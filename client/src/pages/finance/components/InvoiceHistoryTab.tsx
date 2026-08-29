import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, History, Plus, CreditCard, CheckCircle2, Eye } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { fmtMoney } from "@/types/invoice-types";
import { Pencil, Trash2, XCircle } from "lucide-react";
import { HistoryPaginationFooter } from "@/components/common/HistoryPaginationFooter";

/* ── Types ─────────────────────────────────────────────── */
interface HistoryEvent {
  ev_type: "created" | "paid" | "schedule_paid" | "Sửa hoá đơn" | "Xoá hoá đơn" | "Huỷ thanh toán hoá đơn";
  ev_time: string;
  invoice_id: string;
  invoice_code: string;
  invoice_type: "Thu" | "Chi";
  subject_name: string | null;
  grand_total: string;
  amount: string;
  payment_method: string | null;
  location_name: string | null;
  created_by_name: string | null;
  schedule_label: string | null;
  schedule_code: string | null;
  settle_code: string | null;
  old_content_json: string | null;
  new_content_json: string | null;
}

interface HistoryResponse {
  events: HistoryEvent[];
  total: number;
}

/* ── Helpers ────────────────────────────────────────────── */
// Strip 'Z' so the browser treats the timestamp as local time (UTC+7 Vietnam)
// instead of converting from UTC which would shift 7 hours — same pattern used app-wide
function stripUtc(iso: string) {
  return iso.replace("Z", "").replace("+00:00", "");
}

function fmtDateTime(iso: string) {
  try {
    return format(new Date(stripUtc(iso)), "HH:mm — dd/MM/yyyy", { locale: vi });
  } catch { return iso; }
}

