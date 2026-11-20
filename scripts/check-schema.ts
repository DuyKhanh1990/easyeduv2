import { isTable } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { Client } from "pg";
import * as sharedSchema from "../shared/schema";
import * as gatewaySchema from "../gateway/src/schema";
import * as chatSchema from "../shared/models/chat";

const targetUrl =
  process.env.TARGET_DB_URL ||
  process.env.APP_DATABASE_URL ||
  process.env.DATABASE_URL;

const centerId = process.env.CENTER_ID;
if (centerId) {
  console.log(`[check-schema] CENTER_ID: ${centerId}`);
}

if (!targetUrl) {
  console.error("[check-schema] Missing TARGET_DB_URL, APP_DATABASE_URL, or DATABASE_URL");
  process.exit(1);
}

const expectedTables = new Map<string, Set<string>>();

for (const schemaModule of [sharedSchema, gatewaySchema, chatSchema]) {
  for (const exportedValue of Object.values(schemaModule)) {
    if (!isTable(exportedValue)) continue;

    const config = getTableConfig(exportedValue as PgTable);
    const columns = expectedTables.get(config.name) ?? new Set<string>();
    for (const column of config.columns) {
      columns.add(column.name);
    }
    expectedTables.set(config.name, columns);
  }
}

async function checkSchema(): Promise<void> {
  const client = new Client({
    connectionString: targetUrl,
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();

    const { rows: existingTables } = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = $2`,
      ["public", "BASE TABLE"],
    );
    const existingTableNames = new Set(existingTables.map((row) => row.table_name));

    const { rows: existingColumns } = await client.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = $1`,
      ["public"],
    );
    const existingColumnNames = new Map<string, Set<string>>();
    for (const row of existingColumns) {
      const columns = existingColumnNames.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      existingColumnNames.set(row.table_name, columns);
    }

    const missingTables = [...expectedTables.keys()]
      .filter((tableName) => !existingTableNames.has(tableName))
      .sort();
    const missingColumns: string[] = [];

    for (const [tableName, expectedColumns] of expectedTables) {
      const actualColumns = existingColumnNames.get(tableName);
      for (const columnName of expectedColumns) {
        if (actualColumns?.has(columnName)) continue;
        missingColumns.push(`${tableName}.${columnName}`);
      }
    }
    missingColumns.sort();

    if (missingTables.length === 0 && missingColumns.length === 0) {
      console.log(`[check-schema] OK: đủ ${expectedTables.size}/${expectedTables.size} bảng`);
      return;
    }

    console.log(
      `[check-schema] Bảng thiếu: ${missingTables.length > 0 ? missingTables.join(", ") : "không có"}`,
    );
    console.log(
      `[check-schema] Cột thiếu: ${missingColumns.length > 0 ? missingColumns.join(", ") : "không có"}`,
    );

    if (process.env.CHECK_STRICT === "1") {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

checkSchema().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[check-schema] Database check failed: ${message}`);
  process.exit(1);
});
