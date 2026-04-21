import { alias } from "drizzle-orm/pg-core";
import {
  db, eq, and, or, asc, desc, inArray, sql, ilike, gte, lte,
  financeTransactionCategories, financePromotions,
  invoices, invoiceItems, invoicePaymentSchedule,
  invoicePrintTemplates,
  students, locations, staff, crmRelationships,
} from "./base";
import type {
  FinanceTransactionCategory, InsertFinanceTransactionCategory,
  FinancePromotion, InsertFinancePromotion,
  InvoicePrintTemplateRow, InsertInvoicePrintTemplate,
} from "@shared/schema";

// ==========================================
// FINANCE - TRANSACTION CATEGORIES
// ==========================================

export async function getFinanceTransactionCategories(type?: string): Promise<FinanceTransactionCategory[]> {
  const query = db.select().from(financeTransactionCategories);
  if (type) {
    return query.where(eq(financeTransactionCategories.type, type)).orderBy(asc(financeTransactionCategories.name));
  }
  return query.orderBy(asc(financeTransactionCategories.name));
}

export async function createFinanceTransactionCategory(data: InsertFinanceTransactionCategory): Promise<FinanceTransactionCategory> {
  const [cat] = await db.insert(financeTransactionCategories).values(data).returning();
  return cat;
}

export async function updateFinanceTransactionCategory(id: string, data: Partial<InsertFinanceTransactionCategory>): Promise<FinanceTransactionCategory> {
  const [cat] = await db.update(financeTransactionCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(financeTransactionCategories.id, id))
    .returning();
  return cat;
}

export async function deleteFinanceTransactionCategory(id: string): Promise<void> {
  await db.delete(financeTransactionCategories).where(
    and(eq(financeTransactionCategories.id, id), eq(financeTransactionCategories.isDefault, false))
  );
}

// ==========================================
// FINANCE - PROMOTIONS & SURCHARGES
// ==========================================

export async function getFinancePromotions(type?: string): Promise<FinancePromotion[]> {
  const query = db.select().from(financePromotions);
  if (type) {
    return query.where(eq(financePromotions.type, type)).orderBy(asc(financePromotions.name));
  }
  return query.orderBy(asc(financePromotions.name));
}

export async function createFinancePromotion(data: InsertFinancePromotion): Promise<FinancePromotion> {
  const [promo] = await db.insert(financePromotions).values(data).returning();
  return promo;
}

export async function updateFinancePromotion(id: string, data: Partial<InsertFinancePromotion>): Promise<FinancePromotion> {
  const [promo] = await db.update(financePromotions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(financePromotions.id, id))
    .returning();
  return promo;
}

export async function deleteFinancePromotion(id: string): Promise<void> {
  await db.delete(financePromotions).where(eq(financePromotions.id, id));
}

// ==========================================
// FINANCE - INVOICES
// ==========================================

const creatorStaff = alias(staff, "creator_staff");
const updaterStaff = alias(staff, "updater_staff");

