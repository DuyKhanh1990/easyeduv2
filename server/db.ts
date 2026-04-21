import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Fix TIMESTAMP WITHOUT TIMEZONE: pg driver reads these as local strings.
// Append 'Z' so JavaScript Date always treats them as UTC regardless of server locale.
pg.types.setTypeParser(1114, (val: string) => new Date(val + "Z"));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });
