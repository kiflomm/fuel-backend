import {
  pgTable,
  serial,
  integer,
  numeric,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { vehicles } from './vehicles';
import { quotaPeriodEnum } from '../enums';

export const vehicleQuotaRules = pgTable(
  'vehicle_quota_rules',
  {
    id: serial('id').primaryKey(),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    period: quotaPeriodEnum('period').notNull(),
    litersLimit: numeric('liters_limit', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    vehiclePeriodUnique: unique('vehicle_quota_rules_vehicle_period_unique').on(
      t.vehicleId,
      t.period,
    ),
  }),
);
