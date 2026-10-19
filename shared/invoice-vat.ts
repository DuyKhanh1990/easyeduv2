export const INVOICE_VAT_RATES = [0, 5, 8, 10] as const;

export type InvoiceVatRate = typeof INVOICE_VAT_RATES[number];

export function isInvoiceVatRate(value: number): value is InvoiceVatRate {
  return INVOICE_VAT_RATES.includes(value as InvoiceVatRate);
}

export function calculateInvoiceVatAmount(taxableAmount: number, rate: number): number {
  if (!isInvoiceVatRate(rate)) {
    throw new Error("Tỷ lệ VAT không hợp lệ.");
  }
  return Math.round(Math.max(0, Number(taxableAmount) || 0) * rate / 100);
}
