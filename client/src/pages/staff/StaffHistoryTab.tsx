import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, Eye, History, Pencil, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments } from "@/hooks/use-departments";
import { useCenterTimeZone } from "@/hooks/use-center-time-zone";
import { HistoryPaginationFooter } from "@/components/common/HistoryPaginationFooter";
import {
  DEFAULT_CENTER_TIME_ZONE,
  formatCenterInstant,
  getCenterDateKey,
  isInstantInCenterDateRange,
  shiftCalendarDateKey,
} from "@shared/center-time";

type Range = "all" | "today" | "7d" | "30d" | "thismonth";
type Event = {
  id: string; action: string; staffId: string | null; staffCode: string | null;
  staffName: string | null; userName: string | null; locationName: string | null;
  oldContent: string | null; newContent: string | null; createdAt: string;
};
type ParsedEvent = Event & { createdAtInstant: Date | null };

const config: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  "staff.created": { label: "Tạo mới", icon: <Plus className="h-3 w-3" />, cls: "bg-violet-50 border-violet-200 text-violet-700" },
  "staff.updated": { label: "Cập nhật", icon: <Pencil className="h-3 w-3" />, cls: "bg-amber-50 border-amber-200 text-amber-700" },
  "staff.deleted": { label: "Xóa", icon: <Trash2 className="h-3 w-3" />, cls: "bg-red-50 border-red-200 text-red-700" },
};

function dates(range: Range, timeZone: string) {
  const today = getCenterDateKey(new Date(), timeZone);
  if (range === "today") return { from: today, to: today };
  if (range === "7d" || range === "30d") {
    return { from: shiftCalendarDateKey(today, range === "7d" ? -6 : -29), to: today };
  }
  if (range === "thismonth") {
    const [year, month] = today.slice(0, 7).split("-").map(Number);
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { from: `${today.slice(0, 7)}-01`, to: shiftCalendarDateKey(nextMonth, -1) };
  }
  return {};
}

function parseActivityLogInstant(value: string): Date | null {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function formatActivityLogDate(instant: Date | null, timeZone: string) {
  return instant
    ? formatCenterInstant(instant, timeZone, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
    : "Không rõ ngày";
}

function formatActivityLogTime(instant: Date | null, timeZone: string, includeDate = false) {
  if (!instant) return "Không rõ thời gian";
  return formatCenterInstant(instant, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
    hourCycle: "h23",
  }).replace(", ", " — ");
}

function snapshot(event: Event, key: "oldContent" | "newContent") {
  try { return event[key] ? JSON.parse(event[key]!) : {}; } catch { return {}; }
}

const FIELD_LABELS: Record<string, string> = {
  code: "Mã nhân sự",
  fullName: "Họ và tên",
  username: "Tài khoản",
  phone: "Số điện thoại",
  email: "Email",
  address: "Địa chỉ",
  dateOfBirth: "Ngày sinh",
  status: "Trạng thái",
  locationIds: "Cơ sở",
  departmentIds: "Phòng ban",
  roleIds: "Vai trò",
  omicallExtensions: "Số máy lẻ",
};

const HIDDEN_FIELDS = new Set([
  "id", "staffId", "userId", "password", "omicallPasswords",
  "createdAt", "updatedAt", "assignments",
]);

function formatFieldValue(
  key: string,
  value: unknown,
  maps: { locations: Map<string, string>; departments: Map<string, string>; roles: Map<string, string> },
) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status") return String(value) === "Hoạt động" ? "Đang hoạt động" : "Ngừng hoạt động";
  if (key === "dateOfBirth") {
    try { return format(new Date(String(value)), "dd/MM/yyyy"); } catch { return String(value); }
  }
  if (key === "omicallExtensions" && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([locationId, extension]) => `${maps.locations.get(locationId) || "Cơ sở"}: ${extension || "—"}`)
      .join(", ") || "—";
  }
  if (["locationIds", "departmentIds", "roleIds"].includes(key)) {
    const values = Array.isArray(value) ? value : [value];
    const map = key === "locationIds" ? maps.locations : key === "departmentIds" ? maps.departments : maps.roles;
    return values.map(item => map.get(String(item)) || String(item)).join(", ") || "—";
  }
  if (typeof value === "object") return "—";
  return String(value);
}

