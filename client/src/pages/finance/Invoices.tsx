import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { fetchAllInvoicesForExport, getPreviousInvoicePeriodParams, useInvoices, useInvoiceSummary } from "@/hooks/use-invoices";
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
  FileSignature, FileText, Download, Upload, FileSpreadsheet, Loader2, Keyboard, Percent, BookOpen, Merge, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Check, X,
} from "lucide-react";
import {
  DropdownMenu as ActionMenu,
  DropdownMenuContent as ActionMenuContent,
  DropdownMenuItem as ActionMenuItem,
  DropdownMenuSeparator as ActionMenuSeparator,
  DropdownMenuTrigger as ActionMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { useStaff } from "@/hooks/use-staff";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { BulkInvoiceEntryDialog } from "./components/BulkInvoiceEntryDialog";
import { BulkCollectDialog, type BulkCollectPrintData } from "./components/BulkCollectDialog";
import { BulkCollectPrintPreview } from "./components/BulkCollectPrintPreview";
import {
  type InvoiceRow, type ScheduleItem, STATUS_CONFIG, EINVOICE_STATUS_CONFIG,
  parseNum, fmtMoney, fmtDate, getInvoiceBusinessDateKey, getTodayVietnamDate, isInvoicePaidLike,
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
import { ScheduleAdjustmentDialog } from "./components/ScheduleAdjustmentDialog";
import { InvoiceTemplateList } from "./InvoiceTemplateList";
import { InvoicePrintPreview } from "./InvoicePrintPreview";
import { InvoiceQRDialog } from "./components/InvoiceQRDialog";
import { ScheduleProgressPopover } from "./components/ScheduleProgressPopover";
import { InvoiceHistoryTab } from "./components/InvoiceHistoryTab";
import { InvoiceListErrorRow } from "./components/InvoiceListErrorRow";
import { HistoryDialog } from "@/components/common/HistoryDialog";
import { useLocations } from "@/hooks/use-locations";
import type { SortKey } from "@/hooks/use-invoice-filters";
import { useLanguage } from "@/hooks/use-language";

type TabKey = "all" | "unpaid" | "paid" | "confirmed" | "debt" | "history" | "print-template";
type DebtCondition = "all" | "overdue" | "today" | "soon" | "upcoming" | "no-due-date";

type SummaryComparison = {
  direction: "up" | "down" | "flat";
  percent: number | null;
};

function compareSummaryValue(current: number, previous: number | undefined): SummaryComparison | null {
  if (previous === undefined) return null;
  if (current === previous) return { direction: "flat", percent: 0 };
  if (previous === 0) {
    return { direction: current > 0 ? "up" : "down", percent: null };
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return {
    direction: percent > 0 ? "up" : "down",
    percent: Math.abs(percent),
  };
}

function formatComparisonPercent(percent: number | null, newLabel = "Newly generated"): string {
  if (percent === null) return newLabel;
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

const TABS: { key: TabKey; labelKey: string; statusFilter?: string; color: string }[] = [
  { key: "all",              labelKey: "finance.tab.all",            color: "#64748b" },
  { key: "unpaid",           labelKey: "finance.tab.unpaid",         statusFilter: "unpaid",  color: "#ca8a04" },
  { key: "paid",             labelKey: "finance.tab.paid",           statusFilter: "paid",    color: "#16a34a" },
  { key: "confirmed",        labelKey: "finance.tab.confirmed",      statusFilter: "confirmed", color: "#1d4ed8" },
  { key: "debt",             labelKey: "finance.tab.debt",           statusFilter: "debt",    color: "#dc2626" },
  { key: "history",          labelKey: "finance.tab.history",                                      color: "#7c3aed" },
  { key: "print-template",   labelKey: "finance.tab.printTemplate",                              color: "#0891b2" },
];

function invoiceStatusLabel(status: string, t: (key: string) => string): string {
  const keyByStatus: Record<string, string> = {
    paid: "finance.paidStatus",
    confirmed: "finance.tab.confirmed",
    unpaid: "finance.unpaidStatus",
    debt: "finance.tab.debt",
    partial: "finance.partialPayment",
    cancelled: "finance.statusCancelled",
  };
  return t(keyByStatus[status] ?? "finance.unpaidStatus");
}

function einvoiceStatusLabel(status: string, t: (key: string) => string): string {
  const keyByStatus: Record<string, string> = {
    none: "finance.einvoiceNotSigned",
    draft: "finance.einvoicePending",
    published: "finance.einvoiceSigned",
  };
  return t(keyByStatus[status] ?? "finance.einvoiceNotSigned");
}

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
  const { t } = useLanguage();
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
                placeholder={t("finance.filterSearch")}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {visibleOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">{t("finance.noFilterData")}</p>
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
            <button className="text-xs text-purple-600 hover:underline" onClick={() => onChange([])}>{t("finance.clearFilterShort")}</button>
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
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      setDraftFrom(dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "");
      setDraftTo(dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : "");
      setActivePreset(null);
    }
  }, [open]);

  const today = getTodayVietnamDate();

  const presets = [
    { label: t("finance.date.all"),       key: "all",       fn: () => ({ from: undefined as Date | undefined, to: undefined as Date | undefined }) },
    { label: t("finance.date.today"),     key: "today",     fn: () => ({ from: today as Date | undefined, to: today as Date | undefined }) },
    { label: t("finance.date.yesterday"), key: "yesterday", fn: () => { const d = new Date(today); d.setDate(d.getDate() - 1); return { from: d as Date | undefined, to: d as Date | undefined }; } },
    { label: t("finance.date.last7Days"), key: "7d",        fn: () => { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: f as Date | undefined, to: today as Date | undefined }; } },
    { label: t("finance.date.last28Days"),key: "28d",       fn: () => { const f = new Date(today); f.setDate(f.getDate() - 27); return { from: f as Date | undefined, to: today as Date | undefined }; } },
    { label: t("finance.date.thisWeek"),  key: "thisweek",  fn: () => { const day = today.getDay(); const diff = day === 0 ? -6 : 1 - day; const f = new Date(today); f.setDate(today.getDate() + diff); const t = new Date(f); t.setDate(f.getDate() + 6); return { from: f as Date | undefined, to: t as Date | undefined }; } },
    { label: t("finance.date.thisMonth"), key: "thismonth", fn: () => ({ from: new Date(today.getFullYear(), today.getMonth(), 1) as Date | undefined, to: new Date(today.getFullYear(), today.getMonth() + 1, 0) as Date | undefined }) },
    { label: t("finance.date.thisYear"),  key: "thisyear",  fn: () => ({ from: new Date(today.getFullYear(), 0, 1) as Date | undefined, to: new Date(today.getFullYear(), 11, 31) as Date | undefined }) },
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

  const displayLabel = label ?? t("finance.date.created");
  const triggerText = dateRange.from
    ? `${displayLabel}: ${format(dateRange.from, "dd/MM/yyyy")} – ${dateRange.to ? format(dateRange.to, "dd/MM/yyyy") : "..."}`
    : `${displayLabel}: ${t("finance.allTime")}`;

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
              <label className="text-sm text-muted-foreground">{t("finance.date.from")}</label>
              <input
                type="date"
                value={draftFrom}
                onChange={e => { setDraftFrom(e.target.value); setActivePreset(null); }}
                className="w-full h-9 border rounded-md px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">{t("finance.date.to")}</label>
              <input
                type="date"
                value={draftTo}
                onChange={e => { setDraftTo(e.target.value); setActivePreset(null); }}
                className="w-full h-9 border rounded-md px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="outline" size="sm" onClick={handleClear}>{t("finance.clear")}</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApply}>{t("finance.apply")}</Button>
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
  const { t } = useLanguage();
  const value = invoice[field];
  const [open, setOpen] = useState(false);
  const [dateConflictOpen, setDateConflictOpen] = useState(false);
  const [pendingConflictDate, setPendingConflictDate] = useState("");
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const background = isSelected ? "bg-violet-50" : isOdd ? "bg-slate-50" : "bg-white";
  const toInputDate = (date: string | Date | null | undefined) => {
    if (!date) return "";
    return getInvoiceBusinessDateKey(date);
  };

  useEffect(() => {
    if (!open) setDraft(toInputDate(value));
  }, [value, open]);

  type DatePatch = { createdAt?: string; paidAt?: string };
  const mutation = useMutation({
    mutationFn: (payload: DatePatch) => apiRequest(
      "PATCH",
      invoice.isScheduleRow && invoice.scheduleId
        ? `/api/finance/invoice-schedules/${invoice.scheduleId}`
        : `/api/finance/invoices/${invoice.id}`,
      payload,
    ),
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      setOpen(false);
      setDateConflictOpen(false);
      setPendingConflictDate("");
      const target = invoice.isScheduleRow ? t("finance.paymentSchedule") : t("finance.invoiceCode");
      toast({
        title: t("finance.updateDate"),
          description: payload.createdAt && payload.paidAt
          ? t("finance.updatedBothDates", { target, date: fmtDate(payload.paidAt) })
          : field === "createdAt"
          ? t("finance.updatedCreatedDate", { target })
          : t("finance.updatedPaidDate", { target }),
      });
    },
    onError: (error: any) => {
      toast({ title: t("finance.cannotUpdateDate"), description: error?.message ?? t("finance.tryAgain"), variant: "destructive" });
    },
  });

  const createdDate = field === "paidAt" ? toInputDate(invoice.createdAt) : "";
  const paidDate = field === "createdAt" ? toInputDate(invoice.paidAt) : "";
  const hasDateConflict = field === "paidAt" && !!createdDate && !!draft && draft < createdDate;
  const isInvalid = !draft || (field === "createdAt" && !!paidDate && draft > paidDate);
  const label = field === "createdAt" ? t("finance.createdDate") : t("finance.paidDate");
  const saveDate = () => {
    if (hasDateConflict) {
      setPendingConflictDate(draft);
      setDateConflictOpen(true);
      return;
    }
    mutation.mutate(field === "createdAt" ? { createdAt: draft } : { paidAt: draft });
  };
  const confirmDateConflict = () => {
    if (pendingConflictDate) {
      mutation.mutate({ createdAt: pendingConflictDate, paidAt: pendingConflictDate });
    }
  };

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
            title={t("finance.editDate", { label })}
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
            max={field === "createdAt" ? paidDate : undefined}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            data-testid={`input-edit-${field}-${invoice.id}`}
          />
          {field === "paidAt" && (
             <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t("finance.earlierPaidDateHint")}
             </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              <X className="mr-1 h-3.5 w-3.5" /> {t("finance.cancel")}
            </Button>
             <Button type="button" size="sm" onClick={saveDate} disabled={isInvalid || mutation.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" /> {t("finance.save")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
       <Dialog
         open={dateConflictOpen}
         onOpenChange={(next) => {
           if (!mutation.isPending) {
             setDateConflictOpen(next);
             if (!next) setPendingConflictDate("");
           }
         }}
       >
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
            <DialogTitle>{t("finance.paymentDateBeforeCreation")}</DialogTitle>
           </DialogHeader>
           <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t("finance.dateConflictBody", { date: fmtDate(pendingConflictDate), createdDate: fmtDate(createdDate) })}</p>
              <p>{t("finance.dateConflictAction", { date: fmtDate(pendingConflictDate) })}</p>
           </div>
           <div className="flex justify-end gap-2 pt-2">
             <Button type="button" variant="outline" onClick={() => setDateConflictOpen(false)} disabled={mutation.isPending}>
                {t("finance.cancel")}
             </Button>
             <Button type="button" onClick={confirmDateConflict} disabled={mutation.isPending}>
               {mutation.isPending ? t("finance.updateDateSaving") : t("finance.agreeAction")}
             </Button>
           </div>
         </DialogContent>
       </Dialog>
    </td>
  );
}

