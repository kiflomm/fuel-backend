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
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateStationManagerDto } from './dto/create-station-manager.dto';
import { CreateVehicleOwnerDto } from './dto/create-vehicle-owner.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpsertFuelPriceDto } from './dto/upsert-fuel-price.dto';

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

        await tx.insert(schema.vehicles).values(
          dto.vehicles.map((v) => ({
            ownerUserId: user.id,
            plateNumber: v.plateNumber.trim(),
            category: v.category,
            label: v.label ?? null,
            isActive: true,
          })),
        );

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
}
