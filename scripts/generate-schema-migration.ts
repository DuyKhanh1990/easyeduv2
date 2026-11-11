import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as schema from "../shared/schema";

const migrationsDir = path.resolve("migrations");
const baselinePath = path.join(migrationsDir, "meta", "schema-baseline.json");

function getCurrentSnapshot() {
  // This generator is intentionally schema-only: it never opens a DB connection.
  return generateDrizzleJson(schema as any, undefined, ["public"], undefined);
}

function tableCount(snapshot: any): number {
  return Object.keys(snapshot.tables ?? {}).length;
}

function parseName(args: string[]): string {
  const nameIndex = args.findIndex((arg) => arg === "--name");
  const inlineName = args.find((arg) => arg.startsWith("--name="))?.slice("--name=".length);
  const rawName = inlineName ?? (nameIndex >= 0 ? args[nameIndex + 1] : undefined);

  if (!rawName) {
    throw new Error(
      "Thiếu tên migration. Dùng: npm run db:migration:generate -- --name add_table_or_column",
    );
  }

  const slug = rawName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (!slug || !/^[a-z0-9][a-z0-9_]*$/.test(slug)) {
    throw new Error(`Tên migration không hợp lệ: ${rawName}`);
  }

  return slug;
}

function findDestructiveStatements(statements: string[]): string[] {
  const unsafePatterns = [
    /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|CONSTRAINT|INDEX|SEQUENCE|VIEW|DOMAIN)\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?\b(TYPE|SET\s+DATA\s+TYPE)\b/i,
  ];

  return statements.filter((statement) =>
    unsafePatterns.some((pattern) => pattern.test(statement)),
  );
}

function formatSql(statements: string[]): string {
  return `${statements
    .map((statement) => {
      const trimmed = statement.trim();
      return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
    })
    .join("\n\n")}\n`;
}

async function initializeBaseline(): Promise<void> {
  try {
    await stat(baselinePath);
    throw new Error(
      `Baseline đã tồn tại tại ${path.relative(process.cwd(), baselinePath)}; không ghi đè tự động.`,
    );
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  const snapshot = getCurrentSnapshot();
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    flag: "wx",
  });

  console.log(
    `Đã tạo baseline schema (${tableCount(snapshot)} bảng). Không có kết nối hoặc thay đổi database.`,
  );
}

async function nextMigrationPath(slug: string): Promise<string> {
  const files = await readdir(migrationsDir);
  const indexes = files
    .map((file) => file.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const nextIndex = Math.max(0, ...indexes) + 1;
  const filename = `${String(nextIndex).padStart(4, "0")}_${slug}.sql`;
  return path.join(migrationsDir, filename);
}

async function writeMigration(slug: string): Promise<void> {
  let baseline: any;
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "Chưa có baseline. Khởi tạo một lần bằng: npm run db:migration:baseline",
      );
    }
    throw error;
  }

  const currentSnapshot = getCurrentSnapshot();
  const statements = await generateMigration(baseline, currentSnapshot);
  if (statements.length === 0) {
    console.log("Schema không có thay đổi; không tạo migration.");
    return;
  }

  const destructive = findDestructiveStatements(statements);
  if (destructive.length > 0) {
    console.error(
      "Từ chối tạo migration vì Drizzle sinh SQL có nguy cơ xóa dữ liệu hoặc đổi kiểu cột:",
    );
    for (const statement of destructive) {
      console.error(`  - ${statement.replace(/\s+/g, " ").slice(0, 240)}`);
    }
    console.error(
      "Hãy thiết kế migration chuyển đổi dữ liệu an toàn bằng tay; baseline chưa được cập nhật.",
    );
    process.exitCode = 1;
    return;
  }

  const migrationPath = await nextMigrationPath(slug);
  const migrationRelativePath = path.relative(process.cwd(), migrationPath);
  const sql = formatSql(statements);
  const tempSuffix = `.tmp-${process.pid}`;
  const migrationTempPath = `${migrationPath}${tempSuffix}`;
  const baselineTempPath = `${baselinePath}${tempSuffix}`;
  let migrationCommitted = false;

  try {
    await writeFile(migrationTempPath, sql, { flag: "wx" });
    await writeFile(
      baselineTempPath,
      `${JSON.stringify(currentSnapshot, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(migrationTempPath, migrationPath);
    migrationCommitted = true;
    await rename(baselineTempPath, baselinePath);
  } catch (error) {
    if (migrationCommitted) await rm(migrationPath, { force: true });
    throw error;
  } finally {
    await rm(migrationTempPath, { force: true });
    await rm(baselineTempPath, { force: true });
  }

  const unsafeNotNullAdds = statements.filter(
    (statement) =>
      /\bADD\s+COLUMN\b/i.test(statement) &&
      /\bNOT\s+NULL\b/i.test(statement) &&
      !/\bDEFAULT\b/i.test(statement),
  );

  console.log(`Đã tạo ${migrationRelativePath} (${statements.length} SQL statement).`);
  console.log("Đã cập nhật baseline schema. Commit file SQL và baseline cùng source code.");
  console.log("Chỉ tạo file; không kết nối hay cập nhật bất kỳ database nào.");
  if (unsafeNotNullAdds.length > 0) {
    console.warn(
      "Cảnh báo: có cột NOT NULL không có DEFAULT; cần kiểm tra dữ liệu hiện có trước khi áp dụng migration.",
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--init-baseline")) {
    await initializeBaseline();
    return;
  }

  await writeMigration(parseName(args));
}

main().catch((error: any) => {
  console.error("[db:migration] Lỗi:", error?.message ?? error);
  process.exitCode = 1;
});
