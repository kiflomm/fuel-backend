import { pgTable, serial, text, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';

export const vehicleCategories = pgTable('vehicle_categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  fuelSubsidyPercentage: numeric('fuel_subsidy_percentage', {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