function flattenInvoiceRows(invoices: InvoiceRow[]): InvoiceRow[] {
  return invoices.flatMap((invoice) => {
    const schedules = invoice.paymentSchedule ?? [];
    if (schedules.length === 0) return [invoice];

    return schedules.map((schedule, index) => {
      const amount = schedule.amount ?? "0";
      const isPaid = isInvoicePaidLike(schedule.status);
      const installmentNumber = index + 1;
      return {
        ...invoice,
        code: schedule.code ?? `${invoice.code ?? ""}-${installmentNumber}`,
        settleCode: schedule.settleCode ?? null,
        totalAmount: schedule.baseAmount ?? amount,
        totalPromotion: schedule.promotionAmount ?? "0",
        totalSurcharge: schedule.surchargeAmount ?? "0",
        deduction: "0",
        grandTotal: amount,
        paidAmount: isPaid ? amount : "0",
        remainingAmount: isPaid ? "0" : amount,
        status: schedule.status,
        dueDate: schedule.dueDate ?? null,
        paidByName: schedule.paidByName ?? null,
        paidAt: schedule.paidAt ?? null,
        paymentMethod: schedule.paymentMethod ?? null,
        creatorName: schedule.createdByName ?? null,
        createdAt: schedule.createdAt ?? "",
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

async function downloadInvoiceListExcel(
  rows: InvoiceRow[],
  tabLabel: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const columns = [
    { header: t("finance.student"), width: 28 },
    { header: t("finance.studentCode"), width: 16 },
    { header: t("finance.invoiceCode"), width: 18 },
    { header: t("finance.paymentSchedule"), width: 20 },
    { header: t("finance.branch"), width: 20 },
    { header: t("finance.type"), width: 12 },
    { header: t("finance.category"), width: 24 },
    { header: t("finance.class"), width: 24 },
    { header: t("finance.amount"), width: 16 },
    { header: t("finance.promotion"), width: 16 },
    { header: t("finance.surcharge"), width: 16 },
    { header: t("finance.deposit"), width: 16 },
    { header: t("finance.total"), width: 16 },
    { header: t("finance.paid"), width: 16 },
    { header: t("finance.remaining"), width: 16 },
    { header: t("finance.status"), width: 22 },
    { header: t("finance.dueDate"), width: 18 },
    { header: t("finance.paymentMethod"), width: 22 },
    { header: t("finance.creator"), width: 22 },
    { header: t("finance.createdDate"), width: 18 },
    { header: t("finance.payer"), width: 22 },
    { header: t("finance.paidDate"), width: 18 },
    { header: t("finance.description"), width: 36 },
  ];

  const paymentMethodLabels: Record<string, string> = {
    cash: t("finance.cash"),
    transfer: t("finance.transfer"),
    deposit_wallet: t("finance.depositWallet"),
    card: t("finance.card"),
    installment: t("finance.installmentPayment"),
  };

  // Keep each parent invoice immediately above its visible installment rows.
  // The parent row preserves invoice-level promotion/surcharge values that
  // are intentionally zeroed on installment rows.
  const groupedRows = new Map<string, { parent?: InvoiceRow; children: InvoiceRow[]; standalone?: InvoiceRow }>();
  for (const row of rows) {
    const parent = row.isScheduleRow ? row.parentInvoice : undefined;
    const groupId = parent?.id ?? row.id;
    const group = groupedRows.get(groupId) ?? { children: [] };
    if (parent) {
      group.parent = parent;
      group.children.push(row);
    } else {
      group.standalone = row;
    }
    groupedRows.set(groupId, group);
  }

  const exportInvoices: InvoiceRow[] = [];
  for (const group of groupedRows.values()) {
    if (group.parent) {
      exportInvoices.push({
        ...group.parent,
        scheduleLabel: t("finance.parentInvoiceLabel"),
        scheduleId: undefined,
        isScheduleRow: false,
        parentInvoice: undefined,
      });
      exportInvoices.push(
        ...group.children.sort(
          (a, b) => (a.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER) - (b.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER),
        ),
      );
    } else if (group.standalone) {
      exportInvoices.push(group.standalone);
    }
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("finance.invoiceCode"));
  const subtitle = t("finance.exportSubtitle", { tab: tabLabel, count: exportInvoices.length });
  const lastColumn = columns.length;

  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.getCell(1, 1).value = t("finance.invoiceList");
  worksheet.getCell(1, 1).font = { bold: true, size: 14 };
  worksheet.getCell(1, 1).alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 24;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  worksheet.getCell(2, 1).value = subtitle;
  worksheet.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };

  const headerRow = worksheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true, color: { argb: "FF1E293B" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 30;

  const numericColumnIndexes = new Set([9, 10, 11, 12, 13, 14, 15]);
  const parentFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9EAF7" } };
  const parentBorder = {
    top: { style: "thin" as const, color: { argb: "FF93C5FD" } },
    bottom: { style: "thin" as const, color: { argb: "FF93C5FD" } },
  };

  for (const invoice of exportInvoices) {
    const row = worksheet.addRow([
      invoice.name ?? "",
      invoice.studentCode ?? "",
      invoice.code ?? "",
      invoice.scheduleLabel ?? "",
      invoice.branch ?? "",
      invoice.type ?? "",
      invoice.category ?? "",
      invoice.className ?? "",
      // Installment amounts already include the parent-level adjustments.
      // Keep them only in "Tổng tiền"; the parent row carries "Số tiền".
      invoice.isScheduleRow ? "" : parseNum(invoice.totalAmount),
      parseNum(invoice.totalPromotion),
      parseNum(invoice.totalSurcharge),
      parseNum(invoice.deduction),
      parseNum(invoice.grandTotal),
      parseNum(invoice.paidAmount),
      parseNum(invoice.remainingAmount),
      invoiceStatusLabel(invoice.status, t),
      invoice.dueDate ? fmtDate(invoice.dueDate) : "",
      invoice.paymentMethod ? (paymentMethodLabels[invoice.paymentMethod] ?? invoice.paymentMethod) : "",
      invoice.creatorName ?? "",
      fmtDate(invoice.createdAt),
      invoice.paidByName ?? "",
      invoice.paidAt ? fmtDate(invoice.paidAt) : "",
      invoice.note?.trim() || invoice.description?.trim() || invoice.paymentNote?.trim() || "",
    ]);

    row.alignment = { vertical: "middle" };
    row.eachCell((cell, columnNumber) => {
      if (numericColumnIndexes.has(columnNumber)) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });

    if (invoice.scheduleLabel === t("finance.parentInvoiceLabel") && !invoice.isScheduleRow) {
      row.font = { bold: true, color: { argb: "FF0F172A" } };
      row.fill = parentFill;
      row.border = parentBorder;
    }
  }

  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
  });
  worksheet.views = [{ state: "frozen", ySplit: 3 }];
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: lastColumn },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `danh_sach_hoa_don_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function getScheduleForRow(inv: InvoiceRow): ScheduleItem | undefined {
  if (!inv.isScheduleRow || !inv.scheduleId) return undefined;
  return inv.parentInvoice?.paymentSchedule?.find(s => s.id === inv.scheduleId);
}

function renderInvoiceCell(
  colKey: string,
  inv: InvoiceRow,
  t: (key: string, params?: Record<string, string | number>) => string,
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
      return <td key="type" className="p-3 w-[112px] min-w-[112px] whitespace-nowrap"><span className={`text-[11px] px-2.5 py-1 rounded-full font-bold tracking-wide whitespace-nowrap ${inv.type === "Thu" ? "bg-sky-100 text-sky-700 border border-sky-200" : "bg-orange-100 text-orange-700 border border-orange-200"}`}>{inv.type === "Thu" ? t("finance.invoiceTypeIncome") : t("finance.invoiceTypeExpense")}</span></td>;
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
      const fullyPaid = isInvoicePaidLike(inv.status) || (grand > 0 && remaining === 0);
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
                 title={t("finance.viewInvoiceSchedules")}
                data-testid={`button-schedule-progress-${inv.scheduleId}`}
              >
                <span className="text-sm font-semibold text-slate-700">
                  {t("finance.installmentOf", { current: inv.scheduleSortOrder ?? "—", total: inv.paymentSchedule?.length ?? "—" })}
                </span>
                {inv.dueDate && <div className="text-[11px] text-muted-foreground mt-0.5">{t("finance.duePrefix")} {fmtDate(inv.dueDate)}</div>}
              </button>
            </ScheduleProgressPopover>
          </td>
        );
      }
      const hasSchedules = inv.hasSchedules && (inv.scheduleCount ?? 0) > 0;
      // Treat all invoices as at least 1 installment
      const total    = hasSchedules ? (inv.scheduleCount ?? 1) : 1;
      const todayKey = getInvoiceBusinessDateKey(new Date());

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
        isOverdue = !allDone && Boolean(nextDue)
          && getInvoiceBusinessDateKey(nextDue!) < todayKey;
      } else {
        // Single-installment invoice (not split)
        const remaining = parseNum(inv.remainingAmount);
        const grand     = parseNum(inv.grandTotal);
        allDone  = isInvoicePaidLike(inv.status) || (grand > 0 && remaining === 0);
        paidSch  = allDone ? 1 : 0;
        nextDue  = inv.dueDate ?? null;
        lastPaid = allDone ? (inv.dueDate ?? null) : null;
        isOverdue = !allDone && Boolean(nextDue)
          && getInvoiceBusinessDateKey(nextDue!) < todayKey;
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
              <span className="text-sm font-semibold">{t("finance.installmentsCount", { paid: paidSch, total })}</span>
            </div>
            {allDone ? (
              <div className="text-[11px] text-green-600 font-medium">
                {t("finance.completed")}{lastPaid ? ` ${fmtDate(lastPaid)}` : ""}
              </div>
            ) : nextDue ? (
              <div className={`text-[11px] font-medium ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                {isOverdue ? t("finance.overdue") : t("finance.nextInstallmentShort")} {fmtDate(nextDue)}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">{t("finance.noPaymentDue")}</div>
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
      return <td key="remaining" className="p-3 text-right whitespace-nowrap">{remaining > 0 ? <span className="font-medium text-red-600">{fmtMoney(remaining)}</span> : remaining === 0 && grand > 0 ? <span className="text-green-600 text-xs font-medium">{t("finance.paidEnough")}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
    }
    case "description": {
      const displayDescription = inv.note?.trim() || inv.description?.trim() || "";
      return (
        <td key="description" className="p-3" style={{ minWidth: 280, maxWidth: 380 }}>
          <span className="line-clamp-2 text-muted-foreground text-xs leading-relaxed" title={displayDescription}>
            {displayDescription || (inv.paymentNote ? "" : "—")}
          </span>
          {inv.paymentNote && (
            <span className="block mt-0.5 text-[11px] text-blue-500 italic truncate" title={inv.paymentNote}>
              {inv.paymentNote}
            </span>
          )}
        </td>
      );
    }
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
            <Badge className={`text-xs font-medium ${status.className}`}>{invoiceStatusLabel(inv.status, t)}</Badge>
          ) : (
            <InvoiceStatusDropdown invoiceId={inv.id} currentStatus={inv.status} updateStatusMutation={updateStatusMutation} />
          )}
        </td>
      );
    }
    case "einvoice": {
      if (!isInvoicePaidLike(inv.status)) {
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
            {einvoiceStatusLabel(key, t)}
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
      return <EditableInvoiceDateCell invoice={inv} field="createdAt" canEdit={canEdit} isSelected={isSelected} isOdd={isOdd} />;
    case "paidBy":
      return <td key="paidBy" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{inv.paidByName || "—"}</td>;
    case "paidAt":
      return <EditableInvoiceDateCell invoice={inv} field="paidAt" canEdit={canEdit} isSelected={isSelected} isOdd={isOdd} />;
    case "paymentMethod": {
      const method = inv.paymentMethod?.trim();
      const label = method === "cash"
        ? t("finance.cash")
        : method === "transfer"
          ? t("finance.transfer")
          : method === "deposit_wallet"
            ? t("finance.depositWallet")
            : method === "card"
              ? t("finance.card")
              : method === "installment"
                ? t("finance.installmentPayment")
          : method || "—";
      return <td key="paymentMethod" className="p-3 whitespace-nowrap text-muted-foreground text-xs">{label}</td>;
    }
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
  const { t } = useLanguage();
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
          <DialogTitle>{t("finance.print")}</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">{t("finance.choosePrintTemplate")}</label>
            <Select value={defaultTemplateId} onValueChange={onTemplateChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("finance.choosePrintTemplatePlaceholder")} />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("finance.cancel")}</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!defaultTemplateId}
            onClick={() => onConfirm(defaultTemplateId)}
          >
             {t("finance.printAction")}
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
  const { lang, t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-purple-600" />
             {t("finance.bulkDueDateTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground w-full">
             {t("finance.bulkDueDateDescription")}
          </p>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDateChange}
            locale={lang === "en" ? enUS : vi}
            className="rounded-md border"
          />
          {selectedDate && (
            <p className="text-sm font-medium text-purple-700">
               {t("finance.selectedDueDate")} {format(selectedDate, "dd/MM/yyyy")}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t("finance.cancel")}</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedDate || isPending}
            onClick={() => selectedDate && onConfirm(selectedDate)}
          >
            {isPending ? t("finance.updateDateSaving") : t("finance.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BulkInvoiceDateTarget = {
  id: string;
  kind: "invoice" | "schedule";
  createdAt: string | Date | null | undefined;
  paidAt: string | Date | null | undefined;
};

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  return getInvoiceBusinessDateKey(value);
}

function BulkInvoiceDateDialog({
  open,
  onOpenChange,
  onConfirm,
  field,
  selectedDate,
  onDateChange,
  selectedItems,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (date: Date, adjustCreatedAt: boolean) => void;
  field: "createdAt" | "paidAt";
  selectedDate: Date | undefined;
  onDateChange: (d: Date | undefined) => void;
  selectedItems: BulkInvoiceDateTarget[];
  isPending: boolean;
}) {
  const { lang, t } = useLanguage();
  const [confirmingConflict, setConfirmingConflict] = useState(false);
  useEffect(() => {
    if (!open) setConfirmingConflict(false);
  }, [open, field]);
   const label = field === "createdAt" ? t("finance.createdDate").toLowerCase() : t("finance.paidDate").toLowerCase();
  const selectedDateText = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const conflictingItems = selectedDate
    ? selectedItems.filter((item) => {
        if (field === "createdAt" && item.paidAt) {
          return selectedDateText > dateOnly(item.paidAt);
        }
        if (field === "paidAt" && item.createdAt) {
          return selectedDateText < dateOnly(item.createdAt);
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
             {t("finance.bulkDateTitle", { label })}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col items-center gap-3">
             <p className="text-sm text-muted-foreground w-full">{t("finance.bulkDateDescription", { label, count: selectedItems.length })}</p>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              setConfirmingConflict(false);
              onDateChange(date);
            }}
            locale={lang === "en" ? enUS : vi}
            className="rounded-md border"
          />
          {selectedDate && (
            <p className="text-sm font-medium text-purple-700">
               {t("finance.selectedDate")} {format(selectedDate, "dd/MM/yyyy")}
            </p>
          )}
          {field === "paidAt" && conflictingItems.length > 0 && !confirmingConflict && (
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
               {t("finance.dateConflictCount", { count: conflictingItems.length })}
            </div>
          )}
          {field === "createdAt" && conflictingItems.length > 0 && (
            <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
               {t("finance.dateCreatedConflict", { count: conflictingItems.length })}
            </div>
          )}
          {confirmingConflict && (
            <div className="w-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
               {t("finance.dateConflictBulkQuestion", { count: conflictingItems.length, date: selectedDate ? format(selectedDate, "dd/MM/yyyy") : "" })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => {
              if (confirmingConflict) setConfirmingConflict(false);
              else onOpenChange(false);
            }}
            disabled={isPending}
          >
             {confirmingConflict ? t("finance.back") : t("finance.cancel")}
          </Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedDate || (field === "createdAt" && conflictingItems.length > 0) || isPending}
            onClick={() => {
              if (!selectedDate) return;
              if (field === "paidAt" && conflictingItems.length > 0 && !confirmingConflict) {
                setConfirmingConflict(true);
                return;
              }
              onConfirm(selectedDate, confirmingConflict);
            }}
          >
            {isPending ? t("finance.updateDateSaving") : confirmingConflict ? t("finance.agreeAction") : t("finance.confirm")}
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
  const { t } = useLanguage();
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
             {t("finance.assignCommission")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">{t("finance.addCommissionStaff")}</label>
            <Select value="" onValueChange={addRow}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("finance.chooseStaff")} />
              </SelectTrigger>
              <SelectContent>
                {availableStaff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName || s.name || s.id}{s.code ? ` (${s.code})` : ""}
                  </SelectItem>
                ))}
                {availableStaff.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    {(staffList as any[]).length === 0 ? t("finance.loading") : t("finance.noMoreStaff")}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {commissions.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                 {t("finance.commissionList")}
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
                          <span className="sr-only">{t("finance.remove")}</span>×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {commissions.reduce((sum, c) => sum + c.percentage, 0) > 100 && (
                <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-t">
                   {t("finance.commissionOverLimit")}
                </div>
              )}
            </div>
          )}

          {commissions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
               {t("finance.noCommissionStaff")}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => { setCommissions([]); onOpenChange(false); }} disabled={isPending}>
             {t("finance.cancel")}
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            disabled={commissions.length === 0 || isPending}
            onClick={() => onConfirm(commissions)}
          >
            {isPending ? t("finance.assigning") : t("finance.assignCommission")}
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
  const { t } = useLanguage();
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
          <DialogTitle>{t("finance.assignClassBulk")}</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">{t("finance.chooseClass")}</label>
            <Input
              placeholder={t("finance.searchClass")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 mb-1"
            />
            <Select value={selectedClassId} onValueChange={onClassChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("finance.chooseClassPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {filtered.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.classCode || c.id}
                  </SelectItem>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">{t("finance.noClassFound")}</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t("finance.cancel")}</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!selectedClassId || isPending}
            onClick={() => onConfirm(selectedClassId)}
          >
            {isPending ? t("finance.assigning") : t("finance.assignClass")}
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
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: linkedReceipts = [], isLoading: loadingReceipts } = useQuery<any[]>({
    queryKey: ["/api/finance/invoices", target.id, "linked-store-receipts"],
    queryFn: () => apiRequest("GET", `/api/finance/invoices/${target.id}/linked-store-receipts`).then(r => r.json()),
  });

  const isPaidOrPartial = isInvoicePaidLike(target.status) || target.status === "partial";
  const activeReceipts = linkedReceipts.filter(r => r.status !== "cancelled");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
             <Trash2 className="h-4 w-4" /> {t("finance.deleteInvoice")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-3">
          <p className="text-sm">
             {t("finance.confirmDeleteInvoiceQuestion", { code: target.code || target.id })}
          </p>
          {isPaidOrPartial && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800">
              <p className="font-semibold mb-1">{t("finance.cannotDelete")}</p>
              <p>{t("finance.invoiceCode")} <strong>{isInvoicePaidLike(target.status) ? STATUS_CONFIG[target.status]?.label : t("finance.partialPayment")}</strong>. {t("finance.tryAgain")}</p>
            </div>
          )}
          {!isPaidOrPartial && activeReceipts.length > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
              <p className="font-semibold mb-1">{t("finance.deleteLinkedIssueWarning")}</p>
              <ul className="list-disc list-inside space-y-0.5">
                {activeReceipts.map(r => (
                  <li key={r.id}><span className="font-medium">{r.code}</span> {t("finance.deleteLinkedIssueItem")}</li>
                ))}
              </ul>
            </div>
          )}
          {!isPaidOrPartial && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
               {t("finance.deleteIrreversible")}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>{t("finance.cancel")}</Button>
          {!isPaidOrPartial && (
            <Button
              variant="destructive"
              onClick={() =>
                deleteMutation.mutate(target.id, {
                  onSuccess: () => {
                    onClose();
                     toast({ title: t("finance.deleteInvoiceSuccess") });
                  },
                  onError: (err: any) =>
                     toast({ title: t("finance.deleteInvoiceError"), description: err.message, variant: "destructive" }),
                })
              }
              disabled={deleteMutation.isPending || loadingReceipts}
              data-testid="button-confirm-delete-invoice"
            >
              {deleteMutation.isPending ? t("finance.deleting") : t("finance.confirmDelete")}
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
  const { t } = useLanguage();

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
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ schedule: ScheduleItem; invoiceId: string } | null>(null);
  const [printTemplateOpen, setPrintTemplateOpen] = useState(false);
  const [qrInvoice, setQrInvoice] = useState<InvoiceRow | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [signProgress, setSignProgress] = useState<{ done: number; total: number } | null>(null);
  const [isExportingInvoices, setIsExportingInvoices] = useState(false);

  const { data: einvoiceCfg } = useQuery<{ signingType?: string }>({
    queryKey: ["/api/einvoice/config"],
  });
  const isUsbSigning = (einvoiceCfg?.signingType ?? "usb") === "usb";
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
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  useEffect(() => {
    if (selectedIds.size + selectedSchedules.size === 0) {
      setIsActionMenuOpen(false);
    }
  }, [selectedIds.size, selectedSchedules.size]);

  const reopenActionMenuAfterCheckboxClick = () => {
    window.setTimeout(() => setIsActionMenuOpen(true), 0);
  };

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
          results.push({ id, success: false, message: err?.message ?? t("finance.errorSending") });
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
          results.push({ id, success: false, message: err?.message ?? t("finance.errorSending") });
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
         title: vars.isPublish ? t("finance.sendSigned") : t("finance.sendDraft"),
         description: t("finance.signSuccess", { ok, total: results.length, failed: fail > 0 ? ` — ${t("finance.error")} ${fail}` : "" }),
        variant: fail > 0 ? "destructive" : "default",
      });
      setSignDialogOpen(false);
      setSignProgress(null);
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
    },
    onError: (err: any) => {
      toast({
        title: t("finance.sendElectronicInvoiceError"),
         description: err?.message ?? t("finance.noSendRetry"),
        variant: "destructive",
      });
      setSignProgress(null);
    },
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ invoiceIds, scheduleIds, status }: { invoiceIds: string[]; scheduleIds: string[]; status: string }) => {
      await Promise.all([
        ...invoiceIds.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}/status`, { status })),
        ...scheduleIds.map(id => apiRequest("PATCH", `/api/finance/invoice-schedules/${id}/status`, { status })),
      ]);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const label = invoiceStatusLabel(vars.status, t);
      const totalTargets = vars.invoiceIds.length + vars.scheduleIds.length;
      toast({
        title: t("finance.updateSuccess"),
         description: t("finance.statusChanged", { count: totalTargets, status: label }),
      });
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
    },
    onError: (err: any) => {
      toast({
        title: t("finance.updateError"),
         description: err?.message ?? t("finance.noUpdateRetry"),
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
        title: t("finance.assignClassSuccess"),
         description: t("finance.assignedClass", { count: vars.ids.length }),
      });
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
      setBulkAssignClassId("");
    },
    onError: (err: any) => {
      toast({
        title: t("finance.assignClassError"),
         description: err?.message ?? t("finance.noUpdateRetry"),
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
        title: t("finance.assignCommissionSuccess"),
         description: t("finance.assignedCommission", { count: vars.ids.length }),
      });
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
      setBulkCommissionOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: t("finance.assignCommissionError"),
         description: err?.message ?? t("finance.noUpdateRetry"),
        variant: "destructive",
      });
    },
  });

  const bulkUpdateDueDateMutation = useMutation({
    mutationFn: async ({ invoiceIds, scheduleIds, dueDate }: { invoiceIds: string[]; scheduleIds: string[]; dueDate: string }) => {
      await Promise.all([
        ...invoiceIds.map(id => apiRequest("PATCH", `/api/finance/invoices/${id}`, { dueDate })),
        ...scheduleIds.map(id => apiRequest("PATCH", `/api/finance/invoice-schedules/${id}`, { dueDate })),
      ]);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const totalTargets = vars.invoiceIds.length + vars.scheduleIds.length;
      toast({
        title: t("finance.updateSuccess"),
         description: t("finance.updatedDueDate", { count: totalTargets }),
      });
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
      setBulkDueDate(undefined);
    },
    onError: (err: any) => {
      toast({
        title: t("finance.updateError"),
         description: err?.message ?? t("finance.noUpdateRetry"),
        variant: "destructive",
      });
    },
  });

  const bulkUpdateInvoiceDateMutation = useMutation({
    mutationFn: async ({
      invoiceIds,
      scheduleIds,
      field,
      date,
      adjustCreatedAtIds = [],
      adjustCreatedAtScheduleIds = [],
    }: {
      invoiceIds: string[];
      scheduleIds: string[];
      field: "createdAt" | "paidAt";
      date: string;
      adjustCreatedAtIds?: string[];
      adjustCreatedAtScheduleIds?: string[];
    }) => {
      await Promise.all([
        ...invoiceIds.map(id => {
          const payload = field === "paidAt" && adjustCreatedAtIds.includes(id)
            ? { createdAt: date, paidAt: date }
            : { [field]: date };
          return apiRequest("PATCH", `/api/finance/invoices/${id}`, payload);
        }),
        ...scheduleIds.map(id => {
          const payload = field === "paidAt" && adjustCreatedAtScheduleIds.includes(id)
            ? { createdAt: date, paidAt: date }
            : { [field]: date };
          return apiRequest("PATCH", `/api/finance/invoice-schedules/${id}`, payload);
        }),
      ]);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
       const label = vars.field === "createdAt" ? t("finance.createdDate") : t("finance.paidDate");
      const totalTargets = vars.invoiceIds.length + vars.scheduleIds.length;
      const adjustedTargets = (vars.adjustCreatedAtIds?.length ?? 0) + (vars.adjustCreatedAtScheduleIds?.length ?? 0);
      toast({
         title: t("finance.updateSuccess"),
        description: adjustedTargets
           ? t("finance.updatedPaidAndCreated", { count: totalTargets, adjusted: adjustedTargets })
           : t("finance.updatedDate", { label, count: totalTargets }),
      });
      setSelectedIds(new Set());
      setSelectedSchedules(new Map());
      setBulkInvoiceDate(undefined);
      setBulkInvoiceDateField(null);
    },
    onError: (err: any) => {
      toast({
        title: t("finance.updateDateError"),
         description: err?.message ?? t("finance.noUpdateRetry"),
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
         toast({ title: t("finance.deleteInvoiceSuccess"), description: t("finance.filedInvoiceCount", { count: ids.length }) });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: t("finance.deleteInvoiceError"),
         description: err?.message ?? t("finance.deleteInvoiceErrorRetry"),
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

  const { invoices, total, rowPage, tabCounts, isLoading, isError: isInvoiceQueryError, deleteMutation: deleteInvoiceMutation, updateStatusMutation } = useInvoices(queryParams);
  const { summary: invoiceSummary, isLoading: isSummaryLoading } = useInvoiceSummary(queryParams);
  const previousQueryParams = getPreviousInvoicePeriodParams(queryParams);
  const { summary: previousSummary, isLoading: isPreviousSummaryLoading } = useInvoiceSummary(
    previousQueryParams ?? {},
    { enabled: !!previousQueryParams, staleTime: 30_000 },
  );
  const filterInvoiceRowsForDisplay = (rows: InvoiceRow[]) => flattenInvoiceRows(rows).filter((invoice) => {
    if (activeTab === "unpaid") {
      if (isInvoicePaidLike(invoice.status)) return false;
    }
    if (activeTab === "paid") {
      if (invoice.status !== "paid") return false;
    }
    if (activeTab === "confirmed") {
      if (invoice.status !== "confirmed") return false;
    }
    if (activeTab === "debt" && invoice.isScheduleRow && isInvoicePaidLike(invoice.status)) {
      return false;
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
      const day = getInvoiceBusinessDateKey(date);
      return (!from || day >= from) && (!to || day <= to);
    };

    if (queryParams.paidAtFrom || queryParams.paidAtTo) {
      if (!rowDateMatches(invoice.paidAt, queryParams.paidAtFrom, queryParams.paidAtTo)) return false;
    } else if (queryParams.dueDateFrom || queryParams.dueDateTo) {
      const effectiveDueDate = activeTab === "debt" && !invoice.isScheduleRow
        ? (invoice.scheduleNextDueDate || invoice.dueDate)
        : invoice.dueDate;
      if (!rowDateMatches(effectiveDueDate, queryParams.dueDateFrom, queryParams.dueDateTo)) return false;
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
  const filteredDisplayInvoices = filterInvoiceRowsForDisplay(invoices);
  const displayInvoicesByKey = new Map(filteredDisplayInvoices.map((invoice) => [
    invoice.isScheduleRow ? `schedule:${invoice.scheduleId}` : `invoice:${invoice.id}`,
    invoice,
  ]));
  const displayInvoices = rowPage
    ? rowPage
      .map(({ invoiceId, scheduleId }) => displayInvoicesByKey.get(
        scheduleId ? `schedule:${scheduleId}` : `invoice:${invoiceId}`,
      ))
      .filter((invoice): invoice is InvoiceRow => !!invoice)
    : filteredDisplayInvoices;
  const updateScheduleStatusMutation = useMutation({
    mutationFn: ({ scheduleId, status }: { scheduleId: string; status: string }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    },
  });
  const selectedDateItems: BulkInvoiceDateTarget[] = [
    ...invoices
      .filter(invoice => selectedIds.has(invoice.id))
      .map(invoice => ({
        id: invoice.id,
        kind: "invoice" as const,
        createdAt: invoice.createdAt,
        paidAt: invoice.paidAt,
      })),
    ...displayInvoices
      .filter(invoice =>
        invoice.isScheduleRow &&
        !!invoice.scheduleId &&
        selectedSchedules.has(invoice.scheduleId),
      )
      .map(invoice => ({
        id: invoice.scheduleId!,
        kind: "schedule" as const,
        createdAt: invoice.createdAt,
        paidAt: invoice.paidAt,
      })),
  ];

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
  const selectedScheduleRows = displayInvoices.filter(invoice =>
    invoice.isScheduleRow &&
    !!invoice.scheduleId &&
    selectedScheduleIdSet.has(invoice.scheduleId),
  );
  const selectedParentInvoiceIds = Array.from(new Set([
    ...Array.from(selectedIds),
    ...selectedScheduleRows
      .map(invoice => invoice.parentInvoice?.id)
      .filter((id): id is string => !!id),
  ]));
  const selectedBusinessTypes = [
    ...invoices.filter(invoice => selectedIds.has(invoice.id)).map(invoice => invoice.type),
    ...selectedScheduleRows.map(invoice => invoice.parentInvoice?.type ?? invoice.type),
  ];
  const selectedHasThu = selectedBusinessTypes.includes("Thu");
  const selectedHasChi = selectedBusinessTypes.includes("Chi");
  const allSelected = displayInvoices.length > 0 && displayInvoices.every(i =>
    i.isScheduleRow
      ? !!i.scheduleId && selectedScheduleIdSet.has(i.scheduleId)
      : selectedIds.has(i.id),
  );
  const toggleAll = (checked?: boolean) => {
    const shouldSelect = checked ?? !allSelected;
    if (!shouldSelect) {
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
  const toggleOne = (id: string, checked: boolean) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  });

  const toggleSchedule = (s: ScheduleItem, checked: boolean) => setSelectedSchedules(prev => {
    const next = new Map(prev);
    if (checked) next.set(s.id, s);
    else next.delete(s.id);
    return next;
  });

  const totalSelectedCount = selectedIds.size + selectedSchedules.size;
  const hasPaidAtFilter = !!(paidAtRange.from || paidAtRange.to);
  const hasAnyToolbarFilter = hasActiveFilters(filters) || hasPaidAtFilter;
  const summaryCards = [
    { label: t("finance.financeSummary.expectedIncome"), value: invoiceSummary?.expectedIncome ?? 0, previousValue: previousSummary?.expectedIncome, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", testId: "summary-expected-income" },
    { label: t("finance.financeSummary.actualIncome"), value: invoiceSummary?.actualIncome ?? 0, previousValue: previousSummary?.actualIncome, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", testId: "summary-actual-income" },
    { label: t("finance.financeSummary.expectedExpense"), value: invoiceSummary?.expectedExpense ?? 0, previousValue: previousSummary?.expectedExpense, icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50", testId: "summary-expected-expense" },
    { label: t("finance.financeSummary.actualExpense"), value: invoiceSummary?.actualExpense ?? 0, previousValue: previousSummary?.actualExpense, icon: CreditCard, color: "text-red-600", bg: "bg-red-50", testId: "summary-actual-expense" },
    {
      label: t("finance.financeSummary.profit"),
      value: (invoiceSummary?.actualIncome ?? 0) - (invoiceSummary?.actualExpense ?? 0),
      previousValue: (previousSummary?.actualIncome ?? 0) - (previousSummary?.actualExpense ?? 0),
      icon: TrendingUp,
      color: "text-violet-600",
      bg: "bg-violet-50",
      testId: "summary-profit",
    },
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
            {TABS.filter(tab => tab.key !== "history" && tab.key !== "print-template" && tab.key !== "debt").map(tab => {
              const count = tab.key === "all"
                ? tabCounts.all
                : tab.statusFilter === "debt"
                  ? tabCounts.debt
                  : tab.statusFilter
                    ? (tabCounts[tab.statusFilter] ?? 0)
                    : undefined;
               const isActive = activeTab === tab.key;
              return (
                <button
                   key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                   data-testid={`tab-${tab.key}`}
                  style={isActive
                     ? { backgroundColor: tab.color, borderColor: tab.color, boxShadow: `0 2px 8px ${tab.color}25` }
                     : { borderColor: `${tab.color}55`, color: tab.color }
                  }
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    isActive ? "text-white" : "bg-background hover:bg-muted/50"
                  }`}
                >
                  {t(tab.labelKey)}
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
              {TABS.filter(tab => tab.key === "history").map(tab => {
                 const isActive = historyDialogOpen;
                return (
                  <button
                    key={tab.key}
                     onClick={() => setHistoryDialogOpen(true)}
                    data-testid={`tab-${tab.key}`}
                    style={isActive
                       ? { backgroundColor: tab.color, borderColor: tab.color }
                       : { borderColor: `${tab.color}60`, color: tab.color }
                    }
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      isActive ? "text-white" : "bg-background hover:bg-violet-50"
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                );
              })}
              <button
                onClick={() => setPrintTemplateOpen(true)}
                data-testid="tab-print-template"
                style={{ borderColor: "#0891b260", color: "#0891b2" }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all bg-background hover:bg-cyan-50"
              >
                 {t("finance.tab.printTemplate")}
              </button>
            </div>
          </div>

          {/* Financial summary cards — independent from the selected status tab */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1" data-testid="invoice-summary-cards">
            {summaryCards.map(({ label, value, previousValue, icon: Icon, color, bg, testId }) => {
              const comparison = compareSummaryValue(value, previousValue);
              const isComparisonLoading = isSummaryLoading || isPreviousSummaryLoading;
              const comparisonColor = comparison?.direction === "up"
                ? "text-emerald-600"
                : comparison?.direction === "down"
                  ? "text-rose-600"
                  : "text-slate-400";
              const ComparisonIcon = comparison?.direction === "up"
                ? ArrowUp
                : comparison?.direction === "down"
                  ? ArrowDown
                  : null;

              return (
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
                <div
                  className={`mt-1 flex min-h-4 items-center gap-1 text-[10px] font-medium ${comparisonColor}`}
                   title={t("finance.financeSummary.previousPeriod")}
                >
                  {isComparisonLoading ? (
                    <span className="inline-block h-3 w-24 animate-pulse rounded bg-slate-100" />
                  ) : previousQueryParams && comparison ? (
                    <>
                      {ComparisonIcon && <ComparisonIcon className="h-3 w-3" strokeWidth={2.5} />}
                      <span>{formatComparisonPercent(comparison.percent)}</span>
                  <span className="font-normal text-slate-400">{t("finance.financeSummary.previousPeriod")}</span>
                    </>
                  ) : (
                    <span className="font-normal text-slate-400">{t("finance.financeSummary.noComparison")}</span>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Toolbar row */}
          <div className="flex items-center gap-2 flex-wrap border-t border-border/70 pt-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder={t("finance.searchInvoices")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 rounded-lg border-slate-200 bg-white shadow-sm text-sm placeholder:text-slate-400 focus-visible:ring-violet-400" data-testid="input-search" />
            </div>

            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 gap-1.5 rounded-lg border-slate-200 bg-white shadow-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 transition-all ${hasAnyToolbarFilter ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400" : ""}`} data-testid="button-filter">
                  <SlidersHorizontal className={`h-4 w-4 ${hasAnyToolbarFilter ? "text-violet-600" : "text-slate-400"}`} />
                   {t("finance.filterTitle")}
                  {hasAnyToolbarFilter && <span className="w-1.5 h-1.5 rounded-full bg-violet-600" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[720px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">{t("finance.filterTitle")}</span>
                  {hasAnyToolbarFilter && (
                    <button
                      className="text-xs text-purple-600 hover:underline"
                      onClick={() => { setFilters(DEFAULT_FILTERS); setPaidAtRange({}); }}
                    >
                       {t("finance.clearFilters")}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                     { label: t("finance.branch"),             key: "branches",       opts: filterOptions.branches.map(v => ({ value: v, label: v })),       withSearch: false },
                     { label: t("finance.type"),               key: "types",          opts: filterOptions.types.map(v => ({ value: v, label: v })),          withSearch: false },
                     { label: t("finance.category"),           key: "categories",     opts: filterOptions.categories.map(v => ({ value: v, label: v })),     withSearch: false },
                     { label: t("finance.paymentMethod"),      key: "paymentMethods", opts: filterOptions.paymentMethods.map(v => ({ value: v, label: ({ cash: t("finance.cash"), transfer: t("finance.transfer"), deposit_wallet: t("finance.depositWallet"), card: t("finance.card"), installment: t("finance.installmentPayment") } as Record<string, string>)[v] ?? v })), withSearch: false },
                     { label: t("finance.class"),              key: "classes",        opts: filterOptions.classes.map(v => ({ value: v, label: v })),        withSearch: true },
                     { label: t("finance.creator"),            key: "creators",       opts: filterOptions.creators.map(v => ({ value: v, label: v })),       withSearch: true },
                     { label: t("finance.payer"),              key: "payers",         opts: filterOptions.payers.map(v => ({ value: v, label: v })),         withSearch: true },
                     { label: t("finance.commissionStaff"),    key: "commissions",    opts: filterOptions.commissions.map(v => ({ value: v, label: v })),    withSearch: true },
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
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t("finance.paymentDateRange")}</div>
                  <DateRangePicker
                     label={t("finance.paidDate")}
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

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-lg border-slate-200 bg-white text-slate-600 shadow-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all"
              onClick={async () => {
                setIsExportingInvoices(true);
                try {
                  const allInvoices = await fetchAllInvoicesForExport(queryParams);
                  const exportRows = filterInvoiceRowsForDisplay(allInvoices);
                  if (exportRows.length === 0) {
                    toast({ title: t("finance.noInvoicesToDownload") });
                    return;
                  }
                  const tabLabel = t(TABS.find(tab => tab.key === activeTab)?.labelKey ?? "finance.tab.all");
                  await downloadInvoiceListExcel(exportRows, tabLabel, t);
                } catch {
                  toast({
                    title: t("finance.error"),
                    description: t("finance.exportInvoicesFailed"),
                    variant: "destructive",
                  });
                } finally {
                  setIsExportingInvoices(false);
                }
              }}
              disabled={isLoading || isExportingInvoices || total === 0}
              data-testid="button-download-invoices-excel"
            >
              {isExportingInvoices
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileSpreadsheet className="h-4 w-4" />}
              {isExportingInvoices ? t("finance.exportingInvoices") : t("finance.downloadInvoices")}
            </Button>

            {totalSelectedCount > 0 && (() => {
              const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
              const unpaidCount   = selectedInvs.filter(i => i.status === "unpaid" || i.status === "debt").length;
              const partialCount  = selectedInvs.filter(i => i.status === "partial").length;
              const publishedCount = selectedInvs.filter(i => i.einvoiceStatus === "published").length;
              const schedArr = Array.from(selectedSchedules.values());
              const unpaidSchedCount = schedArr.filter(s => !isInvoicePaidLike(s.status)).length;
              const publishedSchedCount = schedArr.filter(s => s.einvoiceStatus === "published").length;
              const reasons: string[] = [];
               if (unpaidCount > 0)    reasons.push(`${unpaidCount} ${t("finance.invoiceCode")} (${t("finance.tab.unpaid").toLowerCase()})`);
               if (partialCount > 0)   reasons.push(`${partialCount} ${t("finance.invoiceCode")} (${t("finance.partialPayment").toLowerCase()})`);
               if (publishedCount > 0) reasons.push(`${publishedCount} ${t("finance.invoiceCode")} (${t("finance.sentSigned").toLowerCase()})`);
               if (unpaidSchedCount > 0) reasons.push(`${unpaidSchedCount} ${t("finance.paymentSchedule")} (${t("finance.tab.unpaid").toLowerCase()})`);
               if (publishedSchedCount > 0) reasons.push(`${publishedSchedCount} ${t("finance.paymentSchedule")} (${t("finance.sentSigned").toLowerCase()})`);
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
                   <FileSignature className="h-4 w-4 text-violet-600" /> {t("finance.sendSignature")} ({totalSelectedCount})
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
                       <p className="font-medium mb-1">{t("finance.cannotSendSignature")}</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-xs">
                        {reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                       <p className="text-xs mt-1 opacity-80">{t("finance.unselectInvoices")}</p>
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
                   {t("finance.reorder")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2" data-testid="popover-col-manager">
                <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{t("finance.columnSettingsHint")}</div>
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
                        <span className="text-sm">{t(col.labelKey)}</span>
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
                 {t("finance.directEntry")}
              </Button>
            )}

            <ActionMenu
              open={isActionMenuOpen}
              onOpenChange={setIsActionMenuOpen}
              modal={false}
            >
              <ActionMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 gap-1.5 rounded-lg shadow-sm font-medium transition-all ${totalSelectedCount > 0 ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"}`}
                  data-testid="button-bulk-action"
                >
                   {t("finance.bulkAction")} {totalSelectedCount > 0 ? `(${totalSelectedCount})` : ""}
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
                {totalSelectedCount > 0 ? (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b mb-1">{t("finance.bulkActionsTitle")}</div>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        const firstId = Array.from(selectedIds)[0];
                        const firstInv = invoices.find(i => i.id === firstId) ?? null;
                        setBulkPrintInvoice(firstInv);
                        setBulkPrintTemplateId("");
                        setBulkPrintOpen(true);
                      }}
                    >
                      <FileText className="w-4 h-4 text-cyan-600" /><span>{t("finance.printTemplates")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateStatusMutation.isPending}
                      onClick={() => {
                        bulkUpdateStatusMutation.mutate({
                          invoiceIds: Array.from(selectedIds),
                          scheduleIds: Array.from(selectedSchedules.keys()),
                          status: "unpaid",
                        });
                      }}
                    >
                      <CreditCard className="w-4 h-4 text-yellow-600" /><span>{t("finance.tab.unpaid")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateStatusMutation.isPending}
                      onClick={() => {
                        bulkUpdateStatusMutation.mutate({
                          invoiceIds: Array.from(selectedIds),
                          scheduleIds: Array.from(selectedSchedules.keys()),
                          status: "paid",
                        });
                      }}
                    >
                      <CheckCircle className="w-4 h-4 text-green-600" /><span>{t("finance.tab.paid")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateStatusMutation.isPending}
                      onClick={() => {
                        bulkUpdateStatusMutation.mutate({
                          invoiceIds: Array.from(selectedIds),
                          scheduleIds: Array.from(selectedSchedules.keys()),
                          status: "confirmed",
                        });
                      }}
                    >
                      <CheckCircle className="w-4 h-4 text-blue-700" /><span>{t("finance.tab.confirmed")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkAssignCommissionMutation.isPending}
                      onClick={() => {
                        setBulkCommissionOpen(true);
                      }}
                    >
                      <Percent className="w-4 h-4 text-orange-500" /><span>{t("finance.assignCommission")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkAssignClassMutation.isPending}
                      onClick={() => {
                        setBulkAssignClassId("");
                        setBulkAssignClassOpen(true);
                      }}
                    >
                      <BookOpen className="w-4 h-4 text-blue-500" /><span>{t("finance.assignClass")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateDueDateMutation.isPending}
                      onClick={() => {
                        setBulkDueDate(undefined);
                        setBulkDueDateOpen(true);
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-purple-600" /><span>{t("finance.updateDueDate")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateInvoiceDateMutation.isPending}
                      onClick={() => {
                        setBulkInvoiceDate(undefined);
                        setBulkInvoiceDateField("createdAt");
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-blue-600" /><span>{t("finance.updateCreatedDate")}</span>
                    </ActionMenuItem>
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                      disabled={bulkUpdateInvoiceDateMutation.isPending}
                      onClick={() => {
                        setBulkInvoiceDate(undefined);
                        setBulkInvoiceDateField("paidAt");
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-green-600" /><span>{t("finance.updatePaidDate")}</span>
                    </ActionMenuItem>
                    <div className="my-1 border-t" />
                    {(() => {
                      return (
                        <>
                           {selectedHasThu && (
                            <ActionMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                              onClick={() => {
                                setBulkCollectOpen(true);
                              }}
                            >
                              <Merge className="w-4 h-4 text-purple-600" /><span>{t("finance.bulkIncome")}</span>
                            </ActionMenuItem>
                          )}
                           {selectedHasChi && (
                            <ActionMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent"
                              onClick={() => {
                                setBulkCollectOpen(true);
                              }}
                            >
                              <Merge className="w-4 h-4 text-orange-500" /><span>{t("finance.bulkExpense")}</span>
                            </ActionMenuItem>
                          )}
                        </>
                      );
                    })()}
                    <div className="my-1 border-t" />
                    <ActionMenuItem
                      className="flex items-center gap-3 py-2 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                      disabled={bulkDeleteMutation.isPending || selectedIds.size === 0}
                      onClick={() => {
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" /><span>{t("finance.deleteInvoice")}</span>
                    </ActionMenuItem>
                  </>
                ) : (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center">{t("finance.selectInvoicesFirst")}</div>
                )}
              </ActionMenuContent>
            </ActionMenu>

            {invPerm.canCreate && (
            <Button size="sm" className="h-9 gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 border-0 shadow-md shadow-violet-200 font-semibold" onClick={handleOpenCreate} data-testid="button-add-invoice">
              <Plus className="h-4 w-4" />
               {t("finance.addVoucher")}
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
                <th className="p-3 w-10 sticky top-0 left-0 z-40 bg-muted">{invPerm.canDelete && <Checkbox checked={allSelected} onCheckedChange={checked => {
                  const nextChecked = checked === true;
                  toggleAll(nextChecked);
                  if (nextChecked) reopenActionMenuAfterCheckboxClick();
                }} data-testid="checkbox-all" />}</th>
                {visibleColumns.map(col => (
                  <th key={col.key} className={`px-3 py-2.5 sticky top-0 z-30 bg-muted text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"} ${col.key === "name" ? "left-10 z-40 min-w-[160px] border-r border-border" : ""} ${col.key === "type" ? "w-[112px] min-w-[112px]" : ""}`} onClick={() => col.sortKey && handleSort(col.sortKey)}>
                    <span className={`flex items-center gap-0.5 ${col.align === "right" ? "justify-end" : ""}`}>
                      {t(col.labelKey)}
                      {col.sortKey && <SortIcon k={col.sortKey} activeSortKey={sortKey} activeSortDir={sortDir} />}
                    </span>
                  </th>
                ))}
                 <th className="px-3 py-2.5 sticky top-0 right-0 z-40 bg-muted text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-28 border-l border-border">{t("finance.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={visibleColumns.length + 2} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                    </div>
                    <p className="text-sm text-slate-400 font-medium">{t("finance.loadingData")}</p>
                  </div>
                </td></tr>
              ) : isInvoiceQueryError ? (
                <InvoiceListErrorRow
                  colSpan={visibleColumns.length + 2}
                  message={t("finance.invoiceListLoadError")}
                />
              ) : invoices.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 2} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <CreditCard className="h-6 w-6 text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-400 font-medium">{t("finance.noInvoiceData")}</p>
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
                          onCheckedChange={checked => {
                            const nextChecked = checked === true;
                            if (isScheduleRow && schedule) {
                              toggleSchedule(schedule, nextChecked);
                              if (nextChecked) reopenActionMenuAfterCheckboxClick();
                            }
                            else {
                              toggleOne(inv.id, nextChecked);
                              if (nextChecked) reopenActionMenuAfterCheckboxClick();
                            }
                          }}
                          data-testid={`checkbox-${rowKey}`}
                        />
                      )}
                    </td>
                   {visibleColumns.map(col => renderInvoiceCell(
                      col.key,
                      inv,
                       t,
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
                               {t("finance.view")}
                            </ActionMenuItem>
                            {invPerm.canEdit && (
                              <ActionMenuItem
                                className="gap-2 cursor-pointer"
                                data-testid={`menuitem-edit-${inv.id}`}
                                onClick={() => handleOpenEdit(parentInvoice.id)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                 {t("finance.edit")}
                              </ActionMenuItem>
                            )}
                            {invPerm.canEdit && isScheduleRow && schedule && !isInvoicePaidLike(schedule.status) && (
                              <ActionMenuItem
                                className="gap-2 cursor-pointer"
                                data-testid={`menuitem-adjust-schedule-${schedule.id}`}
                                onClick={() => setAdjustmentTarget({ schedule, invoiceId: parentInvoice.id })}
                              >
                                <Percent className="h-3.5 w-3.5 text-purple-600" />
                                 {t("finance.promotionSurcharge")}
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
                                   {t("finance.qrCode")}
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
                                   {t("finance.previewPdf")}
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
                                   {t("finance.downloadInvoicePdf")}
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
                                           {t("finance.delete")}
                                        </ActionMenuItem>
                                      </div>
                                    </TooltipTrigger>
                                    {(inv.scheduleCount ?? 0) > 1 && (
                                      <TooltipContent side="left" className="max-w-[220px] text-center">
                                         <p>{t("finance.invoiceHasSchedules")}</p>
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
                       visibleColumns={visibleColumns.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
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
            <span>{total} {t("finance.items")}</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); }}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{t("finance.perPage", { count: n })}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
            <span className="px-2 text-xs">{t("finance.pageOf", { page, total: Math.max(1, Math.ceil(total / pageSize)) })}</span>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>›</Button>
            <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(Math.ceil(total / pageSize))}>»</Button>
          </div>
        </div>
        </div>
        ) : activeTab === "debt" ? (
          /* ===== DEBT / CÔNG NỢ GROUPED CARD VIEW ===== */
          (() => {
            const todayKey = getInvoiceBusinessDateKey(new Date());
            const dayNumber = (key: string) => {
              const [year, month, day] = key.split("-").map(Number);
              return Date.UTC(year, month - 1, day) / 86_400_000;
            };
            const getDebtDueDate = (invoice: InvoiceRow) =>
              invoice.scheduleNextDueDate || invoice.dueDate;
            const getDaysUntilDue = (invoice: InvoiceRow) => {
              const dueDate = getDebtDueDate(invoice);
              if (!dueDate) return null;
              const dueKey = getInvoiceBusinessDateKey(dueDate);
              return dueKey ? dayNumber(dueKey) - dayNumber(todayKey) : null;
            };
            const filteredDebtInvoices = invoices.filter(invoice => {
              if (debtCondition === "all") return true;
              const days = getDaysUntilDue(invoice);
              if (days === null) return debtCondition === "no-due-date";
              if (debtCondition === "overdue") return days < 0;
              if (debtCondition === "today") return days === 0;
              if (debtCondition === "soon") return days >= 1 && days <= 7;
              if (debtCondition === "upcoming") return days > 7;
              return false;
            });
            const totalDebtAll = filteredDebtInvoices.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
            const debtConditionCards: { key: DebtCondition | "total"; label: string; value: string | number; activeClass: string; textClass: string }[] = [
              { key: "overdue", label: t("finance.overdue"), value: invoices.filter(invoice => (getDaysUntilDue(invoice) ?? 0) < 0).length, activeClass: "border-red-300 bg-red-50", textClass: "text-red-600" },
              { key: "today", label: t("finance.dueToday"), value: invoices.filter(invoice => getDaysUntilDue(invoice) === 0).length, activeClass: "border-orange-300 bg-orange-50", textClass: "text-orange-600" },
              { key: "soon", label: t("finance.debtStatusSoon"), value: invoices.filter(invoice => {
                const days = getDaysUntilDue(invoice);
                return days !== null && days >= 1 && days <= 7;
              }).length, activeClass: "border-amber-300 bg-amber-50", textClass: "text-amber-600" },
              { key: "upcoming", label: t("finance.notDue"), value: invoices.filter(invoice => (getDaysUntilDue(invoice) ?? 0) > 7).length, activeClass: "border-blue-300 bg-blue-50", textClass: "text-blue-600" },
              { key: "no-due-date", label: t("finance.noDueDate"), value: invoices.filter(invoice => getDaysUntilDue(invoice) === null).length, activeClass: "border-slate-300 bg-slate-100", textClass: "text-slate-600" },
              { key: "total", label: t("finance.debtTotal"), value: fmtMoney(totalDebtAll), activeClass: "border-rose-300 bg-rose-50", textClass: "text-rose-600" },
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
                      placeholder={t("finance.debtSearchPlaceholder")}
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
                         {t("finance.filterTitle")}
                        {hasActiveFilters(filters) && <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[520px] p-4">
                      <div className="mb-3 flex items-center justify-between">
                         <span className="text-sm font-semibold">{t("finance.debtFilter")}</span>
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
                             {t("finance.clearFilters")}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { label: t("finance.branch"), key: "branches", opts: filterOptions.branches.map(v => ({ value: v, label: v })), withSearch: false },
                          { label: t("finance.category"), key: "categories", opts: filterOptions.categories.map(v => ({ value: v, label: v })), withSearch: false },
                          { label: t("finance.class"), key: "classes", opts: filterOptions.classes.map(v => ({ value: v, label: v })), withSearch: true },
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
                       <SelectValue placeholder={t("finance.debtCondition")} />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="all">{t("finance.allDebtStatus")}</SelectItem>
                       <SelectItem value="overdue">{t("finance.overdue")}</SelectItem>
                       <SelectItem value="today">{t("finance.dueToday")}</SelectItem>
                       <SelectItem value="soon">{t("finance.debtStatusSoon")}</SelectItem>
                       <SelectItem value="upcoming">{t("finance.notDue")}</SelectItem>
                       <SelectItem value="no-due-date">{t("finance.noDueDatePayment")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    label={t("finance.dueDateShort")}
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
                       {t("finance.clearFilterShort")}
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
                    <p className="text-sm">{t("finance.debtLoading")}</p>
                  </div>
                ) : groups.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <CreditCard className="h-10 w-10 opacity-20" />
                    <p className="text-sm">{t("finance.noDebt")}</p>
                  </div>
                ) : (
                  <>
                    {groups.map(group => {
                      const totalDebt = group.invoices.reduce((s, i) => s + parseNum(i.remainingAmount), 0);
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
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t("finance.debtTotal")}</p>
                              <p className="text-red-600 font-bold text-base">{fmtMoney(totalDebt)}</p>
                            </div>
                          </div>
                          <table className="w-full table-fixed text-sm">
                            <colgroup>
                              <col className="w-[18%]" />
                              <col className="w-[15%]" />
                              <col className="w-[14%]" />
                              <col className="w-[14%]" />
                              <col className="w-[13%]" />
                              <col className="w-[14%]" />
                              <col className="w-[12%]" />
                            </colgroup>
                            <thead>
                              <tr className="bg-slate-50/70 border-b border-slate-100">
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.transactionCode")}</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.category")}</th>
                                <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.total")}</th>
                                <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.debtRemaining")}</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.dueDateShort")}</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.status")}</th>
                                <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("finance.debtCondition")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.invoices.map(inv =>
                                inv.hasSchedules
                                  ? (
                                    <DebtScheduleLoader
                                      key={inv.id}
                                      invoice={inv}
                                      dueDateFrom={dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined}
                                      dueDateTo={dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined}
                                    />
                                  )
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
                  <span>{t("finance.debtCount", { count: total })}</span>
                  <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                       {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{t("finance.perPage", { count: n })}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
                  <span className="px-2 text-xs">{t("finance.pageOf", { page, total: Math.max(1, Math.ceil(total / pageSize)) })}</span>
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
        title={t("finance.invoiceHistory")}
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

      {adjustmentTarget && (
        <ScheduleAdjustmentDialog
          schedule={adjustmentTarget.schedule}
          invoiceId={adjustmentTarget.invoiceId}
          onClose={() => setAdjustmentTarget(null)}
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
        const isPaid = isInvoicePaidLike(s.status);
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
           dueDate: s.dueDate ?? invAny.dueDate ?? null,
           paidAt: s.paidAt ? new Date(s.paidAt).toISOString() : null,
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
                packageName: `${invAny.category ?? inv.name ?? t("finance.tuition")} — ${s.label}`,
                name: `${invAny.category ?? inv.name ?? t("finance.tuition")} — ${s.label}`,
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
           sourceInvoiceId: inv.id,
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
            invoiceIds: Array.from(selectedIds),
            scheduleIds: Array.from(selectedSchedules.keys()),
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
        selectedItems={selectedDateItems}
        isPending={bulkUpdateInvoiceDateMutation.isPending}
        onConfirm={(date, adjustCreatedAt) => {
          if (!bulkInvoiceDateField) return;
          const dateText = format(date, "yyyy-MM-dd");
          const invoiceItems = selectedDateItems.filter(item => item.kind === "invoice");
          const scheduleItems = selectedDateItems.filter(item => item.kind === "schedule");
          const adjustCreatedAtIds = adjustCreatedAt && bulkInvoiceDateField === "paidAt"
            ? invoiceItems
                .filter(item => item.createdAt && dateText < dateOnly(item.createdAt))
                .map(item => item.id)
            : [];
          const adjustCreatedAtScheduleIds = adjustCreatedAt && bulkInvoiceDateField === "paidAt"
            ? scheduleItems
                .filter(item => item.createdAt && dateText < dateOnly(item.createdAt))
                .map(item => item.id)
            : [];
          bulkUpdateInvoiceDateMutation.mutate({
            invoiceIds: invoiceItems.map(item => item.id),
            scheduleIds: scheduleItems.map(item => item.id),
            field: bulkInvoiceDateField,
            date: dateText,
            adjustCreatedAtIds,
            adjustCreatedAtScheduleIds,
          });
        }}
      />

      {/* Bulk delete dialog */}
      {bulkDeleteOpen && (() => {
        const selectedInvoices = invoices.filter(inv => selectedIds.has(inv.id));
        const ineligible = selectedInvoices.filter(inv => isInvoicePaidLike(inv.status) || inv.status === "partial");
        const eligible = selectedInvoices.filter(inv => !isInvoicePaidLike(inv.status) && inv.status !== "partial");
        const eligibleWithSchedules = eligible.filter(inv => inv.hasSchedules && (inv.scheduleCount ?? 0) > 1);
        return (
          <Dialog open onOpenChange={(v) => { if (!bulkDeleteMutation.isPending) setBulkDeleteOpen(v); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-4 w-4" /> {t("finance.bulkDeleteTitle")}
                </DialogTitle>
              </DialogHeader>
              <div className="py-3 space-y-3">
                <p className="text-sm">
                  {t("finance.confirmBulkDelete", {
                    count: eligible.length,
                    selected: eligible.length !== selectedInvoices.length ? ` (${t("finance.selectedCount", { count: selectedInvoices.length })})` : "",
                  })}
                </p>

                {ineligible.length > 0 && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 space-y-1">
                    <p className="font-semibold">{t("finance.paidChildInvoicesCannotDelete")}</p>
                    <p>{t("finance.ineligibleInvoices", { count: ineligible.length })}{" "}
                      <span className="font-medium">{ineligible.map(i => i.code || i.id).join(", ")}</span>
                    </p>
                    <p className="mt-0.5">{t("finance.resetPaidSchedules")}</p>
                  </div>
                )}

                {eligibleWithSchedules.length > 0 && (
                  <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 space-y-1">
                    <p className="font-semibold">{t("finance.selectedInvoicesHaveSchedules")}</p>
                    <p>{t("finance.invoicesWithSchedules", { count: eligibleWithSchedules.length })}{" "}
                      <span className="font-medium">{eligibleWithSchedules.map(i => i.code || i.id).join(", ")}</span>
                    </p>
                    <p>{t("finance.deleteChildrenWithParent")}</p>
                  </div>
                )}

                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  {t("finance.bulkDeleteWarning")}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteMutation.isPending}>{t("finance.cancel")}</Button>
                <Button
                  variant="destructive"
                  disabled={bulkDeleteMutation.isPending || eligible.length === 0}
                  onClick={() => bulkDeleteMutation.mutate(eligible.map(i => i.id))}
                >
                  {bulkDeleteMutation.isPending
                    ? t("finance.deleting")
                    : eligible.length === 0
                      ? t("finance.noEligibleInvoices")
                      : t("finance.confirmDeleteCount", { count: eligible.length })}
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
          bulkAssignCommissionMutation.mutate({ ids: selectedParentInvoiceIds, commissions });
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
          bulkAssignClassMutation.mutate({ ids: selectedParentInvoiceIds, classId });
          setBulkAssignClassOpen(false);
        }}
      />

      {/* Bulk Collect (Gộp phiếu thu/chi) */}
      {bulkCollectOpen && (() => {
        const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
        const invoiceType: "Thu" | "Chi" = selectedHasThu ? "Thu" : "Chi";
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
              {t("finance.signDialogTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              {t("finance.signDialogDescription", { count: selectedIds.size })}
            </p>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs leading-relaxed">
              <div className="font-semibold mb-1">{t("finance.notice")}</div>
              {t("finance.signWarning")}
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <Checkbox
                checked={signConfirmed}
                onCheckedChange={(v) => setSignConfirmed(!!v)}
                data-testid="checkbox-sign-confirm"
                className="mt-0.5"
              />
              <span className="text-sm">
                {t("finance.signAcknowledgement")}
              </span>
            </label>

            <div className="border-t pt-3 space-y-1.5 text-xs italic text-muted-foreground">
              <div className="font-medium not-italic text-foreground mb-1">{t("finance.explanation")}</div>
              <div>
                <span className="not-italic font-semibold text-emerald-700">{t("finance.agree")}</span>{" "}
                {t("finance.signImmediately")}
              </div>
              <div>
                <span className="not-italic font-semibold text-amber-700">{t("finance.sendDraftLabel")}</span>{" "}
                {t("finance.draftExplanation")}
              </div>
              <div>
                <span className="not-italic font-semibold text-gray-700">{t("finance.cancelLabel")}</span>{" "}
                {t("finance.cancelExplanation")}
              </div>
            </div>
          </div>

          {signProgress && (
            <div className="pt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t("finance.sendingToProvider")}</span>
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
              {t("finance.cancelLabel").replace(":", "")}
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={!signConfirmed || signMutation.isPending}
              onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), scheduleIds: Array.from(selectedSchedules.keys()), isPublish: false })}
              data-testid="button-sign-draft"
            >
              {t("finance.sendDraftLabel").replace(":", "")}
            </Button>
            {!isUsbSigning && (
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!signConfirmed || signMutation.isPending}
                onClick={() => signMutation.mutate({ invoiceIds: Array.from(selectedIds), scheduleIds: Array.from(selectedSchedules.keys()), isPublish: true })}
                data-testid="button-sign-confirm"
              >
                {signMutation.isPending ? t("finance.processing") : t("finance.agree").replace(":", "")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
