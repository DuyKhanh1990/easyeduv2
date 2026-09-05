import { alias } from "drizzle-orm/pg-core";
import {
  db, eq, and, or, asc, desc, inArray, sql, ilike, gte, lte, isNotNull, isNull,
  financeTransactionCategories, financePromotions,
  financeVouchers, financeVoucherUsages,
  invoices, invoiceItems, invoicePaymentSchedule, invoiceCommissions,
  invoicePrintTemplates,
  students, locations, staff, crmRelationships,
  users, classes,
} from "./base";
import type {
  FinanceTransactionCategory, InsertFinanceTransactionCategory,
  FinancePromotion, InsertFinancePromotion,
  FinanceVoucher, InsertFinanceVoucher,
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
// FINANCE - VOUCHERS
// ==========================================

export async function getFinanceVouchers(searchTerm?: string): Promise<FinanceVoucher[]> {
  const query = db.select().from(financeVouchers);
  if (searchTerm?.trim()) {
    const term = `%${searchTerm.trim()}%`;
    return query
      .where(or(ilike(financeVouchers.code, term), ilike(financeVouchers.name, term)))
      .orderBy(desc(financeVouchers.createdAt));
  }
  return query.orderBy(desc(financeVouchers.createdAt));
}

export type AvailableFinanceVoucher = FinanceVoucher & {
  kind: "voucher";
  voucherId: string;
  id: string;
};

export async function getAvailableFinanceVouchers(
  studentId: string,
  asOfDate?: string,
): Promise<AvailableFinanceVoucher[]> {
  const effectiveDate = asOfDate || new Date().toISOString().slice(0, 10);
  const [student] = await db
    .select({ dateOfBirth: students.dateOfBirth })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student) return [];

  const vouchers = await db
    .select()
    .from(financeVouchers)
    .where(and(
      eq(financeVouchers.isActive, true),
      or(isNull(financeVouchers.startDate), lte(financeVouchers.startDate, effectiveDate)),
      or(isNull(financeVouchers.endDate), gte(financeVouchers.endDate, effectiveDate)),
    ))
    .orderBy(asc(financeVouchers.name));

  const voucherIds = vouchers.map(voucher => voucher.id);
  const usedRows = voucherIds.length > 0
    ? await db
        .select({ voucherId: financeVoucherUsages.voucherId, usedAt: financeVoucherUsages.usedAt })
        .from(financeVoucherUsages)
        .where(and(
          eq(financeVoucherUsages.studentId, studentId),
          inArray(financeVoucherUsages.voucherId, voucherIds),
        ))
    : [];

  const birthDate = student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : null;
  const [, month, day] = birthDate?.split("-") ?? [];
  const [effectiveYear, effectiveMonth, effectiveDay] = effectiveDate.split("-");

  return vouchers
    .filter(voucher => {
      if (voucher.quantity !== null && voucher.usedCount >= voucher.quantity) return false;

      // Birthday voucher: "once" means once per birthday period (month+year), not once forever
      if (voucher.audience === "birthday" && voucher.usageLimit === "once") {
        const usedInCurrentPeriod = usedRows
          .filter(r => r.voucherId === voucher.id)
          .some(r => {
            const d = r.usedAt as Date;
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const y = String(d.getFullYear());
            if (voucher.birthdayMode === "month") return m === effectiveMonth && y === effectiveYear;
            const dy = String(d.getDate()).padStart(2, "0");
            return m === effectiveMonth && y === effectiveYear && dy === effectiveDay;
          });
        if (usedInCurrentPeriod) return false;
      } else if (voucher.usageLimit === "once") {
        const usedByVoucher = new Set(usedRows.map(r => r.voucherId));
        if (usedByVoucher.has(voucher.id)) return false;
      }

      if (voucher.audience === "specific" && !(voucher.audienceStudentIds ?? []).includes(studentId)) return false;
      if (voucher.audience === "birthday") {
        if (!month || !day) return false;
        if (voucher.birthdayMode === "month") return month === effectiveMonth;
        return month === effectiveMonth && day === effectiveDay;
      }
      return voucher.audience === "all" || voucher.audience === "specific";
    })
    .map(voucher => ({
      ...voucher,
      id: `voucher:${voucher.id}`,
      kind: "voucher" as const,
      voucherId: voucher.id,
    }));
}

export async function createFinanceVoucher(data: InsertFinanceVoucher): Promise<FinanceVoucher> {
  const [voucher] = await db.insert(financeVouchers).values(data).returning();
  return voucher;
}

export async function updateFinanceVoucher(id: string, data: Partial<InsertFinanceVoucher>): Promise<FinanceVoucher> {
  const [updated] = await db
    .update(financeVouchers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(financeVouchers.id, id))
    .returning();
  return updated;
}

export async function deleteFinanceVoucher(id: string): Promise<void> {
  await db.delete(financeVouchers).where(eq(financeVouchers.id, id));
}

export type VoucherUsageRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  usedAt: string | null;
  invoiceId: string | null;
};

export async function getFinanceVoucherUsages(
  voucherId: string,
  opts: { page: number; limit: number; search?: string; status?: string },
): Promise<{ data: VoucherUsageRow[]; total: number; voucher: FinanceVoucher | null }> {
  const [voucher] = await db
    .select()
    .from(financeVouchers)
    .where(eq(financeVouchers.id, voucherId))
    .limit(1);
  if (!voucher) return { data: [], total: 0, voucher: null };

  let rows: VoucherUsageRow[];

  if (voucher.audience === "specific") {
    const audienceIds = voucher.audienceStudentIds ?? [];
    if (audienceIds.length === 0) return { data: [], total: 0, voucher };
    const rawRows = await db
      .select({
        studentId: students.id,
        studentName: students.fullName,
        studentCode: students.code,
        usedAt: financeVoucherUsages.usedAt,
        invoiceId: financeVoucherUsages.invoiceId,
      })
      .from(students)
      .leftJoin(
        financeVoucherUsages,
        and(
          eq(financeVoucherUsages.studentId, students.id),
          eq(financeVoucherUsages.voucherId, voucherId),
        ),
      )
      .where(inArray(students.id, audienceIds));
    rows = rawRows.map(r => ({
      studentId: r.studentId,
      studentName: r.studentName,
      studentCode: r.studentCode,
      usedAt: r.usedAt ? (r.usedAt as Date).toISOString() : null,
      invoiceId: r.invoiceId,
    }));
  } else if (voucher.audience === "birthday") {
    // Birthday: show all students whose birth month/day matches today,
    // left-join with usage to show who already used it
    const today = new Date().toISOString().slice(0, 10);
    const [, todayMonth, todayDay] = today.split("-");
    const monthNum = parseInt(todayMonth, 10);
    const dayNum = parseInt(todayDay, 10);

    const eligibleStudents = await db
      .select({ id: students.id, fullName: students.fullName, code: students.code })
      .from(students)
      .where(
        voucher.birthdayMode === "exact"
          ? and(
              sql`extract(month from ${students.dateOfBirth}) = ${monthNum}`,
              sql`extract(day from ${students.dateOfBirth}) = ${dayNum}`,
            )
          : sql`extract(month from ${students.dateOfBirth}) = ${monthNum}`,
      );

    if (eligibleStudents.length === 0) {
      rows = [];
    } else {
      const eligibleIds = eligibleStudents.map(s => s.id);
      const usageRows = await db
        .select({
          studentId: financeVoucherUsages.studentId,
          usedAt: financeVoucherUsages.usedAt,
          invoiceId: financeVoucherUsages.invoiceId,
        })
        .from(financeVoucherUsages)
        .where(and(
          eq(financeVoucherUsages.voucherId, voucherId),
          inArray(financeVoucherUsages.studentId, eligibleIds),
        ));
      const usageByStudent = new Map(usageRows.map(r => [r.studentId, r]));
      rows = eligibleStudents.map(s => {
        const usage = usageByStudent.get(s.id);
        return {
          studentId: s.id,
          studentName: s.fullName,
          studentCode: s.code,
          usedAt: usage?.usedAt ? (usage.usedAt as Date).toISOString() : null,
          invoiceId: usage?.invoiceId ?? null,
        };
      });
    }
  } else {
    // audience === "all": show all who have used it (too many to show all students)
    const rawRows = await db
      .select({
        studentId: students.id,
        studentName: students.fullName,
        studentCode: students.code,
        usedAt: financeVoucherUsages.usedAt,
        invoiceId: financeVoucherUsages.invoiceId,
      })
      .from(financeVoucherUsages)
      .innerJoin(students, eq(students.id, financeVoucherUsages.studentId))
      .where(eq(financeVoucherUsages.voucherId, voucherId));
    rows = rawRows.map(r => ({
      studentId: r.studentId,
      studentName: r.studentName,
      studentCode: r.studentCode,
      usedAt: r.usedAt ? (r.usedAt as Date).toISOString() : null,
      invoiceId: r.invoiceId,
    }));
  }

  // Search filter
  if (opts.search?.trim()) {
    const term = opts.search.trim().toLowerCase();
    rows = rows.filter(r =>
      r.studentName.toLowerCase().includes(term) || r.studentCode.toLowerCase().includes(term),
    );
  }

  // Status filter
  if (opts.status === "used") rows = rows.filter(r => r.usedAt !== null);
  else if (opts.status === "unused") rows = rows.filter(r => r.usedAt === null);

  const total = rows.length;
  const offset = (opts.page - 1) * opts.limit;
  return { data: rows.slice(offset, offset + opts.limit), total, voucher };
}