function fmtDateGroup(iso: string) {
  try {
    return format(new Date(stripUtc(iso)), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch { return iso; }
}

function dateKey(iso: string) {
  try { return stripUtc(iso).slice(0, 10); }
  catch { return iso; }
}

type EvCfg = { label: string; icon: React.ReactNode; bg: string; border: string; textColor: string };

const EV_CONFIG: Record<HistoryEvent["ev_type"], EvCfg> = {
  created: {
    label: "Tạo mới",
    icon: <Plus className="h-3 w-3" />,
    bg: "bg-violet-50",
    border: "border-violet-200",
    textColor: "text-violet-700",
  },
  paid: {
    label: "Đã thanh toán",
    icon: <CheckCircle2 className="h-3 w-3" />,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    textColor: "text-emerald-700",
  },
  schedule_paid: {
    label: "Thu đợt",
    icon: <CreditCard className="h-3 w-3" />,
    bg: "bg-sky-50",
    border: "border-sky-200",
    textColor: "text-sky-700",
  },
  "Sửa hoá đơn": {
    label: "Sửa hoá đơn",
    icon: <Pencil className="h-3 w-3" />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    textColor: "text-amber-700",
  },
  "Xoá hoá đơn": {
    label: "Xoá hoá đơn",
    icon: <Trash2 className="h-3 w-3" />,
    bg: "bg-red-50",
    border: "border-red-200",
    textColor: "text-red-700",
  },
  "Huỷ thanh toán hoá đơn": {
    label: "Huỷ thanh toán",
    icon: <XCircle className="h-3 w-3" />,
    bg: "bg-orange-50",
    border: "border-orange-200",
    textColor: "text-orange-700",
  },
};

function payMethodLabel(m: string | null | undefined) {
  if (!m) return null;
  if (m === "cash")     return "Tiền mặt";
  if (m === "transfer") return "Chuyển khoản";
  return m;
}

/* ── Field labels for diff display ─────────────────────── */
const FIELD_LABELS: Record<string, string> = {
  type:            "Loại phiếu",
  subjectName:     "Đối tượng",
  category:        "Danh mục",
  status:          "Trạng thái",
  grandTotal:      "Tổng tiền",
  paidAmount:      "Đã thanh toán",
  remainingAmount: "Còn lại",
  paymentMethod:   "Hình thức TT",
  dueDate:         "Hạn thanh toán",
  createdAt:       "Ngày tạo",
  paidAt:          "Ngày thanh toán",
  note:            "Ghi chú",
  description:     "Mô tả",
  locationId:      "Cơ sở (ID)",
  locationName:    "Cơ sở",
  classId:         "Lớp học (ID)",
  className:       "Lớp học",
};

const STATUS_LABELS: Record<string, string> = {
  unpaid:  "Chưa thanh toán",
  partial: "Thanh toán một phần",
  paid:    "Đã thanh toán",
};

const MONEY_FIELDS = new Set(["grandTotal", "paidAmount", "remainingAmount"]);
const SKIP_IF_SIBLING: Record<string, string> = {
  locationId: "locationName",
  classId:    "className",
};

function formatFieldValue(key: string, val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (key === "status") return STATUS_LABELS[String(val)] ?? String(val);
  if (MONEY_FIELDS.has(key)) {
    const n = parseFloat(String(val));
    return isNaN(n) ? String(val) : `${fmtMoney(n)} đ`;
  }
  if (key === "paymentMethod") return payMethodLabel(String(val)) ?? String(val);
  if (key === "type") return String(val) === "Thu" ? "Thu (Phiếu thu)" : "Chi (Phiếu chi)";
  if (["dueDate", "createdAt", "paidAt"].includes(key)) {
    try { return format(new Date(String(val)), "dd/MM/yyyy"); } catch { return String(val); }
  }
  return String(val);
}

/* ── Detail dialog ──────────────────────────────────────── */
function EventDetailDialog({
  event,
  onClose,
}: {
  event: HistoryEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;
  const cfg = EV_CONFIG[event.ev_type];

  const oldObj: Record<string, any> = (() => {
    try { return event.old_content_json ? JSON.parse(event.old_content_json) : {}; }
    catch { return {}; }
  })();
  const newObj: Record<string, any> = (() => {
    try { return event.new_content_json ? JSON.parse(event.new_content_json) : {}; }
    catch { return {}; }
  })();

  // Build diff rows — only keys present in new or old, skip sibling IDs when name is available
  const isAuditEvent = ["Sửa hoá đơn", "Huỷ thanh toán hoá đơn", "Xoá hoá đơn"].includes(event.ev_type);

  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
  const diffRows = allKeys
    .filter(k => {
      // If sibling (e.g. locationName) exists, skip locationId
      const sibling = SKIP_IF_SIBLING[k];
      if (sibling && (allKeys.includes(sibling))) return false;
      return true;
    })
    .filter(k => {
      // For Sửa/Huỷ: only show changed fields (old ≠ new)
      if (event.ev_type === "Xoá hoá đơn") return true; // show all snapshot
      const ov = oldObj[k] != null ? String(oldObj[k]) : "";
      const nv = newObj[k] != null ? String(newObj[k]) : "";
      return ov !== nv;
    });

  return (
    <Dialog open={!!event} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.textColor}`}>
              {cfg.icon}
              {cfg.label}
            </span>
            <span className="font-bold text-slate-700">{event.invoice_code}</span>
            <span className="text-slate-400 font-normal">{fmtDateTime(event.ev_time)}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Meta info */}
        <div className="text-xs text-slate-500 space-y-0.5 -mt-1">
          {event.subject_name && <div><span className="font-medium">Đối tượng:</span> {event.subject_name}</div>}
          {event.created_by_name && <div><span className="font-medium">Thực hiện bởi:</span> {event.created_by_name}</div>}
          {event.location_name && <div><span className="font-medium">Cơ sở:</span> {event.location_name}</div>}
        </div>

        {/* Diff table */}
        {isAuditEvent && diffRows.length > 0 ? (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {event.ev_type === "Xoá hoá đơn" ? "Thông tin hoá đơn đã xoá" : "Các trường bị thay đổi"}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 pr-3 font-semibold text-slate-500 w-[30%]">Trường</th>
                  {event.ev_type !== "Xoá hoá đơn" && (
                    <th className="text-left py-1.5 pr-3 font-semibold text-red-400 w-[35%]">Trước</th>
                  )}
                  <th className="text-left py-1.5 font-semibold text-emerald-600">
                    {event.ev_type === "Xoá hoá đơn" ? "Giá trị" : "Sau"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map(k => {
                  const label = FIELD_LABELS[k] ?? k;
                  const oldVal = formatFieldValue(k, oldObj[k]);
                  const newVal = formatFieldValue(k, newObj[k]);
                  return (
                    <tr key={k} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-600 align-top">{label}</td>
                      {event.ev_type !== "Xoá hoá đơn" && (
                        <td className="py-2 pr-3 align-top">
                          <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through decoration-red-300">
                            {oldVal}
                          </span>
                        </td>
                      )}
                      <td className="py-2 align-top">
                        <span className={`px-1.5 py-0.5 rounded ${
                          event.ev_type === "Xoá hoá đơn"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {event.ev_type === "Xoá hoá đơn" ? oldVal : newVal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : isAuditEvent && diffRows.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2 italic">
            Không có chi tiết thay đổi được ghi lại cho sự kiện này.
          </p>
        ) : (
          /* Non-audit events: show basic event summary */
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Tổng tiền hoá đơn</span>
              <span className="font-semibold text-slate-700">
                {fmtMoney(parseFloat(event.grand_total) || 0)} đ
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Số tiền nghiệp vụ</span>
              <span className={`font-semibold ${event.invoice_type === "Thu" ? "text-emerald-600" : "text-red-600"}`}>
                {event.invoice_type === "Thu" ? "+" : "-"}{fmtMoney(parseFloat(event.amount) || 0)} đ
              </span>
            </div>
            {payMethodLabel(event.payment_method) && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Hình thức TT</span>
                <span className="text-slate-700">{payMethodLabel(event.payment_method)}</span>
              </div>
            )}
            {event.ev_type === "schedule_paid" && event.schedule_label && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Đợt thanh toán</span>
                <span className="text-slate-700">{event.schedule_label}</span>
              </div>
            )}
            {event.settle_code && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Mã chứng từ</span>
                <span className="font-mono text-slate-600">{event.settle_code}</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Date range quick-filter ────────────────────────────── */
type QuickRange = "all" | "today" | "7d" | "30d" | "thismonth";

function quickRangeDates(r: QuickRange): { from?: string; to?: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (r === "today") { const s = fmt(today); return { from: s, to: s }; }
  if (r === "7d") { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: fmt(f), to: fmt(today) }; }
  if (r === "30d") { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: fmt(f), to: fmt(today) }; }
  if (r === "thismonth") { const f = new Date(today.getFullYear(), today.getMonth(), 1); const t = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { from: fmt(f), to: fmt(t) }; }
  return {};
}

/* ── Main component ─────────────────────────────────────── */
export function InvoiceHistoryTab({
  locationOptions,
}: {
  locationOptions: { value: string; label: string }[];
}) {
  const [quickRange, setQuickRange] = useState<QuickRange>("7d");
  const [locationId, setLocationId] = useState<string>("__all__");
  const [page, setPage] = useState(1);
  const [detailEvent, setDetailEvent] = useState<HistoryEvent | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const { from, to } = quickRangeDates(quickRange);

  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to)   params.set("dateTo",   to);
  if (locationId !== "__all__") params.set("locationId", locationId);
  params.set("limit",  String(pageSize));
  params.set("offset", String((page - 1) * pageSize));

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/finance/invoices/history", from, to, locationId, page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices/history?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];
  const total  = data?.total  ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Group events by date
  const groups = events.reduce<Map<string, HistoryEvent[]>>((map, ev) => {
    const k = dateKey(ev.ev_time);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(ev);
    return map;
  }, new Map());

  const QUICK_RANGES: { label: string; value: QuickRange }[] = [
    { label: "Toàn thời gian", value: "all" },
    { label: "Hôm nay",        value: "today" },
    { label: "7 ngày",         value: "7d" },
    { label: "30 ngày",        value: "30d" },
    { label: "Tháng này",      value: "thismonth" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-5 pt-3">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Quick range pills */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {QUICK_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => { setQuickRange(r.value); setPage(1); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                quickRange === r.value
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Location filter */}
        {locationOptions.length > 0 && (
          <Select value={locationId} onValueChange={v => { setLocationId(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[180px] text-xs border-slate-200 bg-white">
              <SelectValue placeholder="Tất cả cơ sở" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tất cả cơ sở</SelectItem>
              {locationOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="h-8 w-[100px] text-xs border-slate-200 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 / trang</SelectItem>
            <SelectItem value="100">100 / trang</SelectItem>
            <SelectItem value="200">200 / trang</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5" />
          {from && to ? `${format(new Date(from + "T00:00"), "dd/MM/yyyy")} – ${format(new Date(to + "T00:00"), "dd/MM/yyyy")}` : "Toàn thời gian"}
          <span className="ml-2 font-medium text-slate-600">{total} sự kiện</span>
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            <p className="text-sm">Đang tải lịch sử...</p>
          </div>
        ) : groups.size === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <History className="h-12 w-12 opacity-15" />
            <p className="text-sm">Không có sự kiện nào trong khoảng thời gian này</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([dateKey_, evs]) => (
              <div key={dateKey_}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-slate-50/90 py-1 px-2 rounded-lg backdrop-blur-sm z-10">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {fmtDateGroup(evs[0].ev_time)}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Events for this date */}
                <div className="space-y-1.5">
                  {evs.map((ev, idx) => {
                    const cfg = EV_CONFIG[ev.ev_type];
                    const amount = parseFloat(ev.amount) || 0;
                    const isIncome = ev.invoice_type === "Thu";
                    return (
                      <div
                        key={`${ev.invoice_id}-${ev.ev_type}-${idx}`}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group"
                      >
                        {/* Event type dot */}
                        <div className={`mt-0.5 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full border ${cfg.bg} ${cfg.border}`}>
                          <span className={cfg.textColor}>{cfg.icon}</span>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Event type badge */}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.textColor}`}>
                              {cfg.label}
                              {ev.ev_type === "schedule_paid" && ev.schedule_label && ` — ${ev.schedule_label}`}
                            </span>

                            {/* Invoice type badge */}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              isIncome
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}>
                              {isIncome ? "Thu" : "Chi"}
                            </span>

                            {/* Invoice code */}
                            <span className="text-xs font-bold text-slate-700">
                              {ev.invoice_code}
                              {ev.ev_type === "schedule_paid" && ev.schedule_code && (
                                <span className="font-normal text-slate-400"> / {ev.schedule_code}</span>
                              )}
                            </span>

                            {/* Settle code */}
                            {ev.settle_code && (
                              <span className="text-[10px] text-slate-400 font-mono">{ev.settle_code}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {/* Subject */}
                            {ev.subject_name && (
                              <span className="text-xs text-slate-600 truncate max-w-[180px]">{ev.subject_name}</span>
                            )}
                            {/* Location */}
                            {ev.location_name && (
                              <span className="text-[11px] text-slate-400">{ev.location_name}</span>
                            )}
                            {/* Created by */}
                            {ev.created_by_name && (
                              <span className="text-[11px] text-slate-400">bởi {ev.created_by_name}</span>
                            )}
                            {/* Payment method */}
                            {ev.ev_type !== "created" && payMethodLabel(ev.payment_method) && (
                              <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                {payMethodLabel(ev.payment_method)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: amount + time + eye */}
                        <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                          <p className={`text-sm font-bold ${isIncome ? "text-emerald-600" : "text-red-600"}`}>
                            {isIncome ? "+" : "-"}{fmtMoney(amount)} đ
                          </p>
                          <p className="text-[10px] text-slate-400">{fmtDateTime(ev.ev_time)}</p>
                          {/* Eye icon — always visible on audit events, hover on others */}
                          <button
                            onClick={() => setDetailEvent(ev)}
                            className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full transition-all
                              ${["Sửa hoá đơn","Xoá hoá đơn","Huỷ thanh toán hoá đơn"].includes(ev.ev_type)
                                ? "bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-700"
                                : "opacity-0 group-hover:opacity-100 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                              }`}
                            title="Xem chi tiết"
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────── */}
      <HistoryPaginationFooter
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={value => { setPageSize(value); setPage(1); }}
        legend={<>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Thu</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Chi</span>
        </>}
      />

      {/* ── Detail dialog ────────────────────────────────────── */}
      <EventDetailDialog event={detailEvent} onClose={() => setDetailEvent(null)} />
    </div>
  );
}
