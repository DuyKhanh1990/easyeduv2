import { db } from "./base";
import { invoiceAuditLogs, staff, users, locations } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import type { InsertInvoiceAuditLog, InvoiceAuditLog } from "@shared/schema";

export async function createInvoiceAuditLog(data: InsertInvoiceAuditLog): Promise<InvoiceAuditLog> {
  const [row] = await db.insert(invoiceAuditLogs).values(data).returning();
  return row;
}

export interface InvoiceAuditLogWithDetails extends InvoiceAuditLog {
  userName: string | null;
  locationName: string | null;
}

export async function getInvoiceAuditLogs(filters?: {
  invoiceId?: string;
  limit?: number;
  offset?: number;
}): Promise<InvoiceAuditLogWithDetails[]> {
  const rows = await db
    .select({
      id:          invoiceAuditLogs.id,
      invoiceId:   invoiceAuditLogs.invoiceId,
      invoiceCode: invoiceAuditLogs.invoiceCode,
      invoiceType: invoiceAuditLogs.invoiceType,
      subjectName: invoiceAuditLogs.subjectName,
      grandTotal:  invoiceAuditLogs.grandTotal,
      action:      invoiceAuditLogs.action,
      userId:      invoiceAuditLogs.userId,
      locationId:  invoiceAuditLogs.locationId,
      oldContent:  invoiceAuditLogs.oldContent,
      newContent:  invoiceAuditLogs.newContent,
      createdAt:   invoiceAuditLogs.createdAt,
      staffName:   staff.fullName,
      username:    users.username,
      locationName: locations.name,
    })
    .from(invoiceAuditLogs)
    .leftJoin(users,     eq(invoiceAuditLogs.userId,     users.id))
    .leftJoin(staff,     eq(staff.userId,                invoiceAuditLogs.userId))
    .leftJoin(locations, eq(invoiceAuditLogs.locationId, locations.id))
    .where(filters?.invoiceId ? eq(invoiceAuditLogs.invoiceId, filters.invoiceId) : undefined)
    .orderBy(desc(invoiceAuditLogs.createdAt))
    .limit(filters?.limit  ?? 100)
    .offset(filters?.offset ?? 0);

  return rows.map(r => ({
    ...r,
    userName: r.staffName ?? r.username ?? null,
    locationName: r.locationName ?? null,
  }));
}
