import { describe, expect, it } from "vitest";
import { renderHistoryHtml, renderTemplate } from "./InvoicePrintPreview";

describe("legacy invoice-print financial variables", () => {
  it("uses parent invoice amounts when printing an installment", () => {
    const html = renderTemplate(
      "{{tong_truoc_kmpt}}|{{tong_km}}|{{khau_tru}}|{{tong_pt}}|{{tong_sau_km}}|{{tong_sau_kmpt}}|{{total}}|{{tong_sau_khau_tru}}|{{da_thanh_toan}}|{{con_lai}}|{{km_theo_sp}}|{{km_toan_don}}|{{pt_toan_don}}",
      {
        id: "child",
        code: "INV-1/1",
        type: "Thu",
        grandTotal: "5580000",
        paidAmount: "0",
        remainingAmount: "5580000",
        totalAmount: "6000000",
        totalPromotion: "420000",
        totalSurcharge: "0",
        deduction: "0",
        createdAt: "2026-10-12T00:00:00.000Z",
        parentInvoice: {
          code: "INV-1",
          // Visibility-scoped invoice queries can overwrite totalAmount with
          // the final schedule total; the print variable must still be pre-KM/PT.
          totalAmount: "10160000",
          totalPromotion: "840000",
          totalSurcharge: "0",
          invoicePromotionAmount: "700000",
          invoiceSurchargeAmount: "0",
          deduction: "1000000",
          grandTotal: "10160000",
          paidAmount: "5580000",
          remainingAmount: "4580000",
        },
        items: [{ promotionAmount: "140000", surchargeAmount: "0" }],
        paymentSchedule: [],
      },
    );

    expect(html).toBe("12.000.000|840.000|1.000.000|0|11.160.000|11.160.000|10.160.000|10.160.000|5.580.000|4.580.000|140.000|700.000|0");
  });

  it("uses the invoice itself when there is no separate parent (single invoice)", () => {
    const html = renderTemplate(
      "{{tong_truoc_kmpt}}|{{tong_km}}|{{khau_tru}}|{{tong_pt}}|{{tong_sau_km}}|{{tong_sau_kmpt}}|{{total}}|{{tong_sau_khau_tru}}|{{da_thanh_toan}}|{{con_lai}}|{{km_theo_sp}}|{{km_toan_don}}|{{pt_toan_don}}",
      {
        id: "single",
        type: "Thu",
        grandTotal: "10160000",
        paidAmount: "5580000",
        remainingAmount: "4580000",
        totalPromotion: "840000",
        totalSurcharge: "0",
        invoicePromotionAmount: "700000",
        invoiceSurchargeAmount: "0",
        deduction: "1000000",
        createdAt: "2026-10-12T00:00:00.000Z",
        items: [{ promotionAmount: "140000", surchargeAmount: "0" }],
        paymentSchedule: [],
      },
    );

    expect(html).toBe("12.000.000|840.000|1.000.000|0|11.160.000|11.160.000|10.160.000|10.160.000|5.580.000|4.580.000|140.000|700.000|0");
  });
});

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