import { config } from "dotenv";
config({ path: ".env.local" });
config({ quiet: true });
import postgres from "postgres";

// Phase A "expand": additive, idempotent DDL applied directly to the live DB.
// We use this instead of drizzle-kit migrate because the repo's migration
// snapshots are behind prod (earlier schema changes were applied via push), so
// `generate` produces incorrect CREATE TABLE statements for tables that already
// exist. This script only ADDs — it never drops — and is safe to re-run.
const DDL = `
create extension if not exists pgcrypto;

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  name text,
  invite_code text not null,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table couples add constraint couples_invite_code_unique unique (invite_code);
exception when duplicate_table or duplicate_object then null; end $$;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  role text not null,
  display_name text not null,
  emoji text not null default '🧑',
  legacy_slug text,
  created_at timestamptz not null default now()
);
create unique index if not exists members_couple_role_uniq on members (couple_id, role);
create index if not exists members_couple_idx on members (couple_id);

create table if not exists couple_state (
  couple_id uuid primary key references couples(id) on delete cascade,
  shuffle_seed bigint not null default 0,
  shuffle_updated_at timestamptz not null default now(),
  excluded_origin_groups jsonb not null default '[]'::jsonb
);

alter table swipes              add column if not exists member_id uuid;
alter table tournament_votes    add column if not exists member_id uuid;
alter table user_profiles       add column if not exists member_id uuid;
alter table ai_calls            add column if not exists member_id uuid;
alter table push_subscriptions  add column if not exists member_id uuid;
alter table knockouts           add column if not exists couple_id uuid;

do $$ begin alter table swipes             add constraint swipes_member_id_members_id_fk             foreign key (member_id) references members(id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table tournament_votes   add constraint tournament_votes_member_id_members_id_fk   foreign key (member_id) references members(id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table user_profiles      add constraint user_profiles_member_id_members_id_fk      foreign key (member_id) references members(id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table ai_calls           add constraint ai_calls_member_id_members_id_fk           foreign key (member_id) references members(id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table push_subscriptions add constraint push_subscriptions_member_id_members_id_fk foreign key (member_id) references members(id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table knockouts          add constraint knockouts_couple_id_couples_id_fk          foreign key (couple_id) references couples(id) on delete cascade; exception when duplicate_object then null; end $$;

create index if not exists swipes_member_idx       on swipes (member_id);
create index if not exists tournament_member_idx   on tournament_votes (member_id);
create index if not exists ai_calls_member_kind_idx on ai_calls (member_id, kind, created_at);
create index if not exists push_member_idx         on push_subscriptions (member_id);

-- Transition enablers: let member-keyed code run while user_slug still exists
-- (the destructive contract drops user_slug later). Relax NOT NULL so inserts
-- can omit user_slug, and add the unique indexes the new upserts rely on.
alter table swipes             alter column user_slug drop not null;
alter table tournament_votes   alter column user_slug drop not null;
alter table ai_calls           alter column user_slug drop not null;
alter table push_subscriptions alter column user_slug drop not null;
create unique index if not exists swipes_member_name_uniq on swipes (member_id, name_id);
create unique index if not exists user_profiles_member_uniq on user_profiles (member_id);
`;

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.begin(async (tx) => {
    await tx.unsafe(DDL);
  });
  console.log("Expand DDL applied (additive, idempotent).");
  // Report the new objects exist.
  const newTables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ('couples','members','couple_state')
    order by table_name`;
  console.log("New tables present: " + newTables.map((t) => t.table_name).join(", "));
  const memberCols = await sql<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema='public' and column_name='member_id' order by table_name`;
  console.log("member_id on: " + memberCols.map((t) => t.table_name).join(", "));
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
