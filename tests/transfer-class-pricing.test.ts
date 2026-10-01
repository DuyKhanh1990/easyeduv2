import { describe, expect, it } from "vitest";
import {
  calculateFirstSessionPriceAfterDiscount,
  calculatePerSessionTransferTotal,
  hasExistingSessionTuition,
} from "../client/src/components/education/transferClassPricing";

describe("class transfer per-session tuition fallback", () => {
  it("uses the transfer count and per-session fee instead of the package template count", () => {
    expect(calculatePerSessionTransferTotal(400_000, 7)).toBe(2_800_000);
  });

  it("subtracts the chosen discount before dividing by actual registered sessions", () => {
    const totalAfterDiscount = calculatePerSessionTransferTotal(400_000, 7) - 280_000;
    const discountedUnitPrice = calculateFirstSessionPriceAfterDiscount(totalAfterDiscount, 7);
    expect(discountedUnitPrice).toBe(360_000);
    expect(calculatePerSessionTransferTotal(discountedUnitPrice, 7)).toBe(2_520_000);
  });

  it("uses actual registered session count, not only transferred count, as the unit-price divisor", () => {
    const totalAfterDiscount = calculatePerSessionTransferTotal(400_000, 7) - 100_000;
    expect(calculateFirstSessionPriceAfterDiscount(totalAfterDiscount, 7)).toBe(385_714.29);
  });

  it("keeps saved invoice allocations, applied tuition adjustments, and custom session prices on the existing path", () => {
    expect(hasExistingSessionTuition([
      { sessionPrice: 400_000, feePackage: { fee: 400_000 }, pricing: { hasInvoiceAllocation: true } },
    ], 400_000)).toBe(true);
    expect(hasExistingSessionTuition([
      { sessionPrice: 400_000, feePackage: { fee: 400_000 }, pricing: { hasPackageAdjustment: true } },
    ], 400_000)).toBe(true);
    expect(hasExistingSessionTuition([
      { sessionPrice: 350_000, feePackage: { fee: 400_000 } },
    ], 400_000)).toBe(true);
  });

  it("does not treat the package's default stored session price as an applied tuition override", () => {
    expect(hasExistingSessionTuition([
      { sessionPrice: 400_000, feePackage: { fee: 400_000 } },
    ], 400_000)).toBe(false);
  });
});