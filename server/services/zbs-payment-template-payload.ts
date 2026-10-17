export interface ZbsPaymentInvoiceInput {
  invoiceCode: string | null | undefined;
  installmentCode?: string | null;
  studentName: string | null | undefined;
  category?: string | null;
  remainingAmount: string | number | null | undefined;
  installmentAmount?: string | number | null;
  note?: string | null;
  description?: string | null;
}

export interface ZbsPaymentTemplateData {
  invoice_code: string;
  invoice_note: string;
  student_name: string;
  transfer_amount: number;
  remaining_amount: number;
}

function requiredText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Thiếu dữ liệu ${field} cho payload ZBS.`);
  return normalized;
}

function positiveAmount(value: string | number | null | undefined): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền thanh toán ZBS phải là số dương hợp lệ.");
  }
  return amount;
}

/**
 * Builds only the template_data values for the approved ZBS transfer template.
 * It does not call Zalo or send a message.
 */
export function buildZbsPaymentTemplateData(
  input: ZbsPaymentInvoiceInput,
): ZbsPaymentTemplateData {
  const amount = positiveAmount(input.installmentAmount ?? input.remainingAmount);
  const invoiceCode = input.installmentCode?.trim() || input.invoiceCode?.trim();
  if (!invoiceCode) throw new Error("Thiếu mã hóa đơn/đợt thanh toán cho payload ZBS.");

  const note = input.note?.trim();
  const invoiceNote = note || (
    input.category?.trim() === "Kho" ? input.description?.trim() ?? "" : ""
  );

  return {
    invoice_code: invoiceCode,
    invoice_note: invoiceNote,
    student_name: requiredText(input.studentName, "tên học viên"),
    transfer_amount: amount,
    remaining_amount: amount,
  };
}
