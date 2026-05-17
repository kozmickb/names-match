ALTER TABLE "names" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "gender_filter" text DEFAULT 'all' NOT NULL;