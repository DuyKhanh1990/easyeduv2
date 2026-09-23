import {
  db,
  eq, and, inArray,
  attendanceFeeRules,
  classes,
  courseFeePackages,
  invoices,
  invoiceItems,
  studentWalletTransactions,
} from "./base";

type WalletExecutor = typeof db | any;

type FreeClassWalletTransition = {
  studentId: string;
  classId: string;
  registrationDate: string;
  totalSessions: number | string | null | undefined;
  oldStatus: string | null | undefined;
  newStatus: string | null | undefined;
  createdBy?: string | null;
  createdByName?: string | null;
};

function formatFreeClassDate(date: string): string {
  const [year, month, day] = String(date).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "buổi học";
}

/**
 * Mirrors the regular-class attendance wallet behavior for a free-class day.
 * Free classes have no student_sessions, so their effective fee comes from
 * the invoice item (or the class fee package as fallback).
 */
export async function recordFreeClassWalletTransition(
  executor: WalletExecutor,
  transition: FreeClassWalletTransition,
): Promise<void> {
  const [feeRule] = await executor
    .select({ deductsFee: attendanceFeeRules.deductsFee })
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.attendanceStatus, "present"))
    .limit(1);

  const oldDeducts = transition.oldStatus === "attended" && feeRule?.deductsFee === true;
  const newDeducts = transition.newStatus === "attended" && feeRule?.deductsFee === true;
  if (oldDeducts === newDeducts) return;

  const [[classRow], invoiceItemRows] = await Promise.all([
    executor
      .select({
        className: classes.name,
        packageType: courseFeePackages.type,
        packageFee: courseFeePackages.fee,
      })
      .from(classes)
      .leftJoin(courseFeePackages, eq(classes.feePackageId, courseFeePackages.id))
      .where(eq(classes.id, transition.classId))
      .limit(1),
    executor
      .select({
        invoiceId: invoices.id,
        grandTotal: invoices.grandTotal,
        packageId: invoiceItems.packageId,
        packageType: invoiceItems.packageType,
        unitPrice: invoiceItems.unitPrice,
      })
      .from(invoices)
      .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.studentId, transition.studentId),
        eq(invoices.classId, transition.classId),
        eq(invoices.type, "Thu"),
      )),
  ]);

  const invoiceItem = invoiceItemRows.find((item: any) => item.packageId) ?? invoiceItemRows[0];
  const packageType = invoiceItem?.packageType ?? classRow?.packageType ?? "buổi";
  const totalSessions = Math.max(1, Number(transition.totalSessions || 0));
  const sessionPrice = packageType === "buổi"
    ? Number(invoiceItem?.unitPrice || classRow?.packageFee || 0)
    : Number(invoiceItem?.grandTotal || 0) / totalSessions;

  if (sessionPrice <= 0) return;

  const dateLabel = formatFreeClassDate(transition.registrationDate);
  const isDebit = newDeducts;
  await executor.insert(studentWalletTransactions).values({
    studentId: transition.studentId,
    invoiceId: null,
    type: isDebit ? "debit" : "credit",
    amount: sessionPrice.toFixed(2),
    category: "Học phí",
    action: isDebit
      ? `Trừ học phí ngày ${dateLabel}, do điểm danh có trừ tiền`
      : `Cộng tiền học phí ngày ${dateLabel}, do điểm danh không trừ tiền`,
    classId: transition.classId,
    className: classRow?.className ?? null,
    createdBy: transition.createdBy ?? null,
    createdByName: transition.createdByName ?? null,
  });
}
