import { inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export interface InvoiceScheduleRowArrayFilters {
  paymentMethods?: string[];
  payerNames?: string[];
  creatorNames?: string[];
}

export function buildInvoiceScheduleRowArrayFilterConditions(
  tableAlias: string,
  filters: InvoiceScheduleRowArrayFilters,
): SQL[] {
  const column = (name: string) => sql.raw(`${tableAlias}.${name}`);
  const conditions: SQL[] = [];

  if (filters.paymentMethods?.length) {
    conditions.push(inArray(
      sql`COALESCE(${column("payment_method")}, '')`,
      filters.paymentMethods,
    ));
  }
  if (filters.payerNames?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM staff AS schedule_row_payer
      WHERE schedule_row_payer.user_id = ${column("paid_by")}
        AND ${inArray(sql.raw("schedule_row_payer.full_name"), filters.payerNames)}
    )`);
  }
  if (filters.creatorNames?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM staff AS schedule_row_creator
      WHERE schedule_row_creator.user_id = ${column("created_by")}
        AND ${inArray(sql.raw("schedule_row_creator.full_name"), filters.creatorNames)}
    )`);
  }

  return conditions;
}