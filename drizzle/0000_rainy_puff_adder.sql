CREATE TYPE "public"."announcement_scope" AS ENUM('ALL', 'ROLE', 'STATION');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ANDROID');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('DIESEL', 'BENZENE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."queue_booking_status" AS ENUM('ACTIVE', 'CANCELLED', 'SERVED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."quota_period" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."station_fuel_status" AS ENUM('AVAILABLE', 'LIMITED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('GOVERNMENT_ADMIN', 'STATION_MANAGER', 'STATION_WORKER', 'VEHICLE_OWNER');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('PRIVATE_CAR', 'TAXI', 'BUS', 'TRUCK', 'MOTORCYCLE', 'OTHER');--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"queue_intake_paused" boolean DEFAULT false NOT NULL,
	"fuel_status" "station_fuel_status" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "user_role" DEFAULT 'VEHICLE_OWNER' NOT NULL,
	"station_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reset_password_token" text,
	"reset_password_expires_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"plate_number" text NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_number_unique" UNIQUE("plate_number")
);
--> statement-breakpoint
CREATE TABLE "quota_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_category" "vehicle_category" NOT NULL,
	"period" "quota_period" NOT NULL,
	"liters_limit" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_quota_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"period" "quota_period" NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"remaining_liters" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_quota_balances_vehicle_period_unique" UNIQUE("vehicle_id","period")
);
--> statement-breakpoint
CREATE TABLE "fuel_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"price_per_liter" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_prices_fuel_type_unique" UNIQUE("fuel_type")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"station_id" integer NOT NULL,
	"provider" text DEFAULT 'CHAPA' NOT NULL,
	"tx_ref" text NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"liters_requested" numeric(10, 2) NOT NULL,
	"price_per_liter" numeric(12, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'ETB' NOT NULL,
	"paid_at" timestamp,
	"provider_raw" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tx_ref_unique" UNIQUE("tx_ref")
);
--> statement-breakpoint
CREATE TABLE "queue_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"status" "queue_booking_status" DEFAULT 'ACTIVE' NOT NULL,
	"station_sequence" integer NOT NULL,
	"verify_token" text NOT NULL,
	"booked_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"served_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "queue_bookings_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "queue_bookings_verify_token_unique" UNIQUE("verify_token")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"queue_booking_id" integer NOT NULL,
	"station_worker_user_id" integer NOT NULL,
	"liters_dispensed" numeric(10, 2) NOT NULL,
	"receipt_ref" text,
	"served_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_queue_booking_id_unique" UNIQUE("queue_booking_id")
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" "device_platform" DEFAULT 'ANDROID' NOT NULL,
	"fcm_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_devices_fcm_token_unique" UNIQUE("fcm_token")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by_admin_user_id" integer NOT NULL,
	"target_scope" "announcement_scope" NOT NULL,
	"target_role" "user_role",
	"target_station_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_quota_balances" ADD CONSTRAINT "vehicle_quota_balances_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_bookings" ADD CONSTRAINT "queue_bookings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_bookings" ADD CONSTRAINT "queue_bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_bookings" ADD CONSTRAINT "queue_bookings_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_queue_booking_id_queue_bookings_id_fk" FOREIGN KEY ("queue_booking_id") REFERENCES "public"."queue_bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_station_worker_user_id_users_id_fk" FOREIGN KEY ("station_worker_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_admin_user_id_users_id_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_target_station_id_stations_id_fk" FOREIGN KEY ("target_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;