import {
  pgTable,
  serial,
  timestamp,
  boolean,
  numeric,
  integer,
} from 'drizzle-orm/pg-core';
import { fuelTypes } from './fuel-types';

/**
 * Admin-configured price per liter by fuel type.
 * Payments snapshot the price used at purchase time.
 */
export const fuelPrices = pgTable('fuel_prices', {
  id: serial('id').primaryKey(),
  fuelTypeId: integer('fuel_type_id')
    .notNull()
    .unique()
    .references(() => fuelTypes.id, { onDelete: 'restrict' }),
  pricePerLiter: numeric('price_per_liter', { precision: 12, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

