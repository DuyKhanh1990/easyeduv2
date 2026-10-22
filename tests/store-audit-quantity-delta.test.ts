import { describe, expect, it } from "vitest";
import {
  formatStoreAuditQuantityDelta,
  getStoreAuditQuantityDelta,
} from "../client/src/pages/store/storeAuditQuantityDelta";

describe("store audit quantity delta", () => {
  it("calculates a decrease for edited product lines", () => {
    expect(getStoreAuditQuantityDelta("📦 Test111", "SL: 15, Giá: 40000", "SL: 12, Giá: 40000"))
      .toBe(-3);
    expect(formatStoreAuditQuantityDelta(-3)).toBe("-3");
  });

  it("calculates increases and removals when one side is missing", () => {
    expect(getStoreAuditQuantityDelta("📦 Added", null, "SL: 5, Giá: 100"))
      .toBe(5);
    expect(getStoreAuditQuantityDelta("📦 Removed", "SL: 5, Giá: 100", null))
      .toBe(-5);
    expect(formatStoreAuditQuantityDelta(5)).toBe("+5");
  });

  it("calculates the aggregate total quantity change", () => {
    expect(getStoreAuditQuantityDelta("Tổng số lượng", "27", "24")).toBe(-3);
  });

  it("shows no quantity delta for unrelated fields and formats zero cleanly", () => {
    expect(getStoreAuditQuantityDelta("Kho", "Kho A", "Kho B")).toBeNull();
    expect(getStoreAuditQuantityDelta("📦 Same quantity, price changed", "SL: 12, Giá: 10", "SL: 12, Giá: 12"))
      .toBe(0);
    expect(formatStoreAuditQuantityDelta(-0)).toBe("0");
  });
});
