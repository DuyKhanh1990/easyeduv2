import { DEFAULT_CENTER_TIME_ZONE, getCenterDateKey } from "@shared/center-time";

export interface InvoiceRow {
  id: string;
  locationId?: string | null;
  studentId: string | null;
  studentCode?: string | null;
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
  paymentNote: string | null;
  status: string;
  dueDate: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  paidByName?: string | null;
  paidAt?: string | Date | null;
  className?: string | null;
  paymentMethod?: string | null;
  hasSchedules?: boolean;
  scheduleCount?: number;
  schedulePaidCount?: number;
  scheduleNextDueDate?: string | null;
  scheduleLastPaidDate?: string | null;
  commissions?: { staffId: string; staffCode: string; staffName: string; percentage: number }[];
  // Hoá đơn điện tử (Mắt Bão)
  einvoiceStatus?: "draft" | "published" | null;
  einvoiceFkey?: string | null;
  einvoiceMaTraCuu?: string | null;
  einvoiceMessage?: string | null;
  einvoiceUpdatedAt?: string | Date | null;
  paymentSchedule?: ScheduleItem[];
  scheduleId?: string;
  isScheduleRow?: boolean;
  parentInvoice?: InvoiceRow;
  scheduleLabel?: string | null;
  scheduleSortOrder?: number;
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
  baseAmount?: string | null;
  amount: string;
  promotionKeys?: string[] | null;
  surchargeKeys?: string[] | null;
  promotionAmount?: string | null;
  surchargeAmount?: string | null;
  status: string;
  dueDate: string | null;
  sortOrder: number;
  paymentMethod?: string | null;
  settleCode?: string | null;
  paidAt?: string | Date | null;
  paidByName?: string | null;
  createdAt?: string | Date | null;
  createdByName?: string | null;
  updatedAt?: string | Date | null;
  updatedByName?: string | null;
  einvoiceStatus?: "draft" | "published" | null;
  einvoiceFkey?: string | null;
  einvoiceMaTraCuu?: string | null;
  einvoiceMessage?: string | null;
  einvoiceUpdatedAt?: string | Date | null;
  isSynthetic?: boolean;
}

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid:      { label: "Đã thanh toán",     className: "bg-green-100 text-green-700" },
  confirmed: { label: "Đã xác nhận",       className: "bg-blue-700 text-white" },
  unpaid:    { label: "Chưa thanh toán",   className: "bg-yellow-100 text-yellow-700" },
  debt:      { label: "Công nợ",           className: "bg-red-100 text-red-700" },
  partial:   { label: "Thanh toán 1 phần", className: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Đã huỷ",           className: "bg-gray-100 text-gray-500" },
};

export const isInvoicePaidLike = (status: string | null | undefined): boolean =>
  status === "paid" || status === "confirmed";

export const INVOICE_STATUS_OPTIONS = [
  { value: "unpaid",    label: "Chưa thanh toán",   className: "bg-yellow-100 text-yellow-700" },
  { value: "partial",   label: "Thanh toán 1 phần", className: "bg-orange-100 text-orange-700" },
  { value: "paid",      label: "Đã thanh toán",     className: "bg-green-100 text-green-700" },
  { value: "confirmed", label: "Đã xác nhận",       className: "bg-blue-700 text-white" },
  { value: "debt",      label: "Công nợ",           className: "bg-red-100 text-red-700" },
  { value: "cancelled", label: "Đã huỷ",            className: "bg-gray-100 text-gray-500" },
];

export const DEBT_ROW_COLS = 7;

export const parseNum = (v: string | null | undefined): number =>
  parseFloat(v ?? "0") || 0;

export const fmtMoney = (amount: number): string =>
  amount.toLocaleString("vi-VN") + " ₫";

export const getInvoiceBusinessDateKey = (
  value: string | Date,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return getCenterDateKey(date, timeZone);
};

// Kept as a compatibility alias for invoice callers; timestamp values are
// real instants and must be interpreted in the Center's configured timezone.
export const getInvoiceStoredDateKey = getInvoiceBusinessDateKey;

export const getTodayCenterDate = (
  timeZone = DEFAULT_CENTER_TIME_ZONE,
  now = new Date(),
): Date => {
  const [year, month, day] = getCenterDateKey(now, timeZone).split("-").map(Number);
  // Calendar widgets and date-only filters use a local-date Date value as a
  // carrier. It is not an instant and must never be serialized as one.
  return new Date(year, month - 1, day);
};

export const getTodayVietnamDate = (): Date => {
  return getTodayCenterDate("Asia/Ho_Chi_Minh");
};

export const fmtDate = (
  d: string | Date | null | undefined,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): string => {
  if (!d) return "—";
  const key = getInvoiceBusinessDateKey(d, timeZone);
  if (!key) return String(d);
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
};
