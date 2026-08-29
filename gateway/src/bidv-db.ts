import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as bidvSchema from "./bidv-schema.js";

const connectionString =
  process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[BIDV Gateway DB] GATEWAY_DATABASE_URL or DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

export const bidvDb = drizzle(pool, { schema: bidvSchema });

/** Đảm bảo bảng gateway_registry tồn tại (chạy 1 lần lúc khởi động) */
export async function ensureBidvSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_registry (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'bidv',
      routing_key VARCHAR(100) NOT NULL,
      center_id VARCHAR(100) NOT NULL,
      name TEXT,
      base_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (provider, routing_key)
    )
  `);
  console.log("[BIDVGateway] gateway_registry table ensured");
}
