import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const targetUrl = process.env.TARGET_DB_URL;

if (!targetUrl) {
  console.error("[db-migrations] TARGET_DB_URL is required; refusing to fall back to a Replit database.");
  process.exit(1);
}

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/deploy");
const migrationNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

async function main() {
  const client = new Client({ connectionString: targetUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();

  let lockAcquired = false;
  try {
    const { rows: dbRows } = await client.query("SELECT current_database() AS name");
    console.log(`[db-migrations] Connected to target database "${dbRows[0]?.name ?? "unknown"}".`);

    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["easyedu-deploy-schema-migrations"]);
    lockAcquired = true;

    const { rows: ledgerTable } = await client.query(
      "SELECT to_regclass('public.deployment_schema_migrations') AS table_name",
    );
    if (!ledgerTable[0]?.table_name) {
      throw new Error("Migration ledger is missing; run scripts/push-db-direct.ts first.");
    }

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (!migrationNamePattern.test(file)) {
        throw new Error(`Invalid migration filename: ${file}`);
      }

      const sql = (await readFile(resolve(migrationsDir, file), "utf8")).trim();
      if (!sql) throw new Error(`Migration is empty: ${file}`);

      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows: appliedRows } = await client.query(
        "SELECT checksum FROM public.deployment_schema_migrations WHERE name = $1",
        [file],
      );

      if (appliedRows.length > 0) {
        if (appliedRows[0].checksum !== checksum) {
          throw new Error(`Applied migration was edited: ${file}. Add a new migration instead.`);
        }
        console.log(`[db-migrations] Already applied: ${file}`);
        continue;
      }

      console.log(`[db-migrations] Applying: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.deployment_schema_migrations (name, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("[db-migrations] Schema migrations are up to date.");
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["easyedu-deploy-schema-migrations"]);
    }
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db-migrations] Failed: ${message}`);
  process.exit(1);
});
