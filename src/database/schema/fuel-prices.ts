import {
  pgTable,
  serial,
  timestamp,
  boolean,
  numeric,
} from 'drizzle-orm/pg-core';
import { fuelTypeEnum } from '../enums';

/**
 * Admin-configured price per liter by fuel type.
 * Payments snapshot the price used at purchase time.
 */
export const fuelPrices = pgTable('fuel_prices', {
  id: serial('id').primaryKey(),
  fuelType: fuelTypeEnum('fuel_type').notNull().unique(),
  pricePerLiter: numeric('price_per_liter', { precision: 12, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

