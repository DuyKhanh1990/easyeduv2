import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

type JournalEntry = { idx: number; tag: string; breakpoints?: boolean };
type Snapshot = {
  tables: Record<
    string,
    {
      name: string;
      columns: Record<string, { type: string; notNull: boolean }>;
      indexes: Record<string, { name: string }>;
      foreignKeys: Record<string, { name: string }>;
    }
  >;
};

const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DB migration stopped: APP_DATABASE_URL or DATABASE_URL is required.");
  process.exit(1);
}

const migrationDir = path.resolve(process.env.EASYEDU_MIGRATIONS_DIR || "migrations/easyedu");
const ledgerName = "easyedu_migrations";
const advisoryLockId = 731905220;

function normalizeType(type: string): string {
  return type
    .toLowerCase()
    .replace(/^varchar(?=\(|$)/, "character varying")
    .replace(/^timestamp$/, "timestamp without time zone")
    .replace(/^timestamptz$/, "timestamp with time zone")
    .replace(/^time$/, "time without time zone")
    .replace(/^serial$/, "integer")
    .replace(/,\s+/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMigration(sql: string): string[] {
  return sql
    .split(/--> statement-breakpoint/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeSql(tag: string, sql: string): void {
  const prohibited = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+COLUMN\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i,
  ];
  if (prohibited.some((pattern) => pattern.test(sql))) {
    throw new Error(`Migration ${tag} contains blocked destructive or type-changing SQL.`);
  }
}

async function readMigrations() {
  const journal = JSON.parse(
    await readFile(path.join(migrationDir, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const migrations = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const sql = await readFile(path.join(migrationDir, `${entry.tag}.sql`), "utf8");
    assertSafeSql(entry.tag, sql);
    migrations.push({
      tag: entry.tag,
      sql,
      hash: sha256(sql),
      statements: splitMigration(sql),
    });
  }
  return migrations;
}

async function tableCount(client: PoolClient): Promise<number> {
  const result = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '${ledgerName}'
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function verifyLegacySchema(client: PoolClient): Promise<void> {
  const snapshot = JSON.parse(
    await readFile(path.join(migrationDir, "meta/0002_snapshot.json"), "utf8"),
  ) as Snapshot;
  const expectedTables = Object.values(snapshot.tables);
  const actual = await client.query<{
    table_name: string;
    column_name: string;
    formatted_type: string;
    not_null: boolean;
  }>(`
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS formatted_type,
           a.attnotnull AS not_null
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> '${ledgerName}'
  `);

  const actualColumns = new Map<string, Map<string, { type: string; notNull: boolean }>>();
  for (const row of actual.rows) {
    let columns = actualColumns.get(row.table_name);
    if (!columns) {
      columns = new Map();
      actualColumns.set(row.table_name, columns);
    }
    columns.set(row.column_name, {
      type: normalizeType(row.formatted_type),
      notNull: row.not_null,
    });
  }

  const problems: string[] = [];
  for (const expected of expectedTables) {
    const actualCols = actualColumns.get(expected.name);
    if (!actualCols) {
      problems.push(`missing table ${expected.name}`);
      continue;
    }
    for (const [name, expectedColumn] of Object.entries(expected.columns)) {
      const actualColumn = actualCols.get(name);
      if (!actualColumn) {
        problems.push(`missing column ${expected.name}.${name}`);
        continue;
      }
      if (
        normalizeType(expectedColumn.type) !== actualColumn.type ||
        expectedColumn.notNull !== actualColumn.notNull
      ) {
        problems.push(
          `incompatible column ${expected.name}.${name}: expected ${expectedColumn.type}${expectedColumn.notNull ? " NOT NULL" : ""}, found ${actualColumn.type}${actualColumn.notNull ? " NOT NULL" : ""}`,
        );
      }
    }
  }
  if (problems.length) {
    throw new Error(
      `Legacy database has no migration ledger and cannot be safely adopted. ` +
        `No schema changes were made. Resolve these differences with a reviewed migration:\n- ${problems.join("\n- ")}`,
    );
  }
}

async function main() {
  const migrations = await readMigrations();
  if (!migrations.length) throw new Error("No EasyEdu migrations found in image.");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 15000,
    application_name: "easyedu-db-migrate",
  });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    const existingTables = await tableCount(client);
    const ledgerExists = await client.query(`
      SELECT to_regclass('public.${ledgerName}') IS NOT NULL AS exists
    `);

    if (!ledgerExists.rows[0].exists && existingTables > 0) {
      await verifyLegacySchema(client);
      await client.query(`
        CREATE TABLE public.${ledgerName} (
          tag text PRIMARY KEY,
          hash text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      for (const migration of migrations) {
        await client.query(
          `INSERT INTO public.${ledgerName} (tag, hash) VALUES ($1, $2)`,
          [migration.tag, migration.hash],
        );
      }
      console.log(
        `Adopted existing schema after table/column type verification; recorded ${migrations.length} baseline migrations. No DDL was applied.`,
      );
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.${ledgerName} (
        tag text PRIMARY KEY,
        hash text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<{ tag: string; hash: string }>(
      `SELECT tag, hash FROM public.${ledgerName} ORDER BY applied_at, tag`,
    );
    const appliedByTag = new Map(applied.rows.map((row) => [row.tag, row.hash]));
    const knownTags = new Set(migrations.map((migration) => migration.tag));
    const unknownTags = applied.rows.filter((row) => !knownTags.has(row.tag));
    if (unknownTags.length) {
      throw new Error(
        `Database contains migrations newer than this image: ${unknownTags.map((row) => row.tag).join(", ")}. Refusing downgrade.`,
      );
    }

    for (const migration of migrations) {
      const previousHash = appliedByTag.get(migration.tag);
      if (previousHash) {
        if (previousHash !== migration.hash) {
          throw new Error(`Applied migration ${migration.tag} has a different checksum.`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO public.${ledgerName} (tag, hash) VALUES ($1, $2)`,
          [migration.tag, migration.hash],
        );
        await client.query("COMMIT");
        console.log(`Applied ${migration.tag}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${migration.tag} failed and was rolled back: ${(error as Error).message}`,
        );
      }
    }
    console.log("EasyEdu database migrations are up to date.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(`EasyEdu migration failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
