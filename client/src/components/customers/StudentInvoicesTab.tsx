import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  Receipt,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
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
  const amountColor = inv.type === "Chi" ? "text-red-500" : "text-green-600";

  return (
    <div
      className="bg-background border border-border rounded-xl p-5 flex flex-col sm:flex-row gap-5 sm:gap-8 hover:shadow-sm transition-shadow"
      data-testid={`invoice-card-${inv.id}`}
    >
      <div className="flex-1 space-y-1.5 min-w-0">
        <p className="font-semibold text-foreground text-base leading-tight">
          {inv.title}
          {inv.label && (
            <span className="ml-2 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {inv.label}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Tên: <span className="text-foreground">{inv.studentName || "—"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Số hóa đơn: <span className="text-foreground">{inv.code || "—"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Ngày tạo: <span className="text-foreground">{formatDateTime(inv.createdAt)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Hạn Thanh toán: <span className="text-foreground">{formatDate(inv.dueDate)}</span>
        </p>
      </div>

      <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
        <p className={cn("text-xl font-bold tabular-nums", amountColor)}>
          {formatCurrency(amount)}
        </p>
        <p className="text-sm text-muted-foreground">
          Danh mục: <span className="text-foreground">{inv.category || "—"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Loại: <span className="text-foreground">{typeLabel}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Trạng thái: <span className={status.color}>{status.label}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Mã QR: <span className="text-foreground">Không có</span>
        </p>
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

  const { data, isLoading, isError } = useQuery<{ invoices: InvoiceCard[] }>({
    queryKey: ["/api/students", studentId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải hoá đơn");
      return res.json();
    },
    enabled: !!studentId && open,
    staleTime: 0,
    refetchOnMount: true,
  });

  const invoiceList = data?.invoices ?? [];

  const { totalPaid, totalUnpaid } = useMemo(() => {
    let paid = 0, unpaid = 0;
    for (const inv of invoiceList) {
      const amt = parseFloat(inv.amount) || 0;
      if (inv.status === "paid") paid += amt;
      else if (inv.status === "unpaid" || inv.status === "partial" || inv.status === "debt") unpaid += amt;
    }
    return { totalPaid: paid, totalUnpaid: unpaid };
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
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Hoá đơn của tôi</h2>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm"
            data-testid="student-summary-paid"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Tổng số tiền đã thanh toán</p>
              <p className="text-lg font-bold text-green-600 tabular-nums">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
          <div
            className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm"
            data-testid="student-summary-unpaid"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 shrink-0">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Tổng số tiền chưa thanh toán</p>
              <p className="text-lg font-bold text-orange-500 tabular-nums">{formatCurrency(totalUnpaid)}</p>
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
