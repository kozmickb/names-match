CREATE TABLE "app_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shuffle_seed" bigint DEFAULT 0 NOT NULL,
	"shuffle_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_state_singleton" CHECK ("id" = 1)
);
--> statement-breakpoint
INSERT INTO "app_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
