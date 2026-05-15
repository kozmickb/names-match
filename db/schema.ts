import { pgTable, bigserial, text, timestamp, uniqueIndex, index, pgEnum, bigint, integer } from "drizzle-orm/pg-core";

export const userSlugEnum = pgEnum("user_slug", ["karo", "lucy"]);
export const decisionEnum = pgEnum("decision", ["like", "pass"]);

export const names = pgTable("names", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("swipes_user_name_uniq").on(t.userSlug, t.nameId),
    byUser: index("swipes_user_idx").on(t.userSlug),
    byName: index("swipes_name_idx").on(t.nameId),
  })
);
