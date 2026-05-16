CREATE TABLE "push_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_slug" "user_slug" NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "names" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "names" ADD COLUMN "meaning" text;--> statement-breakpoint
ALTER TABLE "names" ADD COLUMN "meta_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_slug");