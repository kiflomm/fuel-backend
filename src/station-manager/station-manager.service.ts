import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc, inArray, gte, lte } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as schema from '../database/schema';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { CreateStationWorkerDto } from './dto/create-station-worker.dto';
import { UpdateStationWorkerDto } from './dto/update-station-worker.dto';
import { UpdateStationWorkerStatusDto } from './dto/update-station-worker-status.dto';
import { UpdateStationFuelStatusDto } from './dto/update-station-fuel-status.dto';
import { ListStationTransactionsQueryDto } from './dto/list-station-transactions-query.dto';
import { DailyTotalsQueryDto } from './dto/daily-totals-query.dto';
import { ServiceActivityQueryDto } from './dto/service-activity-query.dto';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class StationManagerService {
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

  private async getManagerContext(managerUserId: number) {
    const [manager] = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, managerUserId),
          eq(schema.users.role, 'STATION_MANAGER'),
        ),
      )
      .limit(1);

    if (!manager) {
      throw new NotFoundException('Station manager not found');
    }

    if (!manager.stationId) {
      throw new BadRequestException('Station manager is not assigned to a station');
    }

    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, manager.stationId))
      .limit(1);

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return { manager, station };
  }

  private async getScopedStationWorker(stationId: number, workerUserId: number) {
    const [worker] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, workerUserId))
      .limit(1);

    if (!worker) {
      throw new NotFoundException('Station worker not found');
    }

    if (worker.role !== 'STATION_WORKER') {
      throw new BadRequestException('Target user is not a station worker');
    }

    if (worker.stationId !== stationId) {
      throw new NotFoundException('Station worker not found');
    }

    return worker;
  }

  private normalizeDateRange(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (
      fromDate &&
      toDate &&
      Number.isFinite(fromDate.getTime()) &&
      Number.isFinite(toDate.getTime()) &&
      fromDate > toDate
    ) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    return { fromDate, toDate };
  }

  async createStationWorker(managerUserId: number, dto: CreateStationWorkerDto) {
    const { manager, station } = await this.getManagerContext(managerUserId);

    if (!station.isActive) {
      throw new BadRequestException('Cannot create station worker for an inactive station');
    }

    const passwordHash = await this.hashPassword(dto.password);

    try {
      const [worker] = await this.db
        .insert(schema.users)
        .values({
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'STATION_WORKER',
          stationId: manager.stationId,
          isActive: true,
        })
        .returning();

      return {
        worker: this.mapUser(worker),
        station: {
          id: station.id,
          name: station.name,
          city: station.city,
          isActive: station.isActive,
        },
      };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async listStationWorkers(managerUserId: number) {
    const { station } = await this.getManagerContext(managerUserId);

    const rows = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.stationId, station.id),
          eq(schema.users.role, 'STATION_WORKER'),
        ),
      )
      .orderBy(desc(schema.users.createdAt));

    return rows.map((row) => this.mapUser(row));
  }

  async getStationWorker(managerUserId: number, workerUserId: number) {
    const { station } = await this.getManagerContext(managerUserId);
    const worker = await this.getScopedStationWorker(station.id, workerUserId);
    return this.mapUser(worker);
  }

  async updateStationWorker(
    managerUserId: number,
    workerUserId: number,
    dto: UpdateStationWorkerDto,
  ) {
    const { station } = await this.getManagerContext(managerUserId);
    await this.getScopedStationWorker(station.id, workerUserId);

    const patch: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.firstName !== undefined) patch.firstName = dto.firstName;
    if (dto.lastName !== undefined) patch.lastName = dto.lastName;
    if (dto.password !== undefined) patch.password = await this.hashPassword(dto.password);

    try {
      const [updated] = await this.db
        .update(schema.users)
        .set(patch)
        .where(eq(schema.users.id, workerUserId))
        .returning();

      return this.mapUser(updated);
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async updateStationWorkerStatus(
    managerUserId: number,
    workerUserId: number,
    dto: UpdateStationWorkerStatusDto,
  ) {
    const { station } = await this.getManagerContext(managerUserId);
    await this.getScopedStationWorker(station.id, workerUserId);

    const [updated] = await this.db
      .update(schema.users)
      .set({
        isActive: dto.isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, workerUserId))
      .returning();

    return this.mapUser(updated);
  }

  async getLiveQueue(managerUserId: number) {
    const { station } = await this.getManagerContext(managerUserId);

    const bookings = await this.db
      .select()
      .from(schema.queueBookings)
      .where(
        and(
          eq(schema.queueBookings.stationId, station.id),
          eq(schema.queueBookings.status, 'ACTIVE'),
        ),
      )
      .orderBy(schema.queueBookings.stationSequence);

    const vehicleIds = [...new Set(bookings.map((row) => row.vehicleId))];
    const paymentIds = [...new Set(bookings.map((row) => row.paymentId))];

    const vehicles = vehicleIds.length
      ? await this.db
          .select()
          .from(schema.vehicles)
          .where(inArray(schema.vehicles.id, vehicleIds))
      : [];
    const vehicleMap = new Map(vehicles.map((row) => [row.id, row]));

    const ownerIds = [...new Set(vehicles.map((row) => row.ownerUserId))];
    const owners = ownerIds.length
      ? await this.db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, ownerIds))
      : [];
    const ownerMap = new Map(owners.map((row) => [row.id, row]));

    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((row) => [row.id, row]));

    return bookings.map((booking, index) => {
      const vehicle = vehicleMap.get(booking.vehicleId) ?? null;
      const owner = vehicle ? ownerMap.get(vehicle.ownerUserId) ?? null : null;
      const payment = paymentMap.get(booking.paymentId) ?? null;

      return {
        bookingId: booking.id,
        stationId: booking.stationId,
        status: booking.status,
        stationSequence: booking.stationSequence,
        queuePosition: index + 1,
        bookedAt: booking.bookedAt.toISOString(),
        vehicle: vehicle
          ? {
              id: vehicle.id,
              plateNumber: vehicle.plateNumber,
              category: vehicle.category,
              label: vehicle.label,
            }
          : null,
        owner: owner
          ? {
              id: owner.id,
              firstName: owner.firstName,
              lastName: owner.lastName,
              email: owner.email,
            }
          : null,
        payment: payment
          ? {
              id: payment.id,
              fuelType: payment.fuelTypeCode,
              litersRequested: payment.litersRequested,
              pricePerLiter: payment.pricePerLiter,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            }
          : null,
      };
    });
  }

  async setQueueIntakePaused(managerUserId: number, paused: boolean) {
    const { station } = await this.getManagerContext(managerUserId);

    const [updated] = await this.db
      .update(schema.stations)
      .set({
        queueIntakePaused: paused,
        updatedAt: new Date(),
      })
      .where(eq(schema.stations.id, station.id))
      .returning();

    return this.mapStation(updated);
  }

  async updateFuelStatus(
    managerUserId: number,
    dto: UpdateStationFuelStatusDto,
  ) {
    const { station } = await this.getManagerContext(managerUserId);

    const [updated] = await this.db
      .update(schema.stations)
      .set({
        fuelStatus: dto.fuelStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.stations.id, station.id))
      .returning();

    return this.mapStation(updated);
  }

  async listTransactions(
    managerUserId: number,
    query: ListStationTransactionsQueryDto,
  ) {
    const { station } = await this.getManagerContext(managerUserId);
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const conditions = [eq(schema.transactions.stationId, station.id)];
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.servedAt));

    const workerIds = [...new Set(rows.map((row) => row.stationWorkerUserId))];
    const vehicleIds = [...new Set(rows.map((row) => row.vehicleId))];
    const paymentIds = [...new Set(rows.map((row) => row.paymentId))];

    const workers = workerIds.length
      ? await this.db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, workerIds))
      : [];
    const workerMap = new Map(workers.map((row) => [row.id, row]));

    const vehicles = vehicleIds.length
      ? await this.db
          .select()
          .from(schema.vehicles)
          .where(inArray(schema.vehicles.id, vehicleIds))
      : [];
    const vehicleMap = new Map(vehicles.map((row) => [row.id, row]));

    const ownerIds = [...new Set(vehicles.map((row) => row.ownerUserId))];
    const owners = ownerIds.length
      ? await this.db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, ownerIds))
      : [];
    const ownerMap = new Map(owners.map((row) => [row.id, row]));

    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((row) => [row.id, row]));

    return rows.map((row) => {
      const worker = workerMap.get(row.stationWorkerUserId) ?? null;
      const vehicle = vehicleMap.get(row.vehicleId) ?? null;
      const owner = vehicle ? ownerMap.get(vehicle.ownerUserId) ?? null : null;
      const payment = paymentMap.get(row.paymentId) ?? null;

      return {
        transactionId: row.id,
        queueBookingId: row.queueBookingId,
        servedAt: row.servedAt.toISOString(),
        litersDispensed: row.litersDispensed,
        receiptRef: row.receiptRef ?? null,
        stationWorker: worker
          ? {
              id: worker.id,
              firstName: worker.firstName,
              lastName: worker.lastName,
              email: worker.email,
            }
          : null,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              plateNumber: vehicle.plateNumber,
              category: vehicle.category,
              label: vehicle.label,
            }
          : null,
        owner: owner
          ? {
              id: owner.id,
              firstName: owner.firstName,
              lastName: owner.lastName,
              email: owner.email,
            }
          : null,
        payment: payment
          ? {
              id: payment.id,
              fuelType: payment.fuelTypeCode,
              litersRequested: payment.litersRequested,
              pricePerLiter: payment.pricePerLiter,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            }
          : null,
      };
    });
  }

  async getDailyTotals(managerUserId: number, query: DailyTotalsQueryDto) {
    const { station } = await this.getManagerContext(managerUserId);

    const resolvedDate =
      query.date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${resolvedDate}T00:00:00.000Z`);
    const end = new Date(`${resolvedDate}T23:59:59.999Z`);

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.stationId, station.id),
          gte(schema.transactions.servedAt, start),
          lte(schema.transactions.servedAt, end),
        ),
      );

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
      completedTransactionCount: totals.completedTransactionCount,
      totalLitersDispensed: totals.totalLitersDispensed.toFixed(2),
      totalGrossAmount: totals.totalGrossAmount.toFixed(2),
      uniqueVehiclesServedCount: totals.uniqueVehicleIds.size,
    };
  }

  async getServiceActivity(
    managerUserId: number,
    query: ServiceActivityQueryDto,
  ) {
    const { station } = await this.getManagerContext(managerUserId);
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const conditions = [eq(schema.transactions.stationId, station.id)];
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions));

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
        completedTransactionCount: number;
        totalLitersDispensed: number;
        totalGrossAmount: number;
        latestServiceAt: Date | null;
      }
    >();

    for (const row of rows) {
      const current =
        aggregates.get(row.stationWorkerUserId) ?? {
          stationWorkerUserId: row.stationWorkerUserId,
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
      aggregates.set(row.stationWorkerUserId, current);
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
