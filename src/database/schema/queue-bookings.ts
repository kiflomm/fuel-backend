import {
  pgTable,
  serial,
  timestamp,
  integer,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { queueBookingStatusEnum } from '../enums';
import { stations } from './stations';
import { vehicles } from './vehicles';
import { payments } from './payments';

/**
 * A vehicle's reservation in a station's virtual queue.
 * Created only when quota is valid and payment is SUCCESS.
 */
export const queueBookings = pgTable(
  'queue_bookings',
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
    status: queueBookingStatusEnum('status').notNull().default('ACTIVE'),
    /**
     * Monotonic per-station sequence assigned at booking time (simpler than
     * continuous "position" updates; compute position from served/cancelled).
     */
    stationSequence: integer('station_sequence').notNull(),
    /** Token to embed in a QR code for station worker verification. */
    verifyToken: text('verify_token').notNull(),
    bookedAt: timestamp('booked_at').notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at'),
    servedAt: timestamp('served_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    paymentUnique: unique('queue_bookings_payment_id_unique').on(t.paymentId),
    verifyTokenUnique: unique('queue_bookings_verify_token_unique').on(
      t.verifyToken,
    ),
  }),
);

