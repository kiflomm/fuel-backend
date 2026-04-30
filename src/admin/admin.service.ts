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
import { CreateQuotaRuleDto } from './dto/create-quota-rule.dto';
import { ListQuotaRulesDto } from './dto/list-quota-rules.dto';
import { UpdateQuotaRuleDto } from './dto/update-quota-rule.dto';
import { AdminDailyTotalsQueryDto } from './dto/admin-daily-totals-query.dto';
import { AdminServiceActivityQueryDto } from './dto/admin-service-activity-query.dto';
import { AdminDistributionQueryDto } from './dto/admin-distribution-query.dto';
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
      address: row.address,
      city: row.city,
      phone: row.phone,
      isActive: row.isActive,
      queueIntakePaused: row.queueIntakePaused,
      fuelStatus: row.fuelStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapVehicle(row: typeof schema.vehicles.$inferSelect) {
    return {
      id: row.id,
      plateNumber: row.plateNumber,
      category: row.category,
      label: row.label,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapQuotaRule(row: typeof schema.quotaRules.$inferSelect) {
    return {
      id: row.id,
      vehicleCategory: row.vehicleCategory,
      period: row.period,
      litersLimit: row.litersLimit,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createStation(dto: CreateStationDto) {
    try {
      const [row] = await this.db
        .insert(schema.stations)
        .values({
          name: dto.name,
          address: dto.address ?? null,
          city: dto.city ?? null,
          phone: dto.phone ?? null,
          fuelStatus: dto.fuelStatus ?? 'AVAILABLE',
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
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.city !== undefined) patch.city = dto.city;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.fuelStatus !== undefined) patch.fuelStatus = dto.fuelStatus;
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
          await tx.insert(schema.vehicles).values(
            dto.vehicles.map((v) => ({
              ownerUserId: user.id,
              plateNumber: v.plateNumber.trim(),
              category: v.category,
              label: v.label ?? null,
              isActive: true,
            })),
          );
        }

        const vehicleRows = await tx
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.ownerUserId, user.id));

        return {
          user: this.mapUser(user),
          vehicles: vehicleRows.map((v) => this.mapVehicle(v)),
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

        await tx.insert(schema.vehicles).values(
          dto.vehicles.map((v) => ({
            ownerUserId: owner.id,
            plateNumber: v.plateNumber.trim(),
            category: v.category,
            label: v.label ?? null,
            isActive: true,
          })),
        );

        const vehicles = await tx
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.ownerUserId, owner.id));

        return vehicles.map((v) => this.mapVehicle(v));
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
    return rows.map((row) => this.mapUser(row));
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

    return {
      ...this.mapUser(user),
      station: station[0]
        ? {
            id: station[0].id,
            name: station[0].name,
            city: station[0].city,
            isActive: station[0].isActive,
          }
        : null,
      vehicles: vehicles.map((vehicle) => this.mapVehicle(vehicle)),
    };
  }

  async upsertFuelPrice(dto: UpsertFuelPriceDto) {
    const patch = {
      fuelType: dto.fuelType,
      pricePerLiter: dto.pricePerLiter.toFixed(2),
      isActive: dto.isActive ?? true,
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select()
      .from(schema.fuelPrices)
      .where(eq(schema.fuelPrices.fuelType, dto.fuelType))
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(schema.fuelPrices)
        .set(patch)
        .where(eq(schema.fuelPrices.id, existing.id))
        .returning();
      return {
        id: row.id,
        fuelType: row.fuelType,
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
          fuelType: patch.fuelType,
          pricePerLiter: patch.pricePerLiter,
          isActive: patch.isActive,
          updatedAt: patch.updatedAt,
        })
        .returning();
      return {
        id: row.id,
        fuelType: row.fuelType,
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
    const rows = await this.db.select().from(schema.fuelPrices);
    return rows.map((row) => ({
      id: row.id,
      fuelType: row.fuelType,
      pricePerLiter: row.pricePerLiter,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createQuotaRule(dto: CreateQuotaRuleDto) {
    const [existing] = await this.db
      .select()
      .from(schema.quotaRules)
      .where(
        and(
          eq(schema.quotaRules.vehicleCategory, dto.vehicleCategory),
          eq(schema.quotaRules.period, dto.period),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'A quota rule already exists for this vehicle category and period',
      );
    }

    const [row] = await this.db
      .insert(schema.quotaRules)
      .values({
        vehicleCategory: dto.vehicleCategory,
        period: dto.period,
        litersLimit: dto.litersLimit.toFixed(2),
        isActive: dto.isActive ?? true,
      })
      .returning();

    return this.mapQuotaRule(row);
  }

  async listQuotaRules(query: ListQuotaRulesDto) {
    const conditions: SQL<unknown>[] = [];
    if (query.vehicleCategory !== undefined) {
      conditions.push(
        eq(schema.quotaRules.vehicleCategory, query.vehicleCategory),
      );
    }
    if (query.period !== undefined) {
      conditions.push(eq(schema.quotaRules.period, query.period));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(schema.quotaRules.isActive, query.isActive));
    }

    const rows = await this.db
      .select()
      .from(schema.quotaRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return rows.map((row) => this.mapQuotaRule(row));
  }

  async getQuotaRuleById(id: number) {
    const [row] = await this.db
      .select()
      .from(schema.quotaRules)
      .where(eq(schema.quotaRules.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Quota rule not found');
    }

    return this.mapQuotaRule(row);
  }

  async updateQuotaRule(id: number, dto: UpdateQuotaRuleDto) {
    const [existing] = await this.db
      .select()
      .from(schema.quotaRules)
      .where(eq(schema.quotaRules.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Quota rule not found');
    }

    const patch: Partial<typeof schema.quotaRules.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.litersLimit !== undefined) {
      patch.litersLimit = dto.litersLimit.toFixed(2);
    }
    if (dto.isActive !== undefined) {
      patch.isActive = dto.isActive;
    }

    const [row] = await this.db
      .update(schema.quotaRules)
      .set(patch)
      .where(eq(schema.quotaRules.id, id))
      .returning();

    return this.mapQuotaRule(row);
  }

  async deleteQuotaRule(id: number) {
    const [row] = await this.db
      .delete(schema.quotaRules)
      .where(eq(schema.quotaRules.id, id))
      .returning();

    if (!row) {
      throw new NotFoundException('Quota rule not found');
    }

    return this.mapQuotaRule(row);
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
      const fuelType = String(payment?.fuelType ?? 'UNKNOWN');
      const category = String(vehicle?.category ?? 'UNKNOWN');

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
              ? { id: station.id, name: station.name, city: station.city }
              : { id: stationId, name: null, city: null },
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

    return {
      date: resolvedDate,
      stationId: query.stationId ?? null,
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

    return [...aggregates.values()]
      .sort((a, b) => {
        const aTime = a.latestServiceAt?.getTime() ?? 0;
        const bTime = b.latestServiceAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .map((entry) => {
        const worker = workerMap.get(entry.stationWorkerUserId) ?? null;
        return {
          stationId: entry.stationId,
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
