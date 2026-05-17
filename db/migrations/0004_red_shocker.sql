CREATE TABLE "tournament_votes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_slug" "user_slug" NOT NULL,
	"winner_name_id" bigint NOT NULL,
	"loser_name_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "auto_pass_variants" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_votes" ADD CONSTRAINT "tournament_votes_winner_name_id_names_id_fk" FOREIGN KEY ("winner_name_id") REFERENCES "public"."names"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_votes" ADD CONSTRAINT "tournament_votes_loser_name_id_names_id_fk" FOREIGN KEY ("loser_name_id") REFERENCES "public"."names"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_pair_uniq" ON "tournament_votes" USING btree ("user_slug","winner_name_id","loser_name_id");--> statement-breakpoint
CREATE INDEX "tournament_user_idx" ON "tournament_votes" USING btree ("user_slug");