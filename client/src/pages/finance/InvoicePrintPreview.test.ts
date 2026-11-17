import { describe, expect, it } from "vitest";
import { renderHistoryHtml, renderTemplate } from "./InvoicePrintPreview";
import { INVOICE_PRINT_BASE_STYLES } from "./invoice-print-base-styles";
import { TEMPLATE_PRESETS } from "./invoiceTemplatePresets";
import { renderItemsVat } from "./InvoicePrintTemplate";

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

describe("invoice note print variables", () => {
  const baseInvoice = {
    id: "invoice-1",
    type: "Thu",
    grandTotal: "48000",
    paidAmount: "48000",
    createdAt: "2026-10-24T00:00:00.000Z",
  };

  it("uses the generated invoice description when note is empty", () => {
    const html = renderTemplate("{{ghi_chu}}|{{noi_dung}}", {
      ...baseInvoice,
      description: "Hóa đơn Phiếu xuất kho số 55 bao gồm: IELTS 4.0 SL:1",
    });

    expect(html).toBe(
      "Hóa đơn Phiếu xuất kho số 55 bao gồm: IELTS 4.0 SL:1|Hóa đơn Phiếu xuất kho số 55 bao gồm: IELTS 4.0 SL:1",
    );
  });

  it("prefers the edited invoice note when both fields exist", () => {
    const html = renderTemplate("{{ghi_chu}}", {
      ...baseInvoice,
      note: "Nội dung đã sửa",
      description: "Nội dung tự sinh cũ",
    });

    expect(html).toBe("Nội dung đã sửa");
  });
});

describe("VAT-enabled invoice item table", () => {
  it("shows the rate and VAT-inclusive line total without changing the regular items table", () => {
    const invoice = {
      id: "single-vat",
      type: "Thu",
      grandTotal: "216",
      paidAmount: "216",
      createdAt: "2026-11-17T00:00:00.000Z",
      items: [{
        name: "Gói học",
        unitPrice: 100,
        quantity: 2,
        vatRate: 8,
        vatAmount: 16,
      }],
    };

    const vatHtml = renderTemplate("{{items_vat}}", invoice);
    expect(vatHtml).toContain("<th");
    expect(vatHtml).toContain("VAT");
    expect(vatHtml).toContain(">8</td>");
    expect(vatHtml).toContain(">216</b>");

    const regularHtml = renderTemplate("{{items}}", invoice);
    expect(regularHtml).not.toContain(">VAT</th>");
  });

  it("provides a single-invoice receipt preset with mapped receipt fields", () => {
    const preset = TEMPLATE_PRESETS.find((item) => item.key === "single_receipt");
    expect(preset).toMatchObject({
      invoiceType: "Thu",
      pageSize: "A4",
      scope: "single",
    });
    expect(preset?.html).toContain("{{logo}}");
    expect(preset?.html).toContain("{{customer_name}}");
    expect(preset?.html).toContain("{{items_vat}}");
    expect(preset?.html).toContain("{{invoice_code}}");
    expect(preset?.html).toContain("{{phuong_thuc}}");
  });

  it("shows sample line items in the designer preview", () => {
    const html = renderItemsVat([
      {
        name: "Gói học",
        price: 100,
        quantity: 2,
        discount: 10,
        extra: 20,
        vatRate: 8,
        vatAmount: 7.2,
        promotions: [{ name: "Ưu đãi học viên", amount: 10 }],
        surcharges: [{ name: "Phí tài liệu", amount: 20 }],
      },
    ], 217.2);

    expect(html).toContain("Gói học");
    expect(html).toContain("Gói dịch vụ");
    expect(html).toContain("Khuyến mãi");
    expect(html).toContain("Phụ thu");
    expect(html).toContain(">8</td>");
    expect(html).toContain(">207,2</b>");
    expect(html).toContain("Ưu đãi học viên");
    expect(html).toContain("Phí tài liệu");
    expect(html).toContain(">4</td>");
  });

  it("groups real invoice adjustments and keeps one final total row", () => {
    const html = renderTemplate(
      `<div style="font-family: Georgia, 'Times New Roman', serif;">{{items_vat}}<table style="width:100%;border-collapse:collapse;margin-top:0;font-weight:bold;"><tr><td>Thành tiền</td><td>{{total}}</td></tr><tr><td colspan="2">Bằng chữ: {{thanh_chu}}</td></tr></table></div>`,
      {
        id: "receipt",
        type: "Thu",
        grandTotal: "226",
        paidAmount: "226",
        createdAt: "2026-11-17T00:00:00.000Z",
        items: [{
          name: "Gói học",
          unitPrice: 100,
          quantity: 2,
          promotionAmount: 10,
          surchargeAmount: 20,
          vatRate: 8,
          vatAmount: 16,
        }],
      },
    );

    expect(html).toContain("Gói dịch vụ");
    expect(html).toContain("Khuyến mãi");
    expect(html).toContain("Phụ thu");
    expect(html).toContain(">4</td>");
    expect(html).toContain(">226</td>");
    expect(html.match(/Thành tiền/g)).toHaveLength(2);
    expect(html).toContain("font-family:'Times New Roman', Times, serif");
    expect(html).toContain("Hình thức thanh toán:");
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

describe("invoice print layout styles", () => {
  it("resets browser defaults that otherwise change spacing and borderless table alignment", () => {
    expect(INVOICE_PRINT_BASE_STYLES).toContain(".invoice-print-root p");
    expect(INVOICE_PRINT_BASE_STYLES).toContain("margin: 0;");
    expect(INVOICE_PRINT_BASE_STYLES).toContain("border-spacing: 0;");
    expect(INVOICE_PRINT_BASE_STYLES).toContain("padding-left: 0 !important;");
    expect(INVOICE_PRINT_BASE_STYLES).toContain("padding-right: 0 !important;");
    expect(INVOICE_PRINT_BASE_STYLES).toContain('table[data-borderless="true"] td');
    expect(INVOICE_PRINT_BASE_STYLES).toContain("border: none !important;");
    expect(INVOICE_PRINT_BASE_STYLES).toContain("background: transparent !important;");
  });
});