export async function getInvoices(filters: { status?: string; type?: string; locationId?: string; search?: string; dateFrom?: string; dateTo?: string; salaryTableId?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean } = {}): Promise<any[]> {
  const conditions = [];
  if (filters.type)       conditions.push(eq(invoices.type, filters.type));
  if (filters.salaryTableId) conditions.push(eq(invoices.salaryTableId, filters.salaryTableId));
  if (filters.locationId) {
    if (filters.allowedLocationIds !== null && filters.allowedLocationIds !== undefined && !filters.allowedLocationIds.includes(filters.locationId)) {
      return [];
    }
    conditions.push(eq(invoices.locationId, filters.locationId));
  } else if (!filters.isSuperAdmin && filters.allowedLocationIds !== null && filters.allowedLocationIds !== undefined && filters.allowedLocationIds.length > 0) {
    conditions.push(inArray(invoices.locationId, filters.allowedLocationIds));
  } else if (!filters.isSuperAdmin && filters.allowedLocationIds !== null && filters.allowedLocationIds !== undefined && filters.allowedLocationIds.length === 0) {
    return [];
  }
  if (filters.dateFrom)   conditions.push(gte(invoices.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo)     conditions.push(lte(invoices.createdAt, new Date(filters.dateTo)));
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(or(
      ilike(sql`COALESCE(${students.fullName}, ${invoices.subjectName})`, q),
      ilike(sql`COALESCE(${invoices.code}, '')`, q),
      ilike(sql`COALESCE(${invoices.category}, '')`, q),
    ));
  }

  const rows = await db
    .select({
      invoice: invoices,
      studentName: sql<string>`COALESCE(${students.fullName}, ${invoices.subjectName})`,
      locationName: locations.name,
      creatorName: creatorStaff.fullName,
      updaterName: updaterStaff.fullName,
    })
    .from(invoices)
    .leftJoin(students, eq(invoices.studentId, students.id))
    .leftJoin(locations, eq(invoices.locationId, locations.id))
    .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
    .leftJoin(updaterStaff, eq(invoices.updatedBy, updaterStaff.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.createdAt));

  const invoiceRows = rows.map(r => ({
    ...r.invoice,
    name: r.studentName,
    branch: r.locationName,
    creatorName: r.creatorName,
    updaterName: r.updaterName,
    hasSchedules: false,
  }));

  const invoiceIds = invoiceRows.map(r => r.id);
  if (invoiceIds.length > 0) {
    const scheduleStats2 = await db
      .select({
        invoiceId: invoicePaymentSchedule.invoiceId,
        total: sql<number>`COUNT(*)::int`,
        paidCount: sql<number>`SUM(CASE WHEN ${invoicePaymentSchedule.status} = 'paid' THEN 1 ELSE 0 END)::int`,
        paidSum: sql<string>`COALESCE(SUM(CASE WHEN ${invoicePaymentSchedule.status} = 'paid' THEN ${invoicePaymentSchedule.amount}::numeric ELSE 0 END), 0)::text`,
        nextDueDate: sql<string | null>`MIN(CASE WHEN ${invoicePaymentSchedule.status} != 'paid' THEN ${invoicePaymentSchedule.dueDate} END)`,
        lastPaidDate: sql<string | null>`MAX(CASE WHEN ${invoicePaymentSchedule.status} = 'paid' THEN ${invoicePaymentSchedule.dueDate} END)`,
      })
      .from(invoicePaymentSchedule)
      .where(inArray(invoicePaymentSchedule.invoiceId, invoiceIds))
      .groupBy(invoicePaymentSchedule.invoiceId);

    const statsMap: Record<string, { total: number; paidCount: number; paidSum: number; nextDueDate: string | null; lastPaidDate: string | null }> = {};
    for (const s of scheduleStats2) {
      statsMap[s.invoiceId] = { total: Number(s.total), paidCount: Number(s.paidCount), paidSum: parseFloat(s.paidSum ?? "0"), nextDueDate: s.nextDueDate ?? null, lastPaidDate: s.lastPaidDate ?? null };
    }

    for (const row of invoiceRows) {
      const stats = statsMap[row.id];
      const grand = parseFloat(row.grandTotal ?? "0");
      if (stats && stats.total > 0) {
        row.hasSchedules = true;
        (row as any).scheduleCount = stats.total;
        (row as any).schedulePaidCount = stats.paidCount;
        (row as any).scheduleNextDueDate = stats.nextDueDate;
        (row as any).scheduleLastPaidDate = stats.lastPaidDate;
        row.paidAmount = stats.paidSum.toFixed(2);
        row.remainingAmount = Math.max(0, grand - stats.paidSum).toFixed(2);
        if (stats.paidCount === stats.total) {
          row.status = "paid";
        } else if (stats.paidCount > 0) {
          row.status = "partial";
        } else {
          row.status = "unpaid";
        }
      } else {
        const remaining = parseFloat(row.remainingAmount ?? "0");
        row.paidAmount = Math.max(0, grand - remaining).toFixed(2);
      }
    }
  }

  let result = [...invoiceRows];
  if (filters.status) result = result.filter(i => i.status === filters.status);
  return result;
}

export async function getInvoice(id: string): Promise<any | undefined> {
  const rows = await db
    .select({
      invoice: invoices,
      studentFullName: students.fullName,
      studentCode: students.code,
    })
    .from(invoices)
    .leftJoin(students, eq(invoices.studentId, students.id))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!rows.length) return undefined;
  const { invoice: row, studentFullName, studentCode } = rows[0];
  const [items, schedule] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder)),
    db.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id)).orderBy(asc(invoicePaymentSchedule.sortOrder)),
  ]);
  return {
    ...row,
    items,
    paymentSchedule: schedule,
    studentFullName: studentFullName ?? null,
    studentCode: studentCode ?? null,
  };
}

