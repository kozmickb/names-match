ALTER TABLE "names" ADD COLUMN "uk_rank" integer;--> statement-breakpoint
ALTER TABLE "names" ADD COLUMN "uk_blurb" text;--> statement-breakpoint
ALTER TABLE "names" ADD COLUMN "popularity_fetched_at" timestamp with time zone;