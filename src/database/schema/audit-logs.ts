import { pgTable, serial, varchar, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  action: varchar('action', { length: 255 }).notNull(),
  entity: varchar('entity', { length: 255 }).notNull(),
  entityId: varchar('entity_id', { length: 255 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});