export async function getNextInvoiceCode(type: string): Promise<string> {
  const prefix = type === "income" ? "PT" : "PC";
  const pattern = `${prefix}%`;
  const result = await db
    .select({ code: invoices.code })
    .from(invoices)
    .where(sql`${invoices.code} LIKE ${pattern} AND ${invoices.code} NOT LIKE ${'%-%'}`)
    .orderBy(sql`${invoices.code} DESC`)
    .limit(1);
  if (result.length === 0) {
    return `${prefix}01`;
  }
  const lastCode = result[0].code ?? `${prefix}00`;
  const numStr = lastCode.replace(prefix, "");
  const num = parseInt(numStr, 10) || 0;
  const next = num + 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

export async function createInvoice(data: any): Promise<any> {
  const { items = [], paymentSchedule = [], ...invoiceData } = data;
  if (!invoiceData.code) {
    invoiceData.code = await getNextInvoiceCode(invoiceData.type === "Chi" ? "expense" : "income");
  }
  const invoiceCode = invoiceData.code;
  return await db.transaction(async (tx) => {
    const [inv] = await tx.insert(invoices).values({
      ...invoiceData,
      totalAmount: invoiceData.totalAmount?.toString() ?? "0",
      totalPromotion: invoiceData.totalPromotion?.toString() ?? "0",
      totalSurcharge: invoiceData.totalSurcharge?.toString() ?? "0",
      grandTotal: invoiceData.grandTotal?.toString() ?? "0",
      remainingAmount: invoiceData.remainingAmount?.toString() ?? invoiceData.grandTotal?.toString() ?? "0",
      commission: invoiceData.commission?.toString() ?? "0",
      updatedAt: new Date(),
    }).returning();

    const savedItems = items.length > 0
      ? await tx.insert(invoiceItems).values(
          items.map((item: any, idx: number) => ({
            invoiceId: inv.id,
            packageId: item.packageId || null,
            packageName: item.packageName || item.name || "",
            packageType: item.packageType || null,
            unitPrice: item.unitPrice?.toString() ?? "0",
            quantity: item.quantity ?? 1,
            promotionKeys: item.promotionKeys ?? [],
            surchargeKeys: item.surchargeKeys ?? [],
            promotionAmount: item.promotionAmount?.toString() ?? "0",
            surchargeAmount: item.surchargeAmount?.toString() ?? "0",
            subtotal: item.subtotal?.toString() ?? "0",
            category: item.category || null,
            sortOrder: idx,
          }))
        ).returning()
      : [];

    const savedSchedule = paymentSchedule.length > 0
      ? await tx.insert(invoicePaymentSchedule).values(
          paymentSchedule.map((s: any, idx: number) => ({
            invoiceId: inv.id,
            label: s.label,
            code: `${invoiceCode}-${idx + 1}`,
            amount: s.amount?.toString() ?? "0",
            dueDate: s.dueDate ?? null,
            status: s.status ?? "unpaid",
            sortOrder: idx,
            paymentMethod: s.paymentMethod ?? null,
            appliedBankAccount: s.appliedBankAccount ?? null,
          }))
        ).returning()
      : [];

    return { ...inv, items: savedItems, paymentSchedule: savedSchedule };
  });
}

export async function updateInvoice(id: string, data: any): Promise<any> {
  const { items, paymentSchedule, ...invoiceData } = data;
  const toUpdate: any = { ...invoiceData, updatedAt: new Date() };
  if (toUpdate.totalAmount !== undefined) toUpdate.totalAmount = toUpdate.totalAmount.toString();
  if (toUpdate.totalPromotion !== undefined) toUpdate.totalPromotion = toUpdate.totalPromotion.toString();
  if (toUpdate.totalSurcharge !== undefined) toUpdate.totalSurcharge = toUpdate.totalSurcharge.toString();
  if (toUpdate.grandTotal !== undefined) toUpdate.grandTotal = toUpdate.grandTotal.toString();
  if (toUpdate.paidAmount !== undefined) toUpdate.paidAmount = toUpdate.paidAmount.toString();
  if (toUpdate.remainingAmount !== undefined) toUpdate.remainingAmount = toUpdate.remainingAmount.toString();

  return await db.transaction(async (tx) => {
    const [inv] = await tx.update(invoices).set(toUpdate).where(eq(invoices.id, id)).returning();

    if (Array.isArray(items)) {
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      if (items.length > 0) {
        await tx.insert(invoiceItems).values(
          items.map((item: any, idx: number) => ({
            invoiceId: id,
            packageId: item.packageId || null,
            packageName: item.packageName || item.name || "",
            packageType: item.packageType || null,
            unitPrice: item.unitPrice?.toString() ?? "0",
            quantity: item.quantity ?? 1,
            promotionKeys: item.promotionKeys ?? [],
            surchargeKeys: item.surchargeKeys ?? [],
            promotionAmount: item.promotionAmount?.toString() ?? "0",
            surchargeAmount: item.surchargeAmount?.toString() ?? "0",
            subtotal: item.subtotal?.toString() ?? "0",
            category: item.category || null,
            sortOrder: idx,
          }))
        );
      }
    }

    if (Array.isArray(paymentSchedule)) {
      await tx.delete(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id));
      if (paymentSchedule.length > 0) {
        await tx.insert(invoicePaymentSchedule).values(
          paymentSchedule.map((s: any, idx: number) => ({
            invoiceId: id,
            label: s.label,
            code: `${inv.code}-${idx + 1}`,
            amount: s.amount?.toString() ?? "0",
            dueDate: s.dueDate ?? null,
            status: s.status ?? "unpaid",
            sortOrder: idx,
            paymentMethod: s.paymentMethod ?? null,
            appliedBankAccount: s.appliedBankAccount ?? null,
          }))
        );
      }
    }

    const savedItems = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder));
    const savedSchedule = await tx.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id)).orderBy(asc(invoicePaymentSchedule.sortOrder));
    return { ...inv, items: savedItems, paymentSchedule: savedSchedule };
  });
}