export async function getFinanceVoucherAudienceStudents(
  voucherId: string,
): Promise<Array<{ id: string; fullName: string; code: string; phone: string | null }>> {
  const [voucher] = await db
    .select({ audienceStudentIds: financeVouchers.audienceStudentIds })
    .from(financeVouchers)
    .where(eq(financeVouchers.id, voucherId))
    .limit(1);
  if (!voucher?.audienceStudentIds?.length) return [];
  return db
    .select({ id: students.id, fullName: students.fullName, code: students.code, phone: students.phone })
    .from(students)
    .where(inArray(students.id, voucher.audienceStudentIds));
}

// ==========================================
// FINANCE - INVOICES
// ==========================================

const creatorStaff = alias(staff, "creator_staff");
const updaterStaff = alias(staff, "updater_staff");
const paidByStaff  = alias(staff, "paid_by_staff");

export async function saveInvoiceCommissions(invoiceId: string, commissions: { staffId: string; percentage: number }[]): Promise<void> {
  await db.delete(invoiceCommissions).where(eq(invoiceCommissions.invoiceId, invoiceId));
  if (commissions.length > 0) {
    await db.insert(invoiceCommissions).values(
      commissions.map(c => ({
        invoiceId,
        staffId: c.staffId,
        percentage: String(c.percentage),
      }))
    );
  }
}

export async function getInvoiceCommissionsWithStaff(invoiceId: string): Promise<{ staffId: string; staffCode: string; staffName: string; percentage: number }[]> {
  const commStaff = alias(staff, "comm_staff");
  const rows = await db
    .select({
      staffId: invoiceCommissions.staffId,
      staffCode: commStaff.code,
      staffName: commStaff.fullName,
      percentage: invoiceCommissions.percentage,
    })
    .from(invoiceCommissions)
    .leftJoin(commStaff, eq(invoiceCommissions.staffId, commStaff.id))
    .where(eq(invoiceCommissions.invoiceId, invoiceId));
  return rows.map(r => ({
    staffId: r.staffId,
    staffCode: r.staffCode ?? "",
    staffName: r.staffName ?? "",
    percentage: parseFloat(r.percentage ?? "0"),
  }));
}

