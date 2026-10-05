import { describe, expect, it } from "vitest";
import {
  buildClassTransferSurchargeOnlyAllocations,
  calculateClassFundedAmounts,
  calculateClassTransferSourceCredit,
  calculateClassTransferTargetSessionPrice,
  getPackageSessionValue,
} from "../server/storage/class-transfer-accounting";

describe("class transfer accounting", () => {
  it("uses the latest effective package adjustment before every other source", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [{ id: "session-1", sessionPrice: 900 }],
      allocations: [{
        studentSessionId: "session-1",
        allocatedAmount: 700,
      }],
      adjustments: [
        { studentSessionId: "session-1", effectiveAmount: 650, appliedSequence: 1 },
        { studentSessionId: "session-1", effectiveAmount: 525, appliedSequence: 2 },
      ],
    })).toBe(525);
  });

  it("sums active invoice allocations and ignores allocations from cancelled invoices", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [{ id: "session-1", sessionPrice: 900 }],
      allocations: [
        { studentSessionId: "session-1", allocatedAmount: 250, invoiceStatus: "paid" },
        { studentSessionId: "session-1", allocatedAmount: 100, invoiceStatus: "partial" },
        { studentSessionId: "session-1", allocatedAmount: 800, invoiceStatus: "cancelled" },
      ],
    })).toBe(350);
  });

  it("excludes invoice-item surcharges from transferred tuition only when requested", () => {
    const input = {
      sessions: [
        { id: "session-1", sessionPrice: 500 },
        { id: "session-2", sessionPrice: 500 },
      ],
      allocations: [
        {
          allocationId: "allocation-1",
          invoiceItemId: "item-1",
          studentSessionId: "session-1",
          allocatedAmount: 112.5,
          invoiceStatus: "paid",
          itemPackageType: "buổi",
          itemQuantity: 2,
          itemSurchargeAmount: 25,
          sessionOrder: 1,
        },
        {
          allocationId: "allocation-2",
          invoiceItemId: "item-1",
          studentSessionId: "session-2",
          allocatedAmount: 212.5,
          invoiceStatus: "paid",
          itemPackageType: "buổi",
          itemQuantity: 2,
          itemSurchargeAmount: 25,
          sessionOrder: 2,
        },
      ],
    };

    expect(calculateClassTransferSourceCredit(input)).toBe(325);
    expect(calculateClassTransferSourceCredit({
      ...input,
      excludeSurcharge: true,
    })).toBe(300);
  });

  it("splits course-item surcharge cents across the full invoice allocation set", () => {
    const input = {
      sessions: [
        { id: "session-1", sessionPrice: 500 },
        { id: "session-2", sessionPrice: 500 },
      ],
      allocations: [
        {
          allocationId: "allocation-1",
          invoiceItemId: "course-item",
          studentSessionId: "session-1",
          allocatedAmount: 1.02,
          invoiceStatus: "paid",
          itemPackageType: "khoá",
          itemQuantity: 99,
          itemSurchargeAmount: 0.05,
          sessionOrder: 1,
        },
        {
          allocationId: "allocation-2",
          invoiceItemId: "course-item",
          studentSessionId: "session-2",
          allocatedAmount: 1.03,
          invoiceStatus: "paid",
          itemPackageType: "khoá",
          itemQuantity: 99,
          itemSurchargeAmount: 0.05,
          sessionOrder: 2,
        },
      ],
    };

    expect(calculateClassTransferSourceCredit(input)).toBe(2.05);
    expect(calculateClassTransferSourceCredit({
      ...input,
      excludeSurcharge: true,
    })).toBe(2);
  });

  it("excludes a course-item surcharge from source credit when the invoice item has no fee allocations", () => {
    const sessions = Array.from({ length: 20 }, (_, index) => ({
      id: `session-${String(index + 1).padStart(2, "0")}`,
      sessionPrice: 100_000,
      sessionOrder: index + 1,
    }));
    const surchargeOnlyAllocations = buildClassTransferSurchargeOnlyAllocations(
      [{
        invoiceItemId: "unallocated-course-item",
        invoiceStatus: "unpaid",
        itemPackageType: "khoá",
        itemQuantity: 20,
        itemSurchargeAmount: 50_000,
      }],
      [...sessions].reverse(),
    );
    const input = {
      sessions,
      allocations: surchargeOnlyAllocations,
    };

    expect(surchargeOnlyAllocations.map((row) => row.studentSessionId)).toEqual(
      sessions.map((session) => session.id),
    );
    expect(calculateClassTransferSourceCredit(input)).toBe(2_000_000);
    expect(calculateClassTransferSourceCredit({
      ...input,
      excludeSurcharge: true,
    })).toBe(1_950_000);
  });

  it("uses saved session prices before falling back to package prices", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [
        {
          id: "saved-price",
          sessionPrice: 725,
          packageType: "khoá",
          packageSessions: 4,
          packageTotalAmount: 4000,
        },
        {
          id: "course-fallback",
          packageType: "khoá",
          packageSessions: 6,
          packageTotalAmount: 4800,
        },
        {
          id: "lesson-fallback",
          packageType: "buổi",
          packageFee: 950,
        },
      ],
    })).toBe(725 + 800 + 950);
  });

  it("uses a validated transfer-time discounted unit price when no invoice allocation or adjustment exists", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [
        { id: "lesson-1", sessionPrice: 400, transferPriceOverride: 360 },
        { id: "lesson-2", sessionPrice: 400, transferPriceOverride: 360 },
      ],
    })).toBe(720);
  });

  it("keeps invoice allocations and package adjustments ahead of transfer-time price overrides", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [{ id: "lesson", sessionPrice: 400, transferPriceOverride: 360 }],
      allocations: [{ studentSessionId: "lesson", allocatedAmount: 330, invoiceStatus: "paid" }],
      adjustments: [{ studentSessionId: "lesson", effectiveAmount: 310, appliedSequence: 1 }],
    })).toBe(310);
  });

  it("uses the source class package when a session has no saved package pricing", () => {
    expect(calculateClassTransferSourceCredit({
      sessions: [{ id: "fallback" }],
      defaultPackage: {
        type: "khoá",
        sessions: 8,
        totalAmount: 6400,
        fee: 6400,
      },
    })).toBe(800);
  });

  it("derives a course package unit price from the configured total and session count", () => {
    expect(getPackageSessionValue({
      id: "configured-course",
      packageFeeType: "khóa",
      packageSessions: 12,
      packageTotalAmount: 4_800_000,
    })).toBe(400_000);
  });

  it("applies the selected rounding mode and never returns a negative credit", () => {
    const input = { sessions: [{ id: "price", sessionPrice: 1000.4 }] };
    expect(calculateClassTransferSourceCredit(input)).toBe(1000.4);
    expect(calculateClassTransferSourceCredit({ ...input, roundingMode: "down" })).toBe(1000);
    expect(calculateClassTransferSourceCredit({ ...input, roundingMode: "up" })).toBe(1001);
    expect(calculateClassTransferSourceCredit({
      sessions: [{ id: "negative", sessionPrice: -100 }],
    })).toBe(0);
  });

  it("keeps destination sessions at their package unit price unless explicitly overridden", () => {
    const coursePackage = {
      type: "khoá",
      sessions: 6,
      fee: 4800,
      totalAmount: 4800,
    };

    expect(calculateClassTransferTargetSessionPrice(coursePackage)).toBe(800);
    expect(calculateClassTransferTargetSessionPrice(coursePackage, 750)).toBe(750);
    expect(calculateClassTransferTargetSessionPrice({
      type: "buổi",
      fee: 950,
      sessions: 1,
    })).toBe(950);
    expect(calculateClassTransferTargetSessionPrice(null)).toBeNull();
  });

  it("moves class allocation without changing total funding and excludes unpaid difference invoices", () => {
    const fundedByClass = calculateClassFundedAmounts({
      paidInvoices: [
        { classId: "source", paidAmount: 1200 },
        { classId: "destination", paidAmount: 400 },
        // An unpaid difference invoice contributes no collected funding.
        { classId: "destination", paidAmount: 0 },
      ],
      transferWalletEntries: [
        { classId: "source", type: "debit", amount: 300 },
        { classId: "destination", type: "credit", amount: 300 },
      ],
      paidRefundInvoices: [],
    });

    expect(fundedByClass.get("source")).toBe(900);
    expect(fundedByClass.get("destination")).toBe(700);
    expect([...fundedByClass.values()].reduce((sum, value) => sum + value, 0)).toBe(1600);
  });

  it("reduces destination class funding only by the amount actually paid as a transfer refund", () => {
    const fundedByClass = calculateClassFundedAmounts({
      paidInvoices: [{ classId: "destination", paidAmount: 1200 }],
      transferWalletEntries: [],
      paidRefundInvoices: [{ classId: "destination", paidAmount: 350 }],
    });

    expect(fundedByClass.get("destination")).toBe(850);
  });
});