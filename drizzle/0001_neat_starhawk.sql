CREATE TABLE "fuel_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "fuel_prices" DROP CONSTRAINT "fuel_prices_fuel_type_unique";--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD COLUMN "fuel_type_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fuel_type_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" DROP COLUMN "fuel_type";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "fuel_type";--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_fuel_type_id_unique" UNIQUE("fuel_type_id");--> statement-breakpoint
DROP TYPE "public"."fuel_type";