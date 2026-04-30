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
import type { QuotaPeriod } from '../database/enums';

type DbLike = Pick<
  NodePgDatabase<typeof schema>,
  'select' | 'insert' | 'update' | 'execute'
>;

type ActiveBalance = {
  period: QuotaPeriod;
  remainingLiters: string;
  litersLimit: string;
};

function getUtcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getUtcWeekBounds(now: Date): { start: Date; end: Date } {
  const utcDay = now.getUTCDay();
  const daysFromMonday = (utcDay + 6) % 7;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  start.setUTCDate(start.getUTCDate() - daysFromMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function getUtcMonthBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function getPeriodBounds(period: QuotaPeriod, now: Date): { start: Date; end: Date } {
  switch (period) {
    case 'DAILY':
      return getUtcDayBounds(now);
    case 'WEEKLY':
      return getUtcWeekBounds(now);
    case 'MONTHLY':
      return getUtcMonthBounds(now);
  }
}

@Injectable()
export class QuotaService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private async getVehicleOrThrow(vehicleId: number) {
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

    return vehicle;
  }

  private async getActiveRules(vehicleId: number) {
    const rules = await this.db
      .select()
      .from(schema.vehicleQuotaRules)
      .where(
        and(
          eq(schema.vehicleQuotaRules.vehicleId, vehicleId),
          eq(schema.vehicleQuotaRules.isActive, true),
        ),
      );

    if (rules.length === 0) {
      throw new BadRequestException(
        'No active quota rule for this vehicle. Ask an administrator to configure quota rules.',
      );
    }

    return rules;
  }

  private summarizeBalances(balances: ActiveBalance[]) {
    const remainingValues = balances.map((balance) => Number(balance.remainingLiters));
    const limitValues = balances.map((balance) => Number(balance.litersLimit));
    const remainingLiters = Math.min(...remainingValues).toFixed(2);
    const litersLimit = Math.min(...limitValues).toFixed(2);

    return {
      remainingLiters,
      litersLimit,
      periods: balances,
    };
  }

  private async ensureBalanceForRule(
    executor: DbLike,
    vehicleId: number,
    rule: typeof schema.vehicleQuotaRules.$inferSelect,
    now: Date,
  ): Promise<ActiveBalance> {
    const { start, end } = getPeriodBounds(rule.period, now);

    const [existing] = await executor
      .select()
      .from(schema.vehicleQuotaBalances)
      .where(
        and(
          eq(schema.vehicleQuotaBalances.vehicleId, vehicleId),
          eq(schema.vehicleQuotaBalances.period, rule.period),
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
        await executor
          .update(schema.vehicleQuotaBalances)
          .set({
            periodStart: start,
            periodEnd: end,
            remainingLiters: rule.litersLimit,
            updatedAt: new Date(),
          })
          .where(eq(schema.vehicleQuotaBalances.id, existing.id));
      } else {
        await executor.insert(schema.vehicleQuotaBalances).values({
          vehicleId,
          period: rule.period,
          periodStart: start,
          periodEnd: end,
          remainingLiters: rule.litersLimit,
        });
      }
      remainingStr = String(rule.litersLimit);
    } else {
      remainingStr = String(existing.remainingLiters);
    }

    return {
      period: rule.period,
      remainingLiters: remainingStr,
      litersLimit: String(rule.litersLimit),
    };
  }

  /**
   * Ensures balance rows exist for each active quota rule in the current UTC period windows.
   * Quota is deducted at queue-join time once payment is successful.
   */
  async assertVehicleHasQuotaRemaining(vehicleId: number): Promise<{
    remainingLiters: string;
    litersLimit: string;
    periods: ActiveBalance[];
  }> {
    const vehicle = await this.getVehicleOrThrow(vehicleId);
    const rules = await this.getActiveRules(vehicle.id);
    const now = new Date();
    const balances: ActiveBalance[] = [];

    for (const rule of rules) {
      const balance = await this.ensureBalanceForRule(this.db, vehicleId, rule, now);
      balances.push(balance);
    }

    const hasRemaining = balances.every((balance) => {
      const remainingNum = Number(balance.remainingLiters);
      return Number.isFinite(remainingNum) && remainingNum > 0;
    });

    if (!hasRemaining) {
      throw new BadRequestException('No fuel quota remaining for this vehicle');
    }

    return this.summarizeBalances(balances);
  }

  async assertVehicleHasAtLeast(
    vehicleId: number,
    litersRequested: string,
  ): Promise<{
    remainingLiters: string;
    litersLimit: string;
    periods: ActiveBalance[];
  }> {
    const base = await this.assertVehicleHasQuotaRemaining(vehicleId);
    const reqNum = Number(litersRequested);
    if (!Number.isFinite(reqNum) || reqNum <= 0) {
      throw new BadRequestException('Invalid litersRequested');
    }

    const exceeded = base.periods.find((period) => {
      const remNum = Number(period.remainingLiters);
      return !Number.isFinite(remNum) || reqNum > remNum;
    });

    if (exceeded) {
      throw new BadRequestException(
        `Requested liters exceed remaining ${exceeded.period.toLowerCase()} quota for this vehicle`,
      );
    }
    return base;
  }

  async deductQuota(
    tx: DbLike,
    vehicleId: number,
    liters: string,
  ): Promise<{
    remainingLiters: string;
    litersLimit: string;
    periods: ActiveBalance[];
  }> {
    const reqNum = Number(liters);
    if (!Number.isFinite(reqNum) || reqNum <= 0) {
      throw new BadRequestException('Invalid liters to deduct');
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);

    const vehicle = await this.getVehicleOrThrow(vehicleId);
    const rules = await this.getActiveRules(vehicle.id);
    const now = new Date();
    const updatedBalances: ActiveBalance[] = [];

    for (const rule of rules) {
      const balance = await this.ensureBalanceForRule(tx, vehicleId, rule, now);
      const remainingNum = Number(balance.remainingLiters);
      if (!Number.isFinite(remainingNum) || remainingNum < reqNum) {
        throw new BadRequestException(
          `Requested liters exceed remaining ${rule.period.toLowerCase()} quota for this vehicle`,
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
            eq(schema.vehicleQuotaBalances.period, rule.period),
          ),
        );

      updatedBalances.push({
        period: rule.period,
        remainingLiters: newRemaining,
        litersLimit: String(rule.litersLimit),
      });
    }

    return this.summarizeBalances(updatedBalances);
  }
}
