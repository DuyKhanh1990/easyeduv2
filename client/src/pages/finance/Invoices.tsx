import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useInvoices, useInvoiceSummary } from "@/hooks/use-invoices";
import { useInvoiceFilters, hasActiveFilters, DEFAULT_FILTERS } from "@/hooks/use-invoice-filters";
import { useInvoiceColumns, ALL_COLUMNS } from "@/hooks/use-invoice-columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
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
  Pencil, Trash2, Eye, CreditCard, Settings2, GripVertical, AlertCircle, QrCode, CheckCircle,
  FileSignature, FileText, Download, Upload, FileSpreadsheet, Keyboard, Percent, BookOpen, Merge, TrendingUp, TrendingDown, Check, X,
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
import { useStaff } from "@/hooks/use-staff";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { BulkInvoiceEntryDialog } from "./components/BulkInvoiceEntryDialog";
import { BulkCollectDialog, type BulkCollectPrintData } from "./components/BulkCollectDialog";
import { BulkCollectPrintPreview } from "./components/BulkCollectPrintPreview";
import {
  type InvoiceRow, type ScheduleItem, STATUS_CONFIG, EINVOICE_STATUS_CONFIG,
  parseNum, fmtMoney, fmtDate,
} from "@/types/invoice-types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceStatusDropdown } from "./components/InvoiceStatusDropdown";
import { DebtInvoiceRow } from "./components/DebtInvoiceRow";
import { DebtScheduleLoader } from "./components/DebtScheduleLoader";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { ScheduleRows } from "./components/ScheduleRows";
import { ScheduleStatusDropdown } from "./components/ScheduleStatusDropdown";
import { SplitScheduleDialog } from "./components/SplitScheduleDialog";
import { InvoiceTemplateList } from "./InvoiceTemplateList";
import { InvoicePrintPreview } from "./InvoicePrintPreview";
import { InvoiceQRDialog } from "./components/InvoiceQRDialog";
import { ScheduleProgressPopover } from "./components/ScheduleProgressPopover";
import { InvoiceHistoryTab } from "./components/InvoiceHistoryTab";
import { HistoryDialog } from "@/components/common/HistoryDialog";
import { useLocations } from "@/hooks/use-locations";
import type { SortKey } from "@/hooks/use-invoice-filters";

type TabKey = "all" | "unpaid" | "paid" | "debt" | "history" | "print-template";
type DebtCondition = "all" | "overdue" | "today" | "soon" | "upcoming" | "no-due-date";

const TABS: { key: TabKey; label: string; statusFilter?: string; color: string }[] = [
  { key: "all",              label: "Tất cả",            color: "#64748b" },
  { key: "unpaid",           label: "Chưa thanh toán",   statusFilter: "unpaid",  color: "#ca8a04" },
  { key: "paid",             label: "Đã thanh toán",     statusFilter: "paid",    color: "#16a34a" },
  { key: "debt",             label: "Công nợ",           statusFilter: "debt",    color: "#dc2626" },
  { key: "history",          label: "Lịch sử",                                    color: "#7c3aed" },
  { key: "print-template",   label: "Mẫu in hoá đơn",                             color: "#0891b2" },
];

