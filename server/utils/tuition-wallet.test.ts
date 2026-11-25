import { describe, expect, it } from "vitest";
import {
  computeTuitionWalletAmount,
  isTuitionInvoiceItemCategory,
  sumTuitionInvoiceItemSubtotals,
} from "./tuition-wallet";

describe("tuition wallet invoice categories", () => {
  it("recognizes both standard and registration tuition categories", () => {
    expect(isTuitionInvoiceItemCategory("Học phí")).toBe(true);
    expect(isTuitionInvoiceItemCategory(" Học phí theo đăng ký ")).toBe(true);
    expect(isTuitionInvoiceItemCategory("Sách")).toBe(false);
  });

  it("credits the registration tuition portion while excluding non-tuition items", () => {
    const items = [
      { category: "Học phí theo đăng ký", subtotal: "1000000" },
      { category: "Sách", subtotal: "150000" },
      { category: "Đặt cọc", subtotal: "50000" },
    ];

    expect(computeTuitionWalletAmount(1_200_000, items)).toBe(1_000_000);
    expect(sumTuitionInvoiceItemSubtotals(items)).toBe(1_000_000);
  });
});
