import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  Receipt,
  CheckCircle2,
  Clock,
  TrendingDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceCard {
  id: string;
  invoiceId: string;
  title: string;
  code: string | null;
  label: string | null;
  studentName: string | null;
  type: string;
  category: string | null;
  amount: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  isSchedule: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  unpaid:    { label: "Chưa thanh toán", color: "text-orange-500 font-semibold" },
  partial:   { label: "Thanh toán một phần", color: "text-yellow-600 font-semibold" },
  paid:      { label: "Đã thanh toán", color: "text-green-600 font-semibold" },
  debt:      { label: "Nợ", color: "text-red-500 font-semibold" },
  cancelled: { label: "Đã huỷ", color: "text-muted-foreground line-through" },
};

const PAGE_SIZES = [20, 30, 50];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("vi-VN") + " đ";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  const hour  = String(d.getHours()).padStart(2, "0");
  const min   = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${min}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function InvoiceCardItem({ inv }: { inv: InvoiceCard }) {
  const status = STATUS_CONFIG[inv.status] ?? { label: inv.status, color: "text-muted-foreground" };
  const typeLabel = inv.type === "Chi" ? "Phiếu chi" : "Phiếu thu";
  const amount = parseFloat(inv.amount);
  const isIncome = inv.type !== "Chi";
  const accentColor = isIncome ? "#16a34a" : "#ef4444";
  const amountColor = isIncome ? "text-green-600" : "text-red-500";
  const typeBg = isIncome ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200";

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 flex"
      data-testid={`invoice-card-${inv.id}`}
    >
      {/* Colored left accent bar */}
      <div className="w-1 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />

      <div className="flex-1 p-4 flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-0">
        {/* Left: title + meta */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm leading-tight flex-1">
              {inv.title}
            </p>
            {inv.label && (
              <span className="text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200 shrink-0">
                {inv.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium block">Học viên</span>
              <span className="text-xs text-gray-700">{inv.studentName || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium block">Số hoá đơn</span>
              <span className="text-xs font-mono text-gray-700">{inv.code || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium block">Ngày tạo</span>
              <span className="text-xs text-gray-700">{formatDateTime(inv.createdAt)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium block">Hạn thanh toán</span>
              <span className="text-xs text-gray-700">{formatDate(inv.dueDate)}</span>
            </div>
          </div>
        </div>

        {/* Right: amount + status */}
        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
          <p className={cn("text-lg font-bold tabular-nums", amountColor)}>
            {isIncome ? "+" : "−"}{formatCurrency(amount)}
          </p>
          <div className="flex flex-col items-end gap-1.5">
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", typeBg)}>
              {typeLabel}
            </span>
            <span className={cn("text-[11px] font-semibold", status.color)}>
              {status.label}
            </span>
            <span className="text-[10px] text-gray-400">{inv.category || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  studentId: string;
  open: boolean;
}

export function StudentInvoicesTab({ studentId, open }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ invoices: InvoiceCard[] }>({
    queryKey: ["/api/students", studentId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải hoá đơn");
      return res.json();
    },
    enabled: !!studentId && open,
    staleTime: 30_000,
  });

  const invoiceList = data?.invoices ?? [];

  const { thuDaThanhToan, thuChuaThanhToan, chiDaNhan, chiChuaNhan } = useMemo(() => {
    let thuPaid = 0, thuUnpaid = 0, chiPaid = 0, chiUnpaid = 0;
    for (const inv of invoiceList) {
      const amt = parseFloat(inv.amount) || 0;
      const isPhu = inv.type === "Chi";
      const isUnpaidStatus = inv.status === "unpaid" || inv.status === "partial" || inv.status === "debt";
      if (isPhu) {
        if (inv.status === "paid") chiPaid += amt;
        else if (isUnpaidStatus) chiUnpaid += amt;
      } else {
        if (inv.status === "paid") thuPaid += amt;
        else if (isUnpaidStatus) thuUnpaid += amt;
      }
    }
    return { thuDaThanhToan: thuPaid, thuChuaThanhToan: thuUnpaid, chiDaNhan: chiPaid, chiChuaNhan: chiUnpaid };
  }, [invoiceList]);

  const totalPages = Math.max(1, Math.ceil(invoiceList.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pagedList  = invoiceList.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handlePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Hoá đơn của tôi</h2>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Thẻ Phiếu thu */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-primary" /> Phiếu thu
            </p>
            <div className="flex items-center gap-3" data-testid="student-summary-thu-paid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã thanh toán</p>
                <p className="text-base font-bold text-green-600 tabular-nums">{formatCurrency(thuDaThanhToan)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3" data-testid="student-summary-thu-unpaid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 shrink-0">
                <Clock className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chưa thanh toán</p>
                <p className="text-base font-bold text-orange-500 tabular-nums">{formatCurrency(thuChuaThanhToan)}</p>
              </div>
            </div>
          </div>

          {/* Thẻ Phiếu chi */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-blue-500" /> Phiếu chi
            </p>
            <div className="flex items-center gap-3" data-testid="student-summary-chi-paid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã nhận</p>
                <p className="text-base font-bold text-blue-600 tabular-nums">{formatCurrency(chiDaNhan)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3" data-testid="student-summary-chi-unpaid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0">
                <AlertCircle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chưa nhận</p>
                <p className="text-base font-bold text-red-500 tabular-nums">{formatCurrency(chiChuaNhan)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Invoice list card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* Header row */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <p className="font-semibold text-foreground whitespace-nowrap">Danh sách hoá đơn liên quan</p>

            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="hidden sm:inline text-xs">Hiển thị:</span>
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handlePageSize(s)}
                    data-testid={`inv-page-size-${s}`}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                      pageSize === s
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <span className="text-muted-foreground text-xs tabular-nums">
                {invoiceList.length === 0
                  ? "0"
                  : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, invoiceList.length)}`}
                {" / "}{invoiceList.length}
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  data-testid="inv-page-prev"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  data-testid="inv-page-next"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Đang tải hoá đơn...</span>
              </div>
            )}

            {isError && (
              <div className="text-center py-14 text-sm text-red-500">
                Không thể tải danh sách hoá đơn. Vui lòng thử lại.
              </div>
            )}

            {!isLoading && !isError && invoiceList.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                <Receipt className="h-10 w-10 opacity-25" />
                <p className="text-sm">Học viên hiện tại không có hoá đơn nào</p>
              </div>
            )}

            {!isLoading && !isError && pagedList.map((inv) => (
              <InvoiceCardItem key={inv.id} inv={inv} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
