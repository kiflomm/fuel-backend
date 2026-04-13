import {
  pgTable,
  serial,
  timestamp,
  text,
  boolean,
  json,
} from 'drizzle-orm/pg-core';
import { stationFuelStatusEnum } from '../enums';

/**
 * Physical fuel stations. Station managers and workers are linked via users.stationId.
 */
export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  phone: text('phone'),
  isActive: boolean('is_active').notNull().default(true),
  queueIntakePaused: boolean('queue_intake_paused').notNull().default(false),
  fuelStatus: stationFuelStatusEnum('fuel_status').notNull().default('AVAILABLE'),
  /** Optional structured hours, e.g. { mon: { open: "06:00", close: "18:00" } } */
  operatingHours: json('operating_hours').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
