import { pgTable, bigserial, text, timestamp, uniqueIndex, index, pgEnum, bigint, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const userSlugEnum = pgEnum("user_slug", ["karo", "lucy"]);
export const decisionEnum = pgEnum("decision", ["like", "pass"]);

export const names = pgTable("names", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  origin: text("origin"),
  meaning: text("meaning"),
  metaFetchedAt: timestamp("meta_fetched_at", { withTimezone: true }),
  ukRank: integer("uk_rank"),
  ukBlurb: text("uk_blurb"),
  popularityFetchedAt: timestamp("popularity_fetched_at", { withTimezone: true }),
});

export const userProfiles = pgTable("user_profiles", {
  userSlug: userSlugEnum("user_slug").primaryKey(),
  emoji: text("emoji").notNull().default("🧑"),
  autoPassVariants: boolean("auto_pass_variants").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentVotes = pgTable(
  "tournament_votes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug").notNull(),
    winnerNameId: bigint("winner_name_id", { mode: "number" }).notNull().references(() => names.id, { onDelete: "cascade" }),
    loserNameId: bigint("loser_name_id", { mode: "number" }).notNull().references(() => names.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("tournament_pair_uniq").on(t.userSlug, t.winnerNameId, t.loserNameId),
    byUser: index("tournament_user_idx").on(t.userSlug),
  })
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("push_user_idx").on(t.userSlug),
  })
);

export const appState = pgTable("app_state", {
  id: integer("id").primaryKey().default(1),
  shuffleSeed: bigint("shuffle_seed", { mode: "number" }).notNull().default(0),
  shuffleUpdatedAt: timestamp("shuffle_updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const swipes = pgTable(
  "swipes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug").notNull(),
    nameId: bigint("name_id", { mode: "number" }).notNull().references(() => names.id, { onDelete: "cascade" }),
    decision: decisionEnum("decision").notNull(),
    favourite: boolean("favourite").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("swipes_user_name_uniq").on(t.userSlug, t.nameId),
    byUser: index("swipes_user_idx").on(t.userSlug),
    byName: index("swipes_name_idx").on(t.nameId),
  })
);