export async function getInvoicePaymentSchedules(invoiceId: string): Promise<any[]> {
  return db
    .select()
    .from(invoicePaymentSchedule)
    .where(eq(invoicePaymentSchedule.invoiceId, invoiceId))
    .orderBy(asc(invoicePaymentSchedule.sortOrder));
}

export async function splitInvoiceSchedule(scheduleId: string, splitAmount: number): Promise<{ updated: any; created: any }> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, scheduleId));
    if (!schedule) throw new Error("Không tìm thấy đợt thanh toán");
    if (schedule.status === "paid") throw new Error("Không thể tách đợt đã thanh toán");

    const originalAmount = parseFloat(schedule.amount ?? "0");
    if (splitAmount <= 0 || splitAmount >= originalAmount) {
      throw new Error("Số tiền tách không hợp lệ");
    }
    const remainingAmount = originalAmount - splitAmount;

    const [updated] = await tx
      .update(invoicePaymentSchedule)
      .set({ amount: remainingAmount.toFixed(2) })
      .where(eq(invoicePaymentSchedule.id, scheduleId))
      .returning();

    const allSchedules = await tx
      .select()
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, schedule.invoiceId));

    const subPattern = `${schedule.label}.`;
    const existingSubCount = allSchedules.filter(s => s.label.startsWith(subPattern)).length;
    const subIndex = existingSubCount + 1;

    const newLabel = `${schedule.label}.${subIndex}`;
    const newCode = schedule.code ? `${schedule.code}-${subIndex}` : null;
    const newSortOrder = (schedule.sortOrder ?? 0) + 1;

    for (const s of allSchedules) {
      if ((s.sortOrder ?? 0) > (schedule.sortOrder ?? 0)) {
        await tx
          .update(invoicePaymentSchedule)
          .set({ sortOrder: (s.sortOrder ?? 0) + 1 })
          .where(eq(invoicePaymentSchedule.id, s.id));
      }
    }

    const [created] = await tx
      .insert(invoicePaymentSchedule)
      .values({
        invoiceId: schedule.invoiceId,
        label: newLabel,
        code: newCode ?? undefined,
        amount: splitAmount.toFixed(2),
        status: "unpaid",
        dueDate: schedule.dueDate,
        sortOrder: newSortOrder,
      })
      .returning();

    return { updated, created };
  });
}

export async function updateInvoiceSchedule(scheduleId: string, data: { amount?: number; dueDate?: string | null }): Promise<any> {
  const [schedule] = await db.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, scheduleId));
  if (!schedule) throw new Error("Không tìm thấy đợt thanh toán");
  if (schedule.status === "paid") throw new Error("Không thể sửa đợt đã thanh toán");
  const updateData: any = {};
  if (data.amount !== undefined) updateData.amount = data.amount.toFixed(2);
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  const [updated] = await db
    .update(invoicePaymentSchedule)
    .set(updateData)
    .where(eq(invoicePaymentSchedule.id, scheduleId))
    .returning();
  return updated;
}

