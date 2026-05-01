import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import * as schema from '../database/schema';
import { and, count, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { QuotaService } from '../queue/quota.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';

@Injectable()
export class OwnerService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly quotaService: QuotaService,
  ) {}

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

  async listVehicles(ownerUserId: number) {
    const rows = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.ownerUserId, ownerUserId))
      .orderBy(desc(schema.vehicles.createdAt));

    return rows.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      categoryId: v.categoryId,
      label: v.label,
      isActive: v.isActive,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));
  }

  async getVehicle(ownerUserId: number, vehicleId: number) {
    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.id, vehicleId),
          eq(schema.vehicles.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      categoryId: vehicle.categoryId,
      label: vehicle.label,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  async getVehicleQuota(ownerUserId: number, vehicleId: number) {
    await this.getVehicle(ownerUserId, vehicleId);
    const quota = await this.quotaService.assertVehicleHasQuotaRemaining(vehicleId);
    return {
      vehicleId,
      ...quota,
    };
  }

  async getActiveQueue(ownerUserId: number) {
    const vehicles = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.ownerUserId, ownerUserId));

    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0) {
      return [];
    }

    const bookings = await this.db
      .select()
      .from(schema.queueBookings)
      .where(
        and(
          inArray(schema.queueBookings.vehicleId, vehicleIds),
          eq(schema.queueBookings.status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(schema.queueBookings.bookedAt));

    if (bookings.length === 0) {
      return [];
    }

    const stationIds = [...new Set(bookings.map((b) => b.stationId))];
    const paymentIds = [...new Set(bookings.map((b) => b.paymentId))];

    const stations = stationIds.length
      ? await this.db
          .select()
          .from(schema.stations)
          .where(inArray(schema.stations.id, stationIds))
      : [];
    const stationMap = new Map(stations.map((s) => [s.id, s]));

    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((p) => [p.id, p]));

    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

    const results: Array<{
      bookingId: number;
      stationId: number;
      status: typeof schema.queueBookings.$inferSelect.status;
      stationSequence: number;
      queuePosition: number;
      positionAhead: number;
      bookedAt: string;
      verifyToken: string;
      station: {
        id: number;
        name: string;
        latitude: string | null;
        longitude: string | null;
        city: string | null;
        phone: string | null;
        isActive: boolean;
        queueIntakePaused: boolean;
        remainingFuel: string | null;
      } | null;
      vehicle: {
        id: number;
        plateNumber: string;
        categoryId: number;
        label: string | null;
      } | null;
      payment: {
        id: number;
        status: typeof schema.payments.$inferSelect.status;
        fuelType: typeof schema.payments.$inferSelect.fuelTypeCode;
        litersRequested: string;
        pricePerLiter: string;
        amount: string;
        currency: string;
        paidAt: string | null;
      } | null;
    }> = [];
    for (const booking of bookings) {
      const positionAhead = await this.db
        .select({ c: count() })
        .from(schema.queueBookings)
        .where(
          and(
            eq(schema.queueBookings.stationId, booking.stationId),
            eq(schema.queueBookings.status, 'ACTIVE'),
            lt(schema.queueBookings.stationSequence, booking.stationSequence),
          ),
        );

      const ahead = Number(positionAhead[0]?.c ?? 0);
      const station = stationMap.get(booking.stationId) ?? null;
      const payment = paymentMap.get(booking.paymentId) ?? null;
      const vehicle = vehicleMap.get(booking.vehicleId) ?? null;

      results.push({
        bookingId: booking.id,
        stationId: booking.stationId,
        status: booking.status,
        stationSequence: booking.stationSequence,
        queuePosition: ahead + 1,
        positionAhead: ahead,
        bookedAt: booking.bookedAt.toISOString(),
        verifyToken: booking.verifyToken,
        station: station
          ? {
              id: station.id,
              name: station.name,
              latitude: station.latitude,
              longitude: station.longitude,
              city: station.city,
              phone: station.phone,
              isActive: station.isActive,
              queueIntakePaused: station.queueIntakePaused,
              remainingFuel: station.remainingFuel,
            }
          : null,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              plateNumber: vehicle.plateNumber,
              categoryId: vehicle.categoryId,
              label: vehicle.label,
            }
          : null,
        payment: payment
          ? {
              id: payment.id,
              status: payment.status,
              fuelType: payment.fuelTypeCode,
              litersRequested: payment.litersRequested,
              pricePerLiter: payment.pricePerLiter,
              amount: payment.amount,
              currency: payment.currency,
              paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            }
          : null,
      });
    }

    return results;
  }

  async listTransactions(ownerUserId: number, query: DateRangeQueryDto) {
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const vehicles = await this.db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.ownerUserId, ownerUserId));

    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0) {
      return [];
    }

    const conditions = [inArray(schema.transactions.vehicleId, vehicleIds)];
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.servedAt));

    const stationIds = [...new Set(rows.map((r) => r.stationId))];
    const paymentIds = [...new Set(rows.map((r) => r.paymentId))];
    const txVehicleIds = [...new Set(rows.map((r) => r.vehicleId))];

    const stations = stationIds.length
      ? await this.db
          .select()
          .from(schema.stations)
          .where(inArray(schema.stations.id, stationIds))
      : [];
    const stationMap = new Map(stations.map((s) => [s.id, s]));

    const payments = paymentIds.length
      ? await this.db
          .select()
          .from(schema.payments)
          .where(inArray(schema.payments.id, paymentIds))
      : [];
    const paymentMap = new Map(payments.map((p) => [p.id, p]));

    const vehiclesFull = txVehicleIds.length
      ? await this.db
          .select()
          .from(schema.vehicles)
          .where(inArray(schema.vehicles.id, txVehicleIds))
      : [];
    const vehicleMap = new Map(vehiclesFull.map((v) => [v.id, v]));

    return rows.map((row) => {
      const station = stationMap.get(row.stationId) ?? null;
      const payment = paymentMap.get(row.paymentId) ?? null;
      const vehicle = vehicleMap.get(row.vehicleId) ?? null;

      return {
        transactionId: row.id,
        queueBookingId: row.queueBookingId,
        servedAt: row.servedAt.toISOString(),
        litersDispensed: row.litersDispensed,
        receiptRef: row.receiptRef ?? null,
        station: station
          ? {
              id: station.id,
              name: station.name,
              latitude: station.latitude,
              longitude: station.longitude,
              city: station.city,
              phone: station.phone,
            }
          : null,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              plateNumber: vehicle.plateNumber,
              categoryId: vehicle.categoryId,
              label: vehicle.label,
            }
          : null,
        payment: payment
          ? {
              id: payment.id,
              status: payment.status,
              fuelType: payment.fuelTypeCode,
              litersRequested: payment.litersRequested,
              pricePerLiter: payment.pricePerLiter,
              amount: payment.amount,
              currency: payment.currency,
              paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            }
          : null,
      };
    });
  }

  async getTransaction(ownerUserId: number, transactionId: number) {
    const vehicles = await this.db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.ownerUserId, ownerUserId));

    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0) {
      throw new NotFoundException('Transaction not found');
    }

    const [row] = await this.db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.id, transactionId),
          inArray(schema.transactions.vehicleId, vehicleIds),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Transaction not found');
    }

    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, row.stationId))
      .limit(1);
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, row.paymentId))
      .limit(1);
    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, row.vehicleId))
      .limit(1);

    return {
      transactionId: row.id,
      queueBookingId: row.queueBookingId,
      servedAt: row.servedAt.toISOString(),
      litersDispensed: row.litersDispensed,
      receiptRef: row.receiptRef ?? null,
      station: station
        ? {
            id: station.id,
            name: station.name,
            latitude: station.latitude,
            longitude: station.longitude,
            city: station.city,
            phone: station.phone,
          }
        : null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            plateNumber: vehicle.plateNumber,
            categoryId: vehicle.categoryId,
            label: vehicle.label,
          }
        : null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            fuelType: payment.fuelTypeCode,
            litersRequested: payment.litersRequested,
            pricePerLiter: payment.pricePerLiter,
            amount: payment.amount,
            currency: payment.currency,
            paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            txRef: payment.txRef,
          }
        : null,
    };
  }
}

