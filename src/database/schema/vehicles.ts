import {
  pgTable,
  serial,
  timestamp,
  text,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { vehicleCategories } from './vehicle-categories';

/**
 * Vehicles belong to a single vehicle-owner account (users.role = VEHICLE_OWNER).
 */
export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plateNumber: text('plate_number').notNull().unique(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => vehicleCategories.id, { onDelete: 'restrict' }),
  label: text('label'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
