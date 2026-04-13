import {
  pgTable,
  serial,
  timestamp,
  boolean,
  numeric,
} from 'drizzle-orm/pg-core';
import { quotaPeriodEnum, vehicleCategoryEnum } from '../enums';

/**
 * Policy table controlled by GOVERNMENT_ADMIN.
 * Defines the maximum liters allowed per vehicle category over a period.
 */
export const quotaRules = pgTable('quota_rules', {
  id: serial('id').primaryKey(),
  vehicleCategory: vehicleCategoryEnum('vehicle_category').notNull(),
  period: quotaPeriodEnum('period').notNull(),
  litersLimit: numeric('liters_limit', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

