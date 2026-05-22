import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";

// Authoritative US SSA top-~1000-per-year lists, mirrored on GitHub (public
// domain data). Unioning many years gives broad, real coverage of the names
// parents actually consider. UK ONS popularity is layered on later via db:enrich.
const BASE = "https://raw.githubusercontent.com/aruljohn/popular-baby-names/master";
const START_YEAR = Number(process.env.IMPORT_START_YEAR) || 1950;
const END_YEAR = Number(process.env.IMPORT_END_YEAR) || 2024;
const CONCURRENCY = 8;

const NAME_RE = /^[A-Za-z][A-Za-z'-]{1,28}[A-Za-z]$/;

function normalise(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  return t
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

async function fetchYear(year: number, sex: "boy" | "girl"): Promise<string[]> {
  const url = `${BASE}/${year}/${sex}_names_${year}.csv`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const text = await res.text();
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    const name = comma >= 0 ? line.slice(comma + 1).trim() : line;
    if (name) out.push(name);
  }
  return out;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const sql = postgres(dbUrl, { ssl: "require" });

  try {
    const tasks: Array<{ year: number; sex: "boy" | "girl" }> = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      tasks.push({ year: y, sex: "boy" }, { year: y, sex: "girl" });
    }

    const boys = new Set<string>();
    const girls = new Set<string>();
    let idx = 0;
    let ok = 0;
    let miss = 0;

    async function worker() {
      while (idx < tasks.length) {
        const t = tasks[idx++];
        const names = await fetchYear(t.year, t.sex);
        if (names.length === 0) {
          miss++;
          continue;
        }
        ok++;
        const set = t.sex === "boy" ? boys : girls;
        for (const n of names) set.add(n);
      }
    }
    console.log(`fetching ${tasks.length} files (${START_YEAR}-${END_YEAR})...`);
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`files ok=${ok} miss=${miss} | raw boys=${boys.size} girls=${girls.size}`);

    // Classify: in both lists -> unisex; otherwise masculine/feminine.
    const byName = new Map<string, "masculine" | "feminine" | "unisex">();
    const apply = (raw: string, fromBoy: boolean) => {
      const n = normalise(raw);
      if (!NAME_RE.test(n)) return;
      const prev = byName.get(n);
      if (prev === undefined) {
        byName.set(n, fromBoy ? "masculine" : "feminine");
      } else if ((prev === "masculine" && !fromBoy) || (prev === "feminine" && fromBoy)) {
        byName.set(n, "unisex");
      }
    };
    for (const n of boys) apply(n, true);
    for (const n of girls) apply(n, false);
    console.log(`unique valid names: ${byName.size}`);

    const rows = Array.from(byName.entries()).map(([name, gender]) => ({ name, gender }));
    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // Existing names keep their current gender (do nothing on conflict).
      const res = await sql`
        insert into names ${sql(chunk, "name", "gender")}
        on conflict (name) do nothing`;
      inserted += res.count;
    }
    console.log(`inserted new: ${inserted} | already existed: ${rows.length - inserted}`);
    console.log(`Next: run \`npm run db:enrich\` to fill meaning/origin/popularity.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
