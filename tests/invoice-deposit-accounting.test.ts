import { describe, expect, it } from "vitest";
import {
  calculateAutoInvoiceDepositTotals,
  isLegacyAutoInvoiceDepositDoubleCount,
} from "../shared/invoice-deposit-accounting";

describe("invoice deposit accounting", () => {
  it("subtracts a deposit once and leaves the reduced balance unpaid", () => {
    expect(calculateAutoInvoiceDepositTotals(4_500_000, 500_000)).toEqual({
      deduction: 500_000,
      grandTotal: 4_000_000,
      paidAmount: 0,
      remainingAmount: 4_000_000,
      status: "unpaid",
    });
  });

  it("marks an invoice fully covered by deposit as settled without recording a second payment", () => {
    expect(calculateAutoInvoiceDepositTotals(500_000, 800_000)).toEqual({
      deduction: 500_000,
      grandTotal: 0,
      paidAmount: 0,
      remainingAmount: 0,
      status: "paid",
    });
  });

  it("recognizes the older automatic-invoice double-count shape", () => {
    expect(isLegacyAutoInvoiceDepositDoubleCount({
      totalAmount: "5000000",
      totalPromotion: "500000",
      totalSurcharge: "0",
      grandTotal: "4500000",
      deduction: "500000",
      paidAmount: "500000",
      remainingAmount: "4000000",
      status: "unpaid",
      paymentSchedule: [],
    })).toBe(true);
  });

  it("does not hide a separate real payment or a recorded payment schedule", () => {
    const invoice = {
      totalAmount: "4500000",
      totalPromotion: "0",
      totalSurcharge: "0",
      grandTotal: "4000000",
      deduction: "500000",
      paidAmount: "500000",
      remainingAmount: "3500000",
      status: "partial",
    };

    expect(isLegacyAutoInvoiceDepositDoubleCount(invoice)).toBe(false);
    expect(isLegacyAutoInvoiceDepositDoubleCount({
      ...invoice,
      totalAmount: "5000000",
      totalPromotion: "500000",
      grandTotal: "4500000",
      remainingAmount: "4000000",
      status: "unpaid",
      paymentSchedule: [{ status: "paid", amount: "500000" }],
    })).toBe(false);
  });
});