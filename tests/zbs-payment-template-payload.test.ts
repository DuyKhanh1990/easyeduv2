import { describe, expect, it } from "vitest";
import { buildZbsPaymentTemplateData } from "../server/services/zbs-payment-template-payload";

describe("buildZbsPaymentTemplateData", () => {
  it("uses the installment code and amount for a regular tuition invoice", () => {
    expect(buildZbsPaymentTemplateData({
      invoiceCode: "PT-106",
      installmentCode: "PT-106-2",
      studentName: "Nguyễn Văn A",
      category: "Học phí",
      remainingAmount: "450000.00",
      installmentAmount: "450000.00",
      note: "",
      description: null,
    })).toEqual({
      invoice_code: "PT-106-2",
      invoice_note: "",
      student_name: "Nguyễn Văn A",
      transfer_amount: 450000,
      remaining_amount: 450000,
    });
  });

  it("uses the warehouse description when its invoice note is blank", () => {
    expect(buildZbsPaymentTemplateData({
      invoiceCode: "PT114",
      installmentCode: "PT114-2",
      studentName: "Nguyễn Văn B",
      category: "Kho",
      remainingAmount: "30000.00",
      installmentAmount: "30000.00",
      note: null,
      description: "Hoá đơn Phiếu xuất kho số 35 ngày 06/10/2026 bao gồm: Balo SL:1",
    })).toEqual({
      invoice_code: "PT114-2",
      invoice_note: "Hoá đơn Phiếu xuất kho số 35 ngày 06/10/2026 bao gồm: Balo SL:1",
      student_name: "Nguyễn Văn B",
      transfer_amount: 30000,
      remaining_amount: 30000,
    });
  });

  it("uses the parent invoice code and remaining balance when there is no installment", () => {
    expect(buildZbsPaymentTemplateData({
      invoiceCode: "PT-200",
      studentName: "Nguyễn Văn C",
      category: "Học phí",
      remainingAmount: "125000.00",
    })).toEqual({
      invoice_code: "PT-200",
      invoice_note: "",
      student_name: "Nguyễn Văn C",
      transfer_amount: 125000,
      remaining_amount: 125000,
    });
  });

  it("rejects a zero or invalid transfer amount", () => {
    expect(() => buildZbsPaymentTemplateData({
      invoiceCode: "PT-200",
      studentName: "Nguyễn Văn C",
      remainingAmount: "0",
    })).toThrow("Số tiền thanh toán ZBS phải là số dương hợp lệ.");
  });
});
