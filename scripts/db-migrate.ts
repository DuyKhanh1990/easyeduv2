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
      columns: Record<string, { type: string; notNull: boolean; primaryKey?: boolean }>;
      indexes: Record<
        string,
        {
          name: string;
          columns: {
            expression: string;
            isExpression: boolean;
            asc: boolean;
            nulls: "first" | "last";
          }[];
          isUnique: boolean;
          method: string;
          where?: string;
        }
      >;
      foreignKeys: Record<
        string,
        {
          name: string;
          tableFrom: string;
          tableTo: string;
          columnsFrom: string[];
          columnsTo: string[];
          onDelete: string;
          onUpdate: string;
        }
      >;
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

function normalizeSqlFragment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/\b[a-z_][a-z0-9_]*\./g, "")
    .replace(/[()\s]/g, "")
    .replace(/::[a-z_][a-z0-9_ ]*/g, "")
    .replace(/;$/, "");
}

function normalizeIndexColumn(
  expression: string,
  descending: boolean,
  nulls: "first" | "last",
): string {
  return (
    normalizeSqlFragment(expression) +
    (descending ? "desc" : "asc") +
    `nulls${nulls}`
  );
}

function truncatePgIdentifier(name: string): string {
  let result = "";
  for (const char of name) {
    if (Buffer.byteLength(result + char, "utf8") > 63) break;
    result += char;
  }
  return result;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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

async function readLatestSnapshot(): Promise<Snapshot> {
  const journal = JSON.parse(
    await readFile(path.join(migrationDir, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const latest = [...journal.entries].sort((a, b) => a.idx - b.idx).at(-1);
  if (!latest) throw new Error("Migration journal has no entries.");
  const snapshotName = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  return JSON.parse(
    await readFile(path.join(migrationDir, "meta", snapshotName), "utf8"),
  ) as Snapshot;
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
  const snapshot = await readLatestSnapshot();
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

  const actualIndexes = await client.query<{
    name: string;
    table_name: string;
    is_unique: boolean;
    method: string;
    predicate: string | null;
    columns: string[];
  }>(`
    SELECT index_class.relname AS name,
           table_class.relname AS table_name,
           index_info.indisunique AS is_unique,
           access_method.amname AS method,
           pg_get_expr(index_info.indpred, index_info.indrelid) AS predicate,
           ARRAY(
             SELECT pg_get_indexdef(index_info.indexrelid, ordinal.n, true) ||
                    CASE WHEN (COALESCE(index_info.indoption[ordinal.n - 1], 0) & 1) = 1
                         THEN ' DESC' ELSE ' ASC' END ||
                    CASE WHEN (COALESCE(index_info.indoption[ordinal.n - 1], 0) & 2) = 2
                         THEN ' NULLS FIRST' ELSE ' NULLS LAST' END
             FROM generate_series(1, index_info.indnatts) AS ordinal(n)
             ORDER BY ordinal.n
           ) AS columns
    FROM pg_index index_info
    JOIN pg_class index_class ON index_class.oid = index_info.indexrelid
    JOIN pg_class table_class ON table_class.oid = index_info.indrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    WHERE table_namespace.nspname = 'public'
      AND index_class.relname NOT LIKE 'easyedu_migrations%'
  `);
  const indexMap = new Map(actualIndexes.rows.map((row) => [row.name, row]));
  for (const expectedTable of expectedTables) {
    for (const expectedIndex of Object.values(expectedTable.indexes)) {
      const actualIndex = indexMap.get(truncatePgIdentifier(expectedIndex.name));
      if (!actualIndex) {
        problems.push(`missing index ${expectedIndex.name}`);
        continue;
      }
      const expectedColumns = expectedIndex.columns.map((column) =>
        normalizeIndexColumn(
          column.expression,
          !column.asc,
          column.nulls,
        ),
      );
      const actualColumns = actualIndex.columns.map((column) =>
        normalizeSqlFragment(column),
      );
      if (
        actualIndex.table_name !== expectedTable.name ||
        actualIndex.is_unique !== expectedIndex.isUnique ||
        actualIndex.method !== expectedIndex.method ||
        JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns) ||
        Boolean(actualIndex.predicate) !== Boolean(expectedIndex.where) ||
        (actualIndex.predicate &&
          expectedIndex.where &&
          normalizeSqlFragment(actualIndex.predicate) !==
            normalizeSqlFragment(expectedIndex.where))
      ) {
        problems.push(`incompatible index ${expectedIndex.name}`);
      }
    }
  }

  const constraints = await client.query<{
    name: string;
    kind: string;
    table_name: string;
    referenced_table: string | null;
    columns: string[];
    referenced_columns: string[];
    on_delete: string | null;
    on_update: string | null;
  }>(`
    SELECT constraint_row.conname AS name,
           constraint_row.contype AS kind,
           source_table.relname AS table_name,
           referenced_table.relname AS referenced_table,
           ARRAY(
             SELECT attribute.attname
             FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.conrelid
              AND attribute.attnum = key.attnum
             ORDER BY key.ordinal
           )::text[] AS columns,
           ARRAY(
             SELECT attribute.attname
             FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ordinal)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.confrelid
              AND attribute.attnum = key.attnum
             ORDER BY key.ordinal
           )::text[] AS referenced_columns,
           constraint_row.confdeltype AS on_delete,
           constraint_row.confupdtype AS on_update
    FROM pg_constraint constraint_row
    JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_table.relnamespace
    LEFT JOIN pg_class referenced_table ON referenced_table.oid = constraint_row.confrelid
    WHERE source_namespace.nspname = 'public'
  `);
  const constraintMap = new Map(
    constraints.rows.map((row) => [row.name, row]),
  );
  const actionMap: Record<string, string> = {
    a: "no action",
    r: "restrict",
    c: "cascade",
    n: "set null",
    d: "set default",
  };
  const expectedPrimaryKeys: Array<{ table: string; columns: string[] }> = [];
  for (const expectedTable of expectedTables) {
    const pkColumns = Object.entries(expectedTable.columns)
      .filter(([, column]) => column.primaryKey)
      .map(([name]) => name);
    if (pkColumns.length) expectedPrimaryKeys.push({ table: expectedTable.name, columns: pkColumns });
    for (const expectedFk of Object.values(expectedTable.foreignKeys)) {
      const actualFk = constraintMap.get(truncatePgIdentifier(expectedFk.name));
      if (
        !actualFk ||
        actualFk.kind !== "f" ||
        actualFk.table_name !== expectedTable.name ||
        actualFk.referenced_table !== expectedFk.tableTo ||
        JSON.stringify(actualFk.columns) !== JSON.stringify(expectedFk.columnsFrom) ||
        JSON.stringify(actualFk.referenced_columns) !== JSON.stringify(expectedFk.columnsTo) ||
        actionMap[actualFk.on_delete ?? ""] !== expectedFk.onDelete.toLowerCase() ||
        actionMap[actualFk.on_update ?? ""] !== expectedFk.onUpdate.toLowerCase()
      ) {
        problems.push(`missing or incompatible foreign key ${expectedFk.name}`);
      }
    }
  }
  for (const primaryKey of expectedPrimaryKeys) {
    const actualPrimaryKey = constraints.rows.find(
      (row) =>
        row.kind === "p" &&
        row.table_name === primaryKey.table &&
        JSON.stringify(row.columns) === JSON.stringify(primaryKey.columns),
    );
    if (!actualPrimaryKey) problems.push(`missing or incompatible primary key on ${primaryKey.table}`);
  }

  const manualSql = await readFile(
    path.join(migrationDir, "0001_manual_database_objects.sql"),
    "utf8",
  );
  const manualIndexes = [
    ...manualSql.matchAll(
      /CREATE\s+(UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"(?:\s+USING\s+([a-z0-9_]+))?\s*\(([^;]+?)\)(?:\s+WHERE\s+([^;]+?))?\s*;/gi,
    ),
  ];
  const manualIndexNames = [
    ...manualSql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"/gi),
  ];
  if (manualIndexes.length !== manualIndexNames.length) {
    problems.push("could not parse all manual index definitions");
  }
  for (const match of manualIndexes) {
    const [, unique, rawName, tableName, method, columnsSql, predicateSql] = match;
    const name = truncatePgIdentifier(rawName);
    const actualIndex = indexMap.get(name);
    const expectedColumns = columnsSql.split(",").map((column) => {
      const descending = /\bDESC\b/i.test(column);
      const nulls = /\bNULLS\s+FIRST\b/i.test(column)
        ? "first"
        : /\bNULLS\s+LAST\b/i.test(column)
          ? "last"
          : descending
            ? "first"
            : "last";
      const expression = column
        .replace(/\s+(?:ASC|DESC)\b/gi, "")
        .replace(/\s+NULLS\s+(?:FIRST|LAST)\b/gi, "")
        .trim();
      return normalizeIndexColumn(expression, descending, nulls);
    });
    const actualColumns = actualIndex?.columns.map(normalizeSqlFragment) ?? [];
    if (
      !actualIndex ||
      actualIndex.table_name !== tableName ||
      actualIndex.is_unique !== Boolean(unique) ||
      actualIndex.method !== (method || "btree") ||
      JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns) ||
      Boolean(actualIndex.predicate) !== Boolean(predicateSql) ||
      (actualIndex.predicate &&
        predicateSql &&
        normalizeSqlFragment(actualIndex.predicate) !==
          normalizeSqlFragment(predicateSql))
    ) {
      problems.push(
        `missing or incompatible manual index ${rawName}: expected ${tableName} ${unique ? "unique " : ""}${method || "btree"} (${expectedColumns.join(",")})${predicateSql ? ` WHERE ${normalizeSqlFragment(predicateSql)}` : ""}; found ${actualIndex ? `${actualIndex.table_name} ${actualIndex.is_unique ? "unique " : ""}${actualIndex.method} (${actualColumns.join(",")})${actualIndex.predicate ? ` WHERE ${normalizeSqlFragment(actualIndex.predicate)}` : ""}` : "absent"}`,
      );
    }
  }
  const manualSequenceNames = [...manualSql.matchAll(/CREATE\s+SEQUENCE\s+"([^"]+)"/gi)]
    .map((match) => match[1])
    .map(truncatePgIdentifier);
  const actualSequences = await client.query<{ name: string }>(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  `);
  const sequenceNames = new Set(actualSequences.rows.map((row) => row.name));
  for (const sequenceName of manualSequenceNames) {
    if (!sequenceNames.has(sequenceName)) problems.push(`missing sequence ${sequenceName}`);
  }
  if (!actualIndexes.rows.some((row) => row.name === "idx_bidv_va_invoice_id") ||
      !actualIndexes.rows.some((row) => row.name === "idx_bidv_va_schedule_id")) {
    problems.push("missing BIDV partial indexes");
  }
  const specialObjects = await client.query<{ function_exists: boolean; trigger_exists: boolean; student_id_nullable: boolean }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'update_student_status'
      ) AS function_exists,
      EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'student_classes'
          AND t.tgname = 'student_status_trigger' AND NOT t.tgisinternal
      ) AS trigger_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bidv_virtual_accounts'
          AND column_name = 'student_id' AND is_nullable = 'YES'
      ) AS student_id_nullable
  `);
  const special = specialObjects.rows[0];
  if (!special?.function_exists) problems.push("missing function update_student_status");
  if (!special?.trigger_exists) problems.push("missing trigger student_status_trigger");
  if (!special?.student_id_nullable) problems.push("bidv_virtual_accounts.student_id must be nullable");

  if (problems.length) {
    throw new Error(
      `Legacy database has no migration ledger and cannot be safely adopted. ` +
        `No schema changes were made. Resolve these differences with a reviewed migration:\n- ${problems.join("\n- ")}`,
    );
  }
}

async function addSafeMissingColumns(client: PoolClient): Promise<void> {
  const snapshot = await readLatestSnapshot();
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

  const additions: Array<{
    table: string;
    column: string;
    type: string;
    notNull: boolean;
    defaultValue?: string;
  }> = [];
  const missingTables: string[] = [];
  for (const expectedTable of Object.values(snapshot.tables)) {
    const actualTable = actualColumns.get(expectedTable.name);
    if (!actualTable) {
      missingTables.push(expectedTable.name);
      continue;
    }
    for (const [columnName, expectedColumn] of Object.entries(expectedTable.columns)) {
      const actualColumn = actualTable.get(columnName);
      if (!actualColumn) {
        additions.push({
          table: expectedTable.name,
          column: columnName,
          type: expectedColumn.type,
          notNull: expectedColumn.notNull,
          defaultValue: (expectedColumn as { default?: string }).default,
        });
        continue;
      }
      if (
        normalizeType(expectedColumn.type) !== actualColumn.type ||
        expectedColumn.notNull !== actualColumn.notNull
      ) {
        throw new Error(
          `Legacy schema mismatch at ${expectedTable.name}.${columnName}: expected ${expectedColumn.type}${expectedColumn.notNull ? " NOT NULL" : ""}, found ${actualColumn.type}${actualColumn.notNull ? " NOT NULL" : ""}. No changes were made.`,
        );
      }
    }
  }
  if (missingTables.length) {
    throw new Error(
      `Legacy database is missing tables (${missingTables.slice(0, 20).join(", ")}). No changes were made; a reviewed table migration is required.`,
    );
  }

  const safeConstantDefault =
    /^(?:'(?:[^']|'')*'(?:\:\:[a-zA-Z0-9_ ]+)?|-?\d+(?:\.\d+)?|true|false|null)$/i;
  for (const addition of additions) {
    if (
      !/^[a-zA-Z0-9_(), .\[\]]+$/.test(addition.type) ||
      (addition.defaultValue !== undefined &&
        !safeConstantDefault.test(addition.defaultValue.trim())) ||
      (addition.notNull && addition.defaultValue === undefined)
    ) {
      throw new Error(
        `Cannot safely add ${addition.table}.${addition.column} to a legacy database. A reviewed migration is required; no changes were made.`,
      );
    }
  }

  for (const addition of additions) {
    const defaultSql =
      addition.defaultValue === undefined ? "" : ` DEFAULT ${addition.defaultValue}`;
    const nullSql = addition.notNull ? " NOT NULL" : "";
    await client.query(
      `ALTER TABLE public.${quoteIdentifier(addition.table)} ADD COLUMN ${quoteIdentifier(addition.column)} ${addition.type}${defaultSql}${nullSql}`,
    );
    console.log(`Added verified safe column ${addition.table}.${addition.column}`);
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
      await client.query("BEGIN");
      try {
        await addSafeMissingColumns(client);
        await verifyLegacySchema(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
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