export async function updateInvoiceScheduleStatus(scheduleId: string, status: string): Promise<any> {
  const paidAt = status === "paid" ? new Date() : null;
  const [updated] = await db
    .update(invoicePaymentSchedule)
    .set({ status, paidAt })
    .where(eq(invoicePaymentSchedule.id, scheduleId))
    .returning();
  return updated;
}

export async function appendSalaryPayment(invoiceId: string, amountPaid: number): Promise<any> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new Error("Không tìm thấy phiếu chi");

    const schedules = await tx
      .select()
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, invoiceId))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));

    const grandTotal = parseFloat(inv.grandTotal ?? "0");
    const paidSchedules = schedules.filter((s) => s.status === "paid");
    const unpaidSchedule = schedules.find((s) => s.status === "unpaid");
    const totalPaidBefore = paidSchedules.reduce((sum, s) => sum + parseFloat(s.amount ?? "0"), 0);
    const newTotalPaid = totalPaidBefore + amountPaid;
    const isFullyPaid = newTotalPaid >= grandTotal;
    const newRemaining = Math.max(0, grandTotal - newTotalPaid);
    const nextInstallmentNumber = paidSchedules.length + 1;

    if (unpaidSchedule) {
      if (isFullyPaid) {
        await tx
          .update(invoicePaymentSchedule)
          .set({
            label: `ĐỢT ${nextInstallmentNumber}`,
            amount: amountPaid.toFixed(2),
            status: "paid",
            paidAt: new Date(),
          })
          .where(eq(invoicePaymentSchedule.id, unpaidSchedule.id));
      } else {
        const currentUnpaidSortOrder = unpaidSchedule.sortOrder ?? 0;
        await tx
          .update(invoicePaymentSchedule)
          .set({
            label: `ĐỢT ${nextInstallmentNumber + 1}`,
            amount: newRemaining.toFixed(2),
            sortOrder: currentUnpaidSortOrder + 1,
          })
          .where(eq(invoicePaymentSchedule.id, unpaidSchedule.id));

        await tx.insert(invoicePaymentSchedule).values({
          invoiceId,
          label: `ĐỢT ${nextInstallmentNumber}`,
          code: `${inv.code}-${nextInstallmentNumber}`,
          amount: amountPaid.toFixed(2),
          status: "paid",
          paidAt: new Date(),
          sortOrder: currentUnpaidSortOrder,
          dueDate: null,
        });
      }
    }

    const newStatus = isFullyPaid ? "paid" : "partial";
    await tx
      .update(invoices)
      .set({
        status: newStatus,
        paidAmount: newTotalPaid.toFixed(2),
        remainingAmount: newRemaining.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    const updatedSchedules = await tx
      .select()
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, invoiceId))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));
    const [updatedInv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    return { ...updatedInv, paymentSchedule: updatedSchedules };
  });
}

export async function updateInvoiceStatus(invoiceId: string, status: string): Promise<any> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new Error("Không tìm thấy hoá đơn");

  const grandTotal = parseFloat(inv.grandTotal ?? "0");
  const extraFields: Record<string, any> = {};

  if (status === "paid") {
    extraFields.paidAmount = grandTotal.toFixed(2);
    extraFields.remainingAmount = "0";
  } else if (status === "unpaid") {
    extraFields.paidAmount = "0";
    extraFields.remainingAmount = grandTotal.toFixed(2);
  } else if (status === "cancelled") {
    extraFields.paidAmount = "0";
    extraFields.remainingAmount = "0";
  }

  const [updated] = await db
    .update(invoices)
    .set({ status, ...extraFields, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return updated;
}

export async function deleteInvoice(id: string): Promise<void> {
  const schedules = await db
    .select({ id: invoicePaymentSchedule.id })
    .from(invoicePaymentSchedule)
    .where(eq(invoicePaymentSchedule.invoiceId, id));
  if (schedules.length > 1) {
    throw new Error("Hóa đơn đã có các đợt thanh toán. Vui lòng xoá các đợt trước khi xoá hóa đơn.");
  }
  await db.transaction(async (tx) => {
    if (schedules.length === 1) {
      await tx.delete(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id));
    }
    await tx.delete(invoices).where(eq(invoices.id, id));
  });
}

