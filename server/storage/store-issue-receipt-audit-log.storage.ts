import { db } from "../db";
import { storeIssueReceiptAuditLogs } from "@shared/schema";

export async function createStoreIssueReceiptAuditLog(params: {
  receiptId: string;
  receiptCode: string;
  action: string;
  userId: string | null;
  userName: string;
  locationId: string | null;
  oldContent: Record<string, any> | null;
  newContent: Record<string, any> | null;
}) {
  await db.insert(storeIssueReceiptAuditLogs).values({
    receiptId:   params.receiptId,
    receiptCode: params.receiptCode,
    action:      params.action,
    userId:      params.userId ?? undefined,
    userName:    params.userName,
    locationId:  params.locationId ?? undefined,
    oldContent:  params.oldContent ?? undefined,
    newContent:  params.newContent ?? undefined,
  });
}
