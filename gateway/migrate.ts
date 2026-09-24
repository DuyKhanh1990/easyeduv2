import { Pool } from "pg";

const connectionString =
  process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[Gateway Migrate] GATEWAY_DATABASE_URL or DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS zalo_routing (
        oa_id       VARCHAR(100) PRIMARY KEY,
        center_id   VARCHAR(100) NOT NULL,
        center_url  TEXT         NOT NULL,
        connected_at TIMESTAMP   NOT NULL DEFAULT NOW(),
        is_active   BOOLEAN      NOT NULL DEFAULT TRUE
      );
    `);
    console.log("[Gateway Migrate] zalo_routing table ensured.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS facebook_page_routes (
        page_id       VARCHAR(100) PRIMARY KEY,
        center_id     VARCHAR(100) NOT NULL,
        center_url    TEXT         NOT NULL,
        connected_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
        is_active     BOOLEAN      NOT NULL DEFAULT TRUE
      );
    `);
    console.log("[Gateway Migrate] facebook_page_routes table ensured.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS center_registry (
        center_id    VARCHAR(100) PRIMARY KEY,
        center_url   TEXT         NOT NULL,
        description  TEXT,
        is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
        registered_at TIMESTAMP   NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[Gateway Migrate] center_registry table ensured.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tenant_map (
        id           SERIAL       PRIMARY KEY,
        zalo_user_id VARCHAR(100) NOT NULL UNIQUE,
        user_id      VARCHAR(100) NOT NULL,
        tenant_id    VARCHAR(100) NOT NULL,
        created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[Gateway Migrate] user_tenant_map table ensured.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("[Gateway Migrate] Error:", err);
  process.exit(1);
});
