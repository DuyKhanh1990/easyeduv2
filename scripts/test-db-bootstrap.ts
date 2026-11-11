import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must point at a disposable PostgreSQL database name.");

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  TARGET_DB_URL: databaseUrl,
  DB_OWNER_ROLE: process.env.DB_OWNER_ROLE || new URL(databaseUrl).username,
  STAFF_LIMIT: process.env.STAFF_LIMIT || "10",
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD || "ci-test-password-not-for-production",
};
const runner = path.resolve("dist/db/migrate.cjs");
const seeder = path.resolve("dist/db/seed-default.cjs");
const manifest = JSON.parse(await readFile("dist/db/schema-manifest.json", "utf8"));
const run = (entry: string) => execFileSync(process.execPath, [entry], { env, stdio: "inherit" });

// A fresh DB must initialize, and a repeated Argo Job must be harmless.
run(runner);
run(seeder);
run(runner);
run(seeder);

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows: tableRows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
    ORDER BY tablename
  `);
  const tableNames = tableRows.map((row) => row.tablename);
  assert.equal(manifest.tableNames.length, 180, "build manifest must contain 180 application tables");
  assert.deepEqual(tableNames, manifest.tableNames, "database table names must exactly match this image's manifest");

  const { rows: indexRows } = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `);
  const actualIndexes = new Set(indexRows.map((row) => row.indexname));
  for (const name of [...manifest.indexesByName, ...manifest.customIndexes]) {
    assert(actualIndexes.has(name), `missing expected index ${name}`);
  }

  const { rows: fkRows } = await client.query(`
    SELECT conname FROM pg_constraint WHERE contype = 'f'
  `);
  const actualForeignKeys = new Set(fkRows.map((row) => row.conname));
  for (const name of manifest.foreignKeysByName) {
    assert(actualForeignKeys.has(name.slice(0, 63)), `missing expected foreign key ${name.slice(0, 63)}`);
  }

  const { rows: sequenceRows } = await client.query(`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  `);
  const actualSequences = new Set(sequenceRows.map((row) => row.sequencename));
  for (const name of manifest.customSequences) {
    assert(actualSequences.has(name), `missing custom sequence ${name}`);
  }

  const { rows: settingRows } = await client.query(`
    SELECT key, value FROM system_settings
    WHERE key = ANY($1::text[])
    ORDER BY key
  `, [["s3UsedBytes", "sidebarVisibility", "staffLimit"]]);
  assert.deepEqual(
    settingRows.map((row) => [row.key, row.value]),
    [["s3UsedBytes", "0"], ["sidebarVisibility", "{}"], ["staffLimit", env.STAFF_LIMIT]],
    "fresh-center settings must be seeded with the agreed defaults",
  );
  const { rows: passwordRows } = await client.query(
    "SELECT password_hash FROM users WHERE username = 'admin'",
  );
  assert.equal(passwordRows.length, 1, "bootstrap admin must exist");
  assert.notEqual(passwordRows[0].password_hash, "admin123");
  console.log("[db:test-bootstrap] Verified tables, indexes, foreign keys, sequences, settings, and repeat safety.");
} finally {
  await client.end();
}
