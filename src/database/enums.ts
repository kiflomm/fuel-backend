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
