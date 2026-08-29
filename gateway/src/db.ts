import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const connectionString =
  process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[Gateway DB] GATEWAY_DATABASE_URL or DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
