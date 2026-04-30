import { pgEnum } from 'drizzle-orm/pg-core';

/** Application roles (aligned with product design). */
export const USER_ROLES = [
  'GOVERNMENT_ADMIN',
  'STATION_MANAGER',
  'STATION_WORKER',
  'VEHICLE_OWNER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

/** Vehicle categories for quota rules and registration. */
export const VEHICLE_CATEGORIES = [
  'PRIVATE_CAR',
  'TAXI',
  'BUS',
  'TRUCK',
  'MOTORCYCLE',
  'OTHER',
] as const;

export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const vehicleCategoryEnum = pgEnum('vehicle_category', VEHICLE_CATEGORIES);

/** Station-reported fuel availability for the mobile app and admin views. */
export const STATION_FUEL_STATUSES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'] as const;

export type StationFuelStatus = (typeof STATION_FUEL_STATUSES)[number];

export const stationFuelStatusEnum = pgEnum(
  'station_fuel_status',
  STATION_FUEL_STATUSES,
);

/** How quota limits are applied (for upcoming quota module). */
export const QUOTA_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

export type QuotaPeriod = (typeof QUOTA_PERIODS)[number];

export const quotaPeriodEnum = pgEnum('quota_period', QUOTA_PERIODS);

/** Payment status for queue eligibility and reconciliation. */
export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);

/** Queue booking lifecycle within a station. */
export const QUEUE_BOOKING_STATUSES = [
  'ACTIVE',
  'CANCELLED',
  'SERVED',
  'EXPIRED',
] as const;

export type QueueBookingStatus = (typeof QUEUE_BOOKING_STATUSES)[number];

export const queueBookingStatusEnum = pgEnum(
  'queue_booking_status',
  QUEUE_BOOKING_STATUSES,
);

/** Announcement targeting scope. */
export const ANNOUNCEMENT_SCOPES = ['ALL', 'ROLE', 'STATION'] as const;

export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const announcementScopeEnum = pgEnum(
  'announcement_scope',
  ANNOUNCEMENT_SCOPES,
);

/** Supported device platforms (for push notifications). */
export const DEVICE_PLATFORMS = ['ANDROID'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const devicePlatformEnum = pgEnum('device_platform', DEVICE_PLATFORMS);
