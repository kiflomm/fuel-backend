import { Injectable, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { eq } from 'drizzle-orm';
import { ChapaService } from './chapa.service';
import {
  extractChapaVerifiedFields,
  isChapaVerifySuccess,
  normalizeMoney2,
} from './chapa-verify.util';

@Injectable()
export class PaymentProcessingService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly chapaService: ChapaService,
  ) {}

  /**
   * Verifies a tx_ref with Chapa and updates the local `payments` row.
   * This does NOT do any user authorization checks (intended for webhooks/callbacks).
   */
  async verifyAndFinalizeByTxRef(txRef: string, sourceEvent?: unknown) {
    const clean = txRef.trim();
    if (!clean) {
      throw new BadRequestException('txRef is required');
    }

    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.txRef, clean))
      .limit(1);

    if (!payment) {
      // Idempotent: acknowledge even if we don't know this tx_ref
      return { handled: false as const, reason: 'payment_not_found' as const };
    }

    if (payment.status === 'SUCCESS') {
      return {
        handled: true as const,
        paymentId: payment.id,
        status: 'SUCCESS' as const,
        message: 'Payment already verified',
      };
    }

    if (payment.status !== 'PENDING') {
      return {
        handled: true as const,
        paymentId: payment.id,
        status: payment.status,
        message: `Payment is not pending (status: ${payment.status})`,
      };
    }

    const raw = await this.chapaService.verifyTransaction(clean);
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
      const failedAt = new Date();
      await this.db
        .update(schema.payments)
        .set({
          status: 'FAILED',
          updatedAt: failedAt,
          providerRaw: {
            sourceEvent: sourceEvent as Record<string, unknown>,
            verify: raw as Record<string, unknown>,
          },
        })
        .where(eq(schema.payments.id, payment.id));

      const reason =
        mismatches.length > 0
          ? `Verification mismatch: ${mismatches.join(', ')}`
          : 'Payment was not successful';
      return {
        handled: true as const,
        paymentId: payment.id,
        status: 'FAILED' as const,
        reason,
      };
    }

    const paidAt = new Date();
    await this.db
      .update(schema.payments)
      .set({
        status: 'SUCCESS',
        paidAt,
        updatedAt: paidAt,
        providerRaw: {
          sourceEvent: sourceEvent as Record<string, unknown>,
          verify: raw as Record<string, unknown>,
        },
      })
      .where(eq(schema.payments.id, payment.id));

    return {
      handled: true as const,
      paymentId: payment.id,
      status: 'SUCCESS' as const,
      paidAt: paidAt.toISOString(),
    };
  }
}

