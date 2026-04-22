import { format } from "date-fns";

export interface InvoiceRow {
  id: string;
  studentId: string | null;
  branch: string | null;
  code: string | null;
  settleCode: string | null;
  type: string;
  name: string | null;
  category: string | null;
  totalAmount: string;
  totalPromotion: string;
  totalSurcharge: string;
  deduction: string | null;
  grandTotal: string;
  paidAmount: string;
  remainingAmount: string;
  commission: string | null;
  description: string | null;
  note: string | null;
  status: string;
  dueDate: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  hasSchedules?: boolean;
  scheduleCount?: number;
  schedulePaidCount?: number;
  scheduleNextDueDate?: string | null;
  scheduleLastPaidDate?: string | null;
  // Hoá đơn điện tử (Mắt Bão)
  einvoiceStatus?: "draft" | "published" | null;
  einvoiceFkey?: string | null;
  einvoiceMessage?: string | null;
  einvoiceUpdatedAt?: string | Date | null;
}

export const EINVOICE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  none:      { label: "Chưa ký số", className: "bg-gray-100 text-gray-700 border border-gray-200" },
  draft:     { label: "Chờ ký số",  className: "bg-amber-100 text-amber-700 border border-amber-200" },
  published: { label: "Đã ký số",   className: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
};

export interface ScheduleItem {
  id: string;
  label: string;
  code?: string | null;
  amount: string;
  status: string;
  dueDate: string | null;
  sortOrder: number;
}

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid:      { label: "Đã thanh toán",     className: "bg-green-100 text-green-700" },
  unpaid:    { label: "Chưa thanh toán",   className: "bg-yellow-100 text-yellow-700" },
  debt:      { label: "Công nợ",           className: "bg-red-100 text-red-700" },
  partial:   { label: "Thanh toán 1 phần", className: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Đã huỷ",           className: "bg-gray-100 text-gray-500" },
};

export const INVOICE_STATUS_OPTIONS = [
  { value: "unpaid",    label: "Chưa thanh toán",   className: "bg-yellow-100 text-yellow-700" },
  { value: "partial",   label: "Thanh toán 1 phần", className: "bg-orange-100 text-orange-700" },
  { value: "paid",      label: "Đã thanh toán",     className: "bg-green-100 text-green-700" },
  { value: "debt",      label: "Công nợ",           className: "bg-red-100 text-red-700" },
  { value: "cancelled", label: "Đã huỷ",            className: "bg-gray-100 text-gray-500" },
];

export const DEBT_ROW_COLS = 8;

export const parseNum = (v: string | null | undefined): number =>
  parseFloat(v ?? "0") || 0;

export const fmtMoney = (amount: number): string =>
  amount.toLocaleString("vi-VN") + " ₫";

export const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return String(d); }
};