function MultiSelectFilter({
  label, options, selected, onChange, withSearch,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  withSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const hasSelected = selected.length > 0;
  const selectedLabels = selected
    .map(v => options.find(o => o.value === v)?.label ?? v)
    .join(", ");

  const visibleOptions = withSearch && searchQ.trim()
    ? options.filter(o => o.label.toLowerCase().includes(searchQ.toLowerCase()))
    : options;

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setSearchQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center justify-between gap-1 rounded-md border h-9 px-3 text-sm transition-colors hover:bg-muted/50 ${hasSelected ? "border-purple-400 bg-purple-50 text-purple-700" : "border-input bg-background text-muted-foreground"}`}
        >
          <span className="truncate text-left">
            {hasSelected ? selectedLabels : label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start" side="bottom">
        {withSearch && (
          <div className="px-1 pb-1 border-b mb-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {visibleOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">Không có dữ liệu</p>
          ) : (
            visibleOptions.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-muted/60">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={v => onChange(v ? [...selected, opt.value] : selected.filter(x => x !== opt.value))}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
        {hasSelected && (
          <div className="border-t mt-1 pt-1 px-2">
            <button className="text-xs text-purple-600 hover:underline" onClick={() => onChange([])}>Xoá lọc</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateRangePicker({
  dateRange, onChange, open, onOpenChange, label,
}: {
  dateRange: { from?: Date; to?: Date };
  onChange: (range: { from?: Date; to?: Date }) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label?: string;
}) {
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo]     = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraftFrom(dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "");
      setDraftTo(dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : "");
      setActivePreset(null);
    }
  }, [open]);

  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const presets = [
    { label: "Toàn thời gian",  key: "all",       fn: () => ({ from: undefined as Date | undefined, to: undefined as Date | undefined }) },
    { label: "Hôm nay",         key: "today",     fn: () => ({ from: today as Date | undefined, to: today as Date | undefined }) },
    { label: "Hôm qua",         key: "yesterday", fn: () => { const d = new Date(today); d.setDate(d.getDate() - 1); return { from: d as Date | undefined, to: d as Date | undefined }; } },
    { label: "7 ngày gần nhất", key: "7d",        fn: () => { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: f as Date | undefined, to: today as Date | undefined }; } },
    { label: "28 ngày gần nhất",key: "28d",       fn: () => { const f = new Date(today); f.setDate(f.getDate() - 27); return { from: f as Date | undefined, to: today as Date | undefined }; } },
    { label: "Tuần này",        key: "thisweek",  fn: () => { const day = today.getDay(); const diff = day === 0 ? -6 : 1 - day; const f = new Date(today); f.setDate(today.getDate() + diff); const t = new Date(f); t.setDate(f.getDate() + 6); return { from: f as Date | undefined, to: t as Date | undefined }; } },
    { label: "Tháng này",       key: "thismonth", fn: () => ({ from: new Date(today.getFullYear(), today.getMonth(), 1) as Date | undefined, to: new Date(today.getFullYear(), today.getMonth() + 1, 0) as Date | undefined }) },
    { label: "Năm nay",         key: "thisyear",  fn: () => ({ from: new Date(today.getFullYear(), 0, 1) as Date | undefined, to: new Date(today.getFullYear(), 11, 31) as Date | undefined }) },
  ];

  const handlePreset = (p: typeof presets[0]) => {
    const { from, to } = p.fn();
    setDraftFrom(from ? format(from, "yyyy-MM-dd") : "");
    setDraftTo(to   ? format(to,   "yyyy-MM-dd") : "");
    setActivePreset(p.key);
  };

  const handleApply = () => {
    const from = draftFrom ? new Date(draftFrom + "T00:00:00") : undefined;
    const to   = draftTo   ? new Date(draftTo   + "T00:00:00") : undefined;
    onChange({ from, to });
    onOpenChange(false);
  };

  const handleClear = () => {
    setDraftFrom("");
    setDraftTo("");
    setActivePreset(null);
  };

  const displayLabel = label ?? "Ngày tạo";
  const triggerText = dateRange.from
    ? `${displayLabel}: ${format(dateRange.from, "d/MM/yyyy")} – ${dateRange.to ? format(dateRange.to, "d/MM/yyyy") : "..."}`
    : `${displayLabel}: Toàn thời gian`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-calendar"
          className="h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-700 border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all whitespace-nowrap flex items-center gap-1.5"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {triggerText}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width: "420px" }} sideOffset={4}>
        <div className="flex" style={{ width: "420px" }}>
          <div className="py-2 border-r" style={{ width: "160px", flexShrink: 0 }}>
            {presets.map(p => (
              <button
                key={p.key}
                onClick={() => handlePreset(p)}
                className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${activePreset === p.key ? "bg-violet-600 text-white" : "hover:bg-muted/60"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-4 flex flex-col gap-3" style={{ width: "260px", flexShrink: 0 }}>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Từ ngày</label>
              <input
                type="date"
                value={draftFrom}
                onChange={e => { setDraftFrom(e.target.value); setActivePreset(null); }}
                className="w-full h-9 border rounded-md px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Đến ngày</label>
              <input
                type="date"
                value={draftTo}
                onChange={e => { setDraftTo(e.target.value); setActivePreset(null); }}
                className="w-full h-9 border rounded-md px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="outline" size="sm" onClick={handleClear}>Xóa</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApply}>Áp dụng</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

function EditableInvoiceDateCell({
  invoice,
  field,
  canEdit,
  isSelected,
  isOdd,
}: {
  invoice: InvoiceRow;
  field: "createdAt" | "paidAt";
  canEdit: boolean;
  isSelected?: boolean;
  isOdd?: boolean;
}) {
  const value = invoice[field];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const background = isSelected ? "bg-violet-50" : isOdd ? "bg-slate-50" : "bg-white";
  const toInputDate = (date: string | Date | null | undefined) => {
    if (!date) return "";
    try { return format(new Date(date), "yyyy-MM-dd"); } catch { return ""; }
  };

  useEffect(() => {
    if (!open) setDraft(toInputDate(value));
  }, [value, open]);

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/finance/invoices/${invoice.id}`, {
      [field]: draft || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      setOpen(false);
      toast({ title: "Đã cập nhật ngày", description: field === "createdAt" ? "Ngày tạo hoá đơn đã được thay đổi." : "Ngày thanh toán đã được thay đổi." });
    },
    onError: (error: any) => {
      toast({ title: "Không thể cập nhật ngày", description: error?.message ?? "Vui lòng thử lại.", variant: "destructive" });
    },
  });

  const createdDate = field === "paidAt" ? toInputDate(invoice.createdAt) : "";
  const paidDate = field === "createdAt" ? toInputDate(invoice.paidAt) : "";
  const isInvalid = !draft || (field === "paidAt" && !!createdDate && draft < createdDate) || (field === "createdAt" && !!paidDate && draft > paidDate);
  const label = field === "createdAt" ? "Ngày tạo" : "Ngày thanh toán";

  if (!canEdit) {
    return (
      <td key={field} className={`p-3 whitespace-nowrap text-xs text-muted-foreground ${background}`}>
        {value ? fmtDate(value) : "—"}
      </td>
    );
  }

  return (
    <td key={field} className={`p-3 whitespace-nowrap text-xs ${background}`}>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(toInputDate(value)); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-violet-700 hover:underline underline-offset-2 transition-colors"
            title={`Chỉnh ${label}`}
            data-testid={`button-edit-${field}-${invoice.id}`}
          >
            {value ? fmtDate(value) : "—"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">{label}</p>
          <Input
            type="date"
            value={draft}
            min={field === "paidAt" ? createdDate : undefined}
            max={field === "createdAt" ? paidDate : undefined}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            data-testid={`input-edit-${field}-${invoice.id}`}
          />
          {field === "paidAt" && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">Không sớm hơn ngày tạo: {createdDate ? fmtDate(createdDate) : "—"}</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              <X className="mr-1 h-3.5 w-3.5" /> Hủy
            </Button>
            <Button type="button" size="sm" onClick={() => mutation.mutate()} disabled={isInvalid || mutation.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" /> Lưu
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
}

function flattenInvoiceRows(invoices: InvoiceRow[]): InvoiceRow[] {
  return invoices.flatMap((invoice) => {
    const schedules = invoice.paymentSchedule ?? [];
    if (schedules.length < 2) return [invoice];

    return schedules.map((schedule, index) => {
      const amount = schedule.amount ?? "0";
      const isPaid = schedule.status === "paid";
      const installmentNumber = index + 1;
      return {
        ...invoice,
        code: schedule.code ?? `${invoice.code ?? ""}-${installmentNumber}`,
        settleCode: schedule.settleCode ?? invoice.settleCode,
        totalAmount: amount,
        totalPromotion: "0",
        totalSurcharge: "0",
        deduction: "0",
        grandTotal: amount,
        paidAmount: isPaid ? amount : "0",
        remainingAmount: isPaid ? "0" : amount,
        status: schedule.status,
        dueDate: schedule.dueDate ?? invoice.dueDate,
        paidByName: schedule.paidByName ?? null,
        paidAt: schedule.paidAt ?? null,
        paymentMethod: schedule.paymentMethod ?? invoice.paymentMethod,
        creatorName: schedule.createdByName ?? invoice.creatorName,
        createdAt: schedule.createdAt ?? invoice.createdAt,
        updaterName: schedule.updatedByName ?? invoice.updaterName,
        updatedAt: schedule.updatedAt ?? invoice.updatedAt,
        einvoiceStatus: schedule.einvoiceStatus ?? null,
        einvoiceFkey: schedule.einvoiceFkey ?? null,
        einvoiceMaTraCuu: schedule.einvoiceMaTraCuu ?? null,
        einvoiceMessage: schedule.einvoiceMessage ?? null,
        einvoiceUpdatedAt: schedule.einvoiceUpdatedAt ?? null,
        scheduleId: schedule.id,
        isScheduleRow: true,
        parentInvoice: invoice,
        scheduleLabel: schedule.label,
        scheduleSortOrder: installmentNumber,
      };
    });
  });
}

function getScheduleForRow(inv: InvoiceRow): ScheduleItem | undefined {
  if (!inv.isScheduleRow || !inv.scheduleId) return undefined;
  return inv.parentInvoice?.paymentSchedule?.find(s => s.id === inv.scheduleId);
}

function renderInvoiceCell(
  colKey: string,
  inv: InvoiceRow,
  updateStatusMutation: InvoiceUpdateStatusMutation,
  updateScheduleStatusMutation: {
    mutate: (
      vars: { scheduleId: string; status: string },
      options?: { onSuccess?: () => void; onError?: (err: Error) => void },
    ) => void;
    isPending: boolean;
  },
  canEdit: boolean,
  isSelected?: boolean,
  isOdd?: boolean,
) {
  const nameBg = isSelected ? "bg-violet-50" : isOdd ? "bg-slate-50" : "bg-white";
  switch (colKey) {
    case "branch":
      return <td key="branch" className="p-3 whitespace-nowrap"><span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200">{inv.branch || "—"}</span></td>;
    case "code":
      return <td key="code" className="p-3 font-medium whitespace-nowrap"><span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">{inv.code || "—"}</span></td>;
    case "settleCode":
      return <td key="settleCode" className="p-3 whitespace-nowrap"><span className="text-xs text-slate-400">{inv.settleCode || "—"}</span></td>;
    case "type":
      return <td key="type" className="p-3"><span className={`text-[11px] px-2.5 py-1 rounded-full font-bold tracking-wide ${inv.type === "Thu" ? "bg-sky-100 text-sky-700 border border-sky-200" : "bg-orange-100 text-orange-700 border border-orange-200"}`}>{inv.type}</span></td>;
    case "name":
      return (
        <td key="name" className={`p-3 font-medium whitespace-nowrap sticky left-10 z-10 will-change-transform ${nameBg} min-w-[160px] border-r border-slate-100`}>
          <StudentNameLink studentId={inv.studentId} name={inv.name} code={inv.studentCode} />
        </td>
      );
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
      if (inv.isScheduleRow) {
        const parentInvoice = inv.parentInvoice ?? inv;
        return (
          <td key="scheduleProgress" className="p-2 text-center" style={{ minWidth: 140 }}>
            <ScheduleProgressPopover inv={parentInvoice}>
              <button
                type="button"
                className="w-full rounded-md py-1 hover:bg-violet-50 transition-colors cursor-pointer"
                title="Xem hóa đơn và các đợt thanh toán"
                data-testid={`button-schedule-progress-${inv.scheduleId}`}
              >
                <span className="text-sm font-semibold text-slate-700">
                  Đợt {inv.scheduleSortOrder ?? "—"} / {inv.paymentSchedule?.length ?? "—"}
                </span>
                {inv.dueDate && <div className="text-[11px] text-muted-foreground mt-0.5">Hạn: {fmtDate(inv.dueDate)}</div>}
              </button>
            </ScheduleProgressPopover>
          </td>
        );
      }
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
      return (
        <td key="description" className="p-3" style={{ minWidth: 280, maxWidth: 380 }}>
          <span className="line-clamp-2 text-muted-foreground text-xs leading-relaxed" title={(inv.description ?? inv.note) ?? ""}>
            {inv.description || inv.note || (inv.paymentNote ? "" : "—")}
          </span>
          {inv.paymentNote && (
            <span className="block mt-0.5 text-[11px] text-blue-500 italic truncate" title={inv.paymentNote}>
              {inv.paymentNote}
            </span>
          )}
        </td>
      );
    case "status": {
      const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.unpaid;
      return (
        <td key="status" className="p-3 whitespace-nowrap">
          {inv.isScheduleRow && inv.scheduleId ? (
            <ScheduleStatusDropdown
              scheduleId={inv.scheduleId}
              currentStatus={inv.status}
              updateStatusMutation={updateScheduleStatusMutation}
            />
          ) : inv.hasSchedules ? (
            <Badge className={`text-xs font-medium ${status.className}`}>{status.label}</Badge>
          ) : (
            <InvoiceStatusDropdown invoiceId={inv.id} currentStatus={inv.status} updateStatusMutation={updateStatusMutation} />
          )}
        </td>
      );
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
    case "className":
      return <td key="className" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.className || "—"}</td>;
    case "dueDate":
      return <td key="dueDate" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.dueDate)}</td>;
    case "creator":
      return <td key="creator" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.creatorName || "—"}</td>;
    case "createdAt":
      return inv.isScheduleRow
        ? <td key="createdAt" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.createdAt)}</td>
        : <EditableInvoiceDateCell invoice={inv} field="createdAt" canEdit={canEdit} isSelected={isSelected} isOdd={isOdd} />;
    case "paidBy":
      return <td key="paidBy" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.paidByName || "—"}</td>;
    case "paidAt":
      return inv.isScheduleRow
        ? <td key="paidAt" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.paidAt)}</td>
        : <EditableInvoiceDateCell invoice={inv} field="paidAt" canEdit={canEdit} isSelected={isSelected} isOdd={isOdd} />;
    case "updater":
      return <td key="updater" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.updaterName || "—"}</td>;
    case "updatedAt":
      return <td key="updatedAt" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{fmtDate(inv.updatedAt)}</td>;
    case "commission": {
      const comms = inv.commissions;
      if (comms && comms.length > 0) {
        return (
          <td key="commission" className="p-3 whitespace-nowrap">
            <div className="space-y-0.5">
              {comms.map(c => (
                <div key={c.staffId} className="text-xs text-purple-700 font-medium">
                  {c.staffName} ({c.staffCode}) {Number(c.percentage).toFixed(0)}%
                </div>
              ))}
            </div>
          </td>
        );
      }
      const comm = parseNum(inv.commission);
      return <td key="commission" className="p-3 text-right whitespace-nowrap">{comm > 0 ? <span className="text-xs font-medium text-purple-600">{fmtMoney(comm)}</span> : "—"}</td>;
    }
    default:
      return <td key={colKey} />;
  }
}

