CREATE TYPE "public"."decision" AS ENUM('like', 'pass');--> statement-breakpoint
CREATE TYPE "public"."user_slug" AS ENUM('karo', 'lucy');--> statement-breakpoint
CREATE TABLE "names" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "names_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_slug" "user_slug" NOT NULL,
	"name_id" bigint NOT NULL,
	"decision" "decision" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_name_id_names_id_fk" FOREIGN KEY ("name_id") REFERENCES "public"."names"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "swipes_user_name_uniq" ON "swipes" USING btree ("user_slug","name_id");--> statement-breakpoint
CREATE INDEX "swipes_user_idx" ON "swipes" USING btree ("user_slug");--> statement-breakpoint
CREATE INDEX "swipes_name_idx" ON "swipes" USING btree ("name_id");