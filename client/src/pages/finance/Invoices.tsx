import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useInvoices } from "@/hooks/use-invoices";
import { useInvoiceFilters } from "@/hooks/use-invoice-filters";
import { useInvoiceColumns, ALL_COLUMNS } from "@/hooks/use-invoice-columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, SlidersHorizontal, CalendarIcon, Plus, ChevronUp, ChevronDown,
  Pencil, Trash2, Eye, CreditCard, ChevronRight, Settings2, GripVertical, AlertCircle, QrCode, CheckCircle,
  FileSignature, FileText, Download,
} from "lucide-react";
import {
  DropdownMenu as ActionMenu,
  DropdownMenuContent as ActionMenuContent,
  DropdownMenuItem as ActionMenuItem,
  DropdownMenuSeparator as ActionMenuSeparator,
  DropdownMenuTrigger as ActionMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import {
  type InvoiceRow, STATUS_CONFIG, EINVOICE_STATUS_CONFIG,
  parseNum, fmtMoney, fmtDate,
} from "@/types/invoice-types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { InvoiceStatusDropdown } from "./components/InvoiceStatusDropdown";
import { DebtInvoiceRow } from "./components/DebtInvoiceRow";
import { DebtScheduleLoader } from "./components/DebtScheduleLoader";
import { ScheduleRows } from "./components/ScheduleRows";
import { SplitScheduleDialog } from "./components/SplitScheduleDialog";
import { InvoiceTemplateList } from "./InvoiceTemplateList";
import { InvoicePrintPreview } from "./InvoicePrintPreview";
import { InvoiceQRDialog } from "./components/InvoiceQRDialog";
import { ScheduleProgressPopover } from "./components/ScheduleProgressPopover";
import type { SortKey } from "@/hooks/use-invoice-filters";

type TabKey = "all" | "unpaid" | "partial" | "paid" | "debt" | "history" | "print-template";

const TABS: { key: TabKey; label: string; statusFilter?: string; color: string }[] = [
  { key: "all",            label: "Tất cả",            color: "#64748b" },
  { key: "unpaid",         label: "Chưa thanh toán",   statusFilter: "unpaid",  color: "#ca8a04" },
  { key: "partial",        label: "Thanh toán 1 phần", statusFilter: "partial", color: "#ea580c" },
  { key: "paid",           label: "Đã thanh toán",     statusFilter: "paid",    color: "#16a34a" },
  { key: "debt",           label: "Công nợ",           statusFilter: "debt",    color: "#dc2626" },
  { key: "history",        label: "Lịch sử",                                    color: "#7c3aed" },
  { key: "print-template", label: "Mẫu in hoá đơn",                             color: "#0891b2" },
];

function SortIcon({ k, activeSortKey, activeSortDir }: {
  k: SortKey;
  activeSortKey: SortKey;
  activeSortDir: "asc" | "desc";
}) {
  return (
    <span className="inline-flex flex-col ml-1 opacity-40">
      <ChevronUp className={`h-2.5 w-2.5 -mb-0.5 ${activeSortKey === k && activeSortDir === "asc" ? "opacity-100 text-primary" : ""}`} />
      <ChevronDown className={`h-2.5 w-2.5 ${activeSortKey === k && activeSortDir === "desc" ? "opacity-100 text-primary" : ""}`} />
    </span>
  );
}

interface InvoiceUpdateStatusMutation {
  mutate: (
    vars: { invoiceId: string; status: string },
    options?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => void;
  isPending: boolean;
}

function renderInvoiceCell(colKey: string, inv: InvoiceRow, updateStatusMutation: InvoiceUpdateStatusMutation) {
  switch (colKey) {
    case "branch":
      return <td key="branch" className="p-3 whitespace-nowrap"><span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{inv.branch || "—"}</span></td>;
    case "code":
      return <td key="code" className="p-3 font-medium whitespace-nowrap"><span className="text-primary">{inv.code || "—"}</span></td>;
    case "settleCode":
      return <td key="settleCode" className="p-3 text-muted-foreground whitespace-nowrap">{inv.settleCode || "—"}</td>;
    case "type":
      return <td key="type" className="p-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${inv.type === "Thu" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>{inv.type}</span></td>;
    case "name":
      return <td key="name" className="p-3 font-medium whitespace-nowrap">{inv.name || "—"}</td>;
    case "category":
      return <td key="category" className="p-3 text-muted-foreground whitespace-nowrap">{inv.category || "—"}</td>;
    case "amount":
      return <td key="amount" className="p-3 text-right font-medium whitespace-nowrap">{fmtMoney(parseNum(inv.totalAmount))}</td>;
    case "promotion": {
      const promo = parseNum(inv.totalPromotion);
      return <td key="promotion" className="p-3 text-right text-green-600 whitespace-nowrap">{promo > 0 ? `-${fmtMoney(promo)}` : "—"}</td>;
    }
    case "surcharge": {
      const sur = parseNum(inv.totalSurcharge);
      return <td key="surcharge" className="p-3 text-right text-orange-600 whitespace-nowrap">{sur > 0 ? `+${fmtMoney(sur)}` : "—"}</td>;
    }
    case "deduction": {
      const ded = parseNum(inv.deduction);
      return <td key="deduction" className="p-3 text-right text-red-600 whitespace-nowrap">{ded > 0 ? `-${fmtMoney(ded)}` : "—"}</td>;
    }
    case "total":
      return <td key="total" className="p-3 text-right font-bold whitespace-nowrap">{fmtMoney(parseNum(inv.grandTotal))}</td>;
    case "paymentProgress": {
      const paid      = parseNum(inv.paidAmount);
      const grand     = parseNum(inv.grandTotal);
      const remaining = parseNum(inv.remainingAmount);
      const fullyPaid = inv.status === "paid" || (grand > 0 && remaining === 0);
      const pct       = fullyPaid ? 100 : grand > 0 ? Math.min(100, Math.round((paid / grand) * 100)) : 0;
      const isPaid    = fullyPaid;
      return (
        <td key="paymentProgress" className="p-2 text-center" style={{ minWidth: 160 }}>
          <div className="flex items-baseline justify-center gap-1 text-sm leading-tight mb-1">
            <span className="font-semibold text-green-700">{fmtMoney(paid)}</span>
            <span className="text-muted-foreground text-xs">/</span>
            <span className={`font-semibold ${remaining > 0 ? "text-red-500" : "text-muted-foreground text-xs"}`}>
              {remaining > 0 ? fmtMoney(remaining) : (isPaid ? "0" : "—")}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isPaid ? "bg-green-500" : pct > 0 ? "bg-green-500" : "bg-transparent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{pct}%</div>
        </td>
      );
    }
    case "scheduleProgress": {
      const hasSchedules = inv.hasSchedules && (inv.scheduleCount ?? 0) > 0;
      // Treat all invoices as at least 1 installment
      const total    = hasSchedules ? (inv.scheduleCount ?? 1) : 1;
      const today    = new Date(); today.setHours(0,0,0,0);

      let paidSch: number;
      let nextDue: string | null;
      let lastPaid: string | null;
      let allDone: boolean;
      let isOverdue: boolean;

      if (hasSchedules) {
        paidSch  = inv.schedulePaidCount ?? 0;
        nextDue  = inv.scheduleNextDueDate ?? null;
        lastPaid = inv.scheduleLastPaidDate ?? null;
        allDone  = paidSch === total;
        const nextDate = nextDue ? new Date(nextDue) : null;
        isOverdue = !allDone && nextDate !== null && nextDate < today;
      } else {
        // Single-installment invoice (not split)
        const remaining = parseNum(inv.remainingAmount);
        const grand     = parseNum(inv.grandTotal);
        allDone  = inv.status === "paid" || (grand > 0 && remaining === 0);
        paidSch  = allDone ? 1 : 0;
        nextDue  = inv.dueDate ?? null;
        lastPaid = allDone ? (inv.dueDate ?? null) : null;
        const nextDate = nextDue ? new Date(nextDue) : null;
        isOverdue = !allDone && nextDate !== null && nextDate < today;
      }

      return (
        <td key="scheduleProgress" className="p-2 text-center" style={{ minWidth: 140 }}>
          <ScheduleProgressPopover inv={inv}>
            <div className="flex items-center justify-center gap-1.5 mb-0.5 hover:opacity-80 transition-opacity">
              {allDone
                ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                : isOverdue
                ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                : <CreditCard className="h-4 w-4 text-blue-500 shrink-0" />}
              <span className="text-sm font-semibold">{paidSch} / {total} đợt</span>
            </div>
            {allDone ? (
              <div className="text-[11px] text-green-600 font-medium">
                Hoàn tất{lastPaid ? ` ${fmtDate(lastPaid)}` : ""}
              </div>
            ) : nextDue ? (
              <div className={`text-[11px] font-medium ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                {isOverdue ? "Quá hạn" : "Đợt tiếp:"} {fmtDate(nextDue)}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">Chưa có hạn</div>
            )}
          </ScheduleProgressPopover>
        </td>
      );
    }
    case "paidAmount": {
      const paid = parseNum(inv.paidAmount);
      return <td key="paidAmount" className="p-3 text-right whitespace-nowrap">{paid > 0 ? <span className="font-medium text-green-700">{fmtMoney(paid)}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
    }
    case "remaining": {
      const remaining = parseNum(inv.remainingAmount);
      const grand     = parseNum(inv.grandTotal);
      return <td key="remaining" className="p-3 text-right whitespace-nowrap">{remaining > 0 ? <span className="font-medium text-red-600">{fmtMoney(remaining)}</span> : remaining === 0 && grand > 0 ? <span className="text-green-600 text-xs font-medium">Đã đủ</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
    }
    case "description":
      return <td key="description" className="p-3" style={{ minWidth: 280, maxWidth: 380 }}><span className="line-clamp-2 text-muted-foreground text-xs leading-relaxed" title={(inv.note ?? inv.description) ?? ""}>{inv.note || inv.description || "—"}</span></td>;
    case "status": {
      const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.unpaid;
      return <td key="status" className="p-3 whitespace-nowrap">{inv.hasSchedules ? <Badge className={`text-xs font-medium ${status.className}`}>{status.label}</Badge> : <InvoiceStatusDropdown invoiceId={inv.id} currentStatus={inv.status} updateStatusMutation={updateStatusMutation} />}</td>;
    }
    case "einvoice": {
      if (inv.status !== "paid") {
        return <td key="einvoice" className="p-3 whitespace-nowrap text-muted-foreground text-xs">—</td>;
      }
      const key = inv.einvoiceStatus ?? "none";
      const st  = EINVOICE_STATUS_CONFIG[key] ?? EINVOICE_STATUS_CONFIG.none;
      return (
        <td key="einvoice" className="p-3 whitespace-nowrap" data-testid={`einvoice-status-${inv.id}`}>
          <span
            className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md font-medium ${st.className}`}
            title={inv.einvoiceMessage ?? undefined}
          >
            {st.label}
          </span>
        </td>
      );
    }
    case "dueDate":
      return <td key="dueDate" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.dueDate)}</td>;
    case "creator":
      return <td key="creator" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.creatorName || "—"}</td>;
    case "createdAt":
      return <td key="createdAt" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.createdAt)}</td>;
    case "updater":
      return <td key="updater" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.updaterName || "—"}</td>;
    case "updatedAt":
      return <td key="updatedAt" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.updatedAt)}</td>;
    case "commission": {
      const comm = parseNum(inv.commission);
      return <td key="commission" className="p-3 text-right whitespace-nowrap">{comm > 0 ? <span className="text-xs font-medium text-purple-600">{fmtMoney(comm)}</span> : "—"}</td>;
    }
    default:
      return <td key={colKey} />;
  }
}

