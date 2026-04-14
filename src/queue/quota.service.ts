import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';

/** UTC day window [start, end) for daily quota. */
function getUtcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

@Injectable()
export class QuotaService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Ensures a DAILY balance row exists for the current UTC day and that remaining liters &gt; 0.
   * Quota is deducted at queue-join time once payment is successful.
   */
  async assertVehicleHasQuotaRemaining(vehicleId: number): Promise<{
    remainingLiters: string;
    litersLimit: string;
  }> {
    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, vehicleId))
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (!vehicle.isActive) {
      throw new BadRequestException('Vehicle is inactive');
    }

    const [rule] = await this.db
      .select()
      .from(schema.quotaRules)
      .where(
        and(
          eq(schema.quotaRules.vehicleCategory, vehicle.category),
          eq(schema.quotaRules.period, 'DAILY'),
          eq(schema.quotaRules.isActive, true),
        ),
      )
      .limit(1);

    if (!rule) {
      throw new BadRequestException(
        'No active daily quota rule for this vehicle category. Ask an administrator to configure quota rules.',
      );
    }

    const now = new Date();
    const { start, end } = getUtcDayBounds(now);

    const [existing] = await this.db
      .select()
      .from(schema.vehicleQuotaBalances)
      .where(
        and(
          eq(schema.vehicleQuotaBalances.vehicleId, vehicleId),
          eq(schema.vehicleQuotaBalances.period, 'DAILY'),
        ),
      )
      .limit(1);

    const inWindow =
      existing &&
      existing.periodStart.getTime() <= now.getTime() &&
      now.getTime() < existing.periodEnd.getTime();

    let remainingStr: string;

    if (!inWindow) {
      if (existing) {
        await this.db
          .update(schema.vehicleQuotaBalances)
          .set({
            periodStart: start,
            periodEnd: end,
            remainingLiters: rule.litersLimit,
            updatedAt: new Date(),
          })
          .where(eq(schema.vehicleQuotaBalances.id, existing.id));
      } else {
        await this.db.insert(schema.vehicleQuotaBalances).values({
          vehicleId,
          period: 'DAILY',
          periodStart: start,
          periodEnd: end,
          remainingLiters: rule.litersLimit,
        });
      }
      remainingStr = String(rule.litersLimit);
    } else {
      remainingStr = String(existing!.remainingLiters);
    }

    const remainingNum = Number(remainingStr);
    if (Number.isNaN(remainingNum) || remainingNum <= 0) {
      throw new BadRequestException(
        'No fuel quota remaining for this vehicle in the current period',
      );
    }

    return {
      remainingLiters: remainingStr,
      litersLimit: String(rule.litersLimit),
    };
  }

  async assertVehicleHasAtLeast(
    vehicleId: number,
    litersRequested: string,
  ): Promise<{
    remainingLiters: string;
    litersLimit: string;
  }> {
    const base = await this.assertVehicleHasQuotaRemaining(vehicleId);
    const reqNum = Number(litersRequested);
    const remNum = Number(base.remainingLiters);
    if (!Number.isFinite(reqNum) || reqNum <= 0) {
      throw new BadRequestException('Invalid litersRequested');
    }
    if (!Number.isFinite(remNum) || reqNum > remNum) {
      throw new BadRequestException(
        'Requested liters exceed remaining quota for this vehicle in the current period',
      );
    }
    return base;
  }

  async deductDailyQuota(
    tx: NodePgDatabase<typeof schema>,
    vehicleId: number,
    liters: string,
  ): Promise<{ remainingLiters: string }> {
    const reqNum = Number(liters);
    if (!Number.isFinite(reqNum) || reqNum <= 0) {
      throw new BadRequestException('Invalid liters to deduct');
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);

    // Ensure balance row exists and get current remaining.
    const { remainingLiters } = await this.assertVehicleHasQuotaRemaining(vehicleId);
    const remainingNum = Number(remainingLiters);
    if (!Number.isFinite(remainingNum) || remainingNum < reqNum) {
      throw new BadRequestException(
        'Requested liters exceed remaining quota for this vehicle in the current period',
      );
    }

    const newRemaining = (Math.round((remainingNum - reqNum) * 100) / 100).toFixed(2);

    await tx
      .update(schema.vehicleQuotaBalances)
      .set({
        remainingLiters: newRemaining,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.vehicleQuotaBalances.vehicleId, vehicleId),
          eq(schema.vehicleQuotaBalances.period, 'DAILY'),
        ),
      );

    return { remainingLiters: newRemaining };
  }
}
