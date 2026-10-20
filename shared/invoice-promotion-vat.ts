import { calculateInvoiceVatAmount, isInvoiceVatRate } from "./invoice-vat";

export function getUniformInvoicePromotionVatRate(
  items: Array<{ category?: string | null; vatRate?: number | string | null; subtotal?: number | string | null }>,
): number | null {
  const rates = new Set<number>();
  for (const item of items) {
    const category = String(item.category ?? "").trim().toLocaleLowerCase();
    if (category === "phụ thu" || category === "surcharge") continue;
    if (Number.parseFloat(String(item.subtotal ?? "0")) <= 0) continue;
    const rate = Number(item.vatRate ?? 0);
    if (!isInvoiceVatRate(rate)) throw new Error("Tỷ lệ VAT không hợp lệ.");
    rates.add(rate);
  }
  return rates.size === 1 ? [...rates][0] : null;
}

export function calculateInvoicePromotionVat(
  amount: number,
  items: Array<{ category?: string | null; vatRate?: number | string | null; subtotal?: number | string | null }>,
): number {
  const vatRate = getUniformInvoicePromotionVatRate(items);
  return vatRate === null ? 0 : calculateInvoiceVatAmount(amount, vatRate);
}