function BulkPrintDialog({
  open,
  onOpenChange,
  onConfirm,
  defaultTemplateId,
  onTemplateChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (templateId: string) => void;
  defaultTemplateId: string;
  onTemplateChange: (id: string) => void;
}) {
  const { data: templates = [] } = useQuery<{ id: string; name: string; invoiceType: string }[]>({
    queryKey: ["/api/finance/invoice-print-templates"],
    queryFn: async () => {
      const res = await fetch("/api/finance/invoice-print-templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>In hóa đơn</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Chọn mẫu in</label>
            <Select value={defaultTemplateId} onValueChange={onTemplateChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Chọn mẫu in..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!defaultTemplateId}
            onClick={() => onConfirm(defaultTemplateId)}
          >
            In phiếu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkDueDateDialog({
  open,
  onOpenChange,
  onConfirm,
  selectedDate,
  onDateChange,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (date: Date) => void;
  selectedDate: Date | undefined;
  onDateChange: (d: Date | undefined) => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-purple-600" />
            Cập nhật Hạn thanh toán hàng loạt
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground w-full">
            Chọn ngày hạn thanh toán áp dụng cho tất cả hoá đơn đã chọn.
          </p>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDateChange}
            locale={vi}
            className="rounded-md border"
          />
          {selectedDate && (
            <p className="text-sm font-medium text-purple-700">
              Hạn đã chọn: {format(selectedDate, "dd/MM/yyyy")}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Hủy</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedDate || isPending}
            onClick={() => selectedDate && onConfirm(selectedDate)}
          >
            {isPending ? "Đang cập nhật..." : "Xác nhận"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkInvoiceDateDialog({
  open,
  onOpenChange,
  onConfirm,
  field,
  selectedDate,
  onDateChange,
  selectedInvoices,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (date: Date) => void;
  field: "createdAt" | "paidAt";
  selectedDate: Date | undefined;
  onDateChange: (d: Date | undefined) => void;
  selectedInvoices: InvoiceRow[];
  isPending: boolean;
}) {
  const label = field === "createdAt" ? "ngày tạo" : "ngày thanh toán";
  const selectedDateText = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const conflictingInvoices = selectedDate
    ? selectedInvoices.filter((invoice) => {
        if (field === "createdAt" && invoice.paidAt) {
          return selectedDateText > format(new Date(invoice.paidAt), "yyyy-MM-dd");
        }
        if (field === "paidAt" && invoice.createdAt) {
          return selectedDateText < format(new Date(invoice.createdAt), "yyyy-MM-dd");
        }
        return false;
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-purple-600" />
            Cập nhật {label} hàng loạt
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground w-full">
            Chọn {label} áp dụng cho {selectedInvoices.length} hoá đơn đã chọn.
          </p>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDateChange}
            locale={vi}
            className="rounded-md border"
          />
          {selectedDate && (
            <p className="text-sm font-medium text-purple-700">
              Ngày đã chọn: {format(selectedDate, "dd/MM/yyyy")}
            </p>
          )}
          {conflictingInvoices.length > 0 && (
            <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Không thể áp dụng cho {conflictingInvoices.length} hoá đơn vì ngày thanh toán
              không được trước ngày tạo. Vui lòng chọn ngày khác.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Hủy
          </Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedDate || conflictingInvoices.length > 0 || isPending}
            onClick={() => selectedDate && onConfirm(selectedDate)}
          >
            {isPending ? "Đang cập nhật..." : "Xác nhận"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkAssignCommissionDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (commissions: { staffId: string; percentage: number }[]) => void;
  isPending: boolean;
}) {
  const [commissions, setCommissions] = useState<{ staffId: string; percentage: number }[]>([]);

  const { data: staffList = [] } = useStaff(undefined, true);

  const addRow = (staffId: string) => {
    if (!staffId) return;
    if (commissions.find(c => c.staffId === staffId)) return;
    setCommissions(prev => [...prev, { staffId, percentage: 0 }]);
  };

  const updatePercent = (staffId: string, val: string) => {
    const p = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setCommissions(prev => prev.map(c => c.staffId === staffId ? { ...c, percentage: p } : c));
  };

  const removeRow = (staffId: string) => {
    setCommissions(prev => prev.filter(c => c.staffId !== staffId));
  };

  const availableStaff = (staffList as any[]).filter(s => !commissions.some(c => c.staffId === s.id));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setCommissions([]); } onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-orange-500" />
            Gán hoa hồng hàng loạt
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Thêm nhân viên hưởng hoa hồng</label>
            <Select value="" onValueChange={addRow}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Chọn nhân viên..." />
              </SelectTrigger>
              <SelectContent>
                {availableStaff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName || s.name || s.id}{s.code ? ` (${s.code})` : ""}
                  </SelectItem>
                ))}
                {availableStaff.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    {(staffList as any[]).length === 0 ? "Đang tải..." : "Đã thêm tất cả nhân viên"}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {commissions.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Danh sách hoa hồng
              </div>
              <div className="divide-y">
                {commissions.map(c => {
                  const s = (staffList as any[]).find(x => x.id === c.staffId);
                  return (
                    <div key={c.staffId} className="px-3 py-2 flex items-center gap-2">
                      <div className="flex-1 text-sm truncate">
                        {s?.fullName || s?.name || c.staffId}
                        {s?.code && <span className="text-xs text-muted-foreground ml-1">({s.code})</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={c.percentage}
                          onChange={e => updatePercent(c.staffId, e.target.value)}
                          className="h-7 w-20 text-sm text-right"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(c.staffId)}
                        >
                          <span className="sr-only">Xóa</span>×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {commissions.reduce((sum, c) => sum + c.percentage, 0) > 100 && (
                <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-t">
                  Tổng tỷ lệ hoa hồng vượt quá 100%
                </div>
              )}
            </div>
          )}

          {commissions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Chưa có nhân viên nào được chọn. Chọn nhân viên ở trên để thêm.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => { setCommissions([]); onOpenChange(false); }} disabled={isPending}>
            Hủy
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            disabled={commissions.length === 0 || isPending}
            onClick={() => onConfirm(commissions)}
          >
            {isPending ? "Đang gán..." : "Gán hoa hồng"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkAssignClassDialog({
  open,
  onOpenChange,
  onConfirm,
  selectedClassId,
  onClassChange,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (classId: string) => void;
  selectedClassId: string;
  onClassChange: (id: string) => void;
  isPending: boolean;
}) {
  const [search, setSearch] = useState("");

  const { data: classes = [] } = useQuery<{ id: string; name: string; classCode?: string }[]>({
    queryKey: ["/api/classes", { minimal: true }],
    queryFn: async () => {
      const res = await fetch("/api/classes?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const filtered = search.trim()
    ? classes.filter(c =>
        (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.classCode || "").toLowerCase().includes(search.toLowerCase())
      )
    : classes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gán lớp hàng loạt</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Chọn lớp</label>
            <Input
              placeholder="Tìm lớp..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 mb-1"
            />
            <Select value={selectedClassId} onValueChange={onClassChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Chọn lớp học..." />
              </SelectTrigger>
              <SelectContent>
                {filtered.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.classCode || c.id}
                  </SelectItem>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">Không tìm thấy lớp</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Hủy</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedClassId || isPending}
            onClick={() => onConfirm(selectedClassId)}
          >
            {isPending ? "Đang gán..." : "Gán lớp"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteInvoiceDialog({ target, onClose, deleteMutation }: {
  target: InvoiceRow;
  onClose: () => void;
  deleteMutation: any;
}) {
  const { toast } = useToast();
  const { data: linkedReceipts = [], isLoading: loadingReceipts } = useQuery<any[]>({
    queryKey: ["/api/finance/invoices", target.id, "linked-store-receipts"],
    queryFn: () => apiRequest("GET", `/api/finance/invoices/${target.id}/linked-store-receipts`).then(r => r.json()),
  });

  const isPaidOrPartial = target.status === "paid" || target.status === "partial";
  const activeReceipts = linkedReceipts.filter(r => r.status !== "cancelled");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-4 w-4" /> Xoá hoá đơn
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-3">
          <p className="text-sm">
            Bạn chắc chắn muốn xoá hoá đơn{" "}
            <span className="font-semibold text-purple-700">{target.code || target.id}</span>?
          </p>
          {isPaidOrPartial && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800">
              <p className="font-semibold mb-1">Không thể xoá</p>
              <p>Hoá đơn đang ở trạng thái <strong>{target.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần"}</strong>. Vui lòng chuyển về <strong>Chưa thanh toán</strong> trước khi xoá.</p>
            </div>
          )}
          {!isPaidOrPartial && activeReceipts.length > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
              <p className="font-semibold mb-1">Lưu ý — Phiếu xuất kho liên kết:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {activeReceipts.map(r => (
                  <li key={r.id}><span className="font-medium">{r.code}</span> sẽ bị hủy và tồn kho sẽ được hoàn trả.</li>
                ))}
              </ul>
            </div>
          )}
          {!isPaidOrPartial && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              Hành động này không thể hoàn tác.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>Huỷ</Button>
          {!isPaidOrPartial && (
            <Button
              variant="destructive"
              onClick={() =>
                deleteMutation.mutate(target.id, {
                  onSuccess: () => {
                    onClose();
                    toast({ title: "Đã xoá hoá đơn thành công" });
                  },
                  onError: (err: any) =>
                    toast({ title: "Lỗi xoá hoá đơn", description: err.message, variant: "destructive" }),
                })
              }
              disabled={deleteMutation.isPending || loadingReceipts}
              data-testid="button-confirm-delete-invoice"
            >
              {deleteMutation.isPending ? "Đang xoá..." : "Xác nhận xoá"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const [location, navigate] = useLocation();
  const routeParams = useParams<{ id?: string }>();
  const urlInvoiceId = routeParams?.id; // "new" | "<uuid>" | undefined

  const [activeTab, setActiveTab]   = useState<TabKey>("all");
  const [debtCondition, setDebtCondition] = useState<DebtCondition>("all");
  const { data: locationsList = [] } = useLocations();
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [selectedSchedules, setSelectedSchedules] = useState<Map<string, ScheduleItem>>(new Map());
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen]     = useState(() => !!urlInvoiceId);
  const [bulkEntryOpen, setBulkEntryOpen] = useState(false);
  const [invoiceExcelFile, setInvoiceExcelFile] = useState<File | null>(null);
  const invoiceExcelInputRef = useRef<HTMLInputElement>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(() =>
    urlInvoiceId && urlInvoiceId !== "new" ? urlInvoiceId : null
  );
  const [defaultStudent, setDefaultStudent] = useState<{ id: string; fullName: string; code: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") {
      const studentId   = params.get("studentId") ?? "";
      const studentName = params.get("studentName") ?? "";
      const studentCode = params.get("studentCode") ?? "";
      if (studentId) {
        setDefaultStudent({ id: studentId, fullName: studentName, code: studentCode });
      }
      setDialogOpen(true);
      navigate("/invoices/new", { replace: true });
    }
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    setActiveTab(tab === "debt" || window.location.pathname === "/invoices/debt" ? "debt" : "all");
  }, [location]);

  const handleOpenCreate = () => {
    setEditInvoiceId(null);
    setDialogOpen(true);
    navigate("/invoices/new");
  };

  const handleOpenEdit = (invoiceId: string) => {
    setEditInvoiceId(invoiceId);
    setDialogOpen(true);
    navigate(`/invoices/${invoiceId}`);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditInvoiceId(null);
    setDefaultStudent(null);
    navigate("/invoices");
  };
  const [splitDialog, setSplitDialog]   = useState<{ scheduleId: string; label: string; amount: number; invoiceId: string } | null>(null);
  const [deleteInvoiceTarget, setDeleteInvoiceTarget] = useState<InvoiceRow | null>(null);
  const [printPreviewInvoice, setPrintPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [printPreviewSchedule, setPrintPreviewSchedule] = useState<{ schedule: ScheduleItem; invoice: InvoiceRow } | null>(null);
  const [printTemplateOpen, setPrintTemplateOpen] = useState(false);
  const [qrInvoice, setQrInvoice] = useState<InvoiceRow | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [signProgress, setSignProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: einvoiceCfg } = useQuery<{ signingType?: string }>({
    queryKey: ["/api/einvoice/config"],
  });
  const isUsbSigning = (einvoiceCfg?.signingType ?? "usb") === "usb";
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);
  const [bulkPrintTemplateId, setBulkPrintTemplateId] = useState<string>("");
  const [bulkPrintInvoice, setBulkPrintInvoice] = useState<InvoiceRow | null>(null);
  const [printTemplateId, setPrintTemplateId] = useState<string | undefined>(undefined);
  const [bulkAssignClassOpen, setBulkAssignClassOpen] = useState(false);
  const [bulkAssignClassId, setBulkAssignClassId] = useState<string>("");
  const [bulkDueDateOpen, setBulkDueDateOpen] = useState(false);
  const [bulkDueDate, setBulkDueDate] = useState<Date | undefined>(undefined);
  const [bulkInvoiceDateField, setBulkInvoiceDateField] = useState<"createdAt" | "paidAt" | null>(null);
  const [bulkInvoiceDate, setBulkInvoiceDate] = useState<Date | undefined>(undefined);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCollectOpen, setBulkCollectOpen] = useState(false);
  const [bulkCollectPrintData, setBulkCollectPrintData] = useState<BulkCollectPrintData | null>(null);
  const [bulkCommissionOpen, setBulkCommissionOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  useEffect(() => {
    setIsActionMenuOpen(selectedIds.size > 0);
  }, [selectedIds]);

  const { toast } = useToast();

  const signMutation = useMutation({
    mutationFn: async (vars: { invoiceIds: string[]; scheduleIds: string[]; isPublish: boolean }) => {
      const total = vars.invoiceIds.length + vars.scheduleIds.length;
      setSignProgress({ done: 0, total });
      const results: Array<{ id: string; success: boolean; message: string }> = [];
      let done = 0;
      for (const id of vars.invoiceIds) {
        try {
          const res = await apiRequest("POST", "/api/einvoice/sign", {
            invoiceIds: [id],
            isPublish: vars.isPublish,
          });
          const data = await res.json();
          const r = data.results?.[0];
          results.push({ id, success: !!r?.success, message: r?.message ?? (data.message ?? "OK") });
        } catch (err: any) {
          results.push({ id, success: false, message: err?.message ?? "Lỗi gửi" });
        }
        done++;
        setSignProgress({ done, total });
      }
      for (const id of vars.scheduleIds) {
        try {
          const res = await apiRequest("POST", "/api/einvoice/sign-schedules", {
            scheduleIds: [id],
            isPublish: vars.isPublish,
          });
          const data = await res.json();
          const r = data.results?.[0];
          results.push({ id, success: !!r?.success, message: r?.message ?? (data.message ?? "OK") });
        } catch (err: any) {
          results.push({ id, success: false, message: err?.message ?? "Lỗi gửi" });
        }
        done++;
        setSignProgress({ done, total });
      }
      return results;
    },
    onSuccess: (results, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-schedules"] });
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
      setSelectedSchedules(new Map());
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

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await Promise.all(
        ids.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}/status`, { status }))
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const label = vars.status === "paid" ? "Đã thanh toán" : "Chưa thanh toán";
      toast({
        title: `Cập nhật thành công`,
        description: `Đã chuyển ${vars.ids.length} hoá đơn sang trạng thái "${label}".`,
      });
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi cập nhật trạng thái",
        description: err?.message ?? "Không thể cập nhật, vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkAssignClassMutation = useMutation({
    mutationFn: async ({ ids, classId }: { ids: string[]; classId: string }) => {
      await Promise.all(
        ids.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}`, { classId }))
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      toast({
        title: "Gán lớp thành công",
        description: `Đã gán lớp cho ${vars.ids.length} hoá đơn.`,
      });
      setSelectedIds(new Set());
      setBulkAssignClassId("");
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi gán lớp",
        description: err?.message ?? "Không thể gán lớp, vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkAssignCommissionMutation = useMutation({
    mutationFn: async ({ ids, commissions }: { ids: string[]; commissions: { staffId: string; percentage: number }[] }) => {
      const res = await apiRequest("POST", "/api/finance/invoices/bulk-assign-commission", { ids, commissions });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      toast({
        title: "Gán hoa hồng thành công",
        description: `Đã gán hoa hồng cho ${vars.ids.length} hoá đơn.`,
      });
      setSelectedIds(new Set());
      setBulkCommissionOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi gán hoa hồng",
        description: err?.message ?? "Không thể gán hoa hồng, vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateDueDateMutation = useMutation({
    mutationFn: async ({ ids, dueDate }: { ids: string[]; dueDate: string }) => {
      await Promise.all(
        ids.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}`, { dueDate }))
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      toast({
        title: "Cập nhật hạn thanh toán thành công",
        description: `Đã cập nhật hạn thanh toán cho ${vars.ids.length} hoá đơn.`,
      });
      setSelectedIds(new Set());
      setBulkDueDate(undefined);
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi cập nhật hạn thanh toán",
        description: err?.message ?? "Không thể cập nhật, vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateInvoiceDateMutation = useMutation({
    mutationFn: async ({
      ids,
      field,
      date,
    }: {
      ids: string[];
      field: "createdAt" | "paidAt";
      date: string;
    }) => {
      await Promise.all(
        ids.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}`, { [field]: date }))
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const label = vars.field === "createdAt" ? "ngày tạo" : "ngày thanh toán";
      toast({
        title: `Cập nhật ${label} thành công`,
        description: `Đã cập nhật ${label} cho ${vars.ids.length} hoá đơn.`,
      });
      setSelectedIds(new Set());
      setBulkInvoiceDate(undefined);
      setBulkInvoiceDateField(null);
    },
    onError: (err: any) => {
      toast({
        title: "Không thể cập nhật ngày",
        description: err?.message ?? "Không thể cập nhật, vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/finance/invoices/${id}`)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      toast({ title: "Xoá hoá đơn thành công", description: `Đã xoá ${ids.length} hoá đơn.` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi xoá hoá đơn",
        description: err?.message ?? "Không thể xoá, vui lòng thử lại.",
        variant: "destructive",
      });
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
  const {
    search, setSearch,
    dateRange, setDateRange,
    calendarOpen, setCalendarOpen,
    paidAtRange, setPaidAtRange,
    paidAtCalendarOpen, setPaidAtCalendarOpen,
    filterOpen, setFilterOpen,
    sortKey, sortDir, handleSort,
    filters, setFilters,
    filterOptions,
    page, setPage,
    pageSize, setPageSize,
    queryParams,
  } = useInvoiceFilters(activeTab);

  const { invoices, total, tabCounts, isLoading, deleteMutation: deleteInvoiceMutation, updateStatusMutation } = useInvoices(queryParams);
  const { summary: invoiceSummary, isLoading: isSummaryLoading } = useInvoiceSummary(queryParams);
  const displayInvoices = flattenInvoiceRows(invoices).filter((invoice) => {
    if (activeTab === "unpaid") {
      if (invoice.status === "paid") return false;
    }
    if (activeTab === "paid") {
      if (invoice.status !== "paid") return false;
    }

    if (filters.payers.length > 0 && !filters.payers.includes(invoice.paidByName ?? "")) {
      return false;
    }
    if (filters.creators.length > 0 && !filters.creators.includes(invoice.creatorName ?? "")) {
      return false;
    }
    if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(invoice.paymentMethod ?? "")) {
      return false;
    }

    const rowDateMatches = (
      value: string | Date | null | undefined,
      from?: string,
      to?: string,
    ) => {
      if (!from && !to) return true;
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const day = format(date, "yyyy-MM-dd");
      return (!from || day >= from) && (!to || day <= to);
    };

    if (queryParams.paidAtFrom || queryParams.paidAtTo) {
      if (!rowDateMatches(invoice.paidAt, queryParams.paidAtFrom, queryParams.paidAtTo)) return false;
    } else if (queryParams.dueDateFrom || queryParams.dueDateTo) {
      if (!rowDateMatches(invoice.dueDate, queryParams.dueDateFrom, queryParams.dueDateTo)) return false;
    } else if (queryParams.dateFrom || queryParams.dateTo) {
      if (!rowDateMatches(invoice.createdAt, queryParams.dateFrom, queryParams.dateTo)) return false;
    }

    const searchTerms = search.trim().toLocaleLowerCase("vi").split(/\s+/).filter(Boolean);
    if (searchTerms.length > 0) {
      const searchableText = [
        invoice.name,
        invoice.code,
        invoice.settleCode,
        invoice.category,
        invoice.description,
        invoice.note,
        invoice.paymentNote,
        invoice.scheduleLabel,
      ].filter(Boolean).join(" ").toLocaleLowerCase("vi");
      if (!searchTerms.every((term) => searchableText.includes(term))) return false;
    }

    return true;
  });
  const updateScheduleStatusMutation = useMutation({
    mutationFn: ({ scheduleId, status }: { scheduleId: string; status: string }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    },
  });

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

  const selectedScheduleIdSet = new Set(selectedSchedules.keys());
  const allSelected = displayInvoices.length > 0 && displayInvoices.every(i =>
    i.isScheduleRow
      ? !!i.scheduleId && selectedScheduleIdSet.has(i.scheduleId)
      : selectedIds.has(i.id),
  );
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
      return;
    }
    const parentIds = displayInvoices.filter(i => !i.isScheduleRow).map(i => i.id);
    const scheduleEntries = displayInvoices
      .map(i => getScheduleForRow(i))
      .filter((s): s is ScheduleItem => !!s);
    setSelectedIds(new Set(parentIds));
    setSelectedSchedules(new Map(scheduleEntries.map(s => [s.id, s])));
  };
  const toggleOne   = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSchedule = (s: ScheduleItem) => setSelectedSchedules(prev => {
    const next = new Map(prev);
    if (next.has(s.id)) next.delete(s.id);
    else next.set(s.id, s);
    return next;
  });

  const totalSelectedCount = selectedIds.size + selectedSchedules.size;
  const hasPaidAtFilter = !!(paidAtRange.from || paidAtRange.to);
  const hasAnyToolbarFilter = hasActiveFilters(filters) || hasPaidAtFilter;
  const summaryCards = [
    { label: "Dự thu", value: invoiceSummary?.expectedIncome ?? 0, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", testId: "summary-expected-income" },
    { label: "Thực thu", value: invoiceSummary?.actualIncome ?? 0, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", testId: "summary-actual-income" },
    { label: "Dự chi", value: invoiceSummary?.expectedExpense ?? 0, icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50", testId: "summary-expected-expense" },
    { label: "Thực chi", value: invoiceSummary?.actualExpense ?? 0, icon: CreditCard, color: "text-red-600", bg: "bg-red-50", testId: "summary-actual-expense" },
    { label: "Lợi nhuận", value: (invoiceSummary?.actualIncome ?? 0) - (invoiceSummary?.actualExpense ?? 0), icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50", testId: "summary-profit" },
  ];

  return (
    <DashboardLayout fullscreen>
      <div className="h-full flex flex-col gap-4 p-6 bg-slate-100">

        {activeTab !== "debt" && (
        <>
        {/* Tabs + Toolbar */}
        <div className="shrink-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex flex-col gap-3">
          {/* Pill tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {TABS.filter(t => t.key !== "history" && t.key !== "print-template" && t.key !== "debt").map(t => {
              const count = t.key === "all"
                ? tabCounts.all
                : t.statusFilter === "debt"
                  ? tabCounts.debt
                  : t.statusFilter
                    ? (tabCounts[t.statusFilter] ?? 0)
                    : undefined;
               const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                   onClick={() => setActiveTab(t.key)}
                  data-testid={`tab-${t.key}`}
                  style={isActive
                    ? { backgroundColor: t.color, borderColor: t.color, boxShadow: `0 2px 8px ${t.color}25` }
                    : { borderColor: `${t.color}55`, color: t.color }
                  }
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    isActive ? "text-white" : "bg-background hover:bg-muted/50"
                  }`}
                >
                  {t.label}
                  {count !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? "bg-white/30 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              {TABS.filter(t => t.key === "history").map(t => {
                 const isActive = historyDialogOpen;
                return (
                  <button
                    key={t.key}
                     onClick={() => setHistoryDialogOpen(true)}
                    data-testid={`tab-${t.key}`}
                    style={isActive
                      ? { backgroundColor: t.color, borderColor: t.color }
                      : { borderColor: `${t.color}60`, color: t.color }
                    }
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      isActive ? "text-white" : "bg-background hover:bg-violet-50"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              <button
                onClick={() => setPrintTemplateOpen(true)}
                data-testid="tab-print-template"
                style={{ borderColor: "#0891b260", color: "#0891b2" }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all bg-background hover:bg-cyan-50"
              >
                Mẫu in hoá đơn
              </button>
            </div>
          </div>

          {/* Financial summary cards — independent from the selected status tab */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1" data-testid="invoice-summary-cards">
            {summaryCards.map(({ label, value, icon: Icon, color, bg, testId }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm" data-testid={testId}>
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md ${bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                </div>
                <div className={`mt-1.5 text-base font-bold ${color}`}>
                  {isSummaryLoading ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-100" /> : fmtMoney(value)}
                </div>
              </div>
            ))}
          </div>

          {/* Toolbar row */}
          <div className="flex items-center gap-2 flex-wrap border-t border-border/70 pt-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Tìm kiếm hoá đơn..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 rounded-lg border-slate-200 bg-white shadow-sm text-sm placeholder:text-slate-400 focus-visible:ring-violet-400" data-testid="input-search" />
            </div>

            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 gap-1.5 rounded-lg border-slate-200 bg-white shadow-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 transition-all ${hasAnyToolbarFilter ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400" : ""}`} data-testid="button-filter">
                  <SlidersHorizontal className={`h-4 w-4 ${hasAnyToolbarFilter ? "text-violet-600" : "text-slate-400"}`} />
                  Bộ lọc
                  {hasAnyToolbarFilter && <span className="w-1.5 h-1.5 rounded-full bg-violet-600" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[720px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">Bộ lọc</span>
                  {hasAnyToolbarFilter && (
                    <button
                      className="text-xs text-purple-600 hover:underline"
                      onClick={() => { setFilters(DEFAULT_FILTERS); setPaidAtRange({}); }}
                    >
                      Xoá tất cả
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { label: "Cơ sở",             key: "branches",       opts: filterOptions.branches.map(v => ({ value: v, label: v })),       withSearch: false },
                    { label: "Loại phiếu",         key: "types",          opts: filterOptions.types.map(v => ({ value: v, label: v })),          withSearch: false },
                    { label: "Danh mục",           key: "categories",     opts: filterOptions.categories.map(v => ({ value: v, label: v })),     withSearch: false },
                    { label: "Hình thức",          key: "paymentMethods", opts: filterOptions.paymentMethods.map(v => v === "cash" ? { value: v, label: "Tiền mặt" } : v === "transfer" ? { value: v, label: "Chuyển khoản" } : { value: v, label: v }), withSearch: false },
                    { label: "Lớp",                key: "classes",        opts: filterOptions.classes.map(v => ({ value: v, label: v })),        withSearch: true },
                    { label: "Người tạo",          key: "creators",       opts: filterOptions.creators.map(v => ({ value: v, label: v })),       withSearch: true },
                    { label: "Người thanh toán",   key: "payers",         opts: filterOptions.payers.map(v => ({ value: v, label: v })),         withSearch: true },
                    { label: "Hoa hồng",           key: "commissions",    opts: filterOptions.commissions.map(v => ({ value: v, label: v })),    withSearch: true },
                  ] as Array<{ label: string; key: keyof typeof filters; opts: { value: string; label: string }[]; withSearch: boolean }>).map(({ label, key, opts, withSearch }) => (
                    <MultiSelectFilter
                      key={key}
                      label={label}
                      options={opts}
                      selected={filters[key] as string[]}
                      onChange={val => setFilters(f => ({ ...f, [key]: val }))}
                      withSearch={withSearch}
                    />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/70">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Khoảng ngày thanh toán</div>
                  <DateRangePicker
                    label="Ngày thanh toán"
                    dateRange={paidAtRange}
                    onChange={setPaidAtRange}
                    open={paidAtCalendarOpen}
                    onOpenChange={setPaidAtCalendarOpen}
                  />
                </div>
              </PopoverContent>
            </Popover>

            <DateRangePicker
              dateRange={dateRange}
              onChange={setDateRange}
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
            />

            <div className="flex-1" />

            {totalSelectedCount > 0 && (() => {
              const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
              const unpaidCount   = selectedInvs.filter(i => i.status === "unpaid" || i.status === "debt").length;
              const partialCount  = selectedInvs.filter(i => i.status === "partial").length;
              const publishedCount = selectedInvs.filter(i => i.einvoiceStatus === "published").length;
              const schedArr = Array.from(selectedSchedules.values());
              const unpaidSchedCount = schedArr.filter(s => s.status !== "paid").length;
              const publishedSchedCount = schedArr.filter(s => s.einvoiceStatus === "published").length;
              const reasons: string[] = [];
              if (unpaidCount > 0)    reasons.push(`${unpaidCount} hoá đơn ở trạng thái Chưa thanh toán`);
              if (partialCount > 0)   reasons.push(`${partialCount} hoá đơn ở trạng thái Thanh toán 1 phần`);
              if (publishedCount > 0) reasons.push(`${publishedCount} hoá đơn đã ký số`);
              if (unpaidSchedCount > 0) reasons.push(`${unpaidSchedCount} đợt chưa thanh toán`);
              if (publishedSchedCount > 0) reasons.push(`${publishedSchedCount} đợt đã ký số`);
              const blocked = reasons.length > 0;
              const button = (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-400 shadow-sm font-medium disabled:opacity-50 transition-all"
                  onClick={() => { if (!blocked) { setSignConfirmed(false); setSignDialogOpen(true); } }}
                  disabled={blocked}
                  data-testid="button-send-sign"
                >
                  <FileSignature className="h-4 w-4 text-violet-600" /> Gửi ký số ({totalSelectedCount})
                </Button>
              );
              if (!blocked) return button;
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">{button}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[320px]">
                      <p className="font-medium mb-1">Không thể gửi ký số:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-xs">
                        {reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                      <p className="text-xs mt-1 opacity-80">Vui lòng bỏ chọn các hoá đơn đó.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}


            {invPerm.canEdit && (
            <Popover open={colManagerOpen} onOpenChange={setColManagerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg border-slate-200 bg-white shadow-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all" data-testid="button-col-manager">
                  <Settings2 className="h-4 w-4 text-slate-400" />
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
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-slate-200 bg-white shadow-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
                data-testid="button-upload-direct"
                onClick={() => setBulkEntryOpen(true)}
              >
                <Keyboard className="h-4 w-4 text-blue-600" />
                Nhập trực tiếp
              </Button>
            )}

            <ActionMenu open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen} modal={false}>
              <ActionMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 gap-1.5 rounded-lg shadow-sm font-medium transition-all ${selectedIds.size > 0 ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"}`}
                  data-testid="button-bulk-action"
                >
                  Hành động {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </ActionMenuTrigger>
              <ActionMenuContent
                align="end"
                className="w-56 p-2 rounded-xl bg-white shadow-xl border-border"
                onPointerDownOutside={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('[role="checkbox"]') || target.closest("[data-radix-collection-item]")) e.preventDefault();
                }}
                onInteractOutside={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('[role="checkbox"]') || target.closest("[data-radix-collection-item]")) e.preventDefault();
                }}
              >
                {selectedIds.size > 0 ? (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b mb-1">Thao tác hàng loạt</div>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      onClick={() => {
                        const firstId = Array.from(selectedIds)[0];
                        const firstInv = invoices.find(i => i.id === firstId) ?? null;
                        setBulkPrintInvoice(firstInv);
                        setBulkPrintTemplateId("");
                        setBulkPrintOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <FileText className="w-4 h-4 text-cyan-600" /><span>Mẫu in hoá đơn</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateStatusMutation.isPending}
                      onClick={() => {
                        bulkUpdateStatusMutation.mutate({ ids: Array.from(selectedIds), status: "unpaid" });
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <CreditCard className="w-4 h-4 text-yellow-600" /><span>Chưa thanh toán</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateStatusMutation.isPending}
                      onClick={() => {
                        bulkUpdateStatusMutation.mutate({ ids: Array.from(selectedIds), status: "paid" });
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <CheckCircle className="w-4 h-4 text-green-600" /><span>Đã thanh toán</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkAssignCommissionMutation.isPending}
                      onClick={() => {
                        setBulkCommissionOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <Percent className="w-4 h-4 text-orange-500" /><span>Gán hoa hồng</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkAssignClassMutation.isPending}
                      onClick={() => {
                        setBulkAssignClassId("");
                        setBulkAssignClassOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <BookOpen className="w-4 h-4 text-blue-500" /><span>Gán lớp</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateDueDateMutation.isPending}
                      onClick={() => {
                        setBulkDueDate(undefined);
                        setBulkDueDateOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-purple-600" /><span>Cập nhật Hạn thanh toán</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateInvoiceDateMutation.isPending}
                      onClick={() => {
                        setBulkInvoiceDate(undefined);
                        setBulkInvoiceDateField("createdAt");
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-blue-600" /><span>Cập nhật Ngày tạo</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateInvoiceDateMutation.isPending}
                      onClick={() => {
                        setBulkInvoiceDate(undefined);
                        setBulkInvoiceDateField("paidAt");
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-green-600" /><span>Cập nhật Ngày thanh toán</span>
                    </ActionMenuItem>
                    <div className="my-1 border-t" />
                    {(() => {
                      const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
                      const hasAnyThu = selectedInvs.some(i => i.type === "Thu");
                      const hasAnyChi = selectedInvs.some(i => i.type === "Chi");
                      return (
                        <>
                          {hasAnyThu && (
                            <ActionMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                              onClick={() => {
                                setBulkCollectOpen(true);
                                setIsActionMenuOpen(false);
                              }}
                            >
                              <Merge className="w-4 h-4 text-purple-600" /><span>Thu gộp</span>
                            </ActionMenuItem>
                          )}
                          {hasAnyChi && (
                            <ActionMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                              onClick={() => {
                                setBulkCollectOpen(true);
                                setIsActionMenuOpen(false);
                              }}
                            >
                              <Merge className="w-4 h-4 text-orange-500" /><span>Chi gộp</span>
                            </ActionMenuItem>
                          )}
                        </>
                      );
                    })()}
                    <div className="my-1 border-t" />
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                      disabled={bulkDeleteMutation.isPending}
                      onClick={() => {
                        setBulkDeleteOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <Trash2 className="w-4 h-4" /><span>Xoá hoá đơn</span>
                    </ActionMenuItem>
                  </>
                ) : (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center">Vui lòng chọn hoá đơn để thực hiện hành động</div>
                )}
              </ActionMenuContent>
            </ActionMenu>

            {invPerm.canCreate && (
            <Button size="sm" className="h-9 gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 border-0 shadow-md shadow-violet-200 font-semibold" onClick={handleOpenCreate} data-testid="button-add-invoice">
              <Plus className="h-4 w-4" />
              Thêm mới phiếu
            </Button>
            )}
          </div>
        </div>
        </div>
        </>
        )}


        {/* Table */}
        <div className="flex-1 min-h-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col">
        {activeTab !== "debt" && activeTab !== "history" ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-x-scroll overflow-y-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[1120px] text-xs border-separate border-spacing-0">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 w-10 sticky top-0 left-0 z-40 bg-muted">{invPerm.canDelete && <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-all" />}</th>
                {visibleColumns.map(col => (
                  <th key={col.key} className={`px-3 py-2.5 sticky top-0 z-30 bg-muted text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"} ${col.key === "name" ? "left-10 z-40 min-w-[160px] border-r border-border" : ""}`} onClick={() => col.sortKey && handleSort(col.sortKey)}>
                    <span className={`flex items-center gap-0.5 ${col.align === "right" ? "justify-end" : ""}`}>
                      {col.label}
                      {col.sortKey && <SortIcon k={col.sortKey} activeSortKey={sortKey} activeSortDir={sortDir} />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 sticky top-0 right-0 z-40 bg-muted text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-28 border-l border-border">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={visibleColumns.length + 2} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                    </div>
                    <p className="text-sm text-slate-400 font-medium">Đang tải dữ liệu...</p>
                  </div>
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 2} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <CreditCard className="h-6 w-6 text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-400 font-medium">Không có hoá đơn nào</p>
                  </div>
                </td></tr>
              ) : displayInvoices.map((inv, idx) => {
                const isScheduleRow = !!inv.isScheduleRow;
                const schedule = getScheduleForRow(inv);
                const parentInvoice = inv.parentInvoice ?? inv;
                const isSelected = isScheduleRow
                  ? !!inv.scheduleId && selectedScheduleIdSet.has(inv.scheduleId)
                  : selectedIds.has(inv.id);
                const isExpanded = expandedIds.has(inv.id);
                const rowKey = isScheduleRow ? `schedule-${inv.scheduleId}` : inv.id;

                return [
                  <tr key={rowKey} className={`border-b border-slate-100 transition-colors hover:bg-violet-50/40 ${isSelected ? "bg-violet-50" : idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}`} data-testid={`row-invoice-${rowKey}`}>
                    <td className={`p-3 sticky left-0 z-10 will-change-transform ${isSelected ? "bg-violet-50" : idx % 2 === 1 ? "bg-slate-50" : "bg-white"}`}>
                      {invPerm.canDelete && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            if (isScheduleRow && schedule) toggleSchedule(schedule);
                            else toggleOne(inv.id);
                          }}
                          data-testid={`checkbox-${rowKey}`}
                        />
                      )}
                    </td>
                    {visibleColumns.map(col => renderInvoiceCell(
                      col.key,
                      inv,
                      updateStatusMutation,
                      updateScheduleStatusMutation,
                      invPerm.canEdit,
                      isSelected,
                      idx % 2 === 1,
                    ))}
                    <td className={`p-3 sticky right-0 border-l border-slate-100 will-change-transform ${isSelected ? "bg-violet-50" : idx % 2 === 1 ? "bg-slate-50" : "bg-white"}`}>
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
                              onClick={() => {
                                if (isScheduleRow && schedule) setPrintPreviewSchedule({ schedule, invoice: parentInvoice });
                                else setPrintPreviewInvoice(inv);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              Xem
                            </ActionMenuItem>
                            {invPerm.canEdit && (
                              <ActionMenuItem
                                className="gap-2 cursor-pointer"
                                data-testid={`menuitem-edit-${inv.id}`}
                                onClick={() => handleOpenEdit(parentInvoice.id)}
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
                                   onClick={() => setQrInvoice(isScheduleRow && schedule
                                     ? { ...parentInvoice, scheduleId: schedule.id, code: inv.code, grandTotal: inv.grandTotal, paidAmount: inv.paidAmount, remainingAmount: inv.remainingAmount, status: inv.status } as any
                                     : inv)}
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
                                  onClick={() => window.open(
                                    isScheduleRow && schedule ? `/api/einvoice/schedule-pdf/${schedule.id}` : `/api/einvoice/pdf/${inv.id}`,
                                    "_blank",
                                    "noopener,noreferrer",
                                  )}
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
                                  onClick={() => window.open(
                                    isScheduleRow && schedule ? `/api/einvoice/schedule-pdf/${schedule.id}` : `/api/einvoice/pdf/${inv.id}`,
                                    "_blank",
                                    "noopener,noreferrer",
                                  )}
                                >
                                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                                  Tải PDF hoá đơn
                                </ActionMenuItem>
                              </>
                            )}
                            {invPerm.canDelete && !isScheduleRow && (
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
                    !inv.isScheduleRow && inv.hasSchedules && (
                    <ScheduleRows
                      key={`sched-${inv.id}`}
                      invoiceId={inv.id}
                      isExpanded={isExpanded}
                      visibleColumns={visibleColumns}
                      onSplit={(s) => setSplitDialog({ scheduleId: s.id, label: s.label, amount: parseFloat(s.amount ?? "0"), invoiceId: inv.id })}
                      invoice={{ id: inv.id, code: inv.code ?? undefined, name: inv.name ?? undefined, branch: inv.branch ?? undefined, dueDate: inv.dueDate ?? undefined, description: (inv as any).description ?? undefined, note: (inv as any).note ?? undefined }}
                      selectedScheduleIds={selectedScheduleIdSet}
                      onToggleSchedule={toggleSchedule}
                      canSelect={invPerm.canDelete}
                      payerNames={filters.payers}
                      onViewPrint={(s) => setPrintPreviewSchedule({ schedule: s, invoice: inv })}
                    />
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground pb-1 pt-1">
          <div className="flex items-center gap-2">
            <span>{total} phiếu</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); }}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / trang</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
            <span className="px-2 text-xs">Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>›</Button>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(Math.ceil(total / pageSize))}>»</Button>
          </div>
        </div>
        </div>
        ) : activeTab === "debt" ? (
          /* ===== DEBT / CÔNG NỢ GROUPED CARD VIEW ===== */
          (() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const filteredDebtInvoices = invoices.filter(invoice => {
              if (debtCondition === "all") return true;
              if (!invoice.dueDate) return debtCondition === "no-due-date";
              const due = new Date(invoice.dueDate);
              due.setHours(0, 0, 0, 0);
              const days = Math.round((due.getTime() - today.getTime()) / 86400000);
              if (debtCondition === "overdue") return days < 0;
              if (debtCondition === "today") return days === 0;
              if (debtCondition === "soon") return days >= 1 && days <= 7;
              if (debtCondition === "upcoming") return days > 7;
              return false;
            });
            const totalDebtAll = filteredDebtInvoices.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
            const debtConditionCards: { key: DebtCondition | "total"; label: string; value: string | number; activeClass: string; textClass: string }[] = [
              { key: "overdue", label: "Quá hạn", value: invoices.filter(invoice => {
                if (!invoice.dueDate) return false;
                const due = new Date(invoice.dueDate);
                due.setHours(0, 0, 0, 0);
                return Math.round((due.getTime() - today.getTime()) / 86400000) < 0;
              }).length, activeClass: "border-red-300 bg-red-50", textClass: "text-red-600" },
              { key: "today", label: "Đến hạn hôm nay", value: invoices.filter(invoice => {
                if (!invoice.dueDate) return false;
                const due = new Date(invoice.dueDate);
                due.setHours(0, 0, 0, 0);
                return Math.round((due.getTime() - today.getTime()) / 86400000) === 0;
              }).length, activeClass: "border-orange-300 bg-orange-50", textClass: "text-orange-600" },
              { key: "soon", label: "Sắp đến hạn", value: invoices.filter(invoice => {
                if (!invoice.dueDate) return false;
                const due = new Date(invoice.dueDate);
                due.setHours(0, 0, 0, 0);
                const days = Math.round((due.getTime() - today.getTime()) / 86400000);
                return days >= 1 && days <= 7;
              }).length, activeClass: "border-amber-300 bg-amber-50", textClass: "text-amber-600" },
              { key: "upcoming", label: "Chưa đến hạn", value: invoices.filter(invoice => {
                if (!invoice.dueDate) return false;
                const due = new Date(invoice.dueDate);
                due.setHours(0, 0, 0, 0);
                return Math.round((due.getTime() - today.getTime()) / 86400000) > 7;
              }).length, activeClass: "border-blue-300 bg-blue-50", textClass: "text-blue-600" },
              { key: "no-due-date", label: "Không có hạn", value: invoices.filter(invoice => !invoice.dueDate).length, activeClass: "border-slate-300 bg-slate-100", textClass: "text-slate-600" },
              { key: "total", label: "Tổng công nợ", value: fmtMoney(totalDebtAll), activeClass: "border-rose-300 bg-rose-50", textClass: "text-rose-600" },
            ];
            const groups = (() => {
              const map = new Map<string, { key: string; name: string; invoices: InvoiceRow[] }>();
              for (const inv of filteredDebtInvoices) {
                const key = inv.studentId ?? inv.name ?? "unknown";
                if (!map.has(key)) map.set(key, { key, name: inv.name ?? "—", invoices: [] });
                map.get(key)!.invoices.push(inv);
              }
              return Array.from(map.values());
            })();
            const hasDebtFilters = !!search.trim() || hasActiveFilters(filters) || !!(dateRange.from || dateRange.to) || !!(paidAtRange.from || paidAtRange.to) || debtCondition !== "all";
            return (
              <>
              <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Tìm theo tên học viên, mã hoá đơn..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-sm"
                      data-testid="input-debt-search"
                    />
                  </div>
                  <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-9 gap-1.5 rounded-lg ${hasActiveFilters(filters) ? "border-violet-300 bg-violet-50 text-violet-700" : ""}`}
                        data-testid="button-debt-filter"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Bộ lọc
                        {hasActiveFilters(filters) && <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[520px] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold">Lọc công nợ</span>
                        {hasDebtFilters && (
                          <button
                            className="text-xs text-violet-600 hover:underline"
                            onClick={() => {
                              setSearch("");
                              setFilters(DEFAULT_FILTERS);
                              setDateRange({});
                              setPaidAtRange({});
                              setDebtCondition("all");
                            }}
                          >
                            Xoá tất cả
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { label: "Cơ sở", key: "branches", opts: filterOptions.branches.map(v => ({ value: v, label: v })), withSearch: false },
                          { label: "Danh mục", key: "categories", opts: filterOptions.categories.map(v => ({ value: v, label: v })), withSearch: false },
                          { label: "Lớp", key: "classes", opts: filterOptions.classes.map(v => ({ value: v, label: v })), withSearch: true },
                        ] as Array<{ label: string; key: keyof typeof filters; opts: { value: string; label: string }[]; withSearch: boolean }>).map(({ label, key, opts, withSearch }) => (
                          <MultiSelectFilter
                            key={key}
                            label={label}
                            options={opts}
                            selected={filters[key] as string[]}
                            onChange={val => setFilters(f => ({ ...f, [key]: val }))}
                            withSearch={withSearch}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Select value={debtCondition} onValueChange={value => setDebtCondition(value as DebtCondition)}>
                    <SelectTrigger className="h-9 w-[170px] rounded-lg border-slate-200 bg-white text-sm" data-testid="select-debt-condition">
                      <SelectValue placeholder="Tình trạng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả tình trạng</SelectItem>
                      <SelectItem value="overdue">Quá hạn</SelectItem>
                      <SelectItem value="today">Đến hạn hôm nay</SelectItem>
                      <SelectItem value="soon">Sắp đến hạn (1–7 ngày)</SelectItem>
                      <SelectItem value="upcoming">Chưa đến hạn</SelectItem>
                      <SelectItem value="no-due-date">Không có hạn thanh toán</SelectItem>
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    label="Hạn TT"
                    dateRange={dateRange}
                    onChange={setDateRange}
                    open={calendarOpen}
                    onOpenChange={setCalendarOpen}
                  />
                  {hasDebtFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs text-muted-foreground"
                      onClick={() => {
                        setSearch("");
                        setFilters(DEFAULT_FILTERS);
                        setDateRange({});
                        setPaidAtRange({});
                        setDebtCondition("all");
                      }}
                    >
                      Xoá lọc
                    </Button>
                  )}
                </div>
              </div>
              <div className="relative z-10 mt-3 mb-3 shrink-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {debtConditionCards.map(card => {
                  const isActive = card.key !== "total" && debtCondition === card.key;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => setDebtCondition(card.key === "total" || isActive ? "all" : card.key)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? `${card.activeClass} ${card.textClass}`
                          : `border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 ${card.textClass}`
                      }`}
                      data-testid={`button-debt-condition-${card.key}`}
                    >
                      <span className="text-xs font-medium">{card.label}</span>
                      <span className="text-sm font-bold tabular-nums">{card.value}</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative z-0 flex-1 overflow-auto space-y-3 min-h-0">
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
                    {groups.map(group => {
                      const totalDebt = group.invoices.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
                      const dueDates = group.invoices.filter(i => i.dueDate).map(i => new Date(i.dueDate!));
                      const earliestDue = dueDates.length > 0 ? new Date(Math.min(...dueDates.map(d => d.getTime()))) : null;
                      const daysUntilDue = earliestDue ? Math.ceil((earliestDue.getTime() - Date.now()) / 86400000) : null;
                      const initial = (group.name ?? "?").charAt(0).toUpperCase();
                      const avatarColors = ["from-rose-500 to-pink-600", "from-violet-500 to-purple-600", "from-sky-500 to-blue-600", "from-teal-500 to-emerald-600", "from-amber-500 to-orange-500"];
                      const avatarGrad = avatarColors[(group.name ?? "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
                      return (
                        <div key={group.key} className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden" data-testid={`card-debt-${group.key}`}>
                          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGrad} text-white flex items-center justify-center text-sm font-bold flex-shrink-0 select-none shadow-sm`}>
                                {initial}
                              </div>
                              <span className="font-bold text-sm text-slate-700">{group.name}</span>
                              {daysUntilDue !== null && (
                                <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${
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
                                    ? <><AlertCircle className="h-3 w-3" /> hạn hôm nay</>
                                    : <>còn {daysUntilDue} ngày</>}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Tổng công nợ</p>
                              <p className="text-red-600 font-bold text-base">{fmtMoney(totalDebt)}</p>
                            </div>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50/70 border-b border-slate-100">
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Mã GD</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Danh mục</th>
                                <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tổng tiền</th>
                                <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Đã thanh toán</th>
                                <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Còn nợ</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Hạn TT</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Trạng thái</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tình trạng</th>
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

              {/* Debt pagination */}
              <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground pb-1 pt-1">
                <div className="flex items-center gap-2">
                  <span>{total} hoá đơn công nợ</span>
                  <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / trang</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
                  <span className="px-2 text-xs">Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>›</Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(Math.ceil(total / pageSize))}>»</Button>
                </div>
              </div>
              </>
            );
          })()
         ) : activeTab === "history" ? null : null}
        </div>
        </div>
      </div>

      <CreateInvoiceDialog
        open={dialogOpen}
        invoiceId={editInvoiceId}
        defaultStudent={defaultStudent}
        onClose={handleCloseDialog}
      />

      <HistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        title="Lịch sử hóa đơn"
      >
        <InvoiceHistoryTab
          locationOptions={locationsList.map((l: any) => ({ value: l.id, label: l.name }))}
        />
      </HistoryDialog>

      <BulkInvoiceEntryDialog
        open={bulkEntryOpen}
        onOpenChange={(open) => {
          setBulkEntryOpen(open);
          if (!open) setInvoiceExcelFile(null);
        }}
        importFile={invoiceExcelFile}
        onImportFileConsumed={() => setInvoiceExcelFile(null)}
      />
      <input
        ref={invoiceExcelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (file) {
            setInvoiceExcelFile(file);
            setBulkEntryOpen(true);
          }
        }}
      />

      {deleteInvoiceTarget && (
        <DeleteInvoiceDialog
          target={deleteInvoiceTarget}
          onClose={() => setDeleteInvoiceTarget(null)}
          deleteMutation={deleteInvoiceMutation}
        />
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
          invoice={{
            ...(printPreviewInvoice as any),
            subjectName: (printPreviewInvoice as any).name ?? null,
          }}
          templateId={printTemplateId}
          onClose={() => { setPrintPreviewInvoice(null); setPrintTemplateId(undefined); }}
        />
      )}

      {/* Schedule print preview dialog */}
      {printPreviewSchedule && (() => {
        const { schedule: s, invoice: inv } = printPreviewSchedule;
        const amount = parseFloat(s.amount ?? "0");
        const isPaid = s.status === "paid";
        const invAny = inv as any;
        const scheduleAsInvoice: any = {
          id: s.id,
          code: `${inv.code ?? ""}/${s.code ?? s.label}`,
          type: inv.type,
          subjectName: inv.name ?? null,
          grandTotal: String(amount),
          paidAmount: isPaid ? String(amount) : "0",
          remainingAmount: isPaid ? "0" : String(amount),
          createdAt: typeof inv.createdAt === "string" ? inv.createdAt : new Date(inv.createdAt).toISOString(),
           scheduleCount: invAny.scheduleCount ?? 2,
           hasSchedules: true,
           createdByName: invAny.createdByName ?? null,
           paidByName: s.paidByName ?? null,
          // "Thu kỳ này" + phương thức/ngày = thông tin của đợt
          paymentMethod: s.paymentMethod ?? invAny.paymentMethod ?? null,
          note: invAny.note ?? null,
          description: invAny.description ?? null,
          category: invAny.category ?? null,
          // Danh sách sản phẩm = giữ nguyên các sản phẩm của hoá đơn gốc.
          // Nếu hoá đơn gốc chưa có items, fallback về 1 dòng mang nhãn đợt.
          items: (Array.isArray(invAny.items) && invAny.items.length > 0)
            ? invAny.items
            : [{
                packageName: `${invAny.category ?? inv.name ?? "Học phí"} — ${s.label}`,
                name: `${invAny.category ?? inv.name ?? "Học phí"} — ${s.label}`,
                unitPrice: amount,
                price: amount,
                quantity: 1,
              }],
          // Hoá đơn gốc – để các biến {{tong_hd_goc}}/{{con_lai_hd_goc}}... hiển thị đúng
          parentInvoice: {
            code: inv.code ?? null,
            grandTotal: invAny.grandTotal ?? null,
            paidAmount: invAny.paidAmount ?? null,
            remainingAmount: invAny.remainingAmount ?? null,
            totalAmount: invAny.totalAmount ?? null,
            totalPromotion: invAny.totalPromotion ?? null,
            totalSurcharge: invAny.totalSurcharge ?? null,
            deduction: invAny.deduction ?? null,
          },
           // Bản in theo đợt không fetch lại hóa đơn gốc; truyền lịch đầy đủ
           // để biến {{lich_su_thanh_toan}} hiển thị bảng thay vì trạng thái rỗng.
           paymentSchedule: (Array.isArray(invAny.paymentSchedule) ? invAny.paymentSchedule : []).map((schedule: ScheduleItem) => ({
             label: schedule.label,
             code: schedule.code ?? null,
             amount: schedule.amount,
             dueDate: schedule.dueDate,
             status: schedule.status,
             paidAt: schedule.paidAt ? new Date(schedule.paidAt).toISOString() : null,
             paymentMethod: schedule.paymentMethod ?? null,
           })),
          // Ngân hàng — kế thừa từ hoá đơn gốc nếu có
          locationBankAccounts: invAny.locationBankAccounts ?? null,
          appliedBankAccount: invAny.appliedBankAccount ?? null,
        };
        return (
          <InvoicePrintPreview
            invoice={scheduleAsInvoice}
            skipFetch
            titleSuffix={`(${s.label})`}
            onClose={() => setPrintPreviewSchedule(null)}
          />
        );
      })()}

      {/* Bulk due date dialog */}
      <BulkDueDateDialog
        open={bulkDueDateOpen}
        onOpenChange={setBulkDueDateOpen}
        selectedDate={bulkDueDate}
        onDateChange={setBulkDueDate}
        isPending={bulkUpdateDueDateMutation.isPending}
        onConfirm={(date) => {
          bulkUpdateDueDateMutation.mutate({
            ids: Array.from(selectedIds),
            dueDate: format(date, "yyyy-MM-dd"),
          });
          setBulkDueDateOpen(false);
        }}
      />

      <BulkInvoiceDateDialog
        open={bulkInvoiceDateField !== null}
        onOpenChange={(open) => {
          if (!open && !bulkUpdateInvoiceDateMutation.isPending) {
            setBulkInvoiceDateField(null);
            setBulkInvoiceDate(undefined);
          }
        }}
        field={bulkInvoiceDateField ?? "createdAt"}
        selectedDate={bulkInvoiceDate}
        onDateChange={setBulkInvoiceDate}
        selectedInvoices={invoices.filter(invoice => selectedIds.has(invoice.id))}
        isPending={bulkUpdateInvoiceDateMutation.isPending}
        onConfirm={(date) => {
          if (!bulkInvoiceDateField) return;
          bulkUpdateInvoiceDateMutation.mutate({
            ids: Array.from(selectedIds),
            field: bulkInvoiceDateField,
            date: format(date, "yyyy-MM-dd"),
          });
        }}
      />

      {/* Bulk delete dialog */}
      {bulkDeleteOpen && (() => {
        const selectedInvoices = invoices.filter(inv => selectedIds.has(inv.id));
        const ineligible = selectedInvoices.filter(inv => inv.status === "paid" || inv.status === "partial");
        const eligible = selectedInvoices.filter(inv => inv.status !== "paid" && inv.status !== "partial");
        const eligibleWithSchedules = eligible.filter(inv => inv.hasSchedules && (inv.scheduleCount ?? 0) > 1);
        return (
          <Dialog open onOpenChange={(v) => { if (!bulkDeleteMutation.isPending) setBulkDeleteOpen(v); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-4 w-4" /> Xoá hoá đơn hàng loạt
                </DialogTitle>
              </DialogHeader>
              <div className="py-3 space-y-3">
                <p className="text-sm">
                  Bạn có chắc chắn muốn xoá{" "}
                  <span className="font-semibold text-red-600">{eligible.length}</span>{" "}
                  {eligible.length !== selectedInvoices.length && (
                    <span className="text-muted-foreground">(trong tổng số {selectedInvoices.length} đã chọn)</span>
                  )}{" "}
                  hoá đơn?
                </p>

                {ineligible.length > 0 && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 space-y-1">
                    <p className="font-semibold">Hoá đơn có Đợt con đã thanh toán không thể xoá!</p>
                    <p>
                      {ineligible.length} hoá đơn bị bỏ qua:{" "}
                      <span className="font-medium">{ineligible.map(i => i.code || i.id).join(", ")}</span>
                    </p>
                    <p className="mt-0.5">Cần chuyển các đợt đã thanh toán về chưa thanh toán trước khi xoá.</p>
                  </div>
                )}

                {eligibleWithSchedules.length > 0 && (
                  <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 space-y-1">
                    <p className="font-semibold">Bạn đang chọn có hoá đơn có các đợt con!</p>
                    <p>
                      {eligibleWithSchedules.length} hoá đơn có đợt con:{" "}
                      <span className="font-medium">{eligibleWithSchedules.map(i => i.code || i.id).join(", ")}</span>
                    </p>
                    <p>Xoá hoá đơn gốc thì các đợt con cũng bị xoá theo.</p>
                  </div>
                )}

                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  Khi xoá hoá đơn thì sẽ không thể hoàn tác lại được.
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteMutation.isPending}>Huỷ</Button>
                <Button
                  variant="destructive"
                  disabled={bulkDeleteMutation.isPending || eligible.length === 0}
                  onClick={() => bulkDeleteMutation.mutate(eligible.map(i => i.id))}
                >
                  {bulkDeleteMutation.isPending
                    ? "Đang xoá..."
                    : eligible.length === 0
                      ? "Không có hoá đơn đủ điều kiện"
                      : `Xác nhận xoá ${eligible.length} hoá đơn`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Bulk assign commission dialog */}
      <BulkAssignCommissionDialog
        open={bulkCommissionOpen}
        onOpenChange={setBulkCommissionOpen}
        isPending={bulkAssignCommissionMutation.isPending}
        onConfirm={(commissions) => {
          bulkAssignCommissionMutation.mutate({ ids: Array.from(selectedIds), commissions });
        }}
      />

      {/* Bulk assign class dialog */}
      <BulkAssignClassDialog
        open={bulkAssignClassOpen}
        onOpenChange={setBulkAssignClassOpen}
        selectedClassId={bulkAssignClassId}
        onClassChange={setBulkAssignClassId}
        isPending={bulkAssignClassMutation.isPending}
        onConfirm={(classId) => {
          bulkAssignClassMutation.mutate({ ids: Array.from(selectedIds), classId });
          setBulkAssignClassOpen(false);
        }}
      />

      {/* Bulk Collect (Gộp phiếu thu/chi) */}
      {bulkCollectOpen && (() => {
        const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
        const hasAnyThu = selectedInvs.some(i => i.type === "Thu");
        const invoiceType: "Thu" | "Chi" = hasAnyThu ? "Thu" : "Chi";
        return (
          <BulkCollectDialog
            open={bulkCollectOpen}
            onClose={() => setBulkCollectOpen(false)}
            onSuccess={(printData) => { setSelectedIds(new Set()); setSelectedSchedules(new Map()); setBulkCollectOpen(false); setBulkCollectPrintData(printData); }}
            initialInvoices={selectedInvs}
            initialSchedules={selectedSchedules}
            invoiceType={invoiceType}
          />
        );
      })()}

      {/* Bulk collect print preview */}
      {bulkCollectPrintData && (
        <BulkCollectPrintPreview
          data={bulkCollectPrintData}
          onClose={() => setBulkCollectPrintData(null)}
        />
      )}

      {/* Bulk print — select template dialog */}
      <BulkPrintDialog
        open={bulkPrintOpen}
        onOpenChange={setBulkPrintOpen}
        onConfirm={(templateId) => {
          if (!bulkPrintInvoice) return;
          setBulkPrintOpen(false);
          setPrintTemplateId(templateId || undefined);
          setPrintPreviewInvoice(bulkPrintInvoice);
        }}
        defaultTemplateId={bulkPrintTemplateId}
        onTemplateChange={setBulkPrintTemplateId}
      />

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
              onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), scheduleIds: Array.from(selectedSchedules.keys()), isPublish: false })}
              data-testid="button-sign-draft"
            >
              Gửi nháp
            </Button>
            {!isUsbSigning && (
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!signConfirmed || signMutation.isPending}
                onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), scheduleIds: Array.from(selectedSchedules.keys()), isPublish: true })}
                data-testid="button-sign-confirm"
              >
                {signMutation.isPending ? "Đang xử lý..." : "Đồng ý"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
