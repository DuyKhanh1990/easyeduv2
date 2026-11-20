/**
 * Push schema tới DB mục tiêu không cần interactive CLI
 * Dùng generateDrizzleJson + generateMigration để lấy SQL thuần
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CÁCH CHẠY                                                       ║
 * ║                                                                  ║
 * ║  TARGET_DB_URL="postgresql://user:pass@host:5432/dbname" \       ║
 * ║    npx tsx scripts/push-db-direct.ts                             ║
 * ║                                                                  ║
 * ║  Ví dụ:                                                          ║
 * ║  TARGET_DB_URL="postgresql://postgres:Rl853RrK8OUS9u2q\          ║
 * ║    @42.96.40.138:5432/xyz" npx tsx scripts/push-db-direct.ts    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Phase 1: CREATE TABLE cho bảng mới (bỏ qua nếu đã tồn tại); FK constraints bị defer sang Phase 4
 * Phase 2: ALTER TABLE ADD COLUMN IF NOT EXISTS cho cột mới trong bảng cũ
 * Phase 3: CREATE INDEX IF NOT EXISTS cho index mới trên bảng cũ
 * Phase 4: ALTER TABLE ADD CONSTRAINT FOREIGN KEY (sau khi cột đã được thêm ở Phase 2)
 */
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { Pool } from "pg";
import * as schema from "../shared/schema";

const TARGET_URL =
  process.env.TARGET_DB_URL ||
  process.env.APP_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!TARGET_URL) {
  console.error("❌ Cần set TARGET_DB_URL hoặc APP_DATABASE_URL");
  process.exit(1);
}

console.log("[push-db] Bắt đầu push schema...");
console.log(`[push-db] Target: ${TARGET_URL.replace(/:([^:@]+)@/, ":***@")}`);

const EMPTY_SNAPSHOT = {
  id: "00000000-0000-0000-0000-000000000000",
  prevId: "00000000-0000-0000-0000-000000000000",
  version: "7",
  dialect: "postgresql",
  tables: {},
  enums: {},
  schemas: {},
  sequences: {},
  roles: {},
  policies: {},
  views: {},
  _meta: { columns: {}, schemas: {}, tables: {} },
};

/**
 * Parse một CREATE TABLE statement để lấy danh sách cột và định nghĩa của chúng.
 * Trả về Map<columnName, fullColumnDefinition>
 */
function parseCreateTableColumns(sql: string): { table: string; columns: Map<string, string> } | null {
  const tableMatch = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?\s*\(/i);
  if (!tableMatch) return null;
  const table = tableMatch[1];

  // Lấy phần trong ngoặc đầu tiên (bỏ qua constraint, index, foreign key)
  const body = sql.slice(sql.indexOf("(") + 1);
  const columns = new Map<string, string>();

  // Tách từng dòng cột, bỏ qua CONSTRAINT / PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK
  const lines = body.split(/,\s*\n|,(?=\s*")/);
  for (const raw of lines) {
    const line = raw.trim().replace(/\)\s*;\s*$/, "").trim();
    if (!line) continue;
    if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)\b/i.test(line)) continue;

    // Tên cột phải bắt đầu bằng " hoặc chữ cái
    const colMatch = line.match(/^"?(\w+)"?\s+(.+)/);
    if (!colMatch) continue;
    const colName = colMatch[1];
    const colDef = colMatch[2].replace(/,\s*$/, "").trim();
    // Bỏ qua các từ khoá không phải tên cột
    if (/^(constraint|primary|unique|foreign|check)$/i.test(colName)) continue;
    columns.set(colName, colDef);
  }

  return { table, columns };
}

