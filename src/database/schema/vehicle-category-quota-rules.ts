import {
  pgTable,
  serial,
  integer,
  numeric,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { vehicleCategories } from './vehicle-categories';
import { quotaPeriodEnum } from '../enums';

export const vehicleCategoryQuotaRules = pgTable(
  'vehicle_category_quota_rules',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => vehicleCategories.id, { onDelete: 'cascade' }),
    period: quotaPeriodEnum('period').notNull(),
    litersLimit: numeric('liters_limit', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    categoryPeriodUnique: unique('vehicle_category_quota_rules_category_period_unique').on(
      t.categoryId,
      t.period,
    ),
  }),
);
