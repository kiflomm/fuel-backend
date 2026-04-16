import {
  pgTable,
  serial,
  timestamp,
  text,
  integer,
} from 'drizzle-orm/pg-core';
import { announcementScopeEnum, userRoleEnum } from '../enums';
import { users } from './users';
import { stations } from './stations';

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdByAdminUserId: integer('created_by_admin_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  targetScope: announcementScopeEnum('target_scope').notNull(),
  targetRole: userRoleEnum('target_role'),
  targetStationId: integer('target_station_id').references(() => stations.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

