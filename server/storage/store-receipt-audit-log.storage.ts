import { db } from "./base";
import { storeReceiptAuditLogs } from "@shared/schema";
import type { InsertStoreReceiptAuditLog, StoreReceiptAuditLog } from "@shared/schema";

export async function createStoreReceiptAuditLog(
  data: InsertStoreReceiptAuditLog,
): Promise<StoreReceiptAuditLog> {
  const [row] = await db.insert(storeReceiptAuditLogs).values(data).returning();
  return row;
}
