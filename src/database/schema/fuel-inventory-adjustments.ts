import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { stations } from './stations';
import { fuelTypes } from './fuel-types';
import { users } from './users';

/**
 * Append-only history of inventory changes (government admin corrections).
 */
export const fuelInventoryAdjustments = pgTable(
  'fuel_inventory_adjustments',
  {
    id: serial('id').primaryKey(),
    stationId: integer('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    fuelTypeId: integer('fuel_type_id')
      .notNull()
      .references(() => fuelTypes.id, { onDelete: 'restrict' }),
    previousLiters: numeric('previous_liters', { precision: 12, scale: 2 }).notNull(),
    updatedLiters: numeric('updated_liters', { precision: 12, scale: 2 }).notNull(),
    deltaLiters: numeric('delta_liters', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    note: text('note'),
    changedByUserId: integer('changed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    changedAt: timestamp('changed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('fuel_inventory_adjustments_station_changed_idx').on(t.stationId, t.changedAt),
    index('fuel_inventory_adjustments_fuel_type_idx').on(t.fuelTypeId),
  ],
);
