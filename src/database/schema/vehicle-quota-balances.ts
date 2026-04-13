import {
  pgTable,
  serial,
  timestamp,
  integer,
  numeric,
  unique,
} from 'drizzle-orm/pg-core';
import { quotaPeriodEnum } from '../enums';
import { vehicles } from './vehicles';

/**
 * Rolling quota balance per vehicle and period.
 *
 * Note: we keep one current row per (vehicle, period). Resetting the quota means
 * updating periodStart/periodEnd and remainingLiters.
 */
export const vehicleQuotaBalances = pgTable(
  'vehicle_quota_balances',
  {
    id: serial('id').primaryKey(),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    period: quotaPeriodEnum('period').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    remainingLiters: numeric('remaining_liters', {
      precision: 10,
      scale: 2,
    }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    vehiclePeriodUnique: unique('vehicle_quota_balances_vehicle_period_unique').on(
      t.vehicleId,
      t.period,
    ),
  }),
);

