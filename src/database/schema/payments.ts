import {
  pgTable,
  serial,
  timestamp,
  text,
  integer,
  numeric,
  json,
  unique,
} from 'drizzle-orm/pg-core';
import { fuelTypeEnum, paymentStatusEnum } from '../enums';
import { vehicles } from './vehicles';
import { stations } from './stations';

/**
 * Payment records created before a queue booking.
 * A SUCCESS payment can be used to join the queue.
 */
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    stationId: integer('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('CHAPA'),
    txRef: text('tx_ref').notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    litersRequested: numeric('liters_requested', { precision: 10, scale: 2 }).notNull(),
    pricePerLiter: numeric('price_per_liter', { precision: 12, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('ETB'),
    paidAt: timestamp('paid_at'),
    providerRaw: json('provider_raw').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    txRefUnique: unique('payments_tx_ref_unique').on(t.txRef),
  }),
);