export async function getInvoices(filters: {
  tabFilter?: string;
  type?: string;
  types?: string[];
  locationId?: string;
  locationNames?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paidAtFrom?: string;
  paidAtTo?: string;
  salaryTableId?: string;
  categories?: string[];
  classNames?: string[];
  creatorNames?: string[];
  payerNames?: string[];
  commissionStaffNames?: string[];
  paymentMethods?: string[];
  allowedLocationIds?: string[] | null;
  isSuperAdmin?: boolean;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
  includeTabCounts?: boolean;
} = {}): Promise<{ data: any[]; total: number; tabCounts: Record<string, number> }> {
  const f = filters;
  const applyPagination = typeof f.page === "number" && typeof f.limit === "number" && f.limit > 0;
  const limit  = f.limit  ?? 20;
  const page   = f.page   ?? 1;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  if (f.type)          conditions.push(eq(invoices.type, f.type));
  if (f.types?.length) conditions.push(inArray(invoices.type, f.types) as any);
  if (f.salaryTableId) conditions.push(eq(invoices.salaryTableId, f.salaryTableId));

  if (f.locationId) {
    if (f.allowedLocationIds !== null && f.allowedLocationIds !== undefined && !f.allowedLocationIds.includes(f.locationId)) {
      return { data: [], total: 0, tabCounts: { all: 0, unpaid: 0, partial: 0, paid: 0, debt: 0 } };
    }
    conditions.push(eq(invoices.locationId, f.locationId));
  } else if (f.locationNames?.length) {
    conditions.push(inArray(locations.name, f.locationNames) as any);
  } else if (!f.isSuperAdmin && f.allowedLocationIds !== null && f.allowedLocationIds !== undefined && f.allowedLocationIds.length > 0) {
    conditions.push(inArray(invoices.locationId, f.allowedLocationIds) as any);
  } else if (!f.isSuperAdmin && f.allowedLocationIds !== null && f.allowedLocationIds !== undefined && f.allowedLocationIds.length === 0) {
    return { data: [], total: 0, tabCounts: { all: 0, unpaid: 0, partial: 0, paid: 0, debt: 0 } };
  }

  if (f.paidAtFrom || f.paidAtTo) {
    conditions.push(sql`${invoices.paidAt} IS NOT NULL` as any);
    if (f.paidAtFrom) conditions.push(gte(invoices.paidAt, new Date(f.paidAtFrom)));
    if (f.paidAtTo) {
      const toEnd = new Date(f.paidAtTo);
      toEnd.setHours(23, 59, 59, 999);
      conditions.push(lte(invoices.paidAt, toEnd));
    }
  } else if (f.dueDateFrom || f.dueDateTo) {
    if (f.dueDateFrom) conditions.push(gte(invoices.dueDate, f.dueDateFrom));
    if (f.dueDateTo) conditions.push(lte(invoices.dueDate, f.dueDateTo));
  } else {
    if (f.dateFrom) conditions.push(gte(invoices.createdAt, new Date(f.dateFrom)));
    if (f.dateTo) {
      const toEnd = new Date(f.dateTo);
      toEnd.setHours(23, 59, 59, 999);
      conditions.push(lte(invoices.createdAt, toEnd));
    }
  }

  if (f.search) {
    const searchTerms = f.search.trim().split(/\s+/).filter(Boolean);
    const searchableFields = [
      sql`COALESCE(${students.fullName}, ${invoices.subjectName}, '')`,
      sql`COALESCE(${invoices.code}, '')`,
      sql`COALESCE(${invoices.settleCode}, '')`,
      sql`COALESCE(${invoices.category}, '')`,
      sql`COALESCE(${invoices.description}, '')`,
      sql`COALESCE(${invoices.note}, '')`,
      sql`COALESCE(${invoices.paymentNote}, '')`,
    ];
    if (searchTerms.length > 0) {
      conditions.push(and(
        ...searchTerms.map(term => {
          const q = `%${term}%`;
          const scheduleCodeMatch = sql`EXISTS (
            SELECT 1
            FROM invoice_payment_schedule AS schedule_search
            WHERE schedule_search.invoice_id = ${invoices.id}
              AND (
                schedule_search.code ILIKE ${q}
                OR schedule_search.label ILIKE ${q}
                OR schedule_search.settle_code ILIKE ${q}
              )
          )`;
          return or(
            ...searchableFields.map(field => ilike(field, q)),
            scheduleCodeMatch,
          );
        }),
      ) as any);
    }
  }

  if (f.categories?.length)     conditions.push(inArray(invoices.category, f.categories) as any);
  if (f.paymentMethods?.length) conditions.push(inArray(invoices.paymentMethod, f.paymentMethods) as any);
  if (f.classNames?.length)     conditions.push(inArray(classes.name, f.classNames) as any);
  if (f.creatorNames?.length)   conditions.push(inArray(creatorStaff.fullName, f.creatorNames) as any);
  if (f.payerNames?.length) {
    const schedulePayerStaff = alias(staff, "schedule_payer_filter");
    const schedulePayerInvoiceIds = db
      .select({ invoiceId: invoicePaymentSchedule.invoiceId })
      .from(invoicePaymentSchedule)
      .innerJoin(schedulePayerStaff, eq(invoicePaymentSchedule.paidBy, schedulePayerStaff.userId))
      .where(inArray(schedulePayerStaff.fullName, f.payerNames));
    conditions.push(or(
      inArray(paidByStaff.fullName, f.payerNames),
      inArray(invoices.id, schedulePayerInvoiceIds),
    ) as any);
  }
  if (f.commissionStaffNames?.length) {
    const commStaffSub = alias(staff, "comm_staff_sub");
    conditions.push(
      inArray(invoices.id,
        db.select({ invoiceId: invoiceCommissions.invoiceId })
          .from(invoiceCommissions)
          .innerJoin(commStaffSub, eq(invoiceCommissions.staffId, commStaffSub.id))
          .where(inArray(commStaffSub.fullName, f.commissionStaffNames))
      ) as any
    );
  }

  const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const tabConditions = [...conditions];
  if (f.tabFilter === "unpaid")       tabConditions.push(eq(invoices.status, "unpaid"));
  else if (f.tabFilter === "partial") tabConditions.push(eq(invoices.status, "partial"));
  else if (f.tabFilter === "paid")    tabConditions.push(eq(invoices.status, "paid"));
  else if (f.tabFilter === "debt")    tabConditions.push(sql`${invoices.remainingAmount}::numeric > 0` as any);
  const tabWhere = tabConditions.length > 0 ? and(...tabConditions) : undefined;

  const dirFn = f.sortDir === "asc" ? asc : desc;
  let orderBy: any;
  switch (f.sortKey) {
    case "code":        orderBy = dirFn(invoices.code); break;
    case "settleCode":  orderBy = dirFn(invoices.settleCode); break;
    case "type":        orderBy = dirFn(invoices.type); break;
    case "category":    orderBy = dirFn(invoices.category); break;
    case "grandTotal":  orderBy = dirFn(sql`${invoices.grandTotal}::numeric`); break;
    case "totalAmount": orderBy = dirFn(sql`${invoices.totalAmount}::numeric`); break;
    case "status":      orderBy = dirFn(invoices.status); break;
    case "dueDate":     orderBy = dirFn(invoices.dueDate); break;
    case "updatedAt":   orderBy = dirFn(invoices.updatedAt); break;
    case "paidAt":      orderBy = dirFn(invoices.paidAt); break;
    default:            orderBy = desc(invoices.createdAt); break;
  }

  let tabCounts: Record<string, number> = { all: 0, unpaid: 0, partial: 0, paid: 0, debt: 0 };
  if (f.includeTabCounts) {
    const [tc] = await db.select({
      all:     sql<number>`COUNT(*)::int`,
      unpaid:  sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'unpaid')::int`,
      partial: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'partial')::int`,
      paid:    sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'paid')::int`,
      debt:    sql<number>`COUNT(*) FILTER (WHERE ${invoices.remainingAmount}::numeric > 0 AND ${invoices.status} != 'cancelled')::int`,
    })
    .from(invoices)
    .leftJoin(students,     eq(invoices.studentId, students.id))
    .leftJoin(locations,    eq(invoices.locationId, locations.id))
    .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
    .leftJoin(updaterStaff, eq(invoices.updatedBy, updaterStaff.userId))
    .leftJoin(paidByStaff,  eq(invoices.paidBy, paidByStaff.userId))
    .leftJoin(classes,      eq(invoices.classId, classes.id))
    .where(baseWhere);
    tabCounts = { all: tc.all, unpaid: tc.unpaid, partial: tc.partial, paid: tc.paid, debt: tc.debt };
  }

  let total = 0;
  if (applyPagination) {
    const [{ cnt }] = await db.select({ cnt: sql<number>`COUNT(*)::int` })
      .from(invoices)
      .leftJoin(students,     eq(invoices.studentId, students.id))
      .leftJoin(locations,    eq(invoices.locationId, locations.id))
      .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
      .leftJoin(updaterStaff, eq(invoices.updatedBy, updaterStaff.userId))
      .leftJoin(paidByStaff,  eq(invoices.paidBy, paidByStaff.userId))
      .leftJoin(classes,      eq(invoices.classId, classes.id))
      .where(tabWhere);
    total = cnt;
  }

  const selectFields = {
    invoice:      invoices,
    studentSalesByIds: students.salesByIds,
    studentManagedByIds: students.managedByIds,
    studentTeacherIds: students.teacherIds,
    studentName:  sql<string>`COALESCE(${students.fullName}, ${invoices.subjectName})`,
    studentCode:  students.code,
    locationName: locations.name,
    creatorStaffId: creatorStaff.id,
    creatorName:  creatorStaff.fullName,
    updaterName:  updaterStaff.fullName,
    paidByName:   paidByStaff.fullName,
    className:    classes.name,
  };

  let rows: any[];
  if (applyPagination) {
    rows = await db.select(selectFields)
      .from(invoices)
      .leftJoin(students,     eq(invoices.studentId, students.id))
      .leftJoin(locations,    eq(invoices.locationId, locations.id))
      .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
      .leftJoin(updaterStaff, eq(invoices.updatedBy, updaterStaff.userId))
      .leftJoin(paidByStaff,  eq(invoices.paidBy, paidByStaff.userId))
      .leftJoin(classes,      eq(invoices.classId, classes.id))
      .where(tabWhere).orderBy(orderBy).limit(limit).offset(offset);
  } else {
    rows = await db.select(selectFields)
      .from(invoices)
      .leftJoin(students,     eq(invoices.studentId, students.id))
      .leftJoin(locations,    eq(invoices.locationId, locations.id))
      .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
      .leftJoin(updaterStaff, eq(invoices.updatedBy, updaterStaff.userId))
      .leftJoin(paidByStaff,  eq(invoices.paidBy, paidByStaff.userId))
      .leftJoin(classes,      eq(invoices.classId, classes.id))
      .where(tabWhere).orderBy(orderBy);
  }

  const invoiceRows = rows.map(r => ({
    ...r.invoice,
    studentSalesByIds: r.studentSalesByIds ?? [],
    studentManagedByIds: r.studentManagedByIds ?? [],
    studentTeacherIds: r.studentTeacherIds ?? [],
    name: r.studentName,
    studentCode: r.studentCode ?? null,
    branch: r.locationName,
    creatorStaffId: r.creatorStaffId ?? null,
    creatorName: r.creatorName,
    updaterName: r.updaterName,
    paidByName: r.paidByName ?? null,
    className: r.className ?? null,
    einvoiceStatus: (r.invoice as any).einvoiceStatus ?? null,
    einvoiceFkey: (r.invoice as any).einvoiceFkey ?? null,
    einvoiceMaTraCuu: (r.invoice as any).einvoiceMaTraCuu ?? null,
    einvoiceMessage: (r.invoice as any).einvoiceMessage ?? null,
    einvoiceUpdatedAt: (r.invoice as any).einvoiceUpdatedAt ?? null,
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

  if (invoiceIds.length > 0) {
    const scheduleCreatorStaff = alias(staff, "list_schedule_creator");
    const schedulePaidByStaff = alias(staff, "list_schedule_paid_by");
    const scheduleUpdaterStaff = alias(staff, "list_schedule_updater");
    const scheduleRows = await db
      .select({
        schedule: invoicePaymentSchedule,
        createdByName: scheduleCreatorStaff.fullName,
        paidByName: schedulePaidByStaff.fullName,
        updatedByName: scheduleUpdaterStaff.fullName,
      })
      .from(invoicePaymentSchedule)
      .leftJoin(scheduleCreatorStaff, eq(invoicePaymentSchedule.createdBy, scheduleCreatorStaff.userId))
      .leftJoin(schedulePaidByStaff, eq(invoicePaymentSchedule.paidBy, schedulePaidByStaff.userId))
      .leftJoin(scheduleUpdaterStaff, eq(invoicePaymentSchedule.updatedBy, scheduleUpdaterStaff.userId))
      .where(inArray(invoicePaymentSchedule.invoiceId, invoiceIds))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));

    const schedulesByInvoice: Record<string, any[]> = {};
    for (const { schedule, ...names } of scheduleRows) {
      if (!schedulesByInvoice[schedule.invoiceId]) schedulesByInvoice[schedule.invoiceId] = [];
      schedulesByInvoice[schedule.invoiceId].push({ ...schedule, ...names });
    }
    for (const row of invoiceRows) {
      (row as any).paymentSchedule = schedulesByInvoice[row.id] ?? [];
    }
  }

  if (invoiceIds.length > 0) {
    const commStaff = alias(staff, "comm_staff");
    const commRows = await db
      .select({
        invoiceId: invoiceCommissions.invoiceId,
        staffId: invoiceCommissions.staffId,
        staffCode: commStaff.code,
        staffName: commStaff.fullName,
        percentage: invoiceCommissions.percentage,
      })
      .from(invoiceCommissions)
      .leftJoin(commStaff, eq(invoiceCommissions.staffId, commStaff.id))
      .where(inArray(invoiceCommissions.invoiceId, invoiceIds));

    const commMap: Record<string, { staffId: string; staffCode: string; staffName: string; percentage: number }[]> = {};
    for (const r of commRows) {
      if (!commMap[r.invoiceId]) commMap[r.invoiceId] = [];
      commMap[r.invoiceId].push({ staffId: r.staffId, staffCode: r.staffCode ?? "", staffName: r.staffName ?? "", percentage: parseFloat(r.percentage ?? "0") });
    }
    for (const row of invoiceRows) {
      (row as any).commissions = commMap[row.id] ?? [];
    }
  }

  if (!applyPagination) total = invoiceRows.length;
  return { data: invoiceRows, total, tabCounts };
}

export async function getInvoiceFilterOptions(filters: {
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  allowedLocationIds?: string[] | null;
  isSuperAdmin?: boolean;
} = {}): Promise<Record<string, string[]>> {
  const conditions: any[] = [];
  if (!filters.isSuperAdmin && filters.allowedLocationIds !== null && filters.allowedLocationIds !== undefined) {
    if (filters.allowedLocationIds.length === 0) {
      return { locationNames: [], categories: [], classNames: [], creatorNames: [], payerNames: [], commissionStaffNames: [], paymentMethods: [] };
    }
    conditions.push(inArray(invoices.locationId, filters.allowedLocationIds));
  }
  if (filters.dueDateFrom) conditions.push(gte(invoices.dueDate, filters.dueDateFrom));
  if (filters.dueDateTo) {
    conditions.push(lte(invoices.dueDate, filters.dueDateTo));
  } else if (filters.dateFrom) conditions.push(gte(invoices.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo && !filters.dueDateTo) {
    const toEnd = new Date(filters.dateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(invoices.createdAt, toEnd));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const commOptStaff = alias(staff, "comm_opts");
  const schedulePayerOptStaff = alias(staff, "schedule_payer_opts");
  const [rows, commRows, schedulePayerRows] = await Promise.all([
    db.select({
      locationName: locations.name,
      category: invoices.category,
      className: classes.name,
      creatorName: creatorStaff.fullName,
      payerName: paidByStaff.fullName,
      paymentMethod: invoices.paymentMethod,
    })
    .from(invoices)
    .leftJoin(locations, eq(invoices.locationId, locations.id))
    .leftJoin(classes, eq(invoices.classId, classes.id))
    .leftJoin(creatorStaff, eq(invoices.createdBy, creatorStaff.userId))
    .leftJoin(paidByStaff, eq(invoices.paidBy, paidByStaff.userId))
    .where(where),

    db.select({ staffName: commOptStaff.fullName })
    .from(invoiceCommissions)
    .innerJoin(commOptStaff, eq(invoiceCommissions.staffId, commOptStaff.id))
    .where(
      where
        ? inArray(invoiceCommissions.invoiceId, db.select({ id: invoices.id }).from(invoices).where(where))
        : undefined
    ),

    db.select({ payerName: schedulePayerOptStaff.fullName })
      .from(invoicePaymentSchedule)
      .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
      .leftJoin(locations, eq(invoices.locationId, locations.id))
      .innerJoin(schedulePayerOptStaff, eq(invoicePaymentSchedule.paidBy, schedulePayerOptStaff.userId))
      .where(where),
  ]);

  const uniq = (arr: (string | null | undefined)[]) =>
    [...new Set(arr.filter(v => v != null && v !== ""))].sort() as string[];

  return {
    locationNames: uniq(rows.map(r => r.locationName)),
    categories: uniq(rows.map(r => r.category)),
    classNames: uniq(rows.map(r => r.className)),
    creatorNames: uniq(rows.map(r => r.creatorName)),
    payerNames: uniq([
      ...rows.map(r => r.payerName),
      ...schedulePayerRows.map(r => r.payerName),
    ]),
    paymentMethods: uniq(rows.map(r => r.paymentMethod)),
    commissionStaffNames: uniq(commRows.map(r => r.staffName)),
  };
}

/**
 * Returns cash-flow rows at the payment-event level.
 *
 * Invoices without schedules, and invoices with exactly one schedule, are
 * represented by the invoice row. Invoices with multiple schedules are
 * represented by one row per paid schedule so the report date and amount
 * follow the actual installment payment.
 */
export async function getThuChiReportEntries(filters: {
  paidAtFrom?: string;
  paidAtTo?: string;
  types?: string[];
  locationNames?: string[];
  search?: string;
  creatorNames?: string[];
  paymentMethods?: string[];
  allowedLocationIds?: string[] | null;
  isSuperAdmin?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<{ data: any[]; total: number }> {
  const parentResult = await getInvoices({
    ...filters,
    paidAtFrom: undefined,
    paidAtTo: undefined,
    paymentMethods: undefined,
    payerNames: undefined,
    page: undefined,
    limit: undefined,
    includeTabCounts: false,
  });
  const parentRows = parentResult.data as any[];
  const invoiceIds = parentRows.map(row => row.id).filter(Boolean);

  const scheduleByInvoice = new Map<string, any[]>();
  if (invoiceIds.length > 0) {
    const reportSchedulePayer = alias(staff, "report_schedule_payer");
    const scheduleRows = await db
      .select({
        schedule: invoicePaymentSchedule,
        paidByName: reportSchedulePayer.fullName,
      })
      .from(invoicePaymentSchedule)
      .leftJoin(reportSchedulePayer, eq(invoicePaymentSchedule.paidBy, reportSchedulePayer.userId))
      .where(inArray(invoicePaymentSchedule.invoiceId, invoiceIds))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));

    for (const { schedule, paidByName } of scheduleRows) {
      const list = scheduleByInvoice.get(schedule.invoiceId) ?? [];
      list.push({ ...schedule, paidByName });
      scheduleByInvoice.set(schedule.invoiceId, list);
    }
  }

  const fromMs = filters.paidAtFrom
    ? new Date(`${filters.paidAtFrom}T00:00:00.000Z`).getTime()
    : Number.NEGATIVE_INFINITY;
  const toMs = filters.paidAtTo
    ? new Date(`${filters.paidAtTo}T23:59:59.999Z`).getTime()
    : Number.POSITIVE_INFINITY;
  const paymentMethods = new Set(filters.paymentMethods ?? []);

  const isInSelectedPeriod = (value: unknown): boolean => {
    if (!value) return false;
    const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isFinite(time) && time >= fromMs && time <= toMs;
  };

  const matchesPaymentMethod = (method: unknown): boolean =>
    paymentMethods.size === 0 || paymentMethods.has(String(method ?? ""));

  const reportRows: any[] = [];
  for (const invoice of parentRows) {
    const schedules = scheduleByInvoice.get(invoice.id) ?? [];

    if (schedules.length > 1) {
      for (const schedule of schedules) {
        // A missing installment paidAt cannot be assigned to a reporting
        // period without inventing a payment date.
        if (schedule.status !== "paid" || !isInSelectedPeriod(schedule.paidAt)) continue;
        const paymentMethod = schedule.paymentMethod ?? invoice.paymentMethod;
        if (!matchesPaymentMethod(paymentMethod)) continue;

        reportRows.push({
          ...invoice,
          id: `${invoice.id}:schedule:${schedule.id}`,
          invoiceId: invoice.id,
          reportAmount: schedule.amount,
          paidAmount: schedule.amount,
          paidAt: schedule.paidAt,
          paymentMethod,
          appliedBankAccount: schedule.appliedBankAccount ?? invoice.appliedBankAccount,
          settleCode: schedule.settleCode ?? invoice.settleCode,
          scheduleId: schedule.id,
          scheduleLabel: schedule.label,
          scheduleCode: schedule.code,
          schedulePaidByName: schedule.paidByName ?? null,
          paymentEventType: "schedule",
        });
      }
      continue;
    }

    const singleSchedule = schedules[0];
    const paymentAt = singleSchedule?.paidAt ?? invoice.paidAt;
    const isPaid = singleSchedule
      ? singleSchedule.status === "paid" || invoice.status === "paid"
      : invoice.paidAt != null || invoice.status === "paid";
    if (!isPaid || !isInSelectedPeriod(paymentAt)) continue;

    const paymentMethod = singleSchedule?.paymentMethod ?? invoice.paymentMethod;
    if (!matchesPaymentMethod(paymentMethod)) continue;
    const reportAmount = singleSchedule?.amount ?? invoice.grandTotal;

    reportRows.push({
      ...invoice,
      reportAmount,
      paidAmount: reportAmount,
      paidAt: paymentAt,
      paymentMethod,
      appliedBankAccount: singleSchedule?.appliedBankAccount ?? invoice.appliedBankAccount,
      settleCode: singleSchedule?.settleCode ?? invoice.settleCode,
      scheduleId: singleSchedule?.id ?? null,
      scheduleLabel: null,
      scheduleCode: null,
      schedulePaidByName: singleSchedule?.paidByName ?? null,
      paymentEventType: "invoice",
    });
  }

  reportRows.sort((a, b) => {
    const aTime = new Date(a.paidAt).getTime();
    const bTime = new Date(b.paidAt).getTime();
    return bTime - aTime;
  });

  const total = reportRows.length;
  const limit = filters.limit ?? 20;
  const page = filters.page ?? 1;
  const offset = Math.max(0, page - 1) * limit;

  return {
    data: typeof filters.page === "number" && typeof filters.limit === "number"
      ? reportRows.slice(offset, offset + limit)
      : reportRows,
    total,
  };
}

export async function getInvoicesSummary(filters: {
  locationId?: string;
  locationNames?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paidAtFrom?: string;
  paidAtTo?: string;
  categories?: string[];
  classNames?: string[];
  creatorNames?: string[];
  payerNames?: string[];
  commissionStaffNames?: string[];
  paymentMethods?: string[];
  allowedLocationIds?: string[] | null;
  isSuperAdmin?: boolean;
} = {}): Promise<{
  totalCount: number;
  byStatus: { unpaid: number; partial: number; paid: number; debt: number; cancelled: number };
  totalRevenue: number;
  actualCollected: number;
  debtAmount: number;
  expectedIncome: number;
  expectedExpense: number;
  actualIncome: number;
  actualExpense: number;
  debtIncome: number;
  debtExpense: number;
}> {
  // Tất cả các chỉ số dùng chung một tập hóa đơn theo bộ lọc hiện tại.
  // Thực thu/chi chỉ cộng paidAmount của tập này, không lọc thêm theo paidAt.
  const [{ data: incomeInvoices }, { data: expenseInvoices }] = await Promise.all([
    getInvoices({ ...filters, type: "Thu" }),
    getInvoices({ ...filters, type: "Chi" }),
  ]);

  const byStatus = { unpaid: 0, partial: 0, paid: 0, debt: 0, cancelled: 0 };
  let expectedIncome = 0;
  let expectedExpense = 0;
  let actualIncome = 0;
  let actualExpense = 0;
  let debtIncome = 0;
  let debtExpense = 0;

  // getInvoices() đã tính lại paidAmount/remainingAmount/status từ các đợt thanh toán
  // nếu có. Vì vậy paidAmount chỉ phản ánh phần đã thu/chi của đúng các hóa đơn
  // trong tập lọc hiện tại, bao gồm cả trường hợp thanh toán một phần.
  for (const inv of incomeInvoices) {
    const s = (inv.status ?? "unpaid") as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
    if (inv.status === "cancelled") continue;
    expectedIncome += parseFloat(inv.grandTotal ?? "0");
    actualIncome += parseFloat(inv.paidAmount ?? "0");
    debtIncome += parseFloat(inv.remainingAmount ?? "0");
  }
  for (const inv of expenseInvoices) {
    if (inv.status === "cancelled") continue;
    expectedExpense += parseFloat(inv.grandTotal ?? "0");
    actualExpense += parseFloat(inv.paidAmount ?? "0");
    debtExpense += parseFloat(inv.remainingAmount ?? "0");
  }

  return {
    totalCount: incomeInvoices.length,
    byStatus,
    totalRevenue: expectedIncome,
    actualCollected: actualIncome,
    debtAmount: debtIncome,
    expectedIncome,
    expectedExpense,
    actualIncome,
    actualExpense,
    debtIncome,
    debtExpense,
  };
}

export async function getRevenueByLocation(filters: { locationId?: string; dateFrom?: string; dateTo?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean } = {}): Promise<{
  rows: { locationId: string | null; locationName: string; totalIncome: number; totalExpense: number; profit: number }[];
  totals: { totalIncome: number; totalExpense: number; profit: number };
}> {
  const [{ data: incomeInvoices }, { data: expenseInvoices }] = await Promise.all([
    getInvoices({ ...filters, type: "Thu" }),
    getInvoices({ ...filters, type: "Chi" }),
  ]);

  const map = new Map<string, { locationId: string | null; locationName: string; totalIncome: number; totalExpense: number; profit: number }>();

  const ensure = (locId: string | null | undefined, locName: string | null | undefined) => {
    const key = locId || "__none__";
    if (!map.has(key)) {
      map.set(key, {
        locationId: locId ?? null,
        locationName: (locName && String(locName).trim()) || "Chưa gán cơ sở",
        totalIncome: 0,
        totalExpense: 0,
        profit: 0,
      });
    }
    return map.get(key)!;
  };

  for (const inv of incomeInvoices) {
    if (inv.status === "cancelled") continue;
    const entry = ensure(inv.locationId, (inv as any).branch);
    entry.totalIncome += parseFloat(inv.paidAmount ?? "0");
  }
  for (const inv of expenseInvoices) {
    if (inv.status === "cancelled") continue;
    const entry = ensure(inv.locationId, (inv as any).branch);
    entry.totalExpense += parseFloat(inv.paidAmount ?? "0");
  }

  const rows = Array.from(map.values())
    .map(r => ({ ...r, profit: r.totalIncome - r.totalExpense }))
    .sort((a, b) => b.totalIncome - a.totalIncome);

  const totals = rows.reduce(
    (acc, r) => ({
      totalIncome: acc.totalIncome + r.totalIncome,
      totalExpense: acc.totalExpense + r.totalExpense,
      profit: acc.profit + r.profit,
    }),
    { totalIncome: 0, totalExpense: 0, profit: 0 },
  );

  return { rows, totals };
}

export async function getCustomerDebtSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean } = {}): Promise<{
  totalDebtAmount: number;
  totalCount: number;
  byStatus: { key: string; label: string; count: number; amount: number; pct: number }[];
}> {
  const { data: all } = await getInvoices({ ...filters, type: "Thu" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7days = new Date(today);
  in7days.setDate(in7days.getDate() + 7);

  const buckets = {
    overdue:  { key: "overdue",  label: "Quá hạn",      count: 0, amount: 0 },
    dueSoon:  { key: "dueSoon",  label: "Sắp đến hạn",  count: 0, amount: 0 },
    inTerm:   { key: "inTerm",   label: "Trong hạn",    count: 0, amount: 0 },
    noDue:    { key: "noDue",    label: "Chưa có hạn",  count: 0, amount: 0 },
  };

  let totalCount = 0;
  let totalDebtAmount = 0;

  for (const inv of all) {
    if (inv.status === "cancelled" || inv.status === "paid") continue;
    const remaining = parseFloat(inv.remainingAmount ?? "0");
    if (remaining <= 0) continue;
    const dueRaw = (inv as any).scheduleNextDueDate || inv.dueDate;
    let bucket: keyof typeof buckets;
    if (!dueRaw) {
      bucket = "noDue";
    } else {
      const due = new Date(dueRaw);
      due.setHours(0, 0, 0, 0);
      if (due < today)        bucket = "overdue";
      else if (due <= in7days) bucket = "dueSoon";
      else                     bucket = "inTerm";
    }
    buckets[bucket].count += 1;
    buckets[bucket].amount += remaining;
    totalCount += 1;
    totalDebtAmount += remaining;
  }

  const byStatus = Object.values(buckets).map(b => ({
    ...b,
    pct: totalCount > 0 ? Math.round((b.count / totalCount) * 1000) / 10 : 0,
  }));

  return { totalDebtAmount, totalCount, byStatus };
}

export async function getInvoicesByCategory(filters: { locationId?: string; dateFrom?: string; dateTo?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean } = {}): Promise<{
  income: { categories: { name: string; amount: number; pct: number }[]; total: number };
  expense: { categories: { name: string; amount: number; pct: number }[]; total: number };
}> {
  const [{ data: incomeInvoices }, { data: expenseInvoices }] = await Promise.all([
    getInvoices({ ...filters, type: "Thu" }),
    getInvoices({ ...filters, type: "Chi" }),
  ]);

  const aggregate = (rows: any[], amountField: "paidAmount" | "grandTotal") => {
    const map = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      if (r.status === "cancelled") continue;
      const amount = parseFloat(r[amountField] ?? "0");
      if (amount <= 0) continue;
      const name = (r.category && String(r.category).trim()) || "Khác";
      map.set(name, (map.get(name) ?? 0) + amount);
      total += amount;
    }
    const categories = Array.from(map.entries())
      .map(([name, amount]) => ({
        name,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    return { categories, total };
  };

  return {
    income: aggregate(incomeInvoices, "paidAmount"),
    expense: aggregate(expenseInvoices, "paidAmount"),
  };
}

export async function getInvoice(id: string): Promise<any | undefined> {
  const rows = await db
    .select({
      invoice: invoices,
      studentFullName: students.fullName,
      studentCode: students.code,
      studentPhone: students.phone,
      studentAddress: students.address,
      className: classes.name,
      classCode: classes.classCode,
      createdByName: staff.fullName,
      createdByUsername: users.username,
      locationName: locations.name,
      locationAddress: locations.address,
      locationPhone: locations.phone,
      locationBankAccounts: locations.bankAccounts,
    })
    .from(invoices)
    .leftJoin(students, eq(invoices.studentId, students.id))
    .leftJoin(classes, eq(invoices.classId, classes.id))
    .leftJoin(users, eq(invoices.createdBy, users.id))
    .leftJoin(staff, eq(staff.userId, users.id))
    .leftJoin(locations, eq(invoices.locationId, locations.id))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!rows.length) return undefined;
  const {
    invoice: row,
    studentFullName, studentCode, studentPhone, studentAddress,
    className, classCode, createdByName,
    locationName, locationAddress, locationPhone,
    locationBankAccounts,
  } = rows[0];
  const commStaff2 = alias(staff, "comm_staff2");
  const scheduleCreatorStaff = alias(staff, "schedule_creator_staff");
  const schedulePaidByStaff = alias(staff, "schedule_paid_by_staff");
  const scheduleUpdaterStaff = alias(staff, "schedule_updater_staff");
  const [items, scheduleRows, commRows2] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder)),
    db.select({
      schedule: invoicePaymentSchedule,
      createdByName: scheduleCreatorStaff.fullName,
      paidByName: schedulePaidByStaff.fullName,
      updatedByName: scheduleUpdaterStaff.fullName,
    })
      .from(invoicePaymentSchedule)
      .leftJoin(scheduleCreatorStaff, eq(invoicePaymentSchedule.createdBy, scheduleCreatorStaff.userId))
      .leftJoin(schedulePaidByStaff, eq(invoicePaymentSchedule.paidBy, schedulePaidByStaff.userId))
      .leftJoin(scheduleUpdaterStaff, eq(invoicePaymentSchedule.updatedBy, scheduleUpdaterStaff.userId))
      .where(eq(invoicePaymentSchedule.invoiceId, id))
      .orderBy(asc(invoicePaymentSchedule.sortOrder)),
    db.select({ staffId: invoiceCommissions.staffId, staffCode: commStaff2.code, staffName: commStaff2.fullName, percentage: invoiceCommissions.percentage })
      .from(invoiceCommissions)
      .leftJoin(commStaff2, eq(invoiceCommissions.staffId, commStaff2.id))
      .where(eq(invoiceCommissions.invoiceId, id)),
  ]);
  const schedule = scheduleRows.map(({ schedule: row, ...names }) => ({ ...row, ...names }));
  const commissions = commRows2.map(r => ({ staffId: r.staffId, staffCode: r.staffCode ?? "", staffName: r.staffName ?? "", percentage: parseFloat(r.percentage ?? "0") }));
  return {
    ...row,
    items,
    paymentSchedule: schedule,
    commissions,
    studentFullName: studentFullName ?? null,
    studentCode: studentCode ?? null,
    studentPhone: studentPhone ?? null,
    studentAddress: studentAddress ?? null,
    className: className ?? null,
    classCode: classCode ?? null,
    createdByName: createdByName ?? null,
    locationName: locationName ?? null,
    locationAddress: locationAddress ?? null,
    locationPhone: locationPhone ?? null,
    locationBankAccounts: locationBankAccounts ?? null,
  };
}

/**
 * Tạo mã hóa đơn tuần tự theo cơ sở, atomic (tránh race condition).
 * Dùng bảng invoice_code_sequences với INSERT … ON CONFLICT upsert.
 * Format: {prefix}-{3-digit padded}, ví dụ PT-001, KT-001.
 */
export async function getNextLocationCode(
  locationId: string | null | undefined,
  prefix: string,
  executor?: { execute: (query: any) => Promise<any> },
): Promise<string> {
  const db_ = executor ?? db;
  const key = `${locationId ?? "global"}:${prefix}`;
  const result = await db_.execute(sql`
    INSERT INTO invoice_code_sequences (key, current_value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE
    SET current_value = invoice_code_sequences.current_value + 1
    RETURNING current_value
  `);
  const rows = (result as any).rows ?? result;
  const num = parseInt(String(rows[0]?.current_value ?? "1"), 10);
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

export async function getNextInvoiceCode(type: string, locationId?: string | null): Promise<string> {
  const prefix = type === "income" ? "PT" : "PC";
  return getNextLocationCode(locationId, prefix);
}

export async function createInvoice(data: any): Promise<any> {
  const { items = [], paymentSchedule = [], ...invoiceData } = data;
  if (!invoiceData.code) {
    invoiceData.code = await getNextInvoiceCode(invoiceData.type === "Chi" ? "expense" : "income", invoiceData.locationId);
  }
  const invoiceCode = invoiceData.code;
  return await db.transaction(async (tx) => {
    const isPaidOnCreate = invoiceData.status === "paid";
    const [inv] = await tx.insert(invoices).values({
      ...invoiceData,
      totalAmount: invoiceData.totalAmount?.toString() ?? "0",
      totalPromotion: invoiceData.totalPromotion?.toString() ?? "0",
      totalSurcharge: invoiceData.totalSurcharge?.toString() ?? "0",
      invoicePromotionKeys: invoiceData.invoicePromotionKeys ?? [],
      invoiceSurchargeKeys: invoiceData.invoiceSurchargeKeys ?? [],
      invoicePromotionAmount: invoiceData.invoicePromotionAmount?.toString() ?? "0",
      invoiceSurchargeAmount: invoiceData.invoiceSurchargeAmount?.toString() ?? "0",
      grandTotal: invoiceData.grandTotal?.toString() ?? "0",
      remainingAmount: invoiceData.remainingAmount?.toString() ?? invoiceData.grandTotal?.toString() ?? "0",
      commission: invoiceData.commission?.toString() ?? "0",
      paidAt: isPaidOnCreate ? (invoiceData.paidAt ?? new Date()) : (invoiceData.paidAt ?? null),
      updatedAt: new Date(),
    }).returning();

    await consumeFinanceVouchers(tx, {
      studentId: inv.studentId,
      dueDate: inv.dueDate,
      invoicePromotionKeys: inv.invoicePromotionKeys,
      items,
    }, inv.id);

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
            paidAt: s.status === "paid" ? (s.paidAt ?? new Date()) : null,
            paidBy: s.status === "paid" ? (s.paidBy ?? invoiceData.createdBy ?? null) : null,
            sortOrder: idx,
            paymentMethod: s.paymentMethod ?? null,
            appliedBankAccount: s.appliedBankAccount ?? null,
            createdBy: invoiceData.createdBy ?? null,
            updatedAt: new Date(),
            updatedBy: invoiceData.updatedBy ?? invoiceData.createdBy ?? null,
          }))
        ).returning()
      : [];

    return { ...inv, items: savedItems, paymentSchedule: savedSchedule };
  });
}

async function consumeFinanceVouchers(
  tx: any,
  data: {
    studentId: string | null;
    dueDate: string | null;
    invoicePromotionKeys: string[] | null;
    items: any[];
  },
  invoiceId: string,
): Promise<void> {
  const voucherIds = [...new Set([
    ...(data.invoicePromotionKeys ?? []),
    ...(data.items ?? []).flatMap((item: any) => item.promotionKeys ?? []),
  ]
    .filter((key: string) => key.startsWith("voucher:"))
    .map((key: string) => key.slice("voucher:".length))
    .filter(Boolean))];

  if (voucherIds.length === 0) return;
  if (!data.studentId) throw new Error("Voucher chỉ áp dụng cho học viên.");

  const vouchers = await tx
    .select()
    .from(financeVouchers)
    .where(inArray(financeVouchers.id, voucherIds))
    .for("update");
  if (vouchers.length !== voucherIds.length) {
    throw new Error("Một hoặc nhiều Voucher không còn tồn tại.");
  }

  const [student] = await tx
    .select({ dateOfBirth: students.dateOfBirth })
    .from(students)
    .where(eq(students.id, data.studentId))
    .limit(1);
  const effectiveDate = data.dueDate || new Date().toISOString().slice(0, 10);
  const birthDate = student?.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : null;
  const [, birthMonth, birthDay] = birthDate?.split("-") ?? [];
  const [, effectiveMonth, effectiveDay] = effectiveDate.split("-");

  for (const voucher of vouchers) {
    const inDateRange =
      (!voucher.startDate || String(voucher.startDate) <= effectiveDate) &&
      (!voucher.endDate || String(voucher.endDate) >= effectiveDate);
    const matchesAudience =
      voucher.audience === "all" ||
      (voucher.audience === "specific" && (voucher.audienceStudentIds ?? []).includes(data.studentId)) ||
      (voucher.audience === "birthday" &&
        Boolean(birthMonth && birthDay) &&
        birthMonth === effectiveMonth &&
        (voucher.birthdayMode === "month" || birthDay === effectiveDay));
    if (!voucher.isActive || !inDateRange || !matchesAudience) {
      throw new Error(`Voucher "${voucher.name}" không còn áp dụng cho học viên này.`);
    }
    if (voucher.quantity !== null && voucher.usedCount >= voucher.quantity) {
      throw new Error(`Voucher "${voucher.name}" đã hết số lượng.`);
    }

    const previousUsage = await tx
      .select({ id: financeVoucherUsages.id })
      .from(financeVoucherUsages)
      .where(and(
        eq(financeVoucherUsages.voucherId, voucher.id),
        eq(financeVoucherUsages.studentId, data.studentId),
      ))
      .limit(1);
    if (voucher.usageLimit === "once" && previousUsage.length > 0) {
      throw new Error(`Voucher "${voucher.name}" đã được học viên sử dụng.`);
    }

    await tx.insert(financeVoucherUsages).values({
      voucherId: voucher.id,
      studentId: data.studentId,
      invoiceId,
    });
    await tx
      .update(financeVouchers)
      .set({ usedCount: sql`${financeVouchers.usedCount} + 1` })
      .where(eq(financeVouchers.id, voucher.id));
  }
}

export async function updateInvoice(id: string, data: any): Promise<any> {
  const { items, paymentSchedule, ...invoiceData } = data;
  const toUpdate: any = { ...invoiceData, updatedAt: new Date() };
  if (toUpdate.totalAmount !== undefined) toUpdate.totalAmount = toUpdate.totalAmount.toString();
  if (toUpdate.totalPromotion !== undefined) toUpdate.totalPromotion = toUpdate.totalPromotion.toString();
  if (toUpdate.totalSurcharge !== undefined) toUpdate.totalSurcharge = toUpdate.totalSurcharge.toString();
  if (toUpdate.invoicePromotionAmount !== undefined) toUpdate.invoicePromotionAmount = toUpdate.invoicePromotionAmount.toString();
  if (toUpdate.invoiceSurchargeAmount !== undefined) toUpdate.invoiceSurchargeAmount = toUpdate.invoiceSurchargeAmount.toString();
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
      const existingSchedules = await tx
        .select()
        .from(invoicePaymentSchedule)
        .where(eq(invoicePaymentSchedule.invoiceId, id));
      const existingById = new Map(existingSchedules.map((row) => [row.id, row]));
      const retainedIds = new Set<string>();
      const now = new Date();

      const scheduleRows = paymentSchedule.map((s: any, idx: number) => {
        const previous = s.id ? existingById.get(s.id) : undefined;
        if (previous) retainedIds.add(previous.id);
        const wasPaid = previous?.status === "paid";
        const nextStatus = wasPaid ? "paid" : (s.status ?? previous?.status ?? "unpaid");

        return {
          invoiceId: id,
          label: wasPaid ? previous.label : (s.label ?? previous?.label ?? `ĐỢT ${idx + 1}`),
          code: previous?.code ?? s.code ?? `${inv.code}-${idx + 1}`,
          // A paid installment is immutable. Never trust an edited form value
          // for its amount or payment metadata.
          amount: wasPaid ? previous.amount : (s.amount?.toString() ?? previous?.amount ?? "0"),
          dueDate: wasPaid ? previous.dueDate : (s.dueDate ?? previous?.dueDate ?? null),
          status: nextStatus,
          sortOrder: previous?.sortOrder ?? idx,
          paymentMethod: wasPaid ? previous.paymentMethod : (s.paymentMethod ?? previous?.paymentMethod ?? null),
          appliedBankAccount: wasPaid ? previous.appliedBankAccount : (s.appliedBankAccount ?? previous?.appliedBankAccount ?? null),
          createdAt: previous?.createdAt ?? now,
          createdBy: previous?.createdBy ?? inv.createdBy ?? invoiceData.updatedBy ?? null,
          paidAt: wasPaid
            ? previous.paidAt
            : nextStatus === "paid"
              ? (previous?.paidAt ?? s.paidAt ?? now)
              : null,
          paidBy: wasPaid
            ? previous.paidBy
            : nextStatus === "paid"
              ? (previous?.paidBy ?? s.paidBy ?? invoiceData.updatedBy ?? null)
              : null,
          updatedAt: now,
          updatedBy: invoiceData.updatedBy ?? null,
        };
      });

      // A paid row must survive even if an older client omitted it from the
      // submitted schedule. Unpaid rows may still be removed intentionally.
      for (const previous of existingSchedules) {
        if (previous.status === "paid" && !retainedIds.has(previous.id)) {
          retainedIds.add(previous.id);
          scheduleRows.push({
            invoiceId: id,
            label: previous.label,
            code: previous.code,
            amount: previous.amount,
            dueDate: previous.dueDate,
            status: "paid",
            sortOrder: previous.sortOrder ?? scheduleRows.length,
            paymentMethod: previous.paymentMethod,
            appliedBankAccount: previous.appliedBankAccount,
            createdAt: previous.createdAt ?? now,
            createdBy: previous.createdBy ?? inv.createdBy ?? invoiceData.updatedBy ?? null,
            paidAt: previous.paidAt,
            paidBy: previous.paidBy,
            updatedAt: now,
            updatedBy: invoiceData.updatedBy ?? null,
          });
        }
      }

      for (const previous of existingSchedules) {
        if (previous.status !== "paid" && !retainedIds.has(previous.id)) {
          await tx.delete(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, previous.id));
        }
      }

      for (const row of scheduleRows) {
        if (row.id) {
          await tx
            .update(invoicePaymentSchedule)
            .set(row)
            .where(eq(invoicePaymentSchedule.id, row.id));
        } else {
          await tx.insert(invoicePaymentSchedule).values(row);
        }
      }
    }

    const savedItems = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder));
    const savedSchedule = await tx.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id)).orderBy(asc(invoicePaymentSchedule.sortOrder));
    if (savedSchedule.length > 0) {
      const grandTotal = parseFloat((toUpdate.grandTotal ?? inv.grandTotal) ?? "0");
      const paidAmount = savedSchedule
        .filter((schedule) => schedule.status === "paid")
        .reduce((sum, schedule) => sum + parseFloat(schedule.amount ?? "0"), 0);
      const remainingAmount = Math.max(0, grandTotal - paidAmount);
      const scheduleStatus = paidAmount >= grandTotal && grandTotal > 0
        ? "paid"
        : paidAmount > 0
          ? "partial"
          : "unpaid";
      const [summaryInvoice] = await tx
        .update(invoices)
        .set({
          paidAmount: paidAmount.toFixed(2),
          remainingAmount: remainingAmount.toFixed(2),
          status: scheduleStatus,
          updatedAt: now,
        })
        .where(eq(invoices.id, id))
        .returning();
      return { ...summaryInvoice, items: savedItems, paymentSchedule: savedSchedule };
    }
    return { ...inv, items: savedItems, paymentSchedule: savedSchedule };
  });
}

export async function getInvoicePaymentSchedules(invoiceId: string): Promise<any[]> {
  const scheduleCreatorStaff = alias(staff, "schedule_creator_staff_list");
  const schedulePaidByStaff = alias(staff, "schedule_paid_by_staff_list");
  const scheduleUpdaterStaff = alias(staff, "schedule_updater_staff_list");
  const rows = await db
    .select({
      schedule: invoicePaymentSchedule,
      createdByName: scheduleCreatorStaff.fullName,
      paidByName: schedulePaidByStaff.fullName,
      updatedByName: scheduleUpdaterStaff.fullName,
    })
    .from(invoicePaymentSchedule)
    .leftJoin(scheduleCreatorStaff, eq(invoicePaymentSchedule.createdBy, scheduleCreatorStaff.userId))
    .leftJoin(schedulePaidByStaff, eq(invoicePaymentSchedule.paidBy, schedulePaidByStaff.userId))
    .leftJoin(scheduleUpdaterStaff, eq(invoicePaymentSchedule.updatedBy, scheduleUpdaterStaff.userId))
    .where(eq(invoicePaymentSchedule.invoiceId, invoiceId))
    .orderBy(asc(invoicePaymentSchedule.sortOrder));
  return rows.map(({ schedule, ...names }) => ({ ...schedule, ...names }));
}

export async function splitInvoiceSchedule(scheduleId: string, splitAmount: number, userId?: string | null): Promise<{ updated: any; affected: any }> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, scheduleId));
    if (!schedule) throw new Error("Không tìm thấy đợt thanh toán");
    if (schedule.status === "paid") throw new Error("Không thể tách đợt đã thanh toán");

    const originalAmount = parseFloat(schedule.amount ?? "0");
    if (splitAmount <= 0 || splitAmount >= originalAmount) {
      throw new Error("Số tiền tách không hợp lệ");
    }
    const remainingAmount = originalAmount - splitAmount;

    // Update the current installment to the new (smaller) amount entered by user
    const [updated] = await tx
      .update(invoicePaymentSchedule)
      .set({ amount: splitAmount.toFixed(2), updatedAt: new Date(), updatedBy: userId ?? null })
      .where(eq(invoicePaymentSchedule.id, scheduleId))
      .returning();

    // Get all schedules for this invoice, sorted by sortOrder
    const allSchedules = await tx
      .select()
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, schedule.invoiceId))
      .orderBy(asc(invoicePaymentSchedule.sortOrder));

    const currentSortOrder = schedule.sortOrder ?? 0;

    // Never change an installment that has already been paid. Prefer the next
    // unpaid installment; if there is none after the current one, reuse the
    // first unpaid installment elsewhere in the schedule.
    const unpaidSchedules = allSchedules
      .filter(s => s.id !== scheduleId && s.status !== "paid")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const nextSchedule =
      unpaidSchedules.find(s => (s.sortOrder ?? 0) > currentSortOrder) ??
      unpaidSchedules[0];

    let affected: any;
    if (nextSchedule) {
      // Add remaining amount to the next installment
      const nextNewAmount = parseFloat(nextSchedule.amount ?? "0") + remainingAmount;
      const [updatedNext] = await tx
        .update(invoicePaymentSchedule)
        .set({ amount: nextNewAmount.toFixed(2), updatedAt: new Date(), updatedBy: userId ?? null })
        .where(eq(invoicePaymentSchedule.id, nextSchedule.id))
        .returning();
      affected = updatedNext;
    } else {
      // No next installment — create a new one at the end
      const maxSortOrder = Math.max(...allSchedules.map(s => s.sortOrder ?? 0));
      const newSortOrder = maxSortOrder + 1;
      const newIndex = allSchedules.length + 1;
      const newLabel = `Đợt ${newIndex}`;

      // Derive code from invoice code if possible
      const invoiceCode = allSchedules[0]?.code?.split("-").slice(0, -1).join("-") ?? null;
      const newCode = invoiceCode ? `${invoiceCode}-${newIndex}` : null;

      const [created] = await tx
        .insert(invoicePaymentSchedule)
        .values({
          invoiceId: schedule.invoiceId,
          label: newLabel,
          code: newCode ?? undefined,
          amount: remainingAmount.toFixed(2),
          status: "unpaid",
          dueDate: schedule.dueDate,
          sortOrder: newSortOrder,
          createdBy: schedule.createdBy ?? null,
          updatedBy: userId ?? schedule.updatedBy ?? null,
          updatedAt: new Date(),
        })
        .returning();
      affected = created;
    }

    return { updated, affected };
  });
}

export async function updateInvoiceSchedule(scheduleId: string, data: { amount?: number; dueDate?: string | null; updatedBy?: string | null }): Promise<any> {
  const [schedule] = await db.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.id, scheduleId));
  if (!schedule) throw new Error("Không tìm thấy đợt thanh toán");
  if (schedule.status === "paid") throw new Error("Không thể sửa đợt đã thanh toán");
  const updateData: any = {};
  if (data.amount !== undefined) updateData.amount = data.amount.toFixed(2);
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  updateData.updatedAt = new Date();
  if (data.updatedBy !== undefined) updateData.updatedBy = data.updatedBy;
  const [updated] = await db
    .update(invoicePaymentSchedule)
    .set(updateData)
    .where(eq(invoicePaymentSchedule.id, scheduleId))
    .returning();
  return updated;
}

export async function updateInvoiceScheduleStatus(scheduleId: string, status: string, userId?: string | null): Promise<any> {
  return db.transaction(async (tx) => {
    const paidAt = status === "paid" ? new Date() : null;
    const [updated] = await tx
      .update(invoicePaymentSchedule)
      .set({
        status,
        paidAt,
        paidBy: status === "paid" ? (userId ?? null) : null,
        updatedAt: new Date(),
        updatedBy: userId ?? null,
      })
      .where(eq(invoicePaymentSchedule.id, scheduleId))
      .returning();

    if (!updated?.invoiceId) return updated;

    const schedules = await tx
      .select({
        status: invoicePaymentSchedule.status,
        amount: invoicePaymentSchedule.amount,
      })
      .from(invoicePaymentSchedule)
      .where(eq(invoicePaymentSchedule.invoiceId, updated.invoiceId));
    const [invoice] = await tx
      .select({ grandTotal: invoices.grandTotal })
      .from(invoices)
      .where(eq(invoices.id, updated.invoiceId))
      .limit(1);

    if (invoice && schedules.length > 0) {
      const grandTotal = parseFloat(invoice.grandTotal ?? "0");
      const paidAmount = schedules
        .filter(schedule => schedule.status === "paid")
        .reduce((sum, schedule) => sum + parseFloat(schedule.amount ?? "0"), 0);
      const remainingAmount = Math.max(0, grandTotal - paidAmount);
      const summaryStatus = paidAmount >= grandTotal && grandTotal > 0
        ? "paid"
        : paidAmount > 0
        ? "partial"
        : "unpaid";

      await tx
        .update(invoices)
        .set({
          paidAmount: paidAmount.toFixed(2),
          remainingAmount: remainingAmount.toFixed(2),
          status: summaryStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, updated.invoiceId));
    }

    return updated;
  });
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

export async function updateInvoiceStatus(invoiceId: string, status: string, userId?: string): Promise<any> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new Error("Không tìm thấy hoá đơn");

  const grandTotal = parseFloat(inv.grandTotal ?? "0");
  const extraFields: Record<string, any> = {};

  if (status === "paid") {
    extraFields.paidAmount = grandTotal.toFixed(2);
    extraFields.remainingAmount = "0";
    if (userId) extraFields.paidBy = userId;
    extraFields.paidAt = new Date();
  } else if (status === "unpaid") {
    extraFields.paidAmount = "0";
    extraFields.remainingAmount = grandTotal.toFixed(2);
    extraFields.paidBy = null;
    extraFields.paidAt = null;
  } else if (status === "cancelled") {
    extraFields.paidAmount = "0";
    extraFields.remainingAmount = "0";
    extraFields.paidBy = null;
    extraFields.paidAt = null;
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

/**
 * Ensures crm_pipeline_groups table and new columns on crm_relationships exist.
 * Safe to run on every startup — uses IF NOT EXISTS / IF NOT EXISTS guards.
 * Needed because production DB may be behind dev schema (missing these columns).
 */
export async function migrateCrmPipelineGroupsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_pipeline_groups (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        varchar(255) NOT NULL,
      color       varchar(50)  NOT NULL DEFAULT '#8b5cf6',
      position    integer      NOT NULL DEFAULT 0,
      created_at  timestamp    NOT NULL DEFAULT now(),
      updated_at  timestamp    NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    ALTER TABLE crm_relationships
      ADD COLUMN IF NOT EXISTS group_id      uuid REFERENCES crm_pipeline_groups(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS is_parent_group boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS parent_id     uuid,
      ADD COLUMN IF NOT EXISTS is_system_default boolean NOT NULL DEFAULT false
  `);

  // Backfill the parent flag for existing hierarchies. Older databases may
  // already have parent_id values but no is_parent_group flag set.
  const parentBackfill = await db.execute(sql`
    UPDATE crm_relationships AS parent
    SET
      is_parent_group = TRUE,
      updated_at = NOW()
    WHERE parent.is_parent_group = FALSE
      AND EXISTS (
        SELECT 1
        FROM crm_relationships AS child
        WHERE child.parent_id = parent.id
          AND child.id <> parent.id
      )
    RETURNING parent.id
  `);
  const parentBackfillCount = (parentBackfill as any).rowCount ?? parentBackfill.rows.length;
  console.log(`Migration: CRM parent relationships backfilled (${parentBackfillCount} rows)`);

  // Normalize any historical duplicate marker before enforcing the invariant.
  // The partial unique index below makes concurrent startup safe thereafter.
  const existingSystemDefaults = await db
    .select()
    .from(crmRelationships)
    .where(eq(crmRelationships.isSystemDefault, true))
    .orderBy(asc(crmRelationships.createdAt));
  if (existingSystemDefaults.length > 1) {
    await db
      .update(crmRelationships)
      .set({ isSystemDefault: false, updatedAt: new Date() })
      .where(and(
        eq(crmRelationships.isSystemDefault, true),
        sql`${crmRelationships.id} <> ${existingSystemDefaults[0].id}`
      ));
  }
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS crm_relationships_one_system_default_idx
      ON crm_relationships (is_system_default)
      WHERE is_system_default = TRUE
  `);

  // Lead is the built-in relationship used for new customers. Prefer a
  // pre-existing "Lead" record when possible so older customer assignments
  // continue pointing at the same UUID. The marker, rather than the name, is
  // what makes the system relationship unique and protected.
  const [currentSystemDefault] = await db
    .select()
    .from(crmRelationships)
    .where(eq(crmRelationships.isSystemDefault, true))
    .orderBy(asc(crmRelationships.createdAt))
    .limit(1);
  let defaultLead = currentSystemDefault;

  if (!defaultLead) {
    const [existingLead] = await db
      .select()
      .from(crmRelationships)
      .where(sql`LOWER(${crmRelationships.name}) = 'lead'`)
      .orderBy(asc(crmRelationships.createdAt))
      .limit(1);

    if (existingLead) {
      const [markedLead] = await db
        .update(crmRelationships)
        .set({ isSystemDefault: true, updatedAt: new Date() })
        .where(eq(crmRelationships.id, existingLead.id))
        .returning();
      defaultLead = markedLead;
    } else {
      try {
        const [createdLead] = await db
          .insert(crmRelationships)
          .values({
            name: "Lead",
            color: "#3b82f6",
            position: "0",
            isParentGroup: false,
            parentId: null,
            isSystemDefault: true,
          })
          .returning();
        defaultLead = createdLead;
      } catch (error) {
        // Another application instance may have inserted Lead after this
        // instance checked. The unique index guarantees the re-read below
        // resolves to that same single protected record.
        const [concurrentDefault] = await db
          .select()
          .from(crmRelationships)
          .where(eq(crmRelationships.isSystemDefault, true))
          .limit(1);
        if (!concurrentDefault) throw error;
        defaultLead = concurrentDefault;
      }
    }
  }

  // The system default is deliberately outside the editable parent/child
  // hierarchy. Detaching a pre-existing Lead record affects only its CRM
  // configuration; customer relationship IDs continue to reference it.
  if (defaultLead && (defaultLead.isParentGroup || defaultLead.parentId || defaultLead.groupId)) {
    const [detachedLead] = await db
      .update(crmRelationships)
      .set({
        isParentGroup: false,
        parentId: null,
        groupId: null,
        updatedAt: new Date(),
      })
      .where(eq(crmRelationships.id, defaultLead.id))
      .returning();
    defaultLead = detachedLead;
  }

  console.log(`Migration: CRM system default Lead ensured (${defaultLead?.id ?? "unavailable"})`);
  console.log("Migration: crm_pipeline_groups schema ensured");
}

export async function migratePipelineStageToRelationshipIds(): Promise<void> {
  // Pipeline labels are historical customer data. Mapping by name at every
  // startup can resurrect a deleted relationship whenever an administrator
  // recreates a matching name (and would silently assign Lead* to old rows).
  // New students now always receive a real relationship at creation time, so
  // retain legacy labels instead of applying an unsafe automatic backfill.
  console.log("Migration: pipelineStage → relationshipIds skipped to preserve historical relationships.");
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

export async function getDefaultInvoicePrintTemplate(invoiceType: string, scheduleCount?: number | null): Promise<InvoicePrintTemplateRow | null> {
  const allDefaults = await db.select().from(invoicePrintTemplates)
    .where(and(eq(invoicePrintTemplates.invoiceType, invoiceType), eq(invoicePrintTemplates.isDefault, true)));

  if (allDefaults.length === 0) return null;

  if (scheduleCount != null) {
    // 0 or 1 schedule = single installment; 2+ = multi installment
    const targetScope = scheduleCount >= 2 ? "multi" : "single";
    const scoped = allDefaults.find(t => t.scope === targetScope);
    if (scoped) return scoped;
    const general = allDefaults.find(t => t.scope === "general");
    if (general) return general;
  }

  // fallback: prefer general, then any
  return allDefaults.find(t => t.scope === "general") ?? allDefaults[0];
}

export async function setDefaultInvoicePrintTemplate(id: string, invoiceType: string): Promise<InvoicePrintTemplateRow> {
  // Fetch the template to know its scope
  const [target] = await db.select().from(invoicePrintTemplates).where(eq(invoicePrintTemplates.id, id)).limit(1);
  if (!target) throw new Error("Template not found");

  const scope = target.scope ?? "general";

  if (scope === "general") {
    // Unset ALL defaults for this invoiceType
    await db.update(invoicePrintTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(invoicePrintTemplates.invoiceType, invoiceType));
  } else {
    // Unset other defaults with the same scope, AND unset any general default
    await db.update(invoicePrintTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(
        eq(invoicePrintTemplates.invoiceType, invoiceType),
        eq(invoicePrintTemplates.isDefault, true),
        // unset: same scope OR general
        sql`(${invoicePrintTemplates.scope} = ${scope} OR ${invoicePrintTemplates.scope} = 'general')`
      ));
  }

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
