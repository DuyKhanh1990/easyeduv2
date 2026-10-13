import { describe, expect, it } from "vitest";
import { allocateInvoiceWalletAmountsToSchedules } from "./invoice-schedule-wallet";

describe("allocateInvoiceWalletAmountsToSchedules", () => {
  it("allocates wallet value to child installments without double-counting categories", () => {
    const result = allocateInvoiceWalletAmountsToSchedules(
      1_000,
      [
        { category: "Học phí", subtotal: 800 },
        { category: "Đặt cọc", subtotal: 200 },
      ],
      [
        { id: "first", amount: 500, sortOrder: 0 },
        { id: "second", amount: 500, sortOrder: 1 },
      ],
    );

    expect(result.get("first")).toEqual({ tuition: 500, deposit: 0 });
    expect(result.get("second")).toEqual({ tuition: 300, deposit: 200 });
    expect([...result.values()].reduce((sum, row) => sum + row.tuition + row.deposit, 0)).toBe(1_000);
  });

  it("preserves exact cents across uneven installments and ignores non-wallet items", () => {
    const result = allocateInvoiceWalletAmountsToSchedules(
      10,
      [
        { category: "Học phí", subtotal: 7.01 },
        { category: "Đặt cọc", subtotal: 1.99 },
        { category: "Sách", subtotal: 1 },
      ],
      [
        { id: "third", amount: 3.33, sortOrder: 2 },
        { id: "first", amount: 3.33, sortOrder: 0 },
        { id: "second", amount: 3.34, sortOrder: 1 },
      ],
    );

    expect([...result.values()].reduce((sum, row) => sum + row.tuition, 0)).toBe(7.01);
    expect([...result.values()].reduce((sum, row) => sum + row.deposit, 0)).toBe(1.99);
  });
});
