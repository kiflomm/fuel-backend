import {
  pgTable,
  serial,
  timestamp,
  integer,
  numeric,
  text,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { queueBookings } from './queue-bookings';
import { stations } from './stations';
import { vehicles } from './vehicles';
import { payments } from './payments';
import { users } from './users';

/**
 * Completed fuel service record created by STATION_WORKER confirmation.
 * This is what triggers quota deduction (in application logic).
 */
export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    stationId: integer('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    paymentId: integer('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    queueBookingId: integer('queue_booking_id')
      .notNull()
      .references(() => queueBookings.id, { onDelete: 'restrict' }),
    stationWorkerUserId: integer('station_worker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    litersDispensed: numeric('liters_dispensed', {
      precision: 10,
      scale: 2,
    }).notNull(),
    receiptRef: text('receipt_ref'),
    servedAt: timestamp('served_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('transactions_queue_booking_id_unique').on(t.queueBookingId),
    index('transactions_station_id_served_at_idx').on(t.stationId, t.servedAt),
    index('transactions_served_at_idx').on(t.servedAt),
  ],
);

