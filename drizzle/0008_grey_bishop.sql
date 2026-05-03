CREATE TABLE "station_fuel_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"fuel_type_id" integer NOT NULL,
	"remaining_liters" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_inventory_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"fuel_type_id" integer NOT NULL,
	"previous_liters" numeric(12, 2) NOT NULL,
	"updated_liters" numeric(12, 2) NOT NULL,
	"delta_liters" numeric(12, 2) NOT NULL,
	"reason" text,
	"note" text,
	"changed_by_user_id" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "station_fuel_inventory" ADD CONSTRAINT "station_fuel_inventory_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_fuel_inventory" ADD CONSTRAINT "station_fuel_inventory_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_inventory_adjustments" ADD CONSTRAINT "fuel_inventory_adjustments_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_inventory_adjustments" ADD CONSTRAINT "fuel_inventory_adjustments_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_inventory_adjustments" ADD CONSTRAINT "fuel_inventory_adjustments_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "station_fuel_inventory_station_fuel_uq" ON "station_fuel_inventory" USING btree ("station_id","fuel_type_id");--> statement-breakpoint
CREATE INDEX "fuel_inventory_adjustments_station_changed_idx" ON "fuel_inventory_adjustments" USING btree ("station_id","changed_at");--> statement-breakpoint
CREATE INDEX "fuel_inventory_adjustments_fuel_type_idx" ON "fuel_inventory_adjustments" USING btree ("fuel_type_id");