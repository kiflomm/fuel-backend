CREATE TABLE "vehicle_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vehicle_quota_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"period" "quota_period" NOT NULL,
	"liters_limit" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_quota_rules_vehicle_period_unique" UNIQUE("vehicle_id","period")
);
--> statement-breakpoint
ALTER TABLE "quota_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "quota_rules" CASCADE;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "category_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_quota_rules" ADD CONSTRAINT "vehicle_quota_rules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_category_id_vehicle_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."vehicle_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."vehicle_category";