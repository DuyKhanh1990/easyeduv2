import { describe, expect, it } from "vitest";
import { calculateInvoiceVatAmount, INVOICE_VAT_RATES } from "../shared/invoice-vat";

describe("invoice VAT", () => {
  it("offers only the configured rates", () => {
    expect(INVOICE_VAT_RATES).toEqual([0, 5, 8, 10]);
  });

  it("calculates tax on the amount before VAT and rounds to whole currency units", () => {
    expect(calculateInvoiceVatAmount(100_000, 8)).toBe(8_000);
    expect(calculateInvoiceVatAmount(100_000, 0)).toBe(0);
    expect(calculateInvoiceVatAmount(10_005, 5)).toBe(500);
  });

  it("rejects unsupported tax rates", () => {
    expect(() => calculateInvoiceVatAmount(100_000, 7)).toThrow("Tỷ lệ VAT không hợp lệ.");
  });
});
