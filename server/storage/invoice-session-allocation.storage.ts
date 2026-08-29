import {
  db, eq, and, inArray,
  invoiceSessionAllocations, invoiceItems, studentSessions,
} from "./base";
import type { InvoiceSessionAllocation } from "@shared/schema";

// ==========================================
// INVOICE SESSION ALLOCATIONS
// Phân bổ học phí từ hoá đơn vào từng buổi học
// ==========================================

/**
 * Xoá toàn bộ phân bổ của một hoá đơn (dùng trước khi tái phân bổ)
 */
export async function deleteAllocationsForInvoice(invoiceId: string): Promise<void> {
  await db.delete(invoiceSessionAllocations)
    .where(eq(invoiceSessionAllocations.invoiceId, invoiceId));
}

/**
 * Phân bổ học phí từ hoá đơn vào các buổi học phù hợp.
 *
 * Xử lý hai loại gói học phí:
 *  - "buổi": perSessionAmount = subtotal / quantity, phân bổ tuần tự cho quantity buổi
 *  - "khoá": perSessionAmount = subtotal / quantity, phân bổ tuần tự cho quantity buổi của khoá
 */
export async function distributeInvoiceFeeToSessions(
  invoiceId: string,
  studentId: string,
  classId: string,
): Promise<InvoiceSessionAllocation[]> {
  const items = await db.select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  const eligibleItems = items.filter(
    (item) => (item.packageType === "buổi" || item.packageType === "khoá") && item.packageId,
  );

  if (eligibleItems.length === 0) return [];

  await deleteAllocationsForInvoice(invoiceId);

  const allAllocations: InvoiceSessionAllocation[] = [];

  for (const item of eligibleItems) {
    if (item.packageType === "buổi") {
      // --- BUỔI: mỗi quantity = 1 buổi ---
      const perSessionAmount = Number(item.subtotal) / (item.quantity || 1);
      if (perSessionAmount <= 0) continue;

      const matchedSessions = await db.select()
        .from(studentSessions)
        .where(and(
          eq(studentSessions.studentId, studentId),
          eq(studentSessions.classId, classId),
          eq(studentSessions.packageId, item.packageId!),
        ))
        .orderBy(studentSessions.sessionOrder);

      const toAllocate = matchedSessions.slice(0, item.quantity);
      if (toAllocate.length === 0) continue;

      const rows = toAllocate.map((session) => ({
        invoiceId,
        invoiceItemId: item.id,
        studentSessionId: session.id,
        allocatedAmount: perSessionAmount.toFixed(2),
      }));

      const inserted = await db.insert(invoiceSessionAllocations).values(rows).returning();
      allAllocations.push(...inserted);

    } else if (item.packageType === "khoá") {
      // --- KHOÁ: quantity trong hoá đơn = số buổi học được phân bổ ---
      const totalSessions = item.quantity || 1;
      const perSessionAmount = Number(item.subtotal) / totalSessions;
      if (perSessionAmount <= 0) continue;

      const matchedSessions = await db.select()
        .from(studentSessions)
        .where(and(
          eq(studentSessions.studentId, studentId),
          eq(studentSessions.classId, classId),
          eq(studentSessions.packageId, item.packageId!),
        ))
        .orderBy(studentSessions.sessionOrder);

      const toAllocate = matchedSessions.slice(0, totalSessions);
      if (toAllocate.length === 0) continue;

      const rows = toAllocate.map((session) => ({
        invoiceId,
        invoiceItemId: item.id,
        studentSessionId: session.id,
        allocatedAmount: perSessionAmount.toFixed(2),
      }));

      const inserted = await db.insert(invoiceSessionAllocations).values(rows).returning();
      allAllocations.push(...inserted);
    }
  }

  return allAllocations;
}

/**
 * Lấy map { studentSessionId → allocatedAmount } từ danh sách session IDs.
 * Tổng hợp theo session (một session có thể nhận từ nhiều hoá đơn).
 */
export async function getSessionAllocationMap(
  studentSessionIds: string[],
): Promise<Record<string, number>> {
  if (studentSessionIds.length === 0) return {};

  const rows = await db.select()
    .from(invoiceSessionAllocations)
    .where(inArray(invoiceSessionAllocations.studentSessionId, studentSessionIds));

  const map: Record<string, number> = {};
  for (const row of rows) {
    const prev = map[row.studentSessionId] ?? 0;
    map[row.studentSessionId] = prev + Number(row.allocatedAmount);
  }
  return map;
}

/**
 * Lấy danh sách phân bổ theo hoá đơn (để kiểm tra / hiển thị)
 */
export async function getAllocationsByInvoice(
  invoiceId: string,
): Promise<InvoiceSessionAllocation[]> {
  return db.select()
    .from(invoiceSessionAllocations)
    .where(eq(invoiceSessionAllocations.invoiceId, invoiceId));
}
