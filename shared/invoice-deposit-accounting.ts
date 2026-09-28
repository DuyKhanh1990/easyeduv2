type InvoiceLike = {
  totalAmount?: string | number | null;
  totalPromotion?: string | number | null;
  totalSurcharge?: string | number | null;
  grandTotal?: string | number | null;
  paidAmount?: string | number | null;
  remainingAmount?: string | number | null;
  deduction?: string | number | null;
  status?: string | null;
  paymentSchedule?: unknown[] | null;
};

function nonNegativeAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * A deposit deduction reduces what is owed; it is not a second payment against
 * the already-reduced invoice total.
 */
export function calculateAutoInvoiceDepositTotals(
  grossTotal: number,
  depositBalance: number,
) {
  const gross = nonNegativeAmount(grossTotal);
  const deduction = Math.min(gross, nonNegativeAmount(depositBalance));
  const remaining = Math.max(0, gross - deduction);

  return {
    deduction,
    grandTotal: remaining,
    paidAmount: 0,
    remainingAmount: remaining,
    status: gross > 0 && remaining === 0 ? "paid" : "unpaid",
  } as const;
}

/**
 * Older automatic invoices stored the original total, the deposit deduction,
 * and the same deposit again as paidAmount. Recognize that exact legacy shape
 * when opening an invoice so it is not presented as a second payment.
 */
export function isLegacyAutoInvoiceDepositDoubleCount(
  invoice: InvoiceLike,
): boolean {
  const deduction = nonNegativeAmount(invoice.deduction);
  const paidAmount = nonNegativeAmount(invoice.paidAmount);
  const grossTotal = Math.max(
    0,
    nonNegativeAmount(invoice.totalAmount)
      - nonNegativeAmount(invoice.totalPromotion)
      + nonNegativeAmount(invoice.totalSurcharge),
  );
  const grandTotal = nonNegativeAmount(invoice.grandTotal);
  const remainingAmount = nonNegativeAmount(invoice.remainingAmount);
  const hasSchedule = (invoice.paymentSchedule?.length ?? 0) > 0;
  const epsilon = 0.01;

  return (
    !hasSchedule
    && invoice.status === "unpaid"
    && deduction > 0
    && Math.abs(paidAmount - deduction) < epsilon
    && Math.abs(grandTotal - grossTotal) < epsilon
    && Math.abs(remainingAmount - Math.max(0, grandTotal - deduction)) < epsilon
  );
}