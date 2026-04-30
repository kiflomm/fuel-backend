import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../database/schema';
import { and, count, eq, lt, max, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { ChapaService } from '../payment/chapa.service';
import { QuotaService } from './quota.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import {
  extractChapaVerifiedFields,
  isChapaVerifySuccess,
  normalizeMoney2,
} from '../payment/chapa-verify.util';

@Injectable()
export class QueueService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
    private readonly chapaService: ChapaService,
    private readonly quotaService: QuotaService,
  ) {}

  // ConfigService is still used elsewhere; keep injected for now.

  async listStationsWithQueueLength() {
    const rows = await this.db.select().from(schema.stations);

    const activeCounts = await this.db
      .select({
        stationId: schema.queueBookings.stationId,
        activeCount: count(),
      })
      .from(schema.queueBookings)
      .where(eq(schema.queueBookings.status, 'ACTIVE'))
      .groupBy(schema.queueBookings.stationId);

    const countMap = new Map<number, number>();
    for (const row of activeCounts) {
      countMap.set(row.stationId, Number(row.activeCount));
    }

    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      phone: s.phone,
      isActive: s.isActive,
      queueIntakePaused: s.queueIntakePaused,
      fuelStatus: s.fuelStatus,
      activeQueueLength: countMap.get(s.id) ?? 0,
    }));
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
      )
      .where(
        and(eq(schema.fuelPrices.isActive, true), eq(schema.fuelTypes.isActive, true)),
      );

    return rows.map((row) => ({
      id: row.id,
      fuelType: row.fuelTypeCode,
      pricePerLiter: row.pricePerLiter,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async initiatePayment(ownerUserId: number, dto: InitiatePaymentDto) {
    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.id, dto.vehicleId),
          eq(schema.vehicles.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, dto.stationId))
      .limit(1);
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    if (!station.isActive) {
      throw new BadRequestException('Station is not active');
    }
    if (station.queueIntakePaused) {
      throw new BadRequestException('This station is not accepting new queue entries');
    }
    if (station.fuelStatus === 'UNAVAILABLE') {
      throw new BadRequestException('Station has no fuel available');
    }

    if (!Number.isFinite(dto.litersRequested) || dto.litersRequested <= 0) {
      throw new BadRequestException('Invalid litersRequested');
    }

    const { remainingLiters } =
      await this.quotaService.assertVehicleHasAtLeast(
        dto.vehicleId,
        String(dto.litersRequested),
      );

    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ownerUserId))
      .limit(1);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [priceRow] = await this.db
      .select({
        id: schema.fuelPrices.id,
        pricePerLiter: schema.fuelPrices.pricePerLiter,
        fuelTypeId: schema.fuelPrices.fuelTypeId,
        isActive: schema.fuelPrices.isActive,
        fuelTypeCode: schema.fuelTypes.code,
      })
      .from(schema.fuelPrices)
      .innerJoin(
        schema.fuelTypes,
        eq(schema.fuelPrices.fuelTypeId, schema.fuelTypes.id),
      )
      .where(
        and(
          eq(schema.fuelPrices.isActive, true),
          eq(schema.fuelTypes.isActive, true),
          eq(schema.fuelTypes.code, String(dto.fuelType)),
        ),
      )
      .limit(1);
    if (!priceRow) {
      throw new BadRequestException(
        'No active price configured for this fuel type. Ask an administrator to configure fuel prices.',
      );
    }

    const pricePerLiter = Number(priceRow.pricePerLiter);
    if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) {
      throw new BadRequestException('Invalid fuel price configuration');
    }

    const amountNum =
      Math.round(dto.litersRequested * pricePerLiter * 100) / 100;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid computed amount');
    }

    const amount = amountNum.toFixed(2);
    const txRef = `fuel-v${dto.vehicleId}-s${dto.stationId}-${randomBytes(12).toString('hex')}`;

    const [payment] = await this.db
      .insert(schema.payments)
      .values({
        vehicleId: dto.vehicleId,
        stationId: dto.stationId,
        txRef,
        status: 'PENDING',
        fuelTypeCode: priceRow.fuelTypeCode,
        litersRequested: String(dto.litersRequested),
        pricePerLiter: String(priceRow.pricePerLiter),
        amount,
        currency: 'ETB',
      })
      .returning();

    if (!payment) {
      throw new BadRequestException('Could not create payment');
    }

    try {
      const chapa = await this.chapaService.initializePayment({
        amount,
        currency: 'ETB',
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        phone_number: dto.phoneNumber.trim(),
        tx_ref: txRef,
      });

      const checkoutUrl = chapa.data?.checkout_url;
      if (
        String(chapa.status ?? '').toLowerCase() !== 'success' ||
        !checkoutUrl
      ) {
        await this.db
          .update(schema.payments)
          .set({
            status: 'FAILED',
            updatedAt: new Date(),
            providerRaw: chapa as unknown as Record<string, unknown>,
          })
          .where(eq(schema.payments.id, payment.id));
        throw new BadRequestException(
          chapa.message || 'Payment provider did not return a checkout URL',
        );
      }

      return {
        paymentId: payment.id,
        txRef: payment.txRef,
        amount: payment.amount,
        currency: payment.currency,
        fuelType: payment.fuelTypeCode,
        litersRequested: payment.litersRequested,
        pricePerLiter: payment.pricePerLiter,
        remainingLiters,
        checkoutUrl,
      };
    } catch (e) {
      await this.db
        .update(schema.payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(schema.payments.id, payment.id));
      throw e;
    }
  }

  async verifyPayment(ownerUserId: number, txRef: string) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.txRef, txRef))
      .limit(1);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.id, payment.vehicleId),
          eq(schema.vehicles.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!vehicle) {
      throw new ForbiddenException('Not allowed to verify this payment');
    }

    if (payment.status === 'SUCCESS') {
      return {
        paymentId: payment.id,
        status: payment.status,
        message: 'Payment already verified',
      };
    }
    if (payment.status !== 'PENDING') {
      throw new BadRequestException(
        `Payment cannot be verified (status: ${payment.status})`,
      );
    }

    const raw = await this.chapaService.verifyTransaction(txRef);
    const ok = isChapaVerifySuccess(raw);
    const fields = extractChapaVerifiedFields(raw);

    const expectedAmount = normalizeMoney2(payment.amount);
    const gotAmount = normalizeMoney2(fields.amount);
    const expectedCurrency = String(payment.currency ?? '').toUpperCase();
    const gotCurrency = String(fields.currency ?? '').toUpperCase();

    const mismatches: string[] = [];
    if (fields.txRef && fields.txRef !== payment.txRef) mismatches.push('tx_ref');
    if (expectedAmount && gotAmount && expectedAmount !== gotAmount) mismatches.push('amount');
    if (expectedCurrency && gotCurrency && expectedCurrency !== gotCurrency) mismatches.push('currency');

    if (!ok || mismatches.length > 0) {
      await this.db
        .update(schema.payments)
        .set({
          status: 'FAILED',
          updatedAt: new Date(),
          providerRaw: raw as Record<string, unknown>,
        })
        .where(eq(schema.payments.id, payment.id));
      if (mismatches.length > 0) {
        throw new BadRequestException(
          `Payment verification mismatch: ${mismatches.join(', ')}`,
        );
      }
      throw new BadRequestException('Payment was not successful');
    }

    const paidAt = new Date();
    await this.db
      .update(schema.payments)
      .set({
        status: 'SUCCESS',
        paidAt,
        updatedAt: paidAt,
        providerRaw: raw as Record<string, unknown>,
      })
      .where(eq(schema.payments.id, payment.id));

    return {
      paymentId: payment.id,
      status: 'SUCCESS' as const,
      paidAt: paidAt.toISOString(),
    };
  }

  async joinQueue(ownerUserId: number, paymentId: number) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId))
      .limit(1);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.id, payment.vehicleId),
          eq(schema.vehicles.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!vehicle) {
      throw new ForbiddenException('Not allowed to use this payment');
    }

    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException(
        'Payment must be successful before joining the queue',
      );
    }

    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, payment.stationId))
      .limit(1);
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    if (!station.isActive) {
      throw new BadRequestException('Station is not active');
    }
    if (station.queueIntakePaused) {
      throw new BadRequestException('This station is not accepting new queue entries');
    }
    if (station.fuelStatus === 'UNAVAILABLE') {
      throw new BadRequestException('Station has no fuel available');
    }

    await this.quotaService.assertVehicleHasAtLeast(
      payment.vehicleId,
      String(payment.litersRequested),
    );

    const [existingBooking] = await this.db
      .select({ id: schema.queueBookings.id })
      .from(schema.queueBookings)
      .where(eq(schema.queueBookings.paymentId, paymentId))
      .limit(1);
    if (existingBooking) {
      throw new ConflictException('Queue booking already exists for this payment');
    }

    const verifyToken = randomBytes(24).toString('hex');

    const booking = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${payment.stationId})`,
      );

      // Deduct quota at join time (payment has already succeeded).
      await this.quotaService.deductQuota(
        tx,
        payment.vehicleId,
        String(payment.litersRequested),
      );

      const [agg] = await tx
        .select({ maxSeq: max(schema.queueBookings.stationSequence) })
        .from(schema.queueBookings)
        .where(eq(schema.queueBookings.stationId, payment.stationId));

      const nextSeq =
        (agg?.maxSeq != null ? Number(agg.maxSeq) : 0) + 1;

      const [row] = await tx
        .insert(schema.queueBookings)
        .values({
          stationId: payment.stationId,
          vehicleId: payment.vehicleId,
          paymentId: payment.id,
          status: 'ACTIVE',
          stationSequence: nextSeq,
          verifyToken,
        })
        .returning();

      return row;
    });

    if (!booking) {
      throw new BadRequestException('Could not create queue booking');
    }

    const positionAhead = await this.db
      .select({ c: count() })
      .from(schema.queueBookings)
      .where(
        and(
          eq(schema.queueBookings.stationId, payment.stationId),
          eq(schema.queueBookings.status, 'ACTIVE'),
          lt(
            schema.queueBookings.stationSequence,
            booking.stationSequence,
          ),
        ),
      );

    const ahead = Number(positionAhead[0]?.c ?? 0);

    return {
      bookingId: booking.id,
      stationId: booking.stationId,
      vehicleId: booking.vehicleId,
      stationSequence: booking.stationSequence,
      positionAhead: ahead,
      verifyToken: booking.verifyToken,
      bookedAt: booking.bookedAt.toISOString(),
    };
  }

  async workerVerifyBooking(
    stationWorkerUserId: number,
    stationId: number,
    verifyToken: string,
  ) {
    const [booking] = await this.db
      .select()
      .from(schema.queueBookings)
      .where(eq(schema.queueBookings.verifyToken, verifyToken))
      .limit(1);
    if (!booking) {
      throw new NotFoundException('Queue booking not found');
    }
    if (booking.stationId !== stationId) {
      throw new ForbiddenException('Not allowed to verify bookings for another station');
    }
    if (booking.status !== 'ACTIVE') {
      throw new BadRequestException(`Queue booking is not active (status: ${booking.status})`);
    }

    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, booking.paymentId))
      .limit(1);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, booking.vehicleId))
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const [owner] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, vehicle.ownerUserId))
      .limit(1);
    if (!owner) {
      throw new NotFoundException('Vehicle owner not found');
    }

    const [existingTxn] = await this.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.queueBookingId, booking.id))
      .limit(1);

    return {
      stationWorkerUserId,
      booking: {
        id: booking.id,
        stationId: booking.stationId,
        vehicleId: booking.vehicleId,
        paymentId: booking.paymentId,
        status: booking.status,
        stationSequence: booking.stationSequence,
        bookedAt: booking.bookedAt.toISOString(),
      },
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        categoryId: vehicle.categoryId,
        label: vehicle.label,
      },
      owner: {
        id: owner.id,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        fuelType: payment.fuelTypeCode,
        litersRequested: payment.litersRequested,
        pricePerLiter: payment.pricePerLiter,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      },
      transaction: existingTxn
        ? {
            id: existingTxn.id,
            litersDispensed: existingTxn.litersDispensed,
            receiptRef: existingTxn.receiptRef ?? null,
            servedAt: existingTxn.servedAt.toISOString(),
          }
        : null,
    };
  }

  async workerCompleteBooking(
    stationWorkerUserId: number,
    stationId: number,
    verifyToken: string,
    receiptRef?: string,
  ) {
    const result = await this.db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(schema.queueBookings)
        .where(eq(schema.queueBookings.verifyToken, verifyToken))
        .limit(1);
      if (!booking) {
        throw new NotFoundException('Queue booking not found');
      }
      if (booking.stationId !== stationId) {
        throw new ForbiddenException('Not allowed to complete bookings for another station');
      }

      await tx.execute(sql`SELECT pg_advisory_xact_lock(${booking.id})`);

      const [existingTxn] = await tx
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.queueBookingId, booking.id))
        .limit(1);
      if (existingTxn) {
        return { booking, txn: existingTxn, created: false as const };
      }

      if (booking.status !== 'ACTIVE') {
        throw new BadRequestException(`Queue booking is not active (status: ${booking.status})`);
      }

      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, booking.paymentId))
        .limit(1);
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      if (payment.status !== 'SUCCESS') {
        throw new BadRequestException('Payment is not successful');
      }

      const litersDispensed = String(payment.litersRequested);

      const [txn] = await tx
        .insert(schema.transactions)
        .values({
          stationId: booking.stationId,
          vehicleId: booking.vehicleId,
          paymentId: booking.paymentId,
          queueBookingId: booking.id,
          stationWorkerUserId,
          litersDispensed,
          receiptRef: receiptRef?.trim() ? receiptRef.trim() : null,
        })
        .returning();

      if (!txn) {
        throw new BadRequestException('Could not create transaction');
      }

      await tx
        .update(schema.queueBookings)
        .set({
          status: 'SERVED',
          servedAt: txn.servedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.queueBookings.id, booking.id));

      return { booking, txn, created: true as const };
    });

    return {
      created: result.created,
      transactionId: result.txn.id,
      queueBookingId: result.txn.queueBookingId,
      stationId: result.txn.stationId,
      vehicleId: result.txn.vehicleId,
      paymentId: result.txn.paymentId,
      stationWorkerUserId: result.txn.stationWorkerUserId,
      litersDispensed: result.txn.litersDispensed,
      receiptRef: result.txn.receiptRef ?? null,
      servedAt: result.txn.servedAt.toISOString(),
    };
  }
}
