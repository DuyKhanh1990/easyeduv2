/**
 * One-off script: compare shared/schema.ts with live DB.
 * Run: npx tsx scripts/check_schema_drift.ts
 */
import * as schema from '../shared/schema';
import { pool } from '../server/db';

const SYM_NAME = Symbol.for('drizzle:Name');
const SYM_COLS = Symbol.for('drizzle:Columns');

async function main() {
  const { rows: dbCols } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name != '__drizzle_migrations'
    ORDER BY table_name, column_name
  `);

  const { rows: dbTableRows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name != '__drizzle_migrations'
    ORDER BY table_name
  `);

  const dbMap: Record<string, Set<string>> = {};
  for (const r of dbCols) {
    if (!dbMap[r.table_name]) dbMap[r.table_name] = new Set();
    dbMap[r.table_name].add(r.column_name);
  }

  // Parse schema: Drizzle tables expose Symbol(drizzle:Name) and Symbol(drizzle:Columns)
  const schemaTables: Record<string, Set<string>> = {};
  for (const [, val] of Object.entries(schema as any)) {
    if (!val || typeof val !== 'object') continue;
    const tableName: string | undefined = (val as any)[SYM_NAME];
    const columns: Record<string, any> | undefined = (val as any)[SYM_COLS];
    if (!tableName || !columns) continue;
    const cols = new Set<string>();
    for (const [, col] of Object.entries(columns)) {
      cols.add((col as any).name);
    }
    schemaTables[tableName] = cols;
  }

  const results: string[] = [];
  const schemaTableNames = new Set(Object.keys(schemaTables));
  const dbTableNames = new Set(dbTableRows.map((r: any) => r.table_name as string));

  // Tables in DB but not schema
  for (const t of dbTableNames) {
    if (!schemaTableNames.has(t)) results.push(`TABLE_IN_DB_NOT_SCHEMA: ${t}`);
  }
  // Tables in schema but not DB (sanity check)
  for (const t of schemaTableNames) {
    if (!dbTableNames.has(t)) results.push(`TABLE_IN_SCHEMA_NOT_DB: ${t}`);
  }
  // Column-level diff for shared tables
  for (const [table, schemaCols] of Object.entries(schemaTables)) {
    const dbTableCols = dbMap[table];
    if (!dbTableCols) continue;
    for (const col of dbTableCols) {
      if (!schemaCols.has(col)) results.push(`COL_IN_DB_NOT_SCHEMA: ${table}.${col}`);
    }
    for (const col of schemaCols) {
      if (!dbTableCols.has(col)) results.push(`COL_IN_SCHEMA_NOT_DB: ${table}.${col}`);
    }
  }

  if (results.length === 0) {
    console.log('✅ NO DRIFT — schema and DB are in sync');
  } else {
    console.log(`Found ${results.length} drift(s):\n`);
    console.log(results.join('\n'));
  }

  await pool.end();
}

main().catch(console.error);