function Detail({
  event,
  close,
  maps,
  timeZone,
}: {
  event: ParsedEvent | null;
  close: () => void;
  maps: { locations: Map<string, string>; departments: Map<string, string>; roles: Map<string, string> };
  timeZone: string | null;
}) {
  if (!event) return null;
  const oldObj = snapshot(event, "oldContent");
  const newObj = snapshot(event, "newContent");
  const oldKeys = Object.keys(oldObj);
  const newKeys = Object.keys(newObj);
  const keys = Array.from(new Set([...oldKeys, ...newKeys]))
    .filter(k => !HIDDEN_FIELDS.has(k))
    .filter(k => {
      if (event.action === "staff.created" || event.action === "staff.deleted") return true;
      return String(oldObj[k] ?? "") !== String(newObj[k] ?? "");
    });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-auto rounded-xl bg-white shadow-xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${config[event.action].cls}`}>{config[event.action].icon}{config[event.action].label}</span>{event.staffName || "Nhân sự"}</h3>
          <button onClick={close} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Mã: <b>{event.staffCode || "—"}</b> · {timeZone
          ? formatActivityLogTime(event.createdAtInstant, timeZone, true)
          : "Không tải được múi giờ của trung tâm"}</p>
        {keys.length ? <div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="text-left py-2">Thông tin</th><th className="text-left py-2 text-red-500">Trước</th><th className="text-left py-2 text-emerald-600">Sau</th></tr></thead><tbody>{keys.map(k => <tr key={k} className="border-b border-slate-50"><td className="py-2 font-medium text-slate-600">{FIELD_LABELS[k] ?? k}</td><td className="py-2 text-red-600">{event.action === "staff.created" ? "—" : formatFieldValue(k, oldObj[k], maps)}</td><td className="py-2 text-emerald-700">{event.action === "staff.deleted" ? "—" : formatFieldValue(k, newObj[k], maps)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-400">Không có chi tiết thay đổi.</p>}
      </div>
    </div>
  );
}

export function StaffHistoryTab({ locationOptions }: { locationOptions: { value: string; label: string }[] }) {
  const [range, setRange] = useState<Range>("7d");
  const [locationId, setLocationId] = useState("__all__");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ParsedEvent | null>(null);
  const { data: departments } = useDepartments();
  const [pageSize, setPageSize] = useState(50);
  const centerTimeZone = useCenterTimeZone();
  const timeZone = centerTimeZone.data ?? DEFAULT_CENTER_TIME_ZONE;
  const { from, to } = dates(range, timeZone);
  const { data, isLoading } = useQuery<{ events: Event[]; total: number }>({
    queryKey: ["/api/staff/history", from, to, timeZone, locationId, page, pageSize],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: String(pageSize), offset: String((page - 1) * pageSize) });
      if (from) p.set("dateFrom", from); if (to) p.set("dateTo", to); if (locationId !== "__all__") p.set("locationId", locationId);
      const res = await fetch(`/api/staff/history?${p}`, { credentials: "include" }); if (!res.ok) throw new Error("Failed"); return res.json();
    }, staleTime: 30000,
    enabled: !!centerTimeZone.data && !centerTimeZone.isError,
  });
  const parsedEvents = useMemo(() => (data?.events ?? []).map(event => ({
    ...event,
    createdAtInstant: parseActivityLogInstant(event.createdAt),
  })), [data?.events]);
  const filteredEvents = useMemo(() => parsedEvents.filter(event =>
    event.createdAtInstant
      ? isInstantInCenterDateRange(event.createdAtInstant, range, timeZone)
      : range === "all",
  ), [parsedEvents, range, timeZone]);
  const groups = useMemo(() => filteredEvents.reduce((map, event) => {
    const key = event.createdAtInstant ? getCenterDateKey(event.createdAtInstant, timeZone) : "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
    return map;
  }, new Map<string, ParsedEvent[]>()), [filteredEvents, timeZone]);
  const total = data?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const maps = useMemo(() => {
    const locations = new Map(locationOptions.map(item => [item.value, item.label]));
    const departmentMap = new Map<string, string>();
    const roleMap = new Map<string, string>();
    (departments ?? []).forEach((department: any) => {
      departmentMap.set(department.id, department.name);
      (department.roles ?? []).forEach((role: any) => roleMap.set(role.id, role.name));
    });
    return { locations, departments: departmentMap, roles: roleMap };
  }, [locationOptions, departments]);
  const ranges: { label: string; value: Range }[] = [{ label: "Toàn thời gian", value: "all" }, { label: "Hôm nay", value: "today" }, { label: "7 ngày", value: "7d" }, { label: "30 ngày", value: "30d" }, { label: "Tháng này", value: "thismonth" }];
  return <div className="flex-1 flex flex-col min-h-0 gap-3">
    <div className="flex items-center gap-2 flex-wrap"><div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">{ranges.map(item => <button key={item.value} onClick={() => { setRange(item.value); setPage(1); }} className={`px-3 py-1.5 rounded-md text-xs font-medium ${range === item.value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{item.label}</button>)}</div>{locationOptions.length > 0 && <Select value={locationId} onValueChange={v => { setLocationId(v); setPage(1); }}><SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Tất cả cơ sở" /></SelectTrigger><SelectContent><SelectItem value="__all__">Tất cả cơ sở</SelectItem>{locationOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}<Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}><SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="50">50 / trang</SelectItem><SelectItem value="100">100 / trang</SelectItem><SelectItem value="200">200 / trang</SelectItem></SelectContent></Select><span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><CalendarIcon className="h-3.5 w-3.5" />{total} sự kiện</span></div>
    <div className="flex-1 overflow-auto">{centerTimeZone.isPending ? <div className="py-16 text-center text-sm text-slate-400">Đang tải múi giờ của trung tâm...</div> : centerTimeZone.isError ? <div role="alert" className="py-16 text-center text-sm text-red-600">Không tải được múi giờ của trung tâm.</div> : isLoading ? <div className="py-16 text-center text-sm text-slate-400">Đang tải lịch sử...</div> : !groups.size ? <div className="py-20 text-center text-sm text-slate-400"><History className="h-12 w-12 mx-auto mb-3 opacity-15" />Không có sự kiện nào trong khoảng thời gian này</div> : <div className="space-y-6">{Array.from(groups.entries()).map(([dateKey, events]) => <div key={dateKey}><div className="flex items-center gap-2 mb-2"><div className="h-px flex-1 bg-slate-200" /><span className="text-[11px] font-semibold text-slate-500 uppercase">{dateKey === "unknown" ? "Không rõ ngày" : formatActivityLogDate(events[0].createdAtInstant, timeZone)}</span><div className="h-px flex-1 bg-slate-200" /></div><div className="space-y-1.5">{events.map(event => <div key={event.id} role="button" tabIndex={0} onClick={() => setDetail(event)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(event); } }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:shadow-sm hover:border-violet-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-200"><div className={`w-6 h-6 rounded-full border flex items-center justify-center ${config[event.action].cls}`}>{config[event.action].icon}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${config[event.action].cls}`}>{config[event.action].label}</span><b className="text-xs text-slate-700">{event.staffName || "Nhân sự đã xóa"}</b>{event.staffCode && <span className="font-mono text-[10px] text-slate-400">{event.staffCode}</span>}</div><div className="text-[11px] text-slate-400 mt-1">bởi {event.userName || "Hệ thống"}{event.locationName ? ` · ${event.locationName}` : ""}</div></div><div className="text-right text-[10px] text-slate-400">{formatActivityLogTime(event.createdAtInstant, timeZone)}<button onClick={e => { e.stopPropagation(); setDetail(event); }} className="block ml-auto mt-1 text-slate-400 hover:text-violet-600" title="Xem chi tiết" aria-label="Xem chi tiết"><Eye className="h-3 w-3" /></button></div></div>)}</div></div>)}</div>}</div>
     <HistoryPaginationFooter
       total={total}
       page={page}
       pageSize={pageSize}
       totalPages={totalPages}
       isLoading={isLoading}
       onPageChange={setPage}
       onPageSizeChange={value => { setPageSize(value); setPage(1); }}
       legend={<>
         <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Tạo mới</span>
         <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Cập nhật</span>
         <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Xóa</span>
       </>}
     />
     <Detail event={detail} close={() => setDetail(null)} maps={maps} timeZone={centerTimeZone.data ?? null} />
  </div>;
}