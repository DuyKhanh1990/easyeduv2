import { generateDrizzleJson, generateMigration, type DrizzleSnapshotJSON } from "drizzle-kit/api";
import { Client } from "pg";
import * as sharedSchema from "../shared/schema";
import * as gatewaySchema from "../gateway/src/schema";
import * as chatSchema from "../shared/models/chat";

const targetUrl =
  process.env.TARGET_DB_URL ||
  process.env.APP_DATABASE_URL ||
  process.env.DATABASE_URL;
const syncMode = process.env.SCHEMA_SYNC || "dry-run";
const advisoryLockId = "727141984322";
const identifierPattern = String.raw`(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)`;
const nativeProcessExit = process.exit.bind(process);

type StatementKind = "table" | "sequence" | "type" | "column" | "index" | "foreign-key";

interface ClassifiedStatement {
  sql: string;
  kind: StatementKind;
}

interface ExistingSchema {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
  enums: Set<string>;
  sequences: Set<string>;
}

function lastIdentifier(identifier: string): string | undefined {
  const parts = identifier.match(/"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*/g);
  const last = parts?.at(-1);
  if (!last) return undefined;
  return last.startsWith('"')
    ? last.slice(1, -1).replaceAll('""', '"')
    : last.toLowerCase();
}

function createdTableName(statement: string): string | undefined {
  const match = statement.match(
    new RegExp(`^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${identifierPattern}(?:\\s*\\.\\s*${identifierPattern})?)`, "i"),
  );
  return match?.[1] ? lastIdentifier(match[1]) : undefined;
}

function alteredTableName(statement: string): string | undefined {
  const match = statement.match(
    new RegExp(`^\\s*ALTER\\s+TABLE\\s+(${identifierPattern}(?:\\s*\\.\\s*${identifierPattern})?)`, "i"),
  );
  return match?.[1] ? lastIdentifier(match[1]) : undefined;
}

function classifyStatement(
  statement: string,
  newlyCreatedTables: Set<string>,
): ClassifiedStatement | undefined {
  const sql = statement.trim().replace(/;+$/, "");
  if (/^CREATE\s+TABLE\b/i.test(sql)) return { sql, kind: "table" };
  if (/^CREATE\s+SEQUENCE\b/i.test(sql)) return { sql, kind: "sequence" };
  if (/^CREATE\s+TYPE\b/i.test(sql)) return { sql, kind: "type" };
  if (
    new RegExp(
      `^ALTER\\s+TABLE\\s+${identifierPattern}(?:\\s*\\.\\s*${identifierPattern})?\\s+ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`,
      "i",
    ).test(sql)
  ) {
    return { sql, kind: "column" };
  }

  if (/^CREATE\s+UNIQUE\s+INDEX\b/i.test(sql)) {
    const match = sql.match(
      new RegExp(
        `^\\s*CREATE\\s+UNIQUE\\s+INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${identifierPattern}\\s+ON\\s+(${identifierPattern}(?:\\s*\\.\\s*${identifierPattern})?)`,
        "i",
      ),
    );
    const table = match?.[1] ? lastIdentifier(match[1]) : undefined;
    return table && newlyCreatedTables.has(table) ? { sql, kind: "index" } : undefined;
  }
  if (/^CREATE\s+INDEX\b/i.test(sql)) return { sql, kind: "index" };

  const foreignKeyMatch = sql.match(
    new RegExp(
      `^\\s*ALTER\\s+TABLE\\s+(${identifierPattern}(?:\\s*\\.\\s*${identifierPattern})?)\\s+ADD\\s+CONSTRAINT\\s+${identifierPattern}\\s+FOREIGN\\s+KEY\\s*\\([^)]*\\)\\s+REFERENCES\\b`,
      "i",
    ),
  );
  const foreignKeyTable = foreignKeyMatch?.[1]
    ? lastIdentifier(foreignKeyMatch[1])
    : undefined;
  if (foreignKeyTable && newlyCreatedTables.has(foreignKeyTable)) {
    return { sql, kind: "foreign-key" };
  }

  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expressionUsesMissingColumn(expression: string, missingColumns: Set<string>): boolean {
  for (const column of missingColumns) {
    const escaped = escapeRegExp(column);
    if (new RegExp(`(^|[^A-Za-z0-9_$])"?${escaped}"?([^A-Za-z0-9_$]|$)`, "i").test(expression)) {
      return true;
    }
  }
  return false;
}

function removeMissingColumnDependencies(
  table: DrizzleSnapshotJSON["tables"][string],
  missingColumns: Set<string>,
  missingColumnsByTable: Map<string, Set<string>>,
): void {
  for (const [indexName, index] of Object.entries(table.indexes)) {
    if (index.columns.some((column) => expressionUsesMissingColumn(column.expression, missingColumns))) {
      delete table.indexes[indexName];
    }
  }
  for (const [key, foreignKey] of Object.entries(table.foreignKeys)) {
    const referencedTable = `${foreignKey.schemaTo ?? "public"}.${foreignKey.tableTo}`;
    const missingReferencedColumns = missingColumnsByTable.get(referencedTable) ?? new Set<string>();
    if (
      foreignKey.columnsFrom.some((column) => missingColumns.has(column)) ||
      foreignKey.columnsTo.some((column) => missingReferencedColumns.has(column))
    ) {
      delete table.foreignKeys[key];
    }
  }
  for (const [key, constraint] of Object.entries(table.uniqueConstraints)) {
    if (constraint.columns.some((column) => missingColumns.has(column))) {
      delete table.uniqueConstraints[key];
    }
  }
  for (const [key, primaryKey] of Object.entries(table.compositePrimaryKeys)) {
    if (primaryKey.columns.some((column) => missingColumns.has(column))) {
      delete table.compositePrimaryKeys[key];
    }
  }
  for (const [key, constraint] of Object.entries(table.checkConstraints)) {
    if (expressionUsesMissingColumn(constraint.value, missingColumns)) {
      delete table.checkConstraints[key];
    }
  }
}

async function readExistingSchema(
  client: Client,
  checkEnums: boolean,
  checkSequences: boolean,
): Promise<ExistingSchema> {
  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = $2`,
    ["public", "BASE TABLE"],
  );
  const { rows: columnRows } = await client.query<{
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = $1`,
    ["public"],
  );

  const tables = new Set(tableRows.map((row) => row.table_name));
  const columns = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const names = columns.get(row.table_name) ?? new Set<string>();
    names.add(row.column_name);
    columns.set(row.table_name, names);
  }

  let enums = new Set<string>();
  if (checkEnums) {
    const { rows } = await client.query<{ enum_name: string }>(
      `SELECT DISTINCT t.typname AS enum_name
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = $1 AND t.typtype = $2`,
      ["public", "e"],
    );
    enums = new Set(rows.map((row) => row.enum_name));
  }

  let sequences = new Set<string>();
  if (checkSequences) {
    const { rows } = await client.query<{ sequencename: string }>(
      `SELECT sequencename FROM pg_sequences WHERE schemaname = $1`,
      ["public"],
    );
    sequences = new Set(rows.map((row) => row.sequencename));
  }

  return { tables, columns, enums, sequences };
}

function buildPreviousSnapshot(
  current: DrizzleSnapshotJSON,
  existing: ExistingSchema,
): {
  previous: DrizzleSnapshotJSON;
  missingTables: string[];
  missingColumns: string[];
  missingEnums: string[];
} {
  const previous = structuredClone(current) as DrizzleSnapshotJSON;
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingColumnsByTable = new Map<string, Set<string>>();

  for (const [tableKey, table] of Object.entries(previous.tables)) {
    const tableName = table.name;
    if (!existing.tables.has(tableName)) {
      delete previous.tables[tableKey];
      delete previous.internal?.tables[tableName];
      missingTables.push(tableName);
      continue;
    }

    const actualColumns = existing.columns.get(tableName) ?? new Set<string>();
    const missingForTable = new Set(
      Object.keys(table.columns).filter((columnName) => !actualColumns.has(columnName)),
    );
    missingColumnsByTable.set(`${table.schema || "public"}.${tableName}`, missingForTable);
    for (const columnName of missingForTable) {
      missingColumns.push(`${tableName}.${columnName}`);
    }
  }

  for (const table of Object.values(previous.tables)) {
    const tableName = table.name;
    const missingForTable =
      missingColumnsByTable.get(`${table.schema || "public"}.${tableName}`) ?? new Set<string>();
    for (const columnName of missingForTable) {
      delete table.columns[columnName];
      delete previous.internal?.tables[tableName]?.columns[columnName];
    }
    removeMissingColumnDependencies(table, missingForTable, missingColumnsByTable);
  }

  const missingEnums = Object.entries(previous.enums)
    .filter(([, enumType]) => !existing.enums.has(enumType.name))
    .map(([, enumType]) => enumType.name);
  for (const [key, enumType] of Object.entries(previous.enums)) {
    if (!existing.enums.has(enumType.name)) delete previous.enums[key];
  }

  for (const [key, sequence] of Object.entries(previous.sequences)) {
    if (!existing.sequences.has(sequence.name)) delete previous.sequences[key];
  }

  return { previous, missingTables, missingColumns, missingEnums };
}

function reportUnexpectedError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (syncMode === "dry-run") {
    console.warn(`[sync-schema] CẢNH BÁO (dry-run): ${message}`);
    nativeProcessExit(0);
  }
  console.error(`[sync-schema] Lỗi: ${message}`);
  nativeProcessExit(1);
}

process.on("unhandledRejection", reportUnexpectedError);
process.on("uncaughtException", reportUnexpectedError);

async function runWithDryRunExitGuard<T>(operation: () => T | Promise<T>): Promise<T> {
  if (syncMode !== "dry-run") return operation();

  const originalExit = process.exit;
  process.exit = ((code?: number): never => {
    throw new Error(`Drizzle Kit requested process.exit(${code ?? 0})`);
  }) as typeof process.exit;
  try {
    return await operation();
  } finally {
    process.exit = originalExit;
  }
}

async function main(): Promise<void> {
  if (syncMode === "off") {
    console.log("[sync-schema] SCHEMA_SYNC=off; bỏ qua đồng bộ schema");
    return;
  }
  if (syncMode !== "dry-run" && syncMode !== "apply") {
    throw new Error(`SCHEMA_SYNC không hợp lệ: ${syncMode}. Dùng off, dry-run hoặc apply.`);
  }
  if (!targetUrl) {
    throw new Error("Thiếu TARGET_DB_URL, APP_DATABASE_URL hoặc DATABASE_URL");
  }

  const client = new Client({
    connectionString: targetUrl,
    connectionTimeoutMillis: 15_000,
  });
  let lockAcquired = false;
  let transactionStarted = false;

  try {
    await client.connect();
    if (syncMode === "apply") {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [advisoryLockId]);
      lockAcquired = true;
    }

    const schemaImports = {
      ...sharedSchema,
      ...gatewaySchema,
      ...chatSchema,
    };
    const current = (await runWithDryRunExitGuard(() =>
      generateDrizzleJson(schemaImports),
    )) as DrizzleSnapshotJSON;
    const existing = await readExistingSchema(
      client,
      Object.keys(current.enums).length > 0,
      Object.keys(current.sequences).length > 0,
    );
    const { previous, missingTables, missingColumns, missingEnums } =
      buildPreviousSnapshot(current, existing);
    const statementsToExecute = await runWithDryRunExitGuard(() =>
      generateMigration(previous, current),
    );
    const newlyCreatedTables = new Set(
      statementsToExecute
        .map(createdTableName)
        .filter((name): name is string => Boolean(name)),
    );
    const safeStatements: ClassifiedStatement[] = [];
    const skippedStatements: string[] = [];

    for (const statement of statementsToExecute) {
      const sql = statement.trim().replace(/;+$/, "");
      const tableWithAddedColumn = alteredTableName(sql);
      if (
        /\bADD\s+COLUMN\b/i.test(sql) &&
        /\bNOT\s+NULL\b/i.test(sql) &&
        !/\bDEFAULT\b/i.test(sql) &&
        tableWithAddedColumn &&
        !newlyCreatedTables.has(tableWithAddedColumn)
      ) {
        console.log(
          `[sync-schema] CẢNH BÁO: cột NOT NULL không có DEFAULT trên bảng đã có thể bị từ chối: ${sql}`,
        );
      }

      const classified = classifyStatement(statement, newlyCreatedTables);
      if (classified) {
        safeStatements.push(classified);
        console.log(`[sync-schema] SẼ CHẠY: ${classified.sql}`);
      } else {
        skippedStatements.push(sql);
        console.log(`[sync-schema] BỎ QUA (không an toàn): ${sql}`);
      }
    }

    if (syncMode === "dry-run") {
      console.log(
        `[sync-schema] Đối tượng DB đang thiếu: ${missingTables.length} bảng (${missingTables.join(", ") || "không có"}), ${missingColumns.length} cột (${missingColumns.join(", ") || "không có"}), ${missingEnums.length} enum (${missingEnums.join(", ") || "không có"})`,
      );
      console.log("[sync-schema] Dry-run: không ghi thay đổi vào database");
    }

    if (syncMode === "apply" && safeStatements.length > 0) {
      await client.query("BEGIN");
      transactionStarted = true;
      for (const statement of safeStatements) {
        await client.query(statement.sql);
      }
      await client.query("COMMIT");
      transactionStarted = false;
    }

    const count = (kind: StatementKind) =>
      safeStatements.filter((statement) => statement.kind === kind).length;
    console.log(
      `[sync-schema] Tóm tắt: ${count("table")} bảng, ${count("column")} cột, ${count("index")} index, ${skippedStatements.length} câu bị bỏ qua`,
    );
  } finally {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      try {
        if (lockAcquired) {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [advisoryLockId]);
        }
      } finally {
        await client.end();
      }
    }
  }
}

main().catch(reportUnexpectedError);
