import {
  pgTable,
  serial,
  timestamp,
  text,
  integer,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { devicePlatformEnum } from '../enums';
import { users } from './users';

export const userDevices = pgTable(
  'user_devices',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: devicePlatformEnum('platform').notNull().default('ANDROID'),
    fcmToken: text('fcm_token').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    fcmTokenUnique: unique('user_devices_fcm_token_unique').on(t.fcmToken),
  }),
);

