import { describe, expect, it } from "vitest";
import { renderHistoryHtml } from "./InvoicePrintPreview";

describe("{{lich_su_thanh_toan}}", () => {
  it("renders confirmed installments as paid with their actual payment date", () => {
    const html = renderHistoryHtml([
      {
        label: "ĐỢT 1",
        amount: "2000000",
        status: "confirmed",
        paidAt: "2026-09-23T17:00:00.000Z",
        dueDate: "2026-09-26",
        paymentMethod: "cash",
      },
    ]);

    expect(html).toContain("ĐỢT 1 đã thanh toán");
    expect(html).toContain("24/09/2026");
    expect(html).not.toContain("chưa thanh toán");
    expect(html).not.toContain("Dự kiến");
  });

  it("does not present a due date as the payment date when confirmation lacks paidAt", () => {
    const html = renderHistoryHtml([
      { label: "ĐỢT 2", amount: "2000000", status: "confirmed", dueDate: "2026-09-26" },
    ]);

    expect(html).toContain("ĐỢT 2 đã thanh toán");
    expect(html).not.toContain("Dự kiến");
  });

  it("preserves paid and unpaid installment labels and dates", () => {
    const html = renderHistoryHtml([
      { label: "ĐỢT 1", amount: "2000000", status: "paid", paidAt: "2026-09-23T17:00:00.000Z" },
      { label: "ĐỢT 2", amount: "2000000", status: "unpaid", dueDate: "2026-09-26" },
    ]);

    expect(html).toContain("ĐỢT 1 đã thanh toán");
    expect(html).toContain("ĐỢT 2 chưa thanh toán");
    expect(html).toContain("Dự kiến 26/09/2026");
  });
});