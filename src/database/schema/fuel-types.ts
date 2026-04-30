import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * Admin-managed fuel types.
 * `code` is the stable identifier used across APIs.
 */
export const fuelTypes = pgTable('fuel_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