async function main() {
  const pool = new Pool({
    connectionString: TARGET_URL!,
    max: 3,
    connectionTimeoutMillis: 15000,
  });

  const testClient = await pool.connect();
  const { rows: dbInfo } = await testClient.query("SELECT current_database()");
  console.log(`[push-db] ✅ Kết nối OK: DB = ${dbInfo[0].current_database}`);
  testClient.release();

  // ── Phase 1: CREATE TABLE cho bảng mới ──────────────────────────────────
  console.log("\n[push-db] Phase 1: Tạo bảng mới...");
  const targetSnapshot = generateDrizzleJson(schema as any, undefined, ["public"], undefined);
  console.log(`[push-db] Schema có ${Object.keys(targetSnapshot.tables || {}).length} bảng`);

  const statements = await generateMigration(EMPTY_SNAPSHOT as any, targetSnapshot);
  console.log(`[push-db] Tổng ${statements.length} SQL statement(s)`);

  const client = await pool.connect();
  let ok = 0, skipped = 0, failed = 0;

  // Lưu lại các CREATE TABLE statement để dùng ở Phase 2
  const createTableStatements: string[] = [];
  // FK constraints bị defer sang Phase 4 (cột có thể chưa tồn tại ở Phase 1)
  const deferredFkStatements: string[] = [];
  // CREATE INDEX bị defer sang Phase 3 (cột mới chưa tồn tại khi Phase 1 chạy)
  const deferredIndexStatements: string[] = [];

  try {
    for (const stmt of statements) {
      if (/^\s*CREATE TABLE/i.test(stmt)) {
        createTableStatements.push(stmt);
      }
      // Defer tất cả ADD CONSTRAINT ... FOREIGN KEY sang Phase 4
      if (/ADD\s+CONSTRAINT\b.*\bFOREIGN\s+KEY\b/i.test(stmt)) {
        deferredFkStatements.push(stmt);
        skipped++;
        continue;
      }
      // Defer tất cả CREATE INDEX sang Phase 3 (tránh lỗi khi cột chưa tồn tại)
      if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(stmt)) {
        deferredIndexStatements.push(stmt);
        skipped++;
        continue;
      }
      try {
        await client.query(stmt);
        ok++;
        if (ok % 20 === 0) console.log(`  [progress] ${ok}/${statements.length} xong...`);
      } catch (e: any) {
        const msg: string = e.message || "";
        if (
          msg.includes("already exists") ||
          msg.includes("duplicate")
        ) {
          skipped++;
        } else {
          console.error(`  [FAIL] ${stmt.slice(0, 120)}`);
          console.error(`         → ${msg}`);
          failed++;
        }
      }
    }
  } finally {
    client.release();
  }

  console.log(`\n[push-db] Phase 1 hoàn tất:`);
  console.log(`  • Thực thi thành công : ${ok}`);
  console.log(`  • Bỏ qua (đã tồn tại): ${skipped}`);
  console.log(`  • Lỗi                 : ${failed}`);

  // ── Phase 2: ALTER TABLE ADD COLUMN cho cột mới trong bảng cũ ───────────
  console.log("\n[push-db] Phase 2: Kiểm tra và thêm cột mới vào bảng hiện có...");

  // Lấy tất cả cột hiện có trong DB
  const { rows: existingCols } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const existingMap = new Map<string, Set<string>>();
  for (const row of existingCols) {
    if (!existingMap.has(row.table_name)) existingMap.set(row.table_name, new Set());
    existingMap.get(row.table_name)!.add(row.column_name);
  }

  let addedCols = 0;
  let skippedCols = 0;
  let failedCols = 0;

  for (const stmt of createTableStatements) {
    const parsed = parseCreateTableColumns(stmt);
    if (!parsed) continue;
    const { table, columns } = parsed;

    const existing = existingMap.get(table);
    if (!existing) continue; // Bảng mới — đã được tạo ở Phase 1

    const alterClient = await pool.connect();
    try {
      for (const [colName, colDef] of columns) {
        if (existing.has(colName)) {
          skippedCols++;
          continue;
        }
        // Loại bỏ NOT NULL nếu không có DEFAULT để tránh lỗi khi bảng đã có data
        let safeDef = colDef;
        if (/NOT NULL/i.test(safeDef) && !/DEFAULT/i.test(safeDef)) {
          safeDef = safeDef.replace(/NOT NULL/gi, "").trim();
          console.log(`  [warn] "${table}"."${colName}": bỏ NOT NULL (bảng có data, không có DEFAULT)`);
        }
        const alterSql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${colName}" ${safeDef}`;
        try {
          await alterClient.query(alterSql);
          console.log(`  [+col] "${table}"."${colName}"`);
          addedCols++;
        } catch (e: any) {
          console.error(`  [FAIL col] "${table}"."${colName}": ${e.message}`);
          failedCols++;
        }
      }
    } finally {
      alterClient.release();
    }
  }

  console.log(`\n[push-db] Phase 2 hoàn tất:`);
  console.log(`  • Cột mới thêm vào : ${addedCols}`);
  console.log(`  • Cột đã tồn tại   : ${skippedCols}`);
  console.log(`  • Lỗi              : ${failedCols}`);

  // ── Phase 3: CREATE INDEX cho index mới trên bảng cũ ────────────────────
  console.log("\n[push-db] Phase 3: Kiểm tra và tạo index còn thiếu...");

  // Lấy danh sách index đang có trong DB
  const { rows: existingIndexRows } = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);
  const existingIndexNames = new Set(existingIndexRows.map((r: any) => r.indexname as string));

  // Dùng danh sách đã defer từ Phase 1 (tránh tạo index khi cột chưa tồn tại)
  const indexStatements = deferredIndexStatements;

  let addedIdx = 0;
  let skippedIdx = 0;
  let failedIdx = 0;

  for (const stmt of indexStatements) {
    // Lấy tên index từ statement — hỗ trợ cả 2 dạng:
    //   CREATE INDEX "name" ON ...
    //   CREATE UNIQUE INDEX "name" ON ...
    const nameMatch = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON/i);
    const indexName = nameMatch?.[1];

    if (indexName && existingIndexNames.has(indexName)) {
      skippedIdx++;
      continue;
    }

    // Thêm IF NOT EXISTS để an toàn (PostgreSQL >= 9.5)
    const safeStmt = stmt.replace(
      /CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
      (m, unique) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `
    );

    try {
      const idxClient = await pool.connect();
      try {
        await idxClient.query(safeStmt);
        console.log(`  [+idx] ${indexName ?? stmt.slice(0, 60)}`);
        addedIdx++;
      } finally {
        idxClient.release();
      }
    } catch (e: any) {
      const msg: string = e.message || "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        skippedIdx++;
      } else {
        console.error(`  [FAIL idx] ${indexName ?? "?"}: ${msg}`);
        failedIdx++;
      }
    }
  }

  console.log(`\n[push-db] Phase 3 hoàn tất:`);
  console.log(`  • Index mới tạo   : ${addedIdx}`);
  console.log(`  • Index đã tồn tại: ${skippedIdx}`);
  console.log(`  • Lỗi             : ${failedIdx}`);

  // ── Phase 4: ADD CONSTRAINT FOREIGN KEY (sau khi cột đã tồn tại) ───────────
  console.log("\n[push-db] Phase 4: Kiểm tra và thêm foreign key constraints...");

  // Lấy danh sách constraints đã tồn tại
  const { rows: existingConstraintRows } = await pool.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
  `);
  const existingConstraints = new Set(existingConstraintRows.map((r: any) => r.constraint_name as string));

  let addedFk = 0;
  let skippedFk = 0;
  let failedFk = 0;

  for (const stmt of deferredFkStatements) {
    // Lấy tên constraint để kiểm tra đã tồn tại chưa
    const nameMatch = stmt.match(/ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY/i);
    const constraintName = nameMatch?.[1];

    if (constraintName && existingConstraints.has(constraintName)) {
      skippedFk++;
      continue;
    }

    try {
      const fkClient = await pool.connect();
      try {
        await fkClient.query(stmt);
        console.log(`  [+fk] ${constraintName ?? stmt.slice(0, 80)}`);
        addedFk++;
      } finally {
        fkClient.release();
      }
    } catch (e: any) {
      const msg: string = e.message || "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        skippedFk++;
      } else {
        console.error(`  [FAIL fk] ${constraintName ?? "?"}: ${msg}`);
        failedFk++;
      }
    }
  }

  console.log(`\n[push-db] Phase 4 hoàn tất:`);
  console.log(`  • FK mới thêm vào : ${addedFk}`);
  console.log(`  • FK đã tồn tại   : ${skippedFk}`);
  console.log(`  • Lỗi             : ${failedFk}`);

  await pool.end();

  console.log(`\n[push-db] ✅ Hoàn tất toàn bộ!`);

  if (failed > 0 || failedCols > 0 || failedIdx > 0 || failedFk > 0) {
    console.log("⚠️  Có một số lỗi. Kiểm tra lại output ở trên.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[push-db] ❌ Lỗi:", e.message || e);
  process.exit(1);
});
