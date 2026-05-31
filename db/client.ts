import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Memoize the pool in every environment (not just dev): on serverless the module
// can re-evaluate within a warm instance, and an un-memoized pool would leak
// connections each time. One pool per instance, reused across invocations.
const client = globalForDb.pgClient ?? postgres(connectionString, { prepare: false, max: 5 });
globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
