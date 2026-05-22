import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import * as XLSX from "xlsx";

// UK ONS "Baby names in England and Wales" full lists (Table_6 = every name
// given to 3+ babies that year). Authoritative, UK-relevant breadth to sit
// alongside the US SSA set. Recent years share a consistent layout.
const YEARS = (process.env.ONS_YEARS || "2024,2014,2004")
  .split(",")
  .map((y) => y.trim())
  .filter(Boolean);
const MIN_COUNT = Number(process.env.ONS_MIN_COUNT) || 3;

const NAME_RE = /^[A-Za-z][A-Za-z'-]{1,28}[A-Za-z]$/;

function normalise(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  return t
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

function onsUrl(sex: "boys" | "girls", year: string): string {
  const base =
    "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets";
  const dataset = `babynamesenglandandwalesbabynamesstatistics${sex}`;
  return `${base}/${dataset}/${year}/${sex}names${year}.xlsx`;
}

async function fetchNames(sex: "boys" | "girls", year: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(onsUrl(sex, year));
  } catch {
    return [];
  }
  if (!res.ok) {
    console.log(`  ${sex} ${year}: HTTP ${res.status} — skipped`);
    return [];
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets["Table_6"];
  if (!ws) {
    console.log(`  ${sex} ${year}: no Table_6 — skipped`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  // Find the header row: ["Rank","Name","Count"].
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Array.isArray(r) && String(r[0]).trim() === "Rank" && String(r[1]).trim() === "Name") {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];

  const out: string[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const name = typeof r[1] === "string" ? r[1] : "";
    const count = Number(r[2]);
    if (!name) continue;
    if (Number.isFinite(count) && count < MIN_COUNT) continue;
    out.push(name);
  }
  return out;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const sql = postgres(dbUrl, { ssl: "require" });

  try {
    const boys = new Set<string>();
    const girls = new Set<string>();
    for (const year of YEARS) {
      console.log(`fetching ONS ${year}...`);
      const [b, g] = await Promise.all([fetchNames("boys", year), fetchNames("girls", year)]);
      for (const n of b) boys.add(n);
      for (const n of g) girls.add(n);
      console.log(`  ${year}: boys ${b.length}, girls ${g.length}`);
    }
    console.log(`raw unique: boys ${boys.size}, girls ${girls.size}`);

    const byName = new Map<string, "masculine" | "feminine" | "unisex">();
    const apply = (raw: string, fromBoy: boolean) => {
      const n = normalise(raw);
      if (!NAME_RE.test(n)) return;
      const prev = byName.get(n);
      if (prev === undefined) byName.set(n, fromBoy ? "masculine" : "feminine");
      else if ((prev === "masculine" && !fromBoy) || (prev === "feminine" && fromBoy))
        byName.set(n, "unisex");
    };
    for (const n of boys) apply(n, true);
    for (const n of girls) apply(n, false);
    console.log(`unique valid names: ${byName.size}`);

    const namesArr = Array.from(byName.entries()).map(([name, gender]) => ({ name, gender }));
    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < namesArr.length; i += CHUNK) {
      const chunk = namesArr.slice(i, i + CHUNK);
      const res = await sql`
        insert into names ${sql(chunk, "name", "gender")}
        on conflict (name) do nothing`;
      inserted += res.count;
    }
    console.log(`inserted new: ${inserted} | already existed: ${namesArr.length - inserted}`);
    console.log(`Next: run \`npm run db:enrich\` to fill meaning/origin/popularity.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
