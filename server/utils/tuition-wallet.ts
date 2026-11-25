export type TuitionWalletInvoiceItem = {
  category?: string | null;
  subtotal?: string | number | null;
};

const TUITION_INVOICE_ITEM_CATEGORIES = new Set([
  "Học phí",
  "Học phí theo đăng ký",
]);

export function isTuitionInvoiceItemCategory(category: unknown): boolean {
  return TUITION_INVOICE_ITEM_CATEGORIES.has(String(category ?? "").trim());
}

export function sumTuitionInvoiceItemSubtotals(items: TuitionWalletInvoiceItem[]): number {
  return (items ?? []).reduce((sum, item) => {
    if (!isTuitionInvoiceItemCategory(item.category)) return sum;
    const amount = Number.parseFloat(String(item.subtotal ?? "0"));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export function computeTuitionWalletAmount(
  grandTotal: number,
  items: TuitionWalletInvoiceItem[],
): number {
  const nonTuitionTotal = (items ?? []).reduce((sum, item) => {
    if (isTuitionInvoiceItemCategory(item.category)) return sum;
    const amount = Number.parseFloat(String(item.subtotal ?? "0"));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return Math.max(0, grandTotal - nonTuitionTotal);
}
