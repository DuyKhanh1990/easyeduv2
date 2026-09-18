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

function splitAmountExactly(totalAmount: number, count: number): string[] {
  if (count <= 0) return [];
  const totalCents = Math.round(Math.max(0, totalAmount) * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainderCents = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) => {
    const receivesRemainder = index >= count - remainderCents;
    return ((baseCents + (receivesRemainder ? 1 : 0)) / 100).toFixed(2);
  });
}

async function distributeInvoiceFeeToSessionsWithExecutor(
  executor: any,
  invoiceId: string,
  studentId: string,
  classId: string,
): Promise<InvoiceSessionAllocation[]> {
  const items = await executor.select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  const eligibleItems = items.filter(
    (item: any) => (item.packageType === "buổi" || item.packageType === "khoá") && item.packageId,
  );

  if (eligibleItems.length === 0) return [];

  await executor.delete(invoiceSessionAllocations)
    .where(eq(invoiceSessionAllocations.invoiceId, invoiceId));

  const allAllocations: InvoiceSessionAllocation[] = [];

  for (const item of eligibleItems) {
    const matchedSessions = await executor.select()
      .from(studentSessions)
      .where(and(
        eq(studentSessions.studentId, studentId),
        eq(studentSessions.classId, classId),
        eq(studentSessions.packageId, item.packageId!),
      ))
      .orderBy(studentSessions.sessionOrder);

    const requestedCount = Math.max(1, Number(item.quantity) || 1);
    const toAllocate = matchedSessions.slice(0, requestedCount);
    if (toAllocate.length === 0) continue;

    // Per-session packages retain their established per-session amount.
    // Course packages keep the full net package total and divide it across the
    // actual sessions that still belong to that package.
    const allocatedAmounts = item.packageType === "buổi"
      ? splitAmountExactly(Number(item.subtotal), requestedCount).slice(0, toAllocate.length)
      : splitAmountExactly(Number(item.subtotal), toAllocate.length);
    if (allocatedAmounts.every((amount) => Number(amount) <= 0)) continue;

    const rows = toAllocate.map((session: any, index: number) => ({
      invoiceId,
      invoiceItemId: item.id,
      studentSessionId: session.id,
      allocatedAmount: allocatedAmounts[index],
    }));

    const inserted = await executor.insert(invoiceSessionAllocations).values(rows).returning();
    allAllocations.push(...inserted);
  }

  return allAllocations;
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
  return distributeInvoiceFeeToSessionsWithExecutor(db, invoiceId, studentId, classId);
}

export async function distributeInvoiceFeeToSessionsInTransaction(
  tx: any,
  invoiceId: string,
  studentId: string,
  classId: string,
): Promise<InvoiceSessionAllocation[]> {
  return distributeInvoiceFeeToSessionsWithExecutor(tx, invoiceId, studentId, classId);
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
