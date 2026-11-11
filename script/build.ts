import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as appSchema from "../shared/schema";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "exceljs",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Generate this image's immutable bootstrap schema from its checked-out source.
  // drizzle-kit is used only in the build stage; the runner image consumes SQL.
  const emptySnapshot = {
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
  const snapshot = generateDrizzleJson(appSchema as any, undefined, ["public"], undefined);
  const statements = await generateMigration(emptySnapshot as any, snapshot);
  const createTableCount = statements.filter((statement) => /^\s*CREATE TABLE\b/i.test(statement)).length;
  if (createTableCount !== 180) {
    throw new Error(`Expected 180 application tables in bootstrap schema; generated ${createTableCount}`);
  }
  await mkdir("dist/db/migrations", { recursive: true });
  const extras = await readFile("scripts/db/app-baseline-extras.sql", "utf8");
  const baselineSql = [...statements, extras].join("\n--> statement-breakpoint\n");
  await writeFile("dist/db/app-baseline.sql", baselineSql);
  await writeFile("dist/db/schema-manifest.json", JSON.stringify({
    release: process.env.APP_VERSION || "dev",
    tables: createTableCount,
    indexes: statements.filter((statement) => /^\s*CREATE (?:UNIQUE )?INDEX\b/i.test(statement)).length,
    foreignKeys: statements.filter((statement) => /ADD CONSTRAINT[\s\S]*?FOREIGN KEY/i.test(statement)).length,
    tableNames: Object.values(snapshot.tables).map((table: any) => table.name).sort(),
    columnsByTable: Object.fromEntries(Object.values(snapshot.tables).map((table: any) =>
      [table.name, Object.keys(table.columns).sort()])),
    indexesByName: Object.values(snapshot.tables).flatMap((table: any) =>
      Object.keys(table.indexes || {})).sort(),
    foreignKeysByName: Object.values(snapshot.tables).flatMap((table: any) =>
      Object.keys(table.foreignKeys || {})).sort(),
    customSequences: ["bidv_invoice_va_seq", "invoice_pt_seq", "invoice_pc_seq"],
    customIndexes: [
      "idx_bidv_va_invoice_id", "idx_bidv_va_schedule_id",
      "crm_relationships_one_system_default_idx",
      "idx_exam_submissions_exam_id", "idx_exam_submissions_student_id",
      "idx_exam_submissions_submitted_at", "idx_exam_submissions_exam_student",
      "idx_exam_submissions_exam_class", "idx_esq_section_id", "idx_esq_section_order",
      "idx_exam_sections_exam_id",
      "invoice_audit_logs_invoice_id_idx", "invoice_audit_logs_created_at_idx",
      "invoice_audit_logs_location_id_idx",
      "store_receipt_audit_logs_receipt_id_idx", "store_receipt_audit_logs_created_at_idx",
      "store_receipt_audit_logs_location_id_idx",
      "store_issue_receipt_audit_logs_receipt_id_idx",
      "store_issue_receipt_audit_logs_created_at_idx",
      "store_issue_receipt_audit_logs_location_id_idx",
    ],
  }, null, 2));

  const migrationFiles = await readdir("db/migrations").catch(() => []);
  for (const file of migrationFiles.filter((name) => name.endsWith(".sql")).sort()) {
    await cp(`db/migrations/${file}`, `dist/db/migrations/${file}`);
  }

  await esbuild({
    entryPoints: ["scripts/db-migrate.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/db/migrate.cjs",
    external: ["pg"],
    logLevel: "info",
  });
  await esbuild({
    entryPoints: ["scripts/seed-default.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/db/seed-default.cjs",
    external: ["pg"],
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
