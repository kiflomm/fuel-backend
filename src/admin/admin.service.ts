import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../database/schema';
import { and, eq, SQL } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateStationManagerDto } from './dto/create-station-manager.dto';
import { CreateVehicleOwnerDto } from './dto/create-vehicle-owner.dto';
import { AddOwnerVehiclesDto } from './dto/add-owner-vehicles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpsertFuelPriceDto } from './dto/upsert-fuel-price.dto';
import { CreateFuelTypeDto } from './dto/create-fuel-type.dto';
import { CreateFuelTypeWithPriceDto } from './dto/create-fuel-type-with-price.dto';
import { UpdateFuelTypeDto } from './dto/update-fuel-type.dto';
import { ListFuelTypesDto } from './dto/list-fuel-types.dto';
import { CreateVehicleCategoryDto } from './dto/create-vehicle-category.dto';
import { UpdateVehicleCategoryDto } from './dto/update-vehicle-category.dto';
import { ListVehicleCategoriesDto } from './dto/list-vehicle-categories.dto';
import { AdminDailyTotalsQueryDto } from './dto/admin-daily-totals-query.dto';
import { AdminServiceActivityQueryDto } from './dto/admin-service-activity-query.dto';
import { AdminDistributionQueryDto } from './dto/admin-distribution-query.dto';
import { QuotaRuleItemDto } from './dto/quota-rule-item.dto';
import { desc, gte, inArray, lte } from 'drizzle-orm';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  private mapUser(row: typeof schema.users.$inferSelect) {
    return {
      id: row.id.toString(),
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      stationId: row.stationId ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapStation(row: typeof schema.stations.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      latitude: row.latitude ? parseFloat(row.latitude.toString()) : null,
      longitude: row.longitude ? parseFloat(row.longitude.toString()) : null,
      phone: row.phone,
      isActive: row.isActive,
      queueIntakePaused: row.queueIntakePaused,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapVehicle(
    row: typeof schema.vehicles.$inferSelect,
    category: typeof schema.vehicleCategories.$inferSelect | null,
    quotaRules: Array<typeof schema.vehicleQuotaRules.$inferSelect> = [],
  ) {
    return {
      id: row.id,
      plateNumber: row.plateNumber,
      categoryId: row.categoryId,
      categoryCode: category?.code ?? null,
      categoryName: category?.name ?? null,
      label: row.label,
      isActive: row.isActive,
      quotaRules: quotaRules.map((rule) => ({
        id: rule.id,
        period: rule.period,
        litersLimit: rule.litersLimit,
        isActive: rule.isActive,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapVehicleCategory(
    row: typeof schema.vehicleCategories.$inferSelect,
    quotaRules: Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect> = [],
  ) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      fuelSubsidyPercentage: row.fuelSubsidyPercentage,
      quotaRules: quotaRules.map((rule) => ({
        id: rule.id,
        period: rule.period,
        litersLimit: rule.litersLimit,
        isActive: rule.isActive,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async getCategoryMap() {
    const categories = await this.db.select().from(schema.vehicleCategories);
    return new Map(categories.map((item) => [item.id, item] as const));
  }

  private async getQuotaRulesByVehicleIds(vehicleIds: number[]) {
    if (vehicleIds.length === 0) {
      return new Map<number, Array<typeof schema.vehicleQuotaRules.$inferSelect>>();
    }
    const rules = await this.db
      .select()
      .from(schema.vehicleQuotaRules)
      .where(inArray(schema.vehicleQuotaRules.vehicleId, vehicleIds));
    const grouped = new Map<number, Array<typeof schema.vehicleQuotaRules.$inferSelect>>();
    for (const rule of rules) {
      const existing = grouped.get(rule.vehicleId) ?? [];
      existing.push(rule);
      grouped.set(rule.vehicleId, existing);
    }
    return grouped;
  }

  private async getCategoryQuotaRulesByCategoryIds(categoryIds: number[]) {
    if (categoryIds.length === 0) {
      return new Map<number, Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect>>();
    }
    const rules = await this.db
      .select()
      .from(schema.vehicleCategoryQuotaRules)
      .where(inArray(schema.vehicleCategoryQuotaRules.categoryId, categoryIds));
    const grouped = new Map<number, Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect>>();
    for (const rule of rules) {
      const existing = grouped.get(rule.categoryId) ?? [];
      existing.push(rule);
      grouped.set(rule.categoryId, existing);
    }
    return grouped;
  }

  private async replaceVehicleQuotaRulesForVehicle(
    vehicleId: number,
    quotaRules: QuotaRuleItemDto[],
  ) {
    await this.db
      .delete(schema.vehicleQuotaRules)
      .where(eq(schema.vehicleQuotaRules.vehicleId, vehicleId));

    await this.db.insert(schema.vehicleQuotaRules).values(
      quotaRules.map((quotaRule) => ({
        vehicleId,
        period: quotaRule.period,
        litersLimit: quotaRule.litersLimit.toFixed(2),
        isActive: quotaRule.isActive ?? true,
      })),
    );
  }

  async createStation(dto: CreateStationDto) {
    try {
      const [row] = await this.db
        .insert(schema.stations)
        .values({
          name: dto.name,
          latitude: dto.latitude?.toString() ?? null,
          longitude: dto.longitude?.toString() ?? null,
          phone: dto.phone ?? null,
        })
        .returning();
      return this.mapStation(row);
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Station conflicts with existing data');
      }
      throw e;
    }
  }

  async updateStation(id: number, dto: UpdateStationDto) {
    const [existing] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, id))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Station not found');
    }

    const patch: Partial<typeof schema.stations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.latitude !== undefined) patch.latitude = dto.latitude.toString();
    if (dto.longitude !== undefined) patch.longitude = dto.longitude.toString();
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.queueIntakePaused !== undefined)
      patch.queueIntakePaused = dto.queueIntakePaused;

    const [row] = await this.db
      .update(schema.stations)
      .set(patch)
      .where(eq(schema.stations.id, id))
      .returning();
    return this.mapStation(row);
  }

  async listStations() {
    const rows = await this.db.select().from(schema.stations);
    return rows.map((row) => this.mapStation(row));
  }

  async getStationById(id: number) {
    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, id))
      .limit(1);

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stationId, id));

    return {
      ...this.mapStation(station),
      users: users.map((user) => this.mapUser(user)),
    };
  }

  async createStationManager(dto: CreateStationManagerDto) {
    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, dto.stationId))
      .limit(1);
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    if (!station.isActive) {
      throw new BadRequestException('Cannot assign a manager to an inactive station');
    }

    const passwordHash = await this.hashPassword(dto.password);
    try {
      const [row] = await this.db
        .insert(schema.users)
        .values({
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'STATION_MANAGER',
          stationId: dto.stationId,
          isActive: true,
        })
        .returning();
      return this.mapUser(row);
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async createVehicleOwner(dto: CreateVehicleOwnerDto) {
    const passwordHash = await this.hashPassword(dto.password);
    try {
      return await this.db.transaction(async (tx) => {
        const categoryIds = [
          ...new Set((dto.vehicles ?? []).map((vehicle) => vehicle.categoryId)),
        ];
        if (categoryIds.length > 0) {
          const categories = await tx
            .select()
            .from(schema.vehicleCategories)
            .where(inArray(schema.vehicleCategories.id, categoryIds));
          const categoryMap = new Map(categories.map((item) => [item.id, item] as const));
          const categoryQuotaRules = await tx
            .select()
            .from(schema.vehicleCategoryQuotaRules)
            .where(inArray(schema.vehicleCategoryQuotaRules.categoryId, categoryIds));
          const categoryQuotaRulesByCategoryId = new Map<
            number,
            Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect>
          >();
          for (const rule of categoryQuotaRules) {
            const existing = categoryQuotaRulesByCategoryId.get(rule.categoryId) ?? [];
            existing.push(rule);
            categoryQuotaRulesByCategoryId.set(rule.categoryId, existing);
          }
          for (const categoryId of categoryIds) {
            const category = categoryMap.get(categoryId);
            if (!category) {
              throw new BadRequestException(`Vehicle category ${categoryId} does not exist`);
            }
            if (!category.isActive) {
              throw new BadRequestException(`Vehicle category ${category.code} is inactive`);
            }
            const rules = categoryQuotaRulesByCategoryId.get(categoryId) ?? [];
            if (rules.length === 0) {
              throw new BadRequestException(
                `Vehicle category ${category.code} has no quota rules configured`,
              );
            }
          }
        }

        const [user] = await tx
          .insert(schema.users)
          .values({
            email: dto.email,
            password: passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: 'VEHICLE_OWNER',
            stationId: null,
            isActive: true,
          })
          .returning();

        if (!user) {
          throw new BadRequestException('Failed to create user');
        }

        if (dto.vehicles?.length) {
          const insertedVehicles = await tx
            .insert(schema.vehicles)
            .values(
              dto.vehicles.map((v) => ({
                ownerUserId: user.id,
                plateNumber: v.plateNumber.trim(),
                categoryId: v.categoryId,
                label: v.label ?? null,
                isActive: true,
              })),
            )
            .returning();

          const categoryQuotaRules = await tx
            .select()
            .from(schema.vehicleCategoryQuotaRules)
            .where(
              inArray(
                schema.vehicleCategoryQuotaRules.categoryId,
                insertedVehicles.map((vehicle) => vehicle.categoryId),
              ),
            );
          const categoryQuotaRulesByCategoryId = new Map<
            number,
            Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect>
          >();
          for (const rule of categoryQuotaRules) {
            const existing = categoryQuotaRulesByCategoryId.get(rule.categoryId) ?? [];
            existing.push(rule);
            categoryQuotaRulesByCategoryId.set(rule.categoryId, existing);
          }

          const vehicleRulesToInsert = insertedVehicles.flatMap((insertedVehicle) => {
            const rules = categoryQuotaRulesByCategoryId.get(insertedVehicle.categoryId) ?? [];
            return rules.map((rule) => ({
              vehicleId: insertedVehicle.id,
              period: rule.period,
              litersLimit: rule.litersLimit,
              isActive: rule.isActive,
            }));
          });

          if (vehicleRulesToInsert.length > 0) {
            await tx.insert(schema.vehicleQuotaRules).values(vehicleRulesToInsert);
          }
        }

        const vehicleRows = await tx
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.ownerUserId, user.id));
        const vehicleIds = vehicleRows.map((item) => item.id);
        const categoryMap = await this.getCategoryMap();
        const quotaRulesByVehicleId = await this.getQuotaRulesByVehicleIds(vehicleIds);

        return {
          user: this.mapUser(user),
          vehicles: vehicleRows.map((vehicleRow) =>
            this.mapVehicle(
              vehicleRow,
              categoryMap.get(vehicleRow.categoryId) ?? null,
              quotaRulesByVehicleId.get(vehicleRow.id) ?? [],
            ),
          ),
        };
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Email or vehicle plate already in use');
      }
      throw e;
    }
  }

  async addVehiclesToOwner(ownerUserId: number, dto: AddOwnerVehiclesDto) {
    try {
      return await this.db.transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, ownerUserId))
          .limit(1);

        if (!owner) {
          throw new NotFoundException('User not found');
        }
        if (owner.role !== 'VEHICLE_OWNER') {
          throw new BadRequestException('Target user is not a vehicle owner');
        }

        const categoryIds = [...new Set(dto.vehicles.map((vehicle) => vehicle.categoryId))];
        const categories = await tx
          .select()
          .from(schema.vehicleCategories)
          .where(inArray(schema.vehicleCategories.id, categoryIds));
        const categoryMap = new Map(categories.map((item) => [item.id, item] as const));
        const categoryQuotaRules = await tx
          .select()
          .from(schema.vehicleCategoryQuotaRules)
          .where(inArray(schema.vehicleCategoryQuotaRules.categoryId, categoryIds));
        const categoryQuotaRulesByCategoryId = new Map<
          number,
          Array<typeof schema.vehicleCategoryQuotaRules.$inferSelect>
        >();
        for (const rule of categoryQuotaRules) {
          const existing = categoryQuotaRulesByCategoryId.get(rule.categoryId) ?? [];
          existing.push(rule);
          categoryQuotaRulesByCategoryId.set(rule.categoryId, existing);
        }
        for (const categoryId of categoryIds) {
          const category = categoryMap.get(categoryId);
          if (!category) {
            throw new BadRequestException(`Vehicle category ${categoryId} does not exist`);
          }
          if (!category.isActive) {
            throw new BadRequestException(`Vehicle category ${category.code} is inactive`);
          }
          const rules = categoryQuotaRulesByCategoryId.get(categoryId) ?? [];
          if (rules.length === 0) {
            throw new BadRequestException(
              `Vehicle category ${category.code} has no quota rules configured`,
            );
          }
        }

        const insertedVehicles = await tx
          .insert(schema.vehicles)
          .values(
            dto.vehicles.map((v) => ({
              ownerUserId: owner.id,
              plateNumber: v.plateNumber.trim(),
              categoryId: v.categoryId,
              label: v.label ?? null,
              isActive: true,
            })),
          )
          .returning();

        const vehicleRulesToInsert = insertedVehicles.flatMap((insertedVehicle) => {
          const rules = categoryQuotaRulesByCategoryId.get(insertedVehicle.categoryId) ?? [];
          return rules.map((rule) => ({
            vehicleId: insertedVehicle.id,
            period: rule.period,
            litersLimit: rule.litersLimit,
            isActive: rule.isActive,
          }));
        });
        if (vehicleRulesToInsert.length > 0) {
          await tx.insert(schema.vehicleQuotaRules).values(vehicleRulesToInsert);
        }

        const vehicles = await tx
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.ownerUserId, owner.id));

        const categoryMapAll = await this.getCategoryMap();
        const quotaRulesByVehicleId = await this.getQuotaRulesByVehicleIds(
          vehicles.map((item) => item.id),
        );

        return vehicles.map((vehicle) =>
          this.mapVehicle(
            vehicle,
            categoryMapAll.get(vehicle.categoryId) ?? null,
            quotaRulesByVehicleId.get(vehicle.id) ?? [],
          ),
        );
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Vehicle plate already in use');
      }
      throw e;
    }
  }

  async updateUserStatus(
    targetUserId: number,
    actorUserId: number,
    dto: UpdateUserStatusDto,
  ) {
    const [target] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === 'GOVERNMENT_ADMIN') {
      throw new BadRequestException(
        'Cannot change activation status of a government admin account',
      );
    }
    if (actorUserId === targetUserId && dto.isActive === false) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    const [updated] = await this.db
      .update(schema.users)
      .set({
        isActive: dto.isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, targetUserId))
      .returning();
    return this.mapUser(updated!);
  }

  async listUsers() {
    const rows = await this.db.select().from(schema.users);
    const stationIds = [
      ...new Set(
        rows.map((r) => r.stationId).filter((id): id is number => id != null),
      ),
    ];
    const stationRows = stationIds.length
      ? await this.db
          .select({ id: schema.stations.id, name: schema.stations.name })
          .from(schema.stations)
          .where(inArray(schema.stations.id, stationIds))
      : [];
    const stationNameById = new Map(stationRows.map((s) => [s.id, s.name] as const));
    return rows.map((row) => ({
      ...this.mapUser(row),
      stationName:
        row.stationId != null ? stationNameById.get(row.stationId) ?? null : null,
    }));
  }

  async getUserById(id: number) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const station =
      user.stationId != null
        ? await this.db
            .select()
            .from(schema.stations)
            .where(eq(schema.stations.id, user.stationId))
            .limit(1)
        : [];

    const vehicles =
      user.role === 'VEHICLE_OWNER'
        ? await this.db
            .select()
            .from(schema.vehicles)
            .where(eq(schema.vehicles.ownerUserId, user.id))
        : [];
    const categoryMap = await this.getCategoryMap();
    const quotaRulesByVehicleId = await this.getQuotaRulesByVehicleIds(
      vehicles.map((item) => item.id),
    );

    return {
      ...this.mapUser(user),
      station: station[0]
        ? {
            id: station[0].id,
            name: station[0].name,
            isActive: station[0].isActive,
          }
        : null,
      vehicles: vehicles.map((vehicle) =>
        this.mapVehicle(
          vehicle,
          categoryMap.get(vehicle.categoryId) ?? null,
          quotaRulesByVehicleId.get(vehicle.id) ?? [],
        ),
      ),
    };
  }

  async listVehicleQuotaRules(vehicleId: number) {
    const [vehicle] = await this.db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, vehicleId))
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const rows = await this.db
      .select()
      .from(schema.vehicleQuotaRules)
      .where(eq(schema.vehicleQuotaRules.vehicleId, vehicleId));

    return rows.map((rule) => ({
      id: rule.id,
      period: rule.period,
      litersLimit: rule.litersLimit,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }));
  }

  async updateVehicleQuotaRules(vehicleId: number, quotaRules: QuotaRuleItemDto[]) {
    const [vehicle] = await this.db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, vehicleId))
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.replaceVehicleQuotaRulesForVehicle(vehicleId, quotaRules);
    return this.listVehicleQuotaRules(vehicleId);
  }

  async listFuelTypes(query: ListFuelTypesDto) {
    const includeInactive = query.includeInactive === true;
    const base = this.db
      .select({
        id: schema.fuelTypes.id,
        code: schema.fuelTypes.code,
        name: schema.fuelTypes.name,
        isActive: schema.fuelTypes.isActive,
        createdAt: schema.fuelTypes.createdAt,
        updatedAt: schema.fuelTypes.updatedAt,
        pricePerLiter: schema.fuelPrices.pricePerLiter,
        priceUpdatedAt: schema.fuelPrices.updatedAt,
      })
      .from(schema.fuelTypes)
      .leftJoin(schema.fuelPrices, eq(schema.fuelPrices.fuelTypeId, schema.fuelTypes.id));
    
    const rows = includeInactive
      ? await base
      : await base.where(eq(schema.fuelTypes.isActive, true));

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      pricePerLiter: row.pricePerLiter ? parseFloat(row.pricePerLiter) : null,
      priceUpdatedAt: row.priceUpdatedAt ? row.priceUpdatedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createFuelTypeWithPrice(dto: CreateFuelTypeWithPriceDto) {
    const code = String(dto.code ?? '').trim().toUpperCase();
    const name = String(dto.name ?? '').trim();
    if (!code) throw new BadRequestException('code is required');
    if (!name) throw new BadRequestException('name is required');

    return await this.db.transaction(async (tx) => {
      try {
        const [fuelType] = await tx
          .insert(schema.fuelTypes)
          .values({
            code,
            name,
            isActive: dto.isActive ?? true,
            updatedAt: new Date(),
          })
          .returning();

        await tx.insert(schema.fuelPrices).values({
          fuelTypeId: fuelType.id,
          pricePerLiter: dto.pricePerLiter.toFixed(2),
          isActive: true,
          updatedAt: new Date(),
        });

        return {
          id: fuelType.id,
          code: fuelType.code,
          name: fuelType.name,
          isActive: fuelType.isActive,
          pricePerLiter: dto.pricePerLiter,
          createdAt: fuelType.createdAt.toISOString(),
          updatedAt: fuelType.updatedAt.toISOString(),
        };
      } catch (e) {
        if (isPgUniqueViolation(e)) {
          throw new ConflictException('Fuel type code already exists');
        }
        throw e;
      }
    });
  }

  async createFuelType(dto: CreateFuelTypeDto) {
    const code = String(dto.code ?? '').trim().toUpperCase();
    const name = String(dto.name ?? '').trim();
    if (!code) throw new BadRequestException('code is required');
    if (!name) throw new BadRequestException('name is required');

    try {
      const [row] = await this.db
        .insert(schema.fuelTypes)
        .values({
          code,
          name,
          isActive: dto.isActive ?? true,
          updatedAt: new Date(),
        })
        .returning();

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Fuel type code already exists');
      }
      throw e;
    }
  }

  async updateFuelType(id: number, dto: UpdateFuelTypeDto) {
    const [existing] = await this.db
      .select()
      .from(schema.fuelTypes)
      .where(eq(schema.fuelTypes.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Fuel type not found');

    const patch: Partial<typeof schema.fuelTypes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) {
      const name = String(dto.name ?? '').trim();
      if (!name) throw new BadRequestException('name cannot be empty');
      patch.name = name;
    }

    if (dto.isActive !== undefined) {
      patch.isActive = dto.isActive;
    }

    if (dto.code !== undefined) {
      const nextCode = String(dto.code ?? '').trim().toUpperCase();
      if (!nextCode) throw new BadRequestException('code cannot be empty');

      if (nextCode !== existing.code) {
        const [anyPayment] = await this.db
          .select({ id: schema.payments.id })
          .from(schema.payments)
          .where(eq(schema.payments.fuelTypeCode, existing.code))
          .limit(1);
        if (anyPayment) {
          throw new ConflictException(
            'Cannot change code after payments exist for this fuel type',
          );
        }
        patch.code = nextCode;
      }
    }

    try {
      const [row] = await this.db
        .update(schema.fuelTypes)
        .set(patch)
        .where(eq(schema.fuelTypes.id, id))
        .returning();

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Fuel type code already exists');
      }
      throw e;
    }
  }

  async deleteFuelType(id: number) {
    const [existing] = await this.db
      .select()
      .from(schema.fuelTypes)
      .where(eq(schema.fuelTypes.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Fuel type not found');

    const [anyPrice] = await this.db
      .select({ id: schema.fuelPrices.id })
      .from(schema.fuelPrices)
      .where(eq(schema.fuelPrices.fuelTypeId, existing.id))
      .limit(1);
    if (anyPrice) {
      throw new ConflictException('Cannot delete fuel type while fuel prices exist');
    }

    const [anyPayment] = await this.db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(eq(schema.payments.fuelTypeCode, existing.code))
      .limit(1);
    if (anyPayment) {
      throw new ConflictException('Cannot delete fuel type while payments exist');
    }

    await this.db.delete(schema.fuelTypes).where(eq(schema.fuelTypes.id, id));
    return { id };
  }

  async upsertFuelPrice(dto: UpsertFuelPriceDto) {
    const code = String(dto.fuelTypeCode ?? '').trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('fuelTypeCode is required');
    }

    const [fuelType] = await this.db
      .select()
      .from(schema.fuelTypes)
      .where(eq(schema.fuelTypes.code, code))
      .limit(1);
    if (!fuelType) {
      throw new BadRequestException('Unknown fuel type');
    }

    const patch = {
      fuelTypeId: fuelType.id,
      pricePerLiter: dto.pricePerLiter.toFixed(2),
      isActive: dto.isActive ?? true,
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select()
      .from(schema.fuelPrices)
      .where(eq(schema.fuelPrices.fuelTypeId, fuelType.id))
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(schema.fuelPrices)
        .set(patch)
        .where(eq(schema.fuelPrices.id, existing.id))
        .returning();
      return {
        id: row.id,
        fuelType: code,
        fuelTypeName: fuelType.name,
        pricePerLiter: row.pricePerLiter,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    try {
      const [row] = await this.db
        .insert(schema.fuelPrices)
        .values({
          fuelTypeId: patch.fuelTypeId,
          pricePerLiter: patch.pricePerLiter,
          isActive: patch.isActive,
          updatedAt: patch.updatedAt,
        })
        .returning();
      return {
        id: row.id,
        fuelType: code,
        fuelTypeName: fuelType.name,
        pricePerLiter: row.pricePerLiter,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Fuel price conflicts with existing data');
      }
      throw e;
    }
  }

  async listFuelPrices() {
    const rows = await this.db
      .select({
        id: schema.fuelPrices.id,
        pricePerLiter: schema.fuelPrices.pricePerLiter,
        isActive: schema.fuelPrices.isActive,
        createdAt: schema.fuelPrices.createdAt,
        updatedAt: schema.fuelPrices.updatedAt,
        fuelTypeCode: schema.fuelTypes.code,
        fuelTypeName: schema.fuelTypes.name,
      })
      .from(schema.fuelPrices)
      .innerJoin(
        schema.fuelTypes,
        eq(schema.fuelPrices.fuelTypeId, schema.fuelTypes.id),
      );
    return rows.map((row) => ({
      id: row.id,
      fuelType: row.fuelTypeCode,
      fuelTypeName: row.fuelTypeName,
      pricePerLiter: row.pricePerLiter,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createVehicleCategory(dto: CreateVehicleCategoryDto) {
    const code = String(dto.code ?? '').trim().toUpperCase();
    const name = String(dto.name ?? '').trim();
    if (!code) throw new BadRequestException('code is required');
    if (!name) throw new BadRequestException('name is required');
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.vehicleCategories)
          .values({
            code,
            name,
            description: dto.description?.trim() || null,
            fuelSubsidyPercentage:
              dto.fuelSubsidyPercentage !== undefined
                ? dto.fuelSubsidyPercentage.toFixed(2)
                : '0.00',
            isActive: dto.isActive ?? true,
            updatedAt: new Date(),
          })
          .returning();

        await tx.insert(schema.vehicleCategoryQuotaRules).values(
          dto.quotaRules.map((quotaRule) => ({
            categoryId: row.id,
            period: quotaRule.period,
            litersLimit: quotaRule.litersLimit.toFixed(2),
            isActive: quotaRule.isActive ?? true,
          })),
        );

        const categoryRules = await tx
          .select()
          .from(schema.vehicleCategoryQuotaRules)
          .where(eq(schema.vehicleCategoryQuotaRules.categoryId, row.id));

        return this.mapVehicleCategory(row, categoryRules);
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Vehicle category code already exists');
      }
      throw e;
    }
  }

  async listVehicleCategories(query: ListVehicleCategoriesDto) {
    const includeInactive = query.includeInactive === true;
    const base = this.db.select().from(schema.vehicleCategories);
    const rows = includeInactive
      ? await base
      : await base.where(eq(schema.vehicleCategories.isActive, true));
    const categoryQuotaRulesByCategoryId = await this.getCategoryQuotaRulesByCategoryIds(
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      this.mapVehicleCategory(row, categoryQuotaRulesByCategoryId.get(row.id) ?? []),
    );
  }

  async getVehicleCategoryById(id: number) {
    const [row] = await this.db
      .select()
      .from(schema.vehicleCategories)
      .where(eq(schema.vehicleCategories.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Vehicle category not found');
    }
    const categoryQuotaRulesByCategoryId = await this.getCategoryQuotaRulesByCategoryIds([id]);
    return this.mapVehicleCategory(row, categoryQuotaRulesByCategoryId.get(id) ?? []);
  }

  async updateVehicleCategory(id: number, dto: UpdateVehicleCategoryDto) {
    const [existing] = await this.db
      .select()
      .from(schema.vehicleCategories)
      .where(eq(schema.vehicleCategories.id, id))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Vehicle category not found');
    }
    const patch: Partial<typeof schema.vehicleCategories.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.code !== undefined) patch.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) patch.description = dto.description.trim() || null;
    if (dto.fuelSubsidyPercentage !== undefined) {
      patch.fuelSubsidyPercentage = dto.fuelSubsidyPercentage.toFixed(2);
    }
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.vehicleCategories)
          .set(patch)
          .where(eq(schema.vehicleCategories.id, id))
          .returning();

        if (dto.quotaRules) {
          await tx
            .delete(schema.vehicleCategoryQuotaRules)
            .where(eq(schema.vehicleCategoryQuotaRules.categoryId, id));

          await tx.insert(schema.vehicleCategoryQuotaRules).values(
            dto.quotaRules.map((quotaRule) => ({
              categoryId: id,
              period: quotaRule.period,
              litersLimit: quotaRule.litersLimit.toFixed(2),
              isActive: quotaRule.isActive ?? true,
            })),
          );
        }

        const categoryRules = await tx
          .select()
          .from(schema.vehicleCategoryQuotaRules)
          .where(eq(schema.vehicleCategoryQuotaRules.categoryId, id));

        return this.mapVehicleCategory(row, categoryRules);
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Vehicle category code already exists');
      }
      throw e;
    }
  }

  async deleteVehicleCategory(id: number) {
    const [existing] = await this.db
      .select()
      .from(schema.vehicleCategories)
      .where(eq(schema.vehicleCategories.id, id))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Vehicle category not found');
    }
    const [inUse] = await this.db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.categoryId, id))
      .limit(1);
    if (inUse) {
      throw new ConflictException(
        'Cannot delete vehicle category while vehicles still reference it',
      );
    }
    await this.db.delete(schema.vehicleCategories).where(eq(schema.vehicleCategories.id, id));
    return { id };
  }

  private normalizeDateRange(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('Invalid from date');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid to date');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    return { fromDate, toDate };
  }

  async getDistributionReport(query: AdminDistributionQueryDto) {
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const conditions: SQL<unknown>[] = [];
    if (query.stationId !== undefined) {
      conditions.push(eq(schema.transactions.stationId, query.stationId));
    }
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const txns = await this.db
      .select()
      .from(schema.transactions)
      .where(conditions.length ? and(...conditions) : undefined);

    const stationIds = [...new Set(txns.map((t) => t.stationId))];
    const vehicleIds = [...new Set(txns.map((t) => t.vehicleId))];
    const paymentIds = [...new Set(txns.map((t) => t.paymentId))];

    const stations: Array<typeof schema.stations.$inferSelect> = stationIds.length
      ? await this.db
          .select()
          .from(schema.stations)
          .where(inArray(schema.stations.id, stationIds))
      : [];

    const vehicles: Array<typeof schema.vehicles.$inferSelect> = vehicleIds.length
      ? await this.db
          .select()
          .from(schema.vehicles)
          .where(inArray(schema.vehicles.id, vehicleIds))
      : [];
    const categoryIds = [...new Set(vehicles.map((vehicle) => vehicle.categoryId))];
    const categories: Array<typeof schema.vehicleCategories.$inferSelect> = categoryIds.length
      ? await this.db
          .select()
          .from(schema.vehicleCategories)
          .where(inArray(schema.vehicleCategories.id, categoryIds))
      : [];

    const payments: Array<typeof schema.payments.$inferSelect> = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];

    const stationMap = new Map<number, typeof schema.stations.$inferSelect>(
      stations.map((s) => [s.id, s] as const),
    );
    const vehicleMap = new Map<number, typeof schema.vehicles.$inferSelect>(
      vehicles.map((v) => [v.id, v] as const),
    );
    const paymentMap = new Map<number, typeof schema.payments.$inferSelect>(
      payments.map((p) => [p.id, p] as const),
    );
    const categoryMap = new Map<number, typeof schema.vehicleCategories.$inferSelect>(
      categories.map((category) => [category.id, category] as const),
    );

    const totalsOverall = {
      completedTransactionCount: 0,
      totalLitersDispensed: 0,
      totalGrossAmount: 0,
      uniqueVehicleIds: new Set<number>(),
    };

    type Bucket = {
      completedTransactionCount: number;
      totalLitersDispensed: number;
      totalGrossAmount: number;
      uniqueVehicleIds: Set<number>;
    };

    const byStation = new Map<number, Bucket>();
    const byVehicleCategory = new Map<string, Bucket>();
    const byFuelType = new Map<string, Bucket>();

    const getBucket = (map: Map<any, Bucket>, key: any): Bucket => {
      const existing = map.get(key);
      if (existing) return existing;
      const b: Bucket = {
        completedTransactionCount: 0,
        totalLitersDispensed: 0,
        totalGrossAmount: 0,
        uniqueVehicleIds: new Set<number>(),
      };
      map.set(key, b);
      return b;
    };

    for (const txn of txns) {
      const payment = paymentMap.get(txn.paymentId) ?? null;
      const vehicle = vehicleMap.get(txn.vehicleId) ?? null;

      const liters = Number(txn.litersDispensed);
      const amount = Number(payment?.amount ?? 0);
      const fuelType = String(payment?.fuelTypeCode ?? 'UNKNOWN');
      const category = vehicle ? String(categoryMap.get(vehicle.categoryId)?.code ?? 'UNKNOWN') : 'UNKNOWN';

      totalsOverall.completedTransactionCount += 1;
      totalsOverall.totalLitersDispensed += Number.isFinite(liters) ? liters : 0;
      totalsOverall.totalGrossAmount += Number.isFinite(amount) ? amount : 0;
      totalsOverall.uniqueVehicleIds.add(txn.vehicleId);

      const stationBucket = getBucket(byStation, txn.stationId);
      stationBucket.completedTransactionCount += 1;
      stationBucket.totalLitersDispensed += Number.isFinite(liters) ? liters : 0;
      stationBucket.totalGrossAmount += Number.isFinite(amount) ? amount : 0;
      stationBucket.uniqueVehicleIds.add(txn.vehicleId);

      const catBucket = getBucket(byVehicleCategory, category);
      catBucket.completedTransactionCount += 1;
      catBucket.totalLitersDispensed += Number.isFinite(liters) ? liters : 0;
      catBucket.totalGrossAmount += Number.isFinite(amount) ? amount : 0;
      catBucket.uniqueVehicleIds.add(txn.vehicleId);

      const fuelBucket = getBucket(byFuelType, fuelType);
      fuelBucket.completedTransactionCount += 1;
      fuelBucket.totalLitersDispensed += Number.isFinite(liters) ? liters : 0;
      fuelBucket.totalGrossAmount += Number.isFinite(amount) ? amount : 0;
      fuelBucket.uniqueVehicleIds.add(txn.vehicleId);
    }

    const mapBucket = (b: Bucket) => ({
      completedTransactionCount: b.completedTransactionCount,
      totalLitersDispensed: b.totalLitersDispensed.toFixed(2),
      totalGrossAmount: b.totalGrossAmount.toFixed(2),
      uniqueVehiclesServedCount: b.uniqueVehicleIds.size,
    });

    return {
      filters: {
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
        stationId: query.stationId ?? null,
      },
      totalsOverall: {
        completedTransactionCount: totalsOverall.completedTransactionCount,
        totalLitersDispensed: totalsOverall.totalLitersDispensed.toFixed(2),
        totalGrossAmount: totalsOverall.totalGrossAmount.toFixed(2),
        uniqueVehiclesServedCount: totalsOverall.uniqueVehicleIds.size,
      },
      byStation: [...byStation.entries()]
        .map(([stationId, bucket]) => {
          const station = stationMap.get(stationId) ?? null;
          return {
            station: station
              ? { id: station.id, name: station.name }
              : { id: stationId, name: null },
            ...mapBucket(bucket),
          };
        })
        .sort((a, b) => Number(b.totalGrossAmount) - Number(a.totalGrossAmount)),
      byVehicleCategory: [...byVehicleCategory.entries()]
        .map(([vehicleCategory, bucket]) => ({
          vehicleCategory,
          ...mapBucket(bucket),
        }))
        .sort((a, b) => Number(b.totalGrossAmount) - Number(a.totalGrossAmount)),
      byFuelType: [...byFuelType.entries()]
        .map(([fuelType, bucket]) => ({
          fuelType,
          ...mapBucket(bucket),
        }))
        .sort((a, b) => Number(b.totalGrossAmount) - Number(a.totalGrossAmount)),
    };
  }

  async getDailyTotals(query: AdminDailyTotalsQueryDto) {
    const resolvedDate = query.date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${resolvedDate}T00:00:00.000Z`);
    const end = new Date(`${resolvedDate}T23:59:59.999Z`);

    const conditions: SQL<unknown>[] = [
      gte(schema.transactions.servedAt, start),
      lte(schema.transactions.servedAt, end),
    ];
    if (query.stationId !== undefined) {
      conditions.push(eq(schema.transactions.stationId, query.stationId));
    }

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions));

    const paymentIds = [...new Set(rows.map((row) => row.paymentId))];
    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((row) => [row.id, row]));

    const totals = rows.reduce(
      (acc, row) => {
        acc.completedTransactionCount += 1;
        acc.totalLitersDispensed += Number(row.litersDispensed);
        acc.uniqueVehicleIds.add(row.vehicleId);
        acc.totalGrossAmount += Number(paymentMap.get(row.paymentId)?.amount ?? 0);
        return acc;
      },
      {
        completedTransactionCount: 0,
        totalLitersDispensed: 0,
        totalGrossAmount: 0,
        uniqueVehicleIds: new Set<number>(),
      },
    );

    let station: { id: number; name: string } | null = null;
    if (query.stationId !== undefined) {
      const [s] = await this.db
        .select({ id: schema.stations.id, name: schema.stations.name })
        .from(schema.stations)
        .where(eq(schema.stations.id, query.stationId))
        .limit(1);
      if (s) station = { id: s.id, name: s.name };
    }

    return {
      date: resolvedDate,
      stationId: query.stationId ?? null,
      station,
      completedTransactionCount: totals.completedTransactionCount,
      totalLitersDispensed: totals.totalLitersDispensed.toFixed(2),
      totalGrossAmount: totals.totalGrossAmount.toFixed(2),
      uniqueVehiclesServedCount: totals.uniqueVehicleIds.size,
    };
  }

  async getServiceActivity(query: AdminServiceActivityQueryDto) {
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const conditions: SQL<unknown>[] = [];
    if (query.stationId !== undefined) {
      conditions.push(eq(schema.transactions.stationId, query.stationId));
    }
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(conditions.length ? and(...conditions) : undefined);

    const workerIds = [...new Set(rows.map((row) => row.stationWorkerUserId))];
    const paymentIds = [...new Set(rows.map((row) => row.paymentId))];

    const workers = workerIds.length
      ? await this.db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, workerIds))
      : [];
    const workerMap = new Map(workers.map((row) => [row.id, row]));

    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((row) => [row.id, row]));

    const aggregates = new Map<
      number,
      {
        stationWorkerUserId: number;
        stationId: number;
        completedTransactionCount: number;
        totalLitersDispensed: number;
        totalGrossAmount: number;
        latestServiceAt: Date | null;
      }
    >();

    for (const row of rows) {
      const key = row.stationWorkerUserId;
      const current =
        aggregates.get(key) ?? {
          stationWorkerUserId: row.stationWorkerUserId,
          stationId: row.stationId,
          completedTransactionCount: 0,
          totalLitersDispensed: 0,
          totalGrossAmount: 0,
          latestServiceAt: null,
        };

      current.completedTransactionCount += 1;
      current.totalLitersDispensed += Number(row.litersDispensed);
      current.totalGrossAmount += Number(paymentMap.get(row.paymentId)?.amount ?? 0);
      if (!current.latestServiceAt || row.servedAt > current.latestServiceAt) {
        current.latestServiceAt = row.servedAt;
      }
      aggregates.set(key, current);
    }

    const activityRows = [...aggregates.values()].sort((a, b) => {
      const aTime = a.latestServiceAt?.getTime() ?? 0;
      const bTime = b.latestServiceAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    const stationIdsForActivity = [
      ...new Set(activityRows.map((r) => r.stationId)),
    ];
    const stationRowsForActivity = stationIdsForActivity.length
      ? await this.db
          .select({ id: schema.stations.id, name: schema.stations.name })
          .from(schema.stations)
          .where(inArray(schema.stations.id, stationIdsForActivity))
      : [];
    const stationNameByIdActivity = new Map(
      stationRowsForActivity.map((s) => [s.id, s.name] as const),
    );

    return activityRows.map((entry) => {
      const worker = workerMap.get(entry.stationWorkerUserId) ?? null;
      const stationName = stationNameByIdActivity.get(entry.stationId) ?? null;
      return {
        stationId: entry.stationId,
        station: {
          id: entry.stationId,
          name: stationName,
        },
        stationWorker: worker
          ? {
              id: worker.id,
              firstName: worker.firstName,
              lastName: worker.lastName,
              email: worker.email,
            }
          : {
              id: entry.stationWorkerUserId,
              firstName: null,
              lastName: null,
              email: null,
            },
        completedTransactionCount: entry.completedTransactionCount,
        totalLitersDispensed: entry.totalLitersDispensed.toFixed(2),
        totalGrossAmount: entry.totalGrossAmount.toFixed(2),
        latestServiceAt: entry.latestServiceAt
          ? entry.latestServiceAt.toISOString()
          : null,
      };
    });
  }
}
