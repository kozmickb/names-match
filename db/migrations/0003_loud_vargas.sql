CREATE TABLE "user_profiles" (
	"user_slug" "user_slug" PRIMARY KEY NOT NULL,
	"emoji" text DEFAULT '🧑' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "user_profiles" ("user_slug", "emoji") VALUES ('karo', '🧔🏻') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_profiles" ("user_slug", "emoji") VALUES ('lucy', '👩🏼') ON CONFLICT DO NOTHING;
