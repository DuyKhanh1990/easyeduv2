import { describe, expect, it } from "vitest";
import { getMatBaoInvoiceQuantity, isCoursePackageType } from "./matbao-invoice-mapping";

describe("Mắt Bão invoice quantity mapping", () => {
  it.each(["khoá", "khóa", "KHOA", "course", "theo khóa"])(
    "recognizes course package type %s",
    (packageType) => {
      expect(isCoursePackageType(packageType)).toBe(true);
      expect(getMatBaoInvoiceQuantity(packageType, 5)).toBe(1);
    },
  );

  it("keeps the actual quantity for per-session and non-course items", () => {
    expect(getMatBaoInvoiceQuantity("buổi", 5)).toBe(5);
    expect(getMatBaoInvoiceQuantity("Kho", 5)).toBe(5);
    expect(getMatBaoInvoiceQuantity(null, 5)).toBe(5);
  });
});