export async function deleteInvoiceSchedule(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [schedule] = await tx.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, id));
    if (!schedule) throw new Error("Không tìm thấy đợt thanh toán");
    if (schedule.status === "paid") throw new Error("Không thể xoá đợt đã thanh toán");

    const all = await tx
      .select()
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, schedule.invoiceId))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));

    if (all.length <= 1) throw new Error("Không thể xoá đợt duy nhất");

    const others = all.filter(s => s.id !== id);
    const lastSchedule = others[others.length - 1];

    const deletedAmount = parseFloat(schedule.amount ?? "0");
    const lastAmount = parseFloat(lastSchedule.amount ?? "0");
    await tx
      .update(invoicePaymentSchedule)
      .set({ amount: (lastAmount + deletedAmount).toFixed(2) })
      .where(eq(invoicePaymentSchedule.id, lastSchedule.id));

    await tx.delete(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, id));
  });
}

// ==========================================
// MIGRATION UTILITY
// ==========================================

export async function migratePipelineStageToRelationshipIds(): Promise<void> {
  const allRelationships = await db.select().from(crmRelationships);
  const nameToId = new Map(allRelationships.map(r => [r.name, r.id]));

  const allStudents = await db.select({
    id: students.id,
    pipelineStage: students.pipelineStage,
    relationshipIds: students.relationshipIds,
  }).from(students);

  for (const student of allStudents) {
    const stages: string[] = Array.isArray(student.pipelineStage) ? student.pipelineStage : [];
    const existingIds = new Set<string>(student.relationshipIds || []);
    let changed = false;

    for (const stage of stages) {
      const relId = nameToId.get(stage);
      if (relId && !existingIds.has(relId)) {
        existingIds.add(relId);
        changed = true;
      }
    }

    if (changed) {
      await db.update(students)
        .set({ relationshipIds: Array.from(existingIds) })
        .where(eq(students.id, student.id));
    }
  }
  console.log("Migration: pipelineStage → relationshipIds complete.");
}

// ==========================================
// INVOICE PRINT TEMPLATES
// ==========================================

export async function getInvoicePrintTemplates(): Promise<(InvoicePrintTemplateRow & { creatorName: string | null })[]> {
  const rows = await db.select().from(invoicePrintTemplates).orderBy(desc(invoicePrintTemplates.createdAt));
  const enriched = await Promise.all(rows.map(async (row) => {
    let creatorName: string | null = null;
    if (row.createdBy) {
      const [s] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, row.createdBy)).limit(1);
      creatorName = s?.fullName ?? null;
    }
    return { ...row, creatorName };
  }));
  return enriched;
}

export async function getInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow | null> {
  const [row] = await db.select().from(invoicePrintTemplates).where(eq(invoicePrintTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function createInvoicePrintTemplate(data: InsertInvoicePrintTemplate): Promise<InvoicePrintTemplateRow> {
  const [row] = await db.insert(invoicePrintTemplates).values(data).returning();
  return row;
}

export async function updateInvoicePrintTemplate(id: string, data: Partial<InsertInvoicePrintTemplate>): Promise<InvoicePrintTemplateRow> {
  const [row] = await db.update(invoicePrintTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(invoicePrintTemplates.id, id))
    .returning();
  return row;
}

export async function deleteInvoicePrintTemplate(id: string): Promise<void> {
  await db.delete(invoicePrintTemplates).where(eq(invoicePrintTemplates.id, id));
}

export async function getDefaultInvoicePrintTemplate(invoiceType: string): Promise<InvoicePrintTemplateRow | null> {
  const [row] = await db.select().from(invoicePrintTemplates)
    .where(and(eq(invoicePrintTemplates.invoiceType, invoiceType), eq(invoicePrintTemplates.isDefault, true)))
    .limit(1);
  return row ?? null;
}

export async function setDefaultInvoicePrintTemplate(id: string, invoiceType: string): Promise<InvoicePrintTemplateRow> {
  // Unset all defaults for this invoiceType
  await db.update(invoicePrintTemplates)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(invoicePrintTemplates.invoiceType, invoiceType));
  // Set the new default
  const [row] = await db.update(invoicePrintTemplates)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(invoicePrintTemplates.id, id))
    .returning();
  return row;
}

export async function unsetDefaultInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow> {
  const [row] = await db.update(invoicePrintTemplates)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(invoicePrintTemplates.id, id))
    .returning();
  return row;
}
