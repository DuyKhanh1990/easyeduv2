import { describe, expect, it } from "vitest";
import { rebalanceUnpaidInstallments } from "./paymentScheduleAllocation";

describe("rebalanceUnpaidInstallments", () => {
  it("reduces the unpaid installment when the invoice total decreases", () => {
    const next = rebalanceUnpaidInstallments([
      { id: "paid", status: "paid", amount: 4_365_000 },
      { id: "unpaid", status: "unpaid", amount: 5_735_000 },
    ], -1_370_000);

    expect(next.map(row => row.amount)).toEqual([4_365_000, 4_365_000]);
  });

  it("keeps paid installments unchanged and does not invent a new installment", () => {
    const current = [
      { id: "paid", status: "paid", amount: 4_365_000 },
      { id: "unpaid", status: "unpaid", amount: 4_365_000 },
    ];
    const next = rebalanceUnpaidInstallments(current, 1_370_000);

    expect(next).toHaveLength(2);
    expect(next.map(row => row.amount)).toEqual([4_365_000, 5_735_000]);
  });

  it("leaves an all-paid schedule unchanged so the save can be blocked", () => {
    const current = [
      { id: "paid-1", status: "paid", amount: 4_365_000 },
      { id: "paid-2", status: "confirmed", amount: 4_365_000 },
    ];
    expect(rebalanceUnpaidInstallments(current, -1_370_000)).toBe(current);
  });
});
