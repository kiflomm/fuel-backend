ALTER TABLE "stations" ADD COLUMN "latitude" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "longitude" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "remaining_fuel" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "fuel_status";