import { drizzle } from "drizzle-orm/node-postgres";
import { pushSchema } from "drizzle-kit/api";
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

type StatementKind = "table" | "sequence" | "type" | "column" | "index" | "foreign-key";

interface ClassifiedStatement {
  sql: string;
  kind: StatementKind;
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
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*))?)/i,
  );
  return match?.[1] ? lastIdentifier(match[1]) : undefined;
}

function alteredTableName(statement: string): string | undefined {
  const match = statement.match(
    /^\s*ALTER\s+TABLE\s+((?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*))?)/i,
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
    /^\s*ALTER\s+TABLE\s+(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*))?\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+/i.test(
      sql,
    )
  ) {
    return { sql, kind: "column" };
  }
  if (/^CREATE\s+UNIQUE\s+INDEX\b/i.test(sql)) {
    const uniqueIndexMatch = sql.match(
      /^\s*CREATE\s+UNIQUE\s+INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s+ON\s+((?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*))?)/i,
    );
    const indexedTable = uniqueIndexMatch?.[1]
      ? lastIdentifier(uniqueIndexMatch[1])
      : undefined;
    if (indexedTable && newlyCreatedTables.has(indexedTable)) {
      return { sql, kind: "index" };
    }
    return undefined;
  }
  if (/^CREATE\s+INDEX\b/i.test(sql)) return { sql, kind: "index" };

  const foreignKeyMatch = sql.match(
    /^\s*ALTER\s+TABLE\s+((?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*))?)\s+ADD\s+CONSTRAINT\s+(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\b/i,
  );
  if (foreignKeyMatch?.[1]) {
    const foreignKeyTable = lastIdentifier(foreignKeyMatch[1]);
    if (foreignKeyTable && newlyCreatedTables.has(foreignKeyTable)) {
      return { sql, kind: "foreign-key" };
    }
  }

  return undefined;
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
    const drizzleDb = drizzle(client);
    const { statementsToExecute } = await pushSchema(schemaImports, drizzleDb);
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

    if (syncMode === "apply" && safeStatements.length > 0) {
      await client.query("BEGIN");
      transactionStarted = true;
      for (const statement of safeStatements) {
        await client.query(statement.sql);
      }
      await client.query("COMMIT");
      transactionStarted = false;
    } else if (syncMode === "dry-run") {
      console.log("[sync-schema] Dry-run: không ghi thay đổi vào database");
    }

    const count = (kind: StatementKind) =>
      safeStatements.filter((statement) => statement.kind === kind).length;
    console.log(
      `[sync-schema] Tóm tắt: ${count("table")} bảng, ${count("column")} cột, ${count("index")} index, ${skippedStatements.length} câu bị bỏ qua`,
    );
  } finally {
    try {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (syncMode === "dry-run") {
    console.warn(`[sync-schema] CẢNH BÁO (dry-run): ${message}`);
    process.exitCode = 0;
  } else {
    console.error(`[sync-schema] Lỗi: ${message}`);
    process.exitCode = 1;
  }
});
