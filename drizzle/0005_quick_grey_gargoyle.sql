CREATE TABLE "vehicle_category_quota_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"period" "quota_period" NOT NULL,
	"liters_limit" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_category_quota_rules_category_period_unique" UNIQUE("category_id","period")
);
--> statement-breakpoint
ALTER TABLE "vehicle_category_quota_rules" ADD CONSTRAINT "vehicle_category_quota_rules_category_id_vehicle_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."vehicle_categories"("id") ON DELETE cascade ON UPDATE no action;