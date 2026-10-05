import { describe, expect, it } from "vitest";
import {
  calculateFirstSessionPriceAfterDiscount,
  calculateInvoiceSessionPrice,
  calculatePerSessionTransferTotal,
  hasExistingSessionTuition,
} from "../client/src/components/education/transferClassPricing";

describe("class transfer per-session tuition fallback", () => {
  it("uses the configured package total and session count to price the transferred sessions", () => {
    const packageSessionPrice = calculateFirstSessionPriceAfterDiscount(4_800_000, 12);
    expect(packageSessionPrice).toBe(400_000);
    expect(calculatePerSessionTransferTotal(packageSessionPrice, 7)).toBe(2_800_000);
  });

  it("spreads a package-level discount over the configured package session count", () => {
    const totalAfterDiscount = 4_800_000 - 280_000;
    const discountedUnitPrice = calculateFirstSessionPriceAfterDiscount(totalAfterDiscount, 12);
    expect(discountedUnitPrice).toBe(376_666.67);
    expect(calculatePerSessionTransferTotal(discountedUnitPrice, 7)).toBe(2_636_666.69);
  });

  it("keeps the displayed transfer total equal to first-session price times transferred count", () => {
    const firstSessionPrice = calculateFirstSessionPriceAfterDiscount(4_500_000, 12);
    expect(calculatePerSessionTransferTotal(firstSessionPrice, 7)).toBe(2_625_000);
  });

  it("uses the editable session-count denominator against the package total", () => {
    const firstSessionPrice = calculateFirstSessionPriceAfterDiscount(4_800_000, 10);
    expect(firstSessionPrice).toBe(480_000);
    expect(calculatePerSessionTransferTotal(firstSessionPrice, 7)).toBe(3_360_000);
  });

  it("redivides the invoice amount by the manually edited session count", () => {
    expect(calculateInvoiceSessionPrice(5_050_000, 50_000, 25, false)).toBe(202_000);
    expect(calculateInvoiceSessionPrice(5_050_000, 50_000, 25, true)).toBe(200_000);
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

  it("compares a saved session price with the package-derived unit price", () => {
    expect(hasExistingSessionTuition([
      { sessionPrice: 400_000, feePackage: { fee: 4_800_000 } },
    ], 400_000)).toBe(false);
  });
});