import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const APP_VERSION = process.env.APP_VERSION || "dev";
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const BASELINE_PATH = path.join(__dirname, "app-baseline.sql");

function parseDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error("DATABASE_URL must contain a database name using only letters, digits, and underscores (max 63 characters).");
  }
  const username = decodeURIComponent(url.username);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(username)) {
    throw new Error("DATABASE_URL username is not a valid PostgreSQL role identifier.");
  }
  return { url, databaseName, username };
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(identifier)) {
    throw new Error("Invalid PostgreSQL identifier.");
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

async function ensureDatabase(
  targetUrl: string,
  databaseName: string,
  ownerRole: string,
): Promise<void> {
  const bootstrapUrl = process.env.DB_BOOTSTRAP_URL || targetUrl;
  const maintenance = new Client({ connectionString: maintenanceUrl(bootstrapUrl) });
  await maintenance.connect();
  const lockKey = `easyedu-db-bootstrap:${databaseName}`;
  try {
    await maintenance.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
    const result = await maintenance.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (result.rowCount === 0) {
      const owner = quoteIdentifier(ownerRole);
      const database = quoteIdentifier(databaseName);
      // PostgreSQL identifiers cannot be bind parameters. Both identifiers are
      // strictly validated and quoted before being interpolated.
      await maintenance.query(`CREATE DATABASE ${database} OWNER ${owner} ENCODING 'UTF8'`);
      console.log(`[db:migrate] Created target database "${databaseName}".`);
    } else {
      console.log(`[db:migrate] Target database "${databaseName}" already exists.`);
    }
  } finally {
    await maintenance.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]).catch(() => {});
    await maintenance.end();
  }
}

async function ensureLedger(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      release TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isEmptyDatabase(client: Client): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> 'schema_migrations'
  `);
  return rows[0].count === 0;
}

async function adoptExistingSchema(
  client: Client,
  manifest: any,
  baseline: string,
  release: string,
): Promise<void> {
  const tables = new Set((await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `)).rows.map((row) => row.tablename));
  const columns = new Map<string, Set<string>>();
  for (const row of (await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `)).rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name)!.add(row.column_name);
  }
  const indexes = new Set((await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `)).rows.map((row) => row.indexname));
  const foreignKeys = new Set((await client.query(`
    SELECT conname FROM pg_constraint WHERE contype = 'f'
  `)).rows.map((row) => row.conname));
  const missing: string[] = [];
  for (const table of manifest.tableNames as string[]) {
    if (!tables.has(table)) {
      missing.push(`table ${table}`);
      continue;
    }
    for (const column of manifest.columnsByTable[table] || []) {
      if (!columns.get(table)?.has(column)) missing.push(`column ${table}.${column}`);
    }
  }
  for (const index of [...manifest.indexesByName, ...manifest.customIndexes]) {
    if (!indexes.has(index)) missing.push(`index ${index}`);
  }
  for (const foreignKey of manifest.foreignKeysByName) {
    if (!foreignKeys.has(foreignKey)) missing.push(`foreign key ${foreignKey}`);
  }
  const sequences = new Set((await client.query(`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  `)).rows.map((row) => row.sequencename));
  for (const sequence of manifest.customSequences as string[]) {
    if (!sequences.has(sequence)) missing.push(`sequence ${sequence}`);
  }
  if (missing.length) {
    throw new Error(
      `Existing database has no baseline ledger and does not match image ${release}; refusing changes. Missing: ${missing.slice(0, 20).join(", ")}`,
    );
  }

  await client.query(
    "INSERT INTO schema_migrations (migration_id, checksum, release) VALUES ($1, $2, $3)",
    [`baseline:${release}`, createHash("sha256").update(baseline).digest("hex"), release],
  );
  console.log(`[db:migrate] Existing schema matches image ${release}; recorded baseline without changing app tables.`);
}

async function applySql(client: Client, id: string, sql: string, release: string): Promise<void> {
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await client.query(
    "SELECT checksum FROM schema_migrations WHERE migration_id = $1",
    [id],
  );
  if (existing.rowCount) {
    if (existing.rows[0].checksum !== checksum) {
      throw new Error(`Checksum mismatch for already-applied migration ${id}.`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (migration_id, checksum, release) VALUES ($1, $2, $3)",
      [id, checksum, release],
    );
    await client.query("COMMIT");
    console.log(`[db:migrate] Applied ${id}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL from the center ConfigMap is required.");
  }
  const { databaseName, username } = parseDatabaseUrl(DATABASE_URL);
  const ownerRole = process.env.DB_OWNER_ROLE || username;
  quoteIdentifier(ownerRole);
  await ensureDatabase(DATABASE_URL, databaseName, ownerRole);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await ensureLedger(client);
    const baseline = await readFile(BASELINE_PATH, "utf8");
    const manifest = JSON.parse(await readFile(path.join(__dirname, "schema-manifest.json"), "utf8"));
    const applied = await client.query(
      "SELECT migration_id, checksum FROM schema_migrations WHERE migration_id = $1",
      [`baseline:${APP_VERSION}`],
    );
    if (applied.rowCount === 0) {
      if (await isEmptyDatabase(client)) {
        await applySql(client, `baseline:${APP_VERSION}`, baseline, APP_VERSION);
      } else {
        await adoptExistingSchema(client, manifest, baseline, APP_VERSION);
      }
    }
    if (applied.rowCount > 0) {
      await applySql(client, `baseline:${APP_VERSION}`, baseline, APP_VERSION);
    }

    const files = (await readdir(MIGRATIONS_DIR).catch(() => []))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    let previousId = "";
    for (const file of files) {
      if (!/^\d{6}_[a-z0-9][a-z0-9_-]*\.sql$/.test(file)) {
        throw new Error(`Invalid migration filename: ${file}`);
      }
      const id = file.slice(0, -4);
      if (id === previousId) throw new Error(`Duplicate migration ID: ${id}`);
      previousId = id;
      await applySql(client, id, await readFile(path.join(MIGRATIONS_DIR, file), "utf8"), APP_VERSION);
    }
    console.log(`[db:migrate] Schema ready for image ${APP_VERSION}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[db:migrate] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
