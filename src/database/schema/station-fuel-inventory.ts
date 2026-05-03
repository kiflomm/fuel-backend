import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { stations } from './stations';
import { fuelTypes } from './fuel-types';

/** Per-station remaining fuel inventory for each fuel type. */
export const stationFuelInventory = pgTable(
  'station_fuel_inventory',
  {
    id: serial('id').primaryKey(),
    stationId: integer('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    fuelTypeId: integer('fuel_type_id')
      .notNull()
      .references(() => fuelTypes.id, { onDelete: 'restrict' }),
    remainingLiters: numeric('remaining_liters', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('station_fuel_inventory_station_fuel_uq').on(t.stationId, t.fuelTypeId),
  ],
);
