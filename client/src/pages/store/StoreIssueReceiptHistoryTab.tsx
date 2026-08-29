import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import {
  CalendarIcon, History, PackageMinus, CheckCircle2, XCircle,
  Eye, Pencil, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { HistoryPaginationFooter } from "@/components/common/HistoryPaginationFooter";

/* ── Types ─────────────────────────────────────────────── */
type EvType = "created" | "completed" | "cancelled" | "edited" | "deleted";

interface IssueHistoryEvent {
  ev_type: EvType;
  ev_time: string;
  receipt_id: string;
  receipt_code: string;
  receipt_name: string;
  status: string;
  total_amount: string;
  note: string | null;
  warehouse_name: string | null;
  supplier_name: string | null;   // recipient_name mapped here
  location_name: string | null;
  created_by_name: string | null;
  old_content_json: string | null;
  new_content_json: string | null;
}

interface IssueHistoryResponse {
  events: IssueHistoryEvent[];
  total: number;
}

interface IssueReceiptDetail {
  id: string;
  code: string;
  name: string;
  status: string;
  totalAmount?: string;
  recipientName?: string;
  items?: Array<{
    productCode: string;
    productName: string;
    quantity: number;
    salePrice?: string;
    unitName?: string;
  }>;
}

/* ── Helpers ────────────────────────────────────────────── */
function stripUtc(iso: string) {
  return iso.replace("Z", "").replace("+00:00", "");
}
function fmtDateTime(iso: string) {
  try { return format(new Date(stripUtc(iso)), "HH:mm — dd/MM/yyyy", { locale: vi }); }
  catch { return iso; }
}
function fmtDateGroup(iso: string) {
  try { return format(new Date(stripUtc(iso)), "EEEE, dd/MM/yyyy", { locale: vi }); }
  catch { return iso; }
}
function dateKey(iso: string) {
  try { return stripUtc(iso).slice(0, 10); }
  catch { return iso; }
}
function fmtVND(val: string | number | null | undefined) {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "—" : n.toLocaleString("vi-VN") + " đ";
}

/* ── Event config ───────────────────────────────────────── */
type EvCfg = { label: string; icon: React.ReactNode; bg: string; border: string; textColor: string };

const EV_CONFIG: Record<EvType, EvCfg> = {
  created: {
    label: "Tạo phiếu",
    icon: <PackageMinus className="h-3 w-3" />,
    bg: "bg-sky-50", border: "border-sky-200", textColor: "text-sky-700",
  },
  completed: {
    label: "Đã xuất kho",
    icon: <CheckCircle2 className="h-3 w-3" />,
    bg: "bg-emerald-50", border: "border-emerald-200", textColor: "text-emerald-700",
  },
  cancelled: {
    label: "Đã huỷ",
    icon: <XCircle className="h-3 w-3" />,
    bg: "bg-red-50", border: "border-red-200", textColor: "text-red-700",
  },
  edited: {
    label: "Chỉnh sửa",
    icon: <Pencil className="h-3 w-3" />,
    bg: "bg-amber-50", border: "border-amber-200", textColor: "text-amber-700",
  },
  deleted: {
    label: "Đã xoá",
    icon: <Trash2 className="h-3 w-3" />,
    bg: "bg-slate-100", border: "border-slate-300", textColor: "text-slate-600",
  },
};

/* ── Diff table ─────────────────────────────────────────── */
function DiffTable({ oldContent, newContent }: { oldContent: Record<string, any>; newContent: Record<string, any> }) {
  const keys = Object.keys(oldContent);
  if (!keys.length) return <p className="text-xs text-slate-400 italic">Không có thay đổi được ghi nhận.</p>;
  return (
    <table className="w-full text-xs mt-2">
      <thead>
        <tr className="border-b border-slate-100">
          <th className="text-left py-1.5 pr-3 font-semibold text-slate-500 w-[30%]">Trường</th>
          <th className="text-left py-1.5 pr-3 font-semibold text-red-500 w-[35%]">Trước</th>
          <th className="text-left py-1.5 font-semibold text-emerald-600 w-[35%]">Sau</th>
        </tr>
      </thead>
      <tbody>
        {keys.map(k => (
          <tr key={k} className="border-b border-slate-50">
            <td className="py-1.5 pr-3 font-medium text-slate-600">{k}</td>
            <td className="py-1.5 pr-3 text-red-600 line-through opacity-80">
              {oldContent[k] == null ? <span className="no-underline italic text-slate-400">—</span> : String(oldContent[k])}
            </td>
            <td className="py-1.5 text-emerald-700 font-medium">
              {newContent[k] == null ? <span className="italic text-slate-400">—</span> : String(newContent[k])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Snapshot table ─────────────────────────────────────── */
function SnapshotTable({ content }: { content: Record<string, any> }) {
  const entries = Object.entries(content).filter(([, v]) => v != null && String(v).trim() !== "");
  return (
    <table className="w-full text-xs mt-2">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-slate-50">
            <td className="py-1.5 pr-3 font-medium text-slate-500 w-[40%]">{k}</td>
            <td className="py-1.5 text-slate-700">{String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Detail dialog ──────────────────────────────────────── */
function EventDetailDialog({ event, onClose }: { event: IssueHistoryEvent | null; onClose: () => void }) {
  const needsReceiptFetch = event?.ev_type === "created" || event?.ev_type === "completed" || event?.ev_type === "cancelled";
  const { data: detail, isLoading } = useQuery<IssueReceiptDetail>({
    queryKey: ["/api/store/issue-receipts", event?.receipt_id],
    queryFn: () => apiRequest("GET", `/api/store/issue-receipts/${event!.receipt_id}`).then(r => r.json()),
    enabled: !!event && needsReceiptFetch && event.ev_type !== "deleted",
    staleTime: 60_000,
  });

  if (!event) return null;
  const cfg = EV_CONFIG[event.ev_type] ?? EV_CONFIG.created;

  const oldContent = event.old_content_json ? (() => { try { return JSON.parse(event.old_content_json!); } catch { return null; } })() : null;
  const newContent = event.new_content_json ? (() => { try { return JSON.parse(event.new_content_json!); } catch { return null; } })() : null;

  return (
    <Dialog open={!!event} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.textColor}`}>
              {cfg.icon} {cfg.label}
            </span>
            <span className="font-bold text-slate-700">{event.receipt_code}</span>
            <span className="text-slate-400 font-normal">{fmtDateTime(event.ev_time)}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-500 space-y-0.5 -mt-1">
          {event.receipt_name && <div><span className="font-medium">Tên phiếu:</span> {event.receipt_name}</div>}
          {event.warehouse_name && <div><span className="font-medium">Kho:</span> {event.warehouse_name}</div>}
          {event.supplier_name && <div><span className="font-medium">Người nhận:</span> {event.supplier_name}</div>}
          {event.location_name && <div><span className="font-medium">Cơ sở:</span> {event.location_name}</div>}
          {event.created_by_name && <div><span className="font-medium">Người thực hiện:</span> {event.created_by_name}</div>}
          {event.note && <div><span className="font-medium">Ghi chú:</span> {event.note}</div>}
          {event.ev_type !== "deleted" && (
            <div>
              <span className="font-medium">Tổng tiền:</span>{" "}
              <span className="font-semibold text-slate-700">{fmtVND(event.total_amount)}</span>
            </div>
          )}
        </div>

        {/* edited → diff table */}
        {event.ev_type === "edited" && oldContent && newContent && (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Thay đổi</p>
            <DiffTable oldContent={oldContent} newContent={newContent} />
          </div>
        )}

        {/* deleted → snapshot */}
        {event.ev_type === "deleted" && oldContent && (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Thông tin phiếu đã xoá</p>
            <SnapshotTable content={oldContent} />
          </div>
        )}

        {/* created / cancelled → items list */}
        {needsReceiptFetch && (
          <div className="mt-1">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Danh sách sản phẩm</p>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
              </div>
            ) : !detail?.items?.length ? (
              <p className="text-xs text-slate-400 italic">Không có sản phẩm nào.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-1.5 pr-3 font-semibold text-slate-500 w-[40%]">Sản phẩm</th>
                    <th className="text-left py-1.5 pr-3 font-semibold text-slate-500">Mã</th>
                    <th className="text-center py-1.5 pr-3 font-semibold text-slate-500">SL</th>
                    <th className="text-right py-1.5 font-semibold text-slate-500">Giá bán</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-1.5 pr-3 text-slate-700 font-medium truncate max-w-[160px]">{item.productName}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-500">{item.productCode}</td>
                      <td className="py-1.5 pr-3 text-center tabular-nums font-semibold">{item.quantity}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">
                        {item.salePrice ? fmtVND(item.salePrice) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={2} className="py-1.5 text-xs font-semibold text-slate-600">Tổng</td>
                    <td className="py-1.5 text-center tabular-nums font-bold text-slate-700">
                      {detail.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-bold text-sky-700">
                      {fmtVND(event.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Quick range ────────────────────────────────────────── */
type QuickRange = "all" | "today" | "7d" | "30d" | "thismonth";

function quickRangeDates(r: QuickRange): { from?: string; to?: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (r === "today")    { const s = fmt(today); return { from: s, to: s }; }
  if (r === "7d")       { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: fmt(f), to: fmt(today) }; }
  if (r === "30d")      { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: fmt(f), to: fmt(today) }; }
  if (r === "thismonth"){ const f = new Date(today.getFullYear(), today.getMonth(), 1); const t = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { from: fmt(f), to: fmt(t) }; }
  return {};
}

/* ── Main component ─────────────────────────────────────── */
export function StoreIssueReceiptHistoryTab({
  locationOptions,
}: {
  locationOptions: { value: string; label: string }[];
}) {
  const [quickRange, setQuickRange] = useState<QuickRange>("7d");
  const [locationId, setLocationId] = useState<string>("__all__");
  const [page, setPage] = useState(1);
  const [detailEvent, setDetailEvent] = useState<IssueHistoryEvent | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const { from, to } = quickRangeDates(quickRange);

  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to)   params.set("dateTo",   to);
  if (locationId !== "__all__") params.set("locationId", locationId);
  params.set("limit",  String(pageSize));
  params.set("offset", String((page - 1) * pageSize));

  const { data, isLoading } = useQuery<IssueHistoryResponse>({
    queryKey: ["/api/store/issue-receipts/history", from, to, locationId, page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/store/issue-receipts/history?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];
  const total  = data?.total  ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const groups = events.reduce<Map<string, IssueHistoryEvent[]>>((map, ev) => {
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

  const alwaysVisible = (ev: IssueHistoryEvent) => ev.ev_type === "edited" || ev.ev_type === "deleted";
  const hasDetail = (_ev: IssueHistoryEvent) => true;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-5 pt-3">

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {QUICK_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => { setQuickRange(r.value); setPage(1); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                quickRange === r.value
                  ? "bg-white text-sky-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

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
          <SelectTrigger className="h-8 w-[100px] text-xs border-slate-200 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 / trang</SelectItem>
            <SelectItem value="100">100 / trang</SelectItem>
            <SelectItem value="200">200 / trang</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5" />
          {from && to
            ? `${format(new Date(from + "T00:00"), "dd/MM/yyyy")} – ${format(new Date(to + "T00:00"), "dd/MM/yyyy")}`
            : "Toàn thời gian"}
          <span className="ml-2 font-medium text-slate-600">{total} sự kiện</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <p className="text-sm">Đang tải lịch sử...</p>
          </div>
        ) : groups.size === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <History className="h-12 w-12 opacity-15" />
            <p className="text-sm">Không có sự kiện nào trong khoảng thời gian này</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([dk, evs]) => (
              <div key={dk}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-slate-50/90 py-1 px-2 rounded-lg backdrop-blur-sm z-10">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {fmtDateGroup(evs[0].ev_time)}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="space-y-1.5">
                  {evs.map((ev, idx) => {
                    const cfg = EV_CONFIG[ev.ev_type] ?? EV_CONFIG.created;
                    const always = alwaysVisible(ev);
                    return (
                      <div
                        key={`${ev.receipt_id}-${ev.ev_type}-${idx}`}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group"
                      >
                        <div className={`mt-0.5 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full border ${cfg.bg} ${cfg.border}`}>
                          <span className={cfg.textColor}>{cfg.icon}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.textColor}`}>
                              {cfg.label}
                            </span>
                            <span className="text-xs font-bold text-slate-700 font-mono">{ev.receipt_code}</span>
                            <span className="text-xs text-slate-500 truncate max-w-[200px]">{ev.receipt_name}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {ev.warehouse_name && <span className="text-[11px] text-slate-500">🏭 {ev.warehouse_name}</span>}
                            {ev.supplier_name  && <span className="text-[11px] text-slate-400">👤 {ev.supplier_name}</span>}
                            {ev.location_name  && <span className="text-[11px] text-slate-400">{ev.location_name}</span>}
                            {ev.created_by_name && <span className="text-[11px] text-slate-400">bởi {ev.created_by_name}</span>}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                          {ev.ev_type !== "deleted" && (
                            <p className="text-sm font-bold text-sky-600">{fmtVND(ev.total_amount)}</p>
                          )}
                          <p className="text-[10px] text-slate-400">{fmtDateTime(ev.ev_time)}</p>
                          {hasDetail(ev) && (
                            <button
                              onClick={() => setDetailEvent(ev)}
                              className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full transition-all ${
                                always
                                  ? `${cfg.bg} ${cfg.textColor} hover:opacity-80`
                                  : "opacity-0 group-hover:opacity-100 bg-slate-100 text-slate-400 hover:bg-sky-100 hover:text-sky-600"
                              }`}
                              title="Xem chi tiết"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
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

      {/* Pagination */}
      <HistoryPaginationFooter
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={value => { setPageSize(value); setPage(1); }}
        legend={<>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> Tạo phiếu</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Xuất kho</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Đã hủy</span>
        </>}
      />

      <EventDetailDialog event={detailEvent} onClose={() => setDetailEvent(null)} />
    </div>
  );
}
