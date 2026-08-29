import { useMemo, useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Receipt, CheckCircle2, Clock, TrendingDown, AlertCircle, ChevronLeft, ChevronRight, ShieldOff, QrCode } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { cn } from "@/lib/utils";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { InvoiceQRDialog } from "@/pages/finance/components/InvoiceQRDialog";

interface InvoiceCard {
  id: string;
  invoiceId: string;
  title: string;
  description: string | null;
  note: string | null;
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
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${min}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Map InvoiceCard → shape đủ dùng cho InvoiceQRDialog
function toQrInvoice(inv: InvoiceCard): any {
  // Với hóa đơn đợt con: ghép label ("ĐỢT 1") + mô tả hóa đơn gốc
  // Ví dụ: "ĐỢT 1 Học phí tháng 8" hoặc "ĐỢT 1" nếu không có mô tả
  // Ưu tiên description, fallback sang note (giống InvoiceQRDialog)
  let description = inv.description?.trim() || inv.note?.trim() || "";
  if (inv.isSchedule && inv.label) {
    description = inv.label + (description ? ` ${description}` : "");
  }
  return {
    id: inv.invoiceId ?? inv.id,
    // Với đợt con: truyền scheduleId để InvoiceQRDialog query BIDV VA đúng endpoint
    scheduleId: inv.isSchedule ? inv.id : undefined,
    code: inv.code ?? "",
    name: inv.studentName ?? "",
    grandTotal: inv.amount,
    remainingAmount: "0",
    status: inv.status,
    description,
    branch: null, // dialog sẽ fallback về cơ sở chính
    dueDate: inv.dueDate,
  };
}

function InvoiceCardItem({ inv, highlighted, refCallback, onQrClick }: {
  inv: InvoiceCard;
  highlighted?: boolean;
  refCallback?: (el: HTMLDivElement | null) => void;
  onQrClick?: (inv: InvoiceCard) => void;
}) {
  const status = STATUS_CONFIG[inv.status] ?? { label: inv.status, color: "text-muted-foreground" };
  const typeLabel = inv.type === "Chi" ? "Phiếu chi" : "Phiếu thu";
  const amount = parseFloat(inv.amount);
  const amountColor = inv.type === "Chi" ? "text-red-500" : "text-green-600";

  return (
    <div
      ref={refCallback}
      className={cn(
        "bg-background border rounded-xl p-5 flex flex-col sm:flex-row gap-5 sm:gap-8 hover:shadow-sm transition-all",
        highlighted
          ? "border-primary ring-2 ring-primary/30 shadow-md"
          : "border-border"
      )}
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
        {inv.description && (
          <p className="text-sm text-muted-foreground">
            Mô tả: <span className="text-foreground">{inv.description}</span>
          </p>
        )}
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
        {inv.type !== "Chi" && (inv.status === "unpaid" || inv.status === "partial" || inv.status === "debt") && (
          <button
            onClick={() => onQrClick?.(inv)}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium transition-colors"
            title="Xem mã QR thanh toán"
          >
            <QrCode className="h-3.5 w-3.5" />
            Quét QR thanh toán
          </button>
        )}
      </div>
    </div>
  );
}

export default function MyInvoices() {
  const search = useSearch();
  const targetInvoiceId = new URLSearchParams(search).get("invoiceId");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [qrInvoice, setQrInvoice] = useState<any | null>(null);
  const invoiceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();

  const { data, isLoading, isError } = useQuery<{ invoices: InvoiceCard[] }>({
    queryKey: ["/api/my-space/invoices"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/invoices", { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải hoá đơn");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const isStudent = myPerms?.isStudent ?? false;
  const invoicePermission = myPerms?.permissions?.["/my-space/invoices"];
  const hasInvoiceAccess = myPerms?.isSuperAdmin || (invoicePermission && invoicePermission.canView === true);

  const invoiceList = data?.invoices ?? [];

  const { thuDaThanhToan, thuChuaThanhToan, chiDaNhan, chiChuaNhan } = useMemo(() => {
    let thuPaid = 0, thuUnpaid = 0, chiPaid = 0, chiUnpaid = 0;
    for (const inv of invoiceList) {
      const amt = parseFloat(inv.amount) || 0;
      const isChi = inv.type === "Chi";
      const isUnpaidStatus = inv.status === "unpaid" || inv.status === "partial" || inv.status === "debt";
      if (isChi) {
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
  const safePage = Math.min(page, totalPages);
  const pagedList = invoiceList.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handlePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  // When data loads and there's a target invoiceId, jump to its page then scroll to it
  useEffect(() => {
    if (!targetInvoiceId || isLoading || invoiceList.length === 0) return;
    const idx = invoiceList.findIndex((inv) => inv.invoiceId === targetInvoiceId || inv.id === targetInvoiceId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    setPage(targetPage);
    // Scroll after paint
    setTimeout(() => {
      const el = invoiceRefs.current[targetInvoiceId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);
  }, [targetInvoiceId, isLoading, invoiceList.length]);

  if (!permsLoading && isStudent && !hasInvoiceAccess) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <ShieldOff className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Không có quyền truy cập</h2>
            <p className="text-sm text-muted-foreground">Bạn không có quyền xem Hoá đơn của tôi. Vui lòng liên hệ quản trị viên.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Hoá đơn của tôi</h1>
          </div>
          <PageGuideButton pageTitle="Hoá đơn của tôi" className="shrink-0" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Thẻ Phiếu thu */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 shadow-sm space-y-3" data-testid="summary-thu">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-primary" /> Phiếu thu
            </p>
            <div className="flex items-center gap-3" data-testid="summary-thu-paid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã thanh toán</p>
                <p className="text-base font-bold text-green-600 tabular-nums">{formatCurrency(thuDaThanhToan)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3" data-testid="summary-thu-unpaid">
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
          <div className="bg-card border border-border rounded-2xl px-5 py-4 shadow-sm space-y-3" data-testid="summary-chi">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-blue-500" /> Phiếu chi
            </p>
            <div className="flex items-center gap-3" data-testid="summary-chi-paid">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã nhận</p>
                <p className="text-base font-bold text-blue-600 tabular-nums">{formatCurrency(chiDaNhan)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3" data-testid="summary-chi-unpaid">
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
          {/* Header row: title + pagination controls */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <p className="font-semibold text-foreground whitespace-nowrap">Danh sách hoá đơn liên quan</p>

            {/* Pagination controls */}
            <div className="flex items-center gap-2 text-sm">
              {/* Page size selector */}
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="hidden sm:inline text-xs">Hiển thị:</span>
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handlePageSize(s)}
                    data-testid={`page-size-${s}`}
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
                {invoiceList.length === 0 ? "0" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, invoiceList.length)}`}
                {" / "}{invoiceList.length}
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  data-testid="page-prev"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  data-testid="page-next"
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
                <p className="text-sm">Bạn hiện tại không có hoá đơn nào</p>
              </div>
            )}

            {!isLoading && !isError && pagedList.map((inv) => {
              const key = inv.invoiceId ?? inv.id;
              const isHighlighted = !!targetInvoiceId && (inv.invoiceId === targetInvoiceId || inv.id === targetInvoiceId);
              return (
                <InvoiceCardItem
                  key={inv.id}
                  inv={inv}
                  highlighted={isHighlighted}
                  refCallback={(el) => { invoiceRefs.current[key] = el; }}
                  onQrClick={(inv) => setQrInvoice(toQrInvoice(inv))}
                />
              );
            })}
          </div>
        </div>
      </div>

      <InvoiceQRDialog
        invoice={qrInvoice}
        open={!!qrInvoice}
        onOpenChange={(open) => { if (!open) setQrInvoice(null); }}
      />
    </DashboardLayout>
  );
}
