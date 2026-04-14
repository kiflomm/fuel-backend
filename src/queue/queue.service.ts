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

function isChapaVerifySuccess(response: unknown): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const r = response as Record<string, unknown>;
  const top = String(r.status ?? '').toLowerCase() === 'success';
  const data = r.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (String(d.status ?? '').toLowerCase() === 'success') {
      return true;
    }
  }
  return top;
}

@Injectable()
export class QueueService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
    private readonly chapaService: ChapaService,
    private readonly quotaService: QuotaService,
  ) {}

  private paymentAmount(): string {
    return (
      this.configService.get<string>('QUEUE_PAYMENT_AMOUNT_ETB') ?? '100.00'
    );
  }

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

    await this.quotaService.assertVehicleHasQuotaRemaining(dto.vehicleId);

    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ownerUserId))
      .limit(1);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amount = this.paymentAmount();
    const txRef = `fuel-v${dto.vehicleId}-s${dto.stationId}-${randomBytes(12).toString('hex')}`;

    const [payment] = await this.db
      .insert(schema.payments)
      .values({
        vehicleId: dto.vehicleId,
        stationId: dto.stationId,
        txRef,
        status: 'PENDING',
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

    if (!ok) {
      await this.db
        .update(schema.payments)
        .set({
          status: 'FAILED',
          updatedAt: new Date(),
          providerRaw: raw as Record<string, unknown>,
        })
        .where(eq(schema.payments.id, payment.id));
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

    await this.quotaService.assertVehicleHasQuotaRemaining(payment.vehicleId);

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
}
