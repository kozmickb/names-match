import { pgTable, bigserial, text, timestamp, uniqueIndex, index, pgEnum, bigint, integer, boolean, jsonb, uuid } from "drizzle-orm/pg-core";

export const userSlugEnum = pgEnum("user_slug", ["karo", "lucy"]);
export const decisionEnum = pgEnum("decision", ["like", "pass"]);

// --- Multi-couple tenancy (Phase A) ---
// A couple is the tenant; everything a partner sees is scoped to their couple.
export const couples = pgTable("couples", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Replaces the user_slug enum. The two seats in a couple are roles 'a' and 'b'.
// legacy_slug bridges the existing karo/lucy identity during Phase A.
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coupleId: uuid("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'a' | 'b'
    displayName: text("display_name").notNull(),
    emoji: text("emoji").notNull().default("🧑"),
    legacySlug: text("legacy_slug"), // 'karo' | 'lucy' for the seed couple; null otherwise
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    roleUniq: uniqueIndex("members_couple_role_uniq").on(t.coupleId, t.role),
    byCouple: index("members_couple_idx").on(t.coupleId),
  })
);

// Per-couple shared state — replaces the single-row app_state.
export const coupleState = pgTable("couple_state", {
  coupleId: uuid("couple_id").primaryKey().references(() => couples.id, { onDelete: "cascade" }),
  shuffleSeed: bigint("shuffle_seed", { mode: "number" }).notNull().default(0),
  shuffleUpdatedAt: timestamp("shuffle_updated_at", { withTimezone: true }).defaultNow().notNull(),
  excludedOriginGroups: jsonb("excluded_origin_groups").$type<string[]>().notNull().default([]),
});

export const names = pgTable("names", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  origin: text("origin"),
  meaning: text("meaning"),
  metaFetchedAt: timestamp("meta_fetched_at", { withTimezone: true }),
  ukRank: integer("uk_rank"),
  ukBlurb: text("uk_blurb"),
  popularityFetchedAt: timestamp("popularity_fetched_at", { withTimezone: true }),
  gender: text("gender"),
  originGroup: text("origin_group"),
});

export const userProfiles = pgTable("user_profiles", {
  userSlug: userSlugEnum("user_slug").primaryKey(),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull().default("🧑"),
  autoPassVariants: boolean("auto_pass_variants").notNull().default(false),
  genderFilter: text("gender_filter").notNull().default("all"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentVotes = pgTable(
  "tournament_votes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    winnerNameId: bigint("winner_name_id", { mode: "number" }).notNull().references(() => names.id, { onDelete: "cascade" }),
    loserNameId: bigint("loser_name_id", { mode: "number" }).notNull().references(() => names.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("tournament_pair_uniq").on(t.userSlug, t.winnerNameId, t.loserNameId),
    byUser: index("tournament_user_idx").on(t.userSlug),
    byMember: index("tournament_member_idx").on(t.memberId),
  })
);

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserKind: index("ai_calls_user_kind_idx").on(t.userSlug, t.kind, t.createdAt),
    byMemberKind: index("ai_calls_member_kind_idx").on(t.memberId, t.kind, t.createdAt),
  })
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("push_user_idx").on(t.userSlug),
    byMember: index("push_member_idx").on(t.memberId),
  })
);

export const appState = pgTable("app_state", {
  id: integer("id").primaryKey().default(1),
  shuffleSeed: bigint("shuffle_seed", { mode: "number" }).notNull().default(0),
  shuffleUpdatedAt: timestamp("shuffle_updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Shared "house rules" — origin-group keys excluded from the swipe deck.
  excludedOriginGroups: jsonb("excluded_origin_groups").$type<string[]>().notNull().default([]),
});

export const swipes = pgTable(
  "swipes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userSlug: userSlugEnum("user_slug"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
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
    byMember: index("swipes_member_idx").on(t.memberId),
  })
);

export const knockouts = pgTable(
  "knockouts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "cascade" }),
    gender: text("gender").notNull(),
    size: integer("size").notNull(),
    status: text("status").notNull().default("active"),
    championNameId: bigint("champion_name_id", { mode: "number" }).references(() => names.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    genderUniq: uniqueIndex("knockout_gender_uniq").on(t.gender),
  })
);

export const knockoutMatches = pgTable(
  "knockout_matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    knockoutId: bigint("knockout_id", { mode: "number" })
      .notNull()
      .references(() => knockouts.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    nameAId: bigint("name_a_id", { mode: "number" }).references(() => names.id, { onDelete: "set null" }),
    nameBId: bigint("name_b_id", { mode: "number" }).references(() => names.id, { onDelete: "set null" }),
    winnerNameId: bigint("winner_name_id", { mode: "number" }).references(() => names.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byKo: index("knockout_match_ko_idx").on(t.knockoutId, t.round, t.slot),
  })
);
