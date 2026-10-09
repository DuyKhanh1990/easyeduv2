export const INVOICE_VISIBILITY_PERMISSIONS = [
  { value: "income-unpaid", resource: "/invoices#visibility/income-unpaid", type: "Thu", status: "unpaid", name: "Phiếu thu - Chưa thanh toán" },
  { value: "income-paid", resource: "/invoices#visibility/income-paid", type: "Thu", status: "paid", name: "Phiếu thu - Đã thanh toán" },
  { value: "income-confirmed", resource: "/invoices#visibility/income-confirmed", type: "Thu", status: "confirmed", name: "Phiếu thu - Đã xác nhận" },
  { value: "expense-unpaid", resource: "/invoices#visibility/expense-unpaid", type: "Chi", status: "unpaid", name: "Phiếu chi - Chưa thanh toán" },
  { value: "expense-paid", resource: "/invoices#visibility/expense-paid", type: "Chi", status: "paid", name: "Phiếu chi - Đã thanh toán" },
  { value: "expense-confirmed", resource: "/invoices#visibility/expense-confirmed", type: "Chi", status: "confirmed", name: "Phiếu chi - Đã xác nhận" },
] as const;

export type InvoiceVisibilityPermission = typeof INVOICE_VISIBILITY_PERMISSIONS[number];
export type InvoiceVisibilityStatus = InvoiceVisibilityPermission["status"];
export type InvoiceVisibilityType = InvoiceVisibilityPermission["type"];

export function invoiceStatusMatchesVisibilityPermission(
  invoiceStatus: string | null | undefined,
  permissionStatus: InvoiceVisibilityStatus,
): boolean {
  if (permissionStatus === "unpaid") {
    return invoiceStatus === "unpaid" || invoiceStatus === "partial";
  }
  return invoiceStatus === permissionStatus;
}
