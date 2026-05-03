import {
  pgTable,
  serial,
  timestamp,
  text,
  boolean,
  numeric,
} from 'drizzle-orm/pg-core';

/**
 * Physical fuel stations. Station managers and workers are linked via users.stationId.
 */
export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 8 }),
  longitude: numeric('longitude', { precision: 11, scale: 8 }),
  phone: text('phone'),
  isActive: boolean('is_active').notNull().default(true),
  queueIntakePaused: boolean('queue_intake_paused').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
