import { describe, expect, it } from "vitest";
import {
  calculateInvoicePromotionVat,
  getUniformInvoicePromotionVatRate,
} from "../shared/invoice-promotion-vat";

describe("invoice-wide promotion VAT", () => {
  it("accepts one VAT rate across billable non-surcharge lines", () => {
    expect(getUniformInvoicePromotionVatRate([
      { category: "Tuition", vatRate: 8, subtotal: 100_000 },
      { category: "Materials", vatRate: 8, subtotal: 25_000 },
      { category: "Phụ thu", vatRate: 10, subtotal: 5_000 },
    ])).toBe(8);
  });

  it("returns no rate when eligible lines have mixed VAT", () => {
    expect(getUniformInvoicePromotionVatRate([
      { category: "Tuition", vatRate: 8, subtotal: 100_000 },
      { category: "Materials", vatRate: 5, subtotal: 25_000 },
    ])).toBeNull();
  });

  it("treats missing legacy VAT as zero and does not change its promotion VAT", () => {
    expect(calculateInvoicePromotionVat(10_000, [
      { category: "Tuition", subtotal: 100_000 },
    ])).toBe(0);
  });

  it("does not let surcharge VAT create a mixed-rate result", () => {
    expect(calculateInvoicePromotionVat(10_000, [
      { category: "Tuition", vatRate: 8, subtotal: 100_000 },
      { category: "Surcharge", vatRate: 5, subtotal: 20_000 },
    ])).toBe(800);
  });
});
