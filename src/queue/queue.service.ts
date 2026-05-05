import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../database/schema';
import { and, count, desc, eq, gte, inArray, lt, lte, max, sql } from 'drizzle-orm';
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
  private readonly logger = new Logger(QueueService.name);

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
      latitude: s.latitude,
      longitude: s.longitude,
      phone: s.phone,
      isActive: s.isActive,
      queueIntakePaused: s.queueIntakePaused,
      activeQueueLength: countMap.get(s.id) ?? 0,
    }));
  }

  async getStationById(stationId: number) {
    const [station] = await this.db
      .select({
        id: schema.stations.id,
        name: schema.stations.name,
        latitude: schema.stations.latitude,
        longitude: schema.stations.longitude,
        phone: schema.stations.phone,
        isActive: schema.stations.isActive,
        queueIntakePaused: schema.stations.queueIntakePaused,
      })
      .from(schema.stations)
      .where(eq(schema.stations.id, stationId))
      .limit(1);

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return station;
  }

  async listFuelPrices() {
    try {
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
    } catch (error) {
      this.logger.error(
        `Failed listing active fuel prices at ${new Date().toISOString()}: ${this.extractErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async initiatePayment(ownerUserId: number, dto: InitiatePaymentDto) {
    const [vehicle] = await this.db
      .select({
        id: schema.vehicles.id,
        ownerUserId: schema.vehicles.ownerUserId,
        fuelSubsidyPercentage: schema.vehicleCategories.fuelSubsidyPercentage,
      })
      .from(schema.vehicles)
      .innerJoin(
        schema.vehicleCategories,
        eq(schema.vehicles.categoryId, schema.vehicleCategories.id),
      )
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

    const fuelSubsidyPercentage = Number(vehicle.fuelSubsidyPercentage ?? 0);
    if (!Number.isFinite(fuelSubsidyPercentage) || fuelSubsidyPercentage < 0 || fuelSubsidyPercentage > 100) {
      throw new BadRequestException('Invalid vehicle category fuel subsidy configuration');
    }

    const grossAmountNum =
      Math.round(dto.litersRequested * pricePerLiter * 100) / 100;
    if (!Number.isFinite(grossAmountNum) || grossAmountNum <= 0) {
      throw new BadRequestException('Invalid computed amount');
    }

    const subsidyAmountNum =
      Math.round(grossAmountNum * (fuelSubsidyPercentage / 100) * 100) / 100;
    const amountNum = Math.round((grossAmountNum - subsidyAmountNum) * 100) / 100;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid computed amount after subsidy');
    }

    const grossAmount = grossAmountNum.toFixed(2);
    const subsidyAmount = subsidyAmountNum.toFixed(2);
    const amount = amountNum.toFixed(2);
    const fuelSubsidyPercentageDisplay = fuelSubsidyPercentage.toFixed(2);
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
        this.logger.error(
          `Chapa initialize returned non-success for paymentId=${payment.id} txRef=${payment.txRef}: status=${String(chapa.status ?? 'unknown')}`,
        );
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
        grossAmount,
        fuelSubsidyPercentage: fuelSubsidyPercentageDisplay,
        subsidyAmount,
        remainingLiters,
        checkoutUrl,
      };
    } catch (e) {
      this.logger.error(
        `Payment initiation failed for ownerUserId=${ownerUserId} vehicleId=${dto.vehicleId} stationId=${dto.stationId}: ${this.extractErrorMessage(e)}`,
      );
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
      this.logger.error(
        `Payment verify failed txRef=${payment.txRef} paymentId=${payment.id} mismatches=${mismatches.join(',') || 'none'} providerStatus=${String((raw as Record<string, unknown>)?.['status'] ?? 'unknown')}`,
      );
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

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
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

  async listWorkerTransactions(stationId: number, query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.normalizeDateRange(query.from, query.to);

    const conditions = [eq(schema.transactions.stationId, stationId)];
    if (fromDate) conditions.push(gte(schema.transactions.servedAt, fromDate));
    if (toDate) conditions.push(lte(schema.transactions.servedAt, toDate));

    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.servedAt));

    const paymentIds = [...new Set(rows.map((r) => r.paymentId))];
    const txVehicleIds = [...new Set(rows.map((r) => r.vehicleId))];

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
      const payment = paymentMap.get(row.paymentId) ?? null;
      const vehicle = vehicleMap.get(row.vehicleId) ?? null;

      return {
        transactionId: row.id,
        queueBookingId: row.queueBookingId,
        servedAt: row.servedAt.toISOString(),
        litersDispensed: row.litersDispensed,
        receiptRef: row.receiptRef ?? null,
        station: {
          id: stationId,
          name: null, // Will be filled by controller if needed
          latitude: null,
          longitude: null,
          phone: null,
        },
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

  async getWorkerTransaction(stationId: number, transactionId: number) {
    const [row] = await this.db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.id, transactionId),
          eq(schema.transactions.stationId, stationId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Transaction not found');
    }

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
      station: {
        id: stationId,
        name: null, // Will be filled by controller if needed
        latitude: null,
        longitude: null,
        phone: null,
      },
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