export default function Invoices() {
  const [activeTab, setActiveTab]   = useState<TabKey>("all");
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [splitDialog, setSplitDialog]   = useState<{ scheduleId: string; label: string; amount: number; invoiceId: string } | null>(null);
  const [deleteInvoiceTarget, setDeleteInvoiceTarget] = useState<InvoiceRow | null>(null);
  const [printPreviewInvoice, setPrintPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [printTemplateOpen, setPrintTemplateOpen] = useState(false);
  const [qrInvoice, setQrInvoice] = useState<InvoiceRow | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [signProgress, setSignProgress] = useState<{ done: number; total: number } | null>(null);

  const { toast } = useToast();

  const signMutation = useMutation({
    mutationFn: async (vars: { invoiceIds: string[]; isPublish: boolean }) => {
      setSignProgress({ done: 0, total: vars.invoiceIds.length });
      // Gọi tuần tự từng hoá đơn để có thanh tiến độ chính xác
      const results: Array<{ invoiceId: string; success: boolean; message: string }> = [];
      for (let i = 0; i < vars.invoiceIds.length; i++) {
        const id = vars.invoiceIds[i];
        try {
          const res = await apiRequest("POST", "/api/einvoice/sign", {
            invoiceIds: [id],
            isPublish: vars.isPublish,
          });
          const data = await res.json();
          const r = data.results?.[0];
          results.push({
            invoiceId: id,
            success: !!r?.success,
            message: r?.message ?? (data.message ?? "OK"),
          });
        } catch (err: any) {
          results.push({ invoiceId: id, success: false, message: err?.message ?? "Lỗi gửi" });
        }
        setSignProgress({ done: i + 1, total: vars.invoiceIds.length });
      }
      return results;
    },
    onSuccess: (results, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const ok = results.filter(r => r.success).length;
      const fail = results.length - ok;
      toast({
        title: vars.isPublish ? "Đã gửi ký số" : "Đã gửi nháp",
        description: `Thành công ${ok}/${results.length}${fail > 0 ? ` — Thất bại ${fail}` : ""}`,
        variant: fail > 0 ? "destructive" : "default",
      });
      setSignDialogOpen(false);
      setSignProgress(null);
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi gửi hoá đơn điện tử",
        description: err?.message ?? "Không gửi được, vui lòng thử lại",
        variant: "destructive",
      });
      setSignProgress(null);
    },
  });

  const { data: myPerms } = useMyPermissions();
  const invPerm = (() => {
    if (!myPerms) return { canCreate: false, canEdit: false, canDelete: false };
    if (myPerms.isSuperAdmin) return { canCreate: true, canEdit: true, canDelete: true };
    const p = myPerms.permissions["/invoices"];
    if (!p) return { canCreate: false, canEdit: false, canDelete: false };
    return { canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
  })();
  const { invoices: rawInvoices, isLoading, deleteMutation: deleteInvoiceMutation, updateStatusMutation } = useInvoices();

  const {
    search, setSearch,
    dateRange, setDateRange,
    calendarOpen, setCalendarOpen,
    sortKey, sortDir, handleSort,
    filters, setFilters,
    filtered,
  } = useInvoiceFilters(rawInvoices, activeTab);

  const {
    columnOrder,
    columnVisible, setColumnVisible,
    colManagerOpen, setColManagerOpen,
    dragKey, setDragKey,
    visibleColumns,
    handleColDragStart,
    handleColDragOver,
  } = useInvoiceColumns();

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id));
  const toggleAll   = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(i => i.id)));
  const toggleOne   = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-3">

        {/* Tabs + Toolbar */}
        <div className="flex flex-col gap-3">
          {/* Pill tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.filter(t => t.key !== "history" && t.key !== "print-template").map(t => {
              const count = t.statusFilter
                ? rawInvoices.filter(i => i.status === t.statusFilter).length
                : t.key === "all" ? rawInvoices.length : undefined;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  data-testid={`tab-${t.key}`}
                  style={isActive
                    ? { backgroundColor: t.color, borderColor: t.color }
                    : { borderColor: t.color, color: t.color }
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-all ${
                    isActive ? "text-white shadow-sm" : "bg-white hover:opacity-80"
                  }`}
                >
                  {t.label}
                  {count !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      isActive ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="ml-auto flex gap-2">
              {TABS.filter(t => t.key === "history").map(t => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    data-testid={`tab-${t.key}`}
                    style={isActive
                      ? { backgroundColor: t.color, borderColor: t.color }
                      : { borderColor: t.color, color: t.color }
                    }
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-all ${
                      isActive ? "text-white shadow-sm" : "bg-white hover:opacity-80"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              <button
                onClick={() => setPrintTemplateOpen(true)}
                data-testid="tab-print-template"
                style={{ borderColor: "#0891b2", color: "#0891b2" }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-all bg-white hover:bg-cyan-50"
              >
                Mẫu in hoá đơn
              </button>
            </div>
          </div>

          {/* Toolbar row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm hoá đơn..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search" />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" data-testid="button-filter">
                  <SlidersHorizontal className="h-4 w-4" />
                  Bộ lọc
                  {(filters.type || filters.branch) && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Loại phiếu</div>
                <DropdownMenuCheckboxItem checked={filters.type === "Thu"} onCheckedChange={v => setFilters(f => ({ ...f, type: v ? "Thu" : undefined }))}>Thu</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filters.type === "Chi"} onCheckedChange={v => setFilters(f => ({ ...f, type: v ? "Chi" : undefined }))}>Chi</DropdownMenuCheckboxItem>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">Cơ sở</div>
                <DropdownMenuCheckboxItem checked={filters.branch === "Cơ sở chính"} onCheckedChange={v => setFilters(f => ({ ...f, branch: v ? "Cơ sở chính" : undefined }))}>Cơ sở chính</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filters.branch === "Minh Khai"} onCheckedChange={v => setFilters(f => ({ ...f, branch: v ? "Minh Khai" : undefined }))}>Minh Khai</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 gap-1.5 ${(dateRange.from || dateRange.to) ? "border-purple-400 text-purple-700" : ""}`} data-testid="button-calendar">
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange.from
                    ? dateRange.to
                      ? `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to, "dd/MM/yy")}`
                      : format(dateRange.from, "dd/MM/yyyy")
                    : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range: any) => { setDateRange({ from: range?.from, to: range?.to }); if (range?.to) setCalendarOpen(false); }}
                  locale={vi} numberOfMonths={2} />
                {(dateRange.from || dateRange.to) && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateRange({})}>Xoá bộ lọc ngày</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex-1" />

            {selectedIds.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-purple-700 border-purple-200 hover:bg-purple-50"
                onClick={() => { setSignConfirmed(false); setSignDialogOpen(true); }}
                data-testid="button-send-sign"
              >
                <FileSignature className="h-4 w-4 mr-1" /> Gửi ký số ({selectedIds.size})
              </Button>
            )}

            {invPerm.canDelete && selectedIds.size > 0 && (
              <Button variant="outline" size="sm" className="h-9 text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-1" /> Xoá {selectedIds.size} phiếu
              </Button>
            )}

            {invPerm.canEdit && (
            <Popover open={colManagerOpen} onOpenChange={setColManagerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" data-testid="button-col-manager">
                  <Settings2 className="h-4 w-4" />
                  Sắp xếp
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2" data-testid="popover-col-manager">
                <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">Ẩn / hiện và kéo thả để sắp xếp cột</div>
                <div className="space-y-0.5 max-h-80 overflow-y-auto">
                  {columnOrder.map(key => {
                    const col = ALL_COLUMNS.find(c => c.key === key);
                    if (!col) return null;
                    return (
                      <div
                        key={key}
                        draggable
                        onDragStart={() => handleColDragStart(key)}
                        onDragOver={e => handleColDragOver(e as any, key)}
                        onDragEnd={() => setDragKey(null)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab hover:bg-muted transition-colors select-none ${dragKey === key ? "opacity-40" : ""}`}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <Checkbox
                          checked={columnVisible[key]}
                          onCheckedChange={v => setColumnVisible(prev => ({ ...prev, [key]: !!v }))}
                          data-testid={`checkbox-col-${key}`}
                        />
                        <span className="text-sm">{col.label}</span>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            )}

            {invPerm.canCreate && (
            <Button size="sm" className="h-9 gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={() => setDialogOpen(true)} data-testid="button-add-invoice">
              <Plus className="h-4 w-4" />
              Thêm mới phiếu
            </Button>
            )}
          </div>
        </div>


        {/* Table */}
        {activeTab !== "debt" && activeTab !== "history" ? (
        <>
        <div className="flex-1 overflow-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <tr className="border-b">
                <th className="p-3 w-8"></th>
                <th className="p-3 w-10">{invPerm.canDelete && <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-all" />}</th>
                {visibleColumns.map(col => (
                  <th key={col.key} className={`p-3 font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"}`} onClick={() => col.sortKey && handleSort(col.sortKey)}>
                    <span className={`flex items-center gap-0.5 ${col.align === "right" ? "justify-end" : ""}`}>
                      {col.label}
                      {col.sortKey && <SortIcon k={col.sortKey} activeSortKey={sortKey} activeSortDir={sortDir} />}
                    </span>
                  </th>
                ))}
                <th className="p-3 text-center font-semibold text-muted-foreground w-28 sticky right-0 bg-muted/80">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={visibleColumns.length + 3} className="py-16 text-center text-muted-foreground"><div className="flex flex-col items-center gap-2"><div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" /><p>Đang tải dữ liệu...</p></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 3} className="py-16 text-center text-muted-foreground"><CreditCard className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Không có hoá đơn nào</p></td></tr>
              ) : filtered.map((inv, idx) => {
                const isSelected = selectedIds.has(inv.id);
                const isExpanded = expandedIds.has(inv.id);

                return [
                  <tr key={inv.id} className={`border-b transition-colors hover:bg-muted/30 ${isSelected ? "bg-purple-50 dark:bg-purple-900/10" : idx % 2 === 1 ? "bg-muted/10" : ""}`} data-testid={`row-invoice-${inv.id}`}>
                    <td className="p-2 w-8">
                      {(inv.scheduleCount ?? 0) > 1 ? (
                        <button
                          onClick={() => toggleExpand(inv.id)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground"
                          data-testid={`button-expand-${inv.id}`}
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                      ) : (
                        <span className="flex items-center justify-center w-6 h-6 text-muted-foreground/20">
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      )}
                    </td>
                    <td className="p-3">{invPerm.canDelete && <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(inv.id)} data-testid={`checkbox-${inv.id}`} />}</td>
                    {visibleColumns.map(col => renderInvoiceCell(col.key, inv, updateStatusMutation))}
                    <td className="p-3 sticky right-0 bg-card border-l">
                      <div className="flex items-center justify-center">
                        <ActionMenu>
                          <ActionMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-primary"
                              data-testid={`button-actions-${inv.id}`}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          </ActionMenuTrigger>
                          <ActionMenuContent align="end" className="w-40">
                            <ActionMenuItem
                              className="gap-2 cursor-pointer"
                              data-testid={`menuitem-view-${inv.id}`}
                              onClick={() => setPrintPreviewInvoice(inv)}
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              Xem
                            </ActionMenuItem>
                            {invPerm.canEdit && (
                              <ActionMenuItem
                                className="gap-2 cursor-pointer"
                                data-testid={`menuitem-edit-${inv.id}`}
                                onClick={() => { setEditInvoiceId(inv.id); setDialogOpen(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                Sửa
                              </ActionMenuItem>
                            )}
                            {(inv.status === "unpaid" || inv.status === "debt") && (
                              <>
                                <ActionMenuSeparator />
                                <ActionMenuItem
                                  className="gap-2 cursor-pointer"
                                  data-testid={`menuitem-qr-${inv.id}`}
                                  onClick={() => setQrInvoice(inv)}
                                >
                                  <QrCode className="h-3.5 w-3.5 text-purple-600" />
                                  Mã QR
                                </ActionMenuItem>
                              </>
                            )}
                            {inv.einvoiceStatus === "draft" && (
                              <>
                                <ActionMenuSeparator />
                                <ActionMenuItem
                                  className="gap-2 cursor-pointer"
                                  data-testid={`menuitem-einvoice-preview-${inv.id}`}
                                  onClick={() => window.open(`/api/einvoice/pdf/${inv.id}`, "_blank", "noopener,noreferrer")}
                                >
                                  <FileText className="h-3.5 w-3.5 text-indigo-600" />
                                  Xem thử PDF
                                </ActionMenuItem>
                              </>
                            )}
                            {inv.einvoiceStatus === "published" && (
                              <>
                                <ActionMenuSeparator />
                                <ActionMenuItem
                                  className="gap-2 cursor-pointer"
                                  data-testid={`menuitem-einvoice-pdf-${inv.id}`}
                                  onClick={() => window.open(`/api/einvoice/pdf/${inv.id}`, "_blank", "noopener,noreferrer")}
                                >
                                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                                  Tải PDF hoá đơn
                                </ActionMenuItem>
                              </>
                            )}
                            {invPerm.canDelete && (
                              <>
                                <ActionMenuSeparator />
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <ActionMenuItem
                                          className={`gap-2 cursor-pointer text-destructive focus:text-destructive ${(inv.scheduleCount ?? 0) > 1 ? "opacity-40 pointer-events-none" : ""}`}
                                          data-testid={`menuitem-delete-${inv.id}`}
                                          disabled={(inv.scheduleCount ?? 0) > 1}
                                          onClick={() => (inv.scheduleCount ?? 0) <= 1 && setDeleteInvoiceTarget(inv)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Xoá
                                        </ActionMenuItem>
                                      </div>
                                    </TooltipTrigger>
                                    {(inv.scheduleCount ?? 0) > 1 && (
                                      <TooltipContent side="left" className="max-w-[220px] text-center">
                                        <p>Hóa đơn đã có các đợt thanh toán.<br/>Vui lòng xoá các đợt trước khi xoá hóa đơn.</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                          </ActionMenuContent>
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>,
                  inv.hasSchedules && (
                    <ScheduleRows
                      key={`sched-${inv.id}`}
                      invoiceId={inv.id}
                      isExpanded={isExpanded}
                      visibleColumns={visibleColumns}
                      onSplit={(s) => setSplitDialog({ scheduleId: s.id, label: s.label, amount: parseFloat(s.amount ?? "0"), invoiceId: inv.id })}
                      invoice={{ id: inv.id, code: inv.code, name: inv.name, branch: inv.branch, dueDate: inv.dueDate }}
                    />
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pb-1">
          <span>Hiển thị {filtered.length} / {rawInvoices.length} phiếu</span>
          <div className="flex items-center gap-4">
            <span>Tổng thu: <span className="font-semibold text-blue-600">{fmtMoney(filtered.filter(i => i.type === "Thu").reduce((s, i) => s + parseNum(i.grandTotal), 0))}</span></span>
            <span>Tổng chi: <span className="font-semibold text-orange-600">{fmtMoney(filtered.filter(i => i.type === "Chi").reduce((s, i) => s + parseNum(i.grandTotal), 0))}</span></span>
          </div>
        </div>
        </>
        ) : activeTab === "debt" ? (
          /* ===== DEBT / CÔNG NỢ GROUPED CARD VIEW ===== */
          (() => {
            const groups = (() => {
              const map = new Map<string, { key: string; name: string; invoices: InvoiceRow[] }>();
              for (const inv of filtered) {
                const key = inv.studentId ?? inv.name ?? "unknown";
                if (!map.has(key)) map.set(key, { key, name: inv.name ?? "—", invoices: [] });
                map.get(key)!.invoices.push(inv);
              }
              return Array.from(map.values());
            })();
            const totalDebtAll = filtered.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
            return (
              <div className="flex-1 overflow-auto space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                    <p className="text-sm">Đang tải dữ liệu...</p>
                  </div>
                ) : groups.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <CreditCard className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Không có công nợ nào</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm text-muted-foreground pb-1">
                      <span>{groups.length} học viên có công nợ — {filtered.length} hoá đơn</span>
                      <span>Tổng công nợ: <span className="font-bold text-red-600">{fmtMoney(totalDebtAll)}</span></span>
                    </div>
                    {groups.map(group => {
                      const totalDebt = group.invoices.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
                      const dueDates = group.invoices.filter(i => i.dueDate).map(i => new Date(i.dueDate!));
                      const earliestDue = dueDates.length > 0 ? new Date(Math.min(...dueDates.map(d => d.getTime()))) : null;
                      const daysUntilDue = earliestDue ? Math.ceil((earliestDue.getTime() - Date.now()) / 86400000) : null;
                      const initial = (group.name ?? "?").charAt(0).toUpperCase();
                      return (
                        <div key={group.key} className="border rounded-lg bg-card shadow-sm overflow-hidden" data-testid={`card-debt-${group.key}`}>
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 select-none">
                                {initial}
                              </div>
                              <span className="font-semibold text-sm">{group.name}</span>
                              {daysUntilDue !== null && (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                                  daysUntilDue < 0
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : daysUntilDue === 0
                                    ? "bg-orange-50 text-orange-600 border-orange-200"
                                    : daysUntilDue <= 3
                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                    : "bg-yellow-50 text-yellow-600 border-yellow-200"
                                }`}>
                                  {daysUntilDue < 0
                                    ? <><AlertCircle className="h-3 w-3" /> quá hạn {Math.abs(daysUntilDue)} ngày</>
                                    : daysUntilDue === 0
                                    ? <><AlertCircle className="h-3 w-3" /> hạn thanh toán hôm nay</>
                                    : <>hạn thanh toán {daysUntilDue} ngày nữa</>}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">Tổng công nợ</p>
                              <p className="text-red-600 font-bold text-sm">{fmtMoney(totalDebt)}</p>
                            </div>
                          </div>
                          <table className="w-full text-sm border-t">
                            <thead>
                              <tr className="bg-muted/40 border-b">
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Mã GD</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Danh mục</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Tổng tiền</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Đã thanh toán</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Còn nợ</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Hạn thanh toán</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Trạng thái</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tình trạng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.invoices.map(inv =>
                                inv.hasSchedules
                                  ? <DebtScheduleLoader key={inv.id} invoice={inv} />
                                  : <DebtInvoiceRow key={inv.id} invoice={inv} />
                              )}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })()
        ) : null}
      </div>

      <CreateInvoiceDialog
        open={dialogOpen}
        invoiceId={editInvoiceId}
        onClose={() => { setDialogOpen(false); setEditInvoiceId(null); }}
      />

      {deleteInvoiceTarget && (
        <Dialog open onOpenChange={() => setDeleteInvoiceTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Xoá hoá đơn
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <p className="text-sm">
                Bạn chắc chắn muốn xoá hoá đơn{" "}
                <span className="font-semibold text-purple-700">{deleteInvoiceTarget.code || deleteInvoiceTarget.id}</span>?
              </p>
              {(deleteInvoiceTarget.scheduleCount ?? 0) === 1 && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
                  <p className="font-semibold">Lưu ý:</p>
                  <p>Đợt thanh toán duy nhất của hoá đơn này cũng sẽ bị xoá.</p>
                </div>
              )}
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                Hành động này không thể hoàn tác.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteInvoiceTarget(null)} disabled={deleteInvoiceMutation.isPending}>Huỷ</Button>
              <Button
                variant="destructive"
                onClick={() =>
                  deleteInvoiceMutation.mutate(deleteInvoiceTarget.id, {
                    onSuccess: () => {
                      setDeleteInvoiceTarget(null);
                      toast({ title: "Đã xoá hoá đơn thành công" });
                    },
                    onError: (err: any) =>
                      toast({ title: "Lỗi xoá hoá đơn", description: err.message, variant: "destructive" }),
                  })
                }
                disabled={deleteInvoiceMutation.isPending}
                data-testid="button-confirm-delete-invoice"
              >
                {deleteInvoiceMutation.isPending ? "Đang xoá..." : "Xác nhận xoá"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {splitDialog && (
        <SplitScheduleDialog
          scheduleId={splitDialog.scheduleId}
          label={splitDialog.label}
          amount={splitDialog.amount}
          invoiceId={splitDialog.invoiceId}
          onClose={() => setSplitDialog(null)}
        />
      )}

      {/* Print preview dialog */}
      {printPreviewInvoice && (
        <InvoicePrintPreview
          invoice={printPreviewInvoice}
          onClose={() => setPrintPreviewInvoice(null)}
        />
      )}

      {/* Invoice Template List dialog */}
      <InvoiceTemplateList open={printTemplateOpen} onOpenChange={setPrintTemplateOpen} />

      {/* QR Payment dialog */}
      <InvoiceQRDialog
        invoice={qrInvoice}
        open={!!qrInvoice}
        onOpenChange={(open) => { if (!open) setQrInvoice(null); }}
      />

      {/* Sign & Send e-invoice confirmation dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-sign-einvoice">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-5 w-5 text-purple-600" />
              Xác nhận phát hành hóa đơn điện tử
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              Bạn đang chọn{" "}
              <span className="font-semibold text-purple-700" data-testid="text-sign-count">
                {selectedIds.size}
              </span>{" "}
              hóa đơn để ký số và gửi lên cơ quan Thuế.
            </p>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs leading-relaxed">
              <div className="font-semibold mb-1">Lưu ý:</div>
              Hóa đơn sau khi ký số sẽ không thể sửa đổi hoặc xóa bỏ một cách thông thường.
              Vui lòng đảm bảo các thông tin học viên và số tiền đã chính xác 100%.
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <Checkbox
                checked={signConfirmed}
                onCheckedChange={(v) => setSignConfirmed(!!v)}
                data-testid="checkbox-sign-confirm"
                className="mt-0.5"
              />
              <span className="text-sm">
                Tôi đã kiểm tra kỹ và chịu trách nhiệm với dữ liệu này.
              </span>
            </label>

            <div className="border-t pt-3 space-y-1.5 text-xs italic text-muted-foreground">
              <div className="font-medium not-italic text-foreground mb-1">Giải thích:</div>
              <div>
                <span className="not-italic font-semibold text-emerald-700">Đồng ý:</span>{" "}
                Hóa đơn sẽ được ký số và gửi lên Thuế ngay lập tức. Không thể sửa sau khi ký.
              </div>
              <div>
                <span className="not-italic font-semibold text-amber-700">Gửi nháp:</span>{" "}
                Dữ liệu chỉ gửi sang Mắt Bão để kiểm tra, chưa có giá trị pháp lý. Có thể xóa/sửa dễ dàng.
              </div>
              <div>
                <span className="not-italic font-semibold text-gray-700">Hủy bỏ:</span>{" "}
                Đóng cửa sổ và không làm gì cả.
              </div>
            </div>
          </div>

          {signProgress && (
            <div className="pt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Đang gửi sang Mắt Bão...</span>
                <span>{signProgress.done} / {signProgress.total}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all"
                  style={{ width: `${signProgress.total > 0 ? (signProgress.done / signProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setSignDialogOpen(false)}
              disabled={signMutation.isPending}
              data-testid="button-sign-cancel"
            >
              Hủy bỏ
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={!signConfirmed || signMutation.isPending}
              onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), isPublish: false })}
              data-testid="button-sign-draft"
            >
              Gửi nháp
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              disabled={!signConfirmed || signMutation.isPending}
              onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), isPublish: true })}
              data-testid="button-sign-confirm"
            >
              {signMutation.isPending ? "Đang xử lý..." : "Đồng ý"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
