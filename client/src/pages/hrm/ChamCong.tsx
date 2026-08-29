import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, ChevronDown, Clock, CheckCircle2,
  AlertCircle, Zap, CalendarDays, User, ClipboardCheck,
  Upload, Download, FileUp, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getAuthToken, getAuthHeaders } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";

// ─── API helper ─────────────────────────────────────────────────────────────
async function apiFetch(url: string): Promise<any[]> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { credentials: "include", headers });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ─── Constants ─────────────────────────────────────────────────────────────
const today = new Date();
const DAY_W = 46;
const COL_CB = 36;
const COL_NV = 40;
const COL_NAME = 150;
const COL_ROLE = 130;
const COL_TONG = 64;
const COL_NGHI = 52;
const COL_MUON = 52;
const COL_TANG = 64;
const RIGHT_FIXED_W = COL_TONG + COL_NGHI + COL_MUON + COL_TANG;
const LEFT_FIXED_W = COL_CB + COL_NV + COL_NAME + COL_ROLE;

const DOW_SHORT: Record<number, string> = {
  1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN",
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function parseMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToHours(m: number): number {
  return m / 60;
}
function formatHours(h: number): string {
  if (h <= 0) return "0 giờ";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh} giờ` : `${hh} giờ ${mm} phút`;
}
function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "SA" : "CH";
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}
function getShiftTotalHours(tpl: any): number {
  if (!tpl) return 0;
  if (tpl.totalHours != null) return Number(tpl.totalHours) || 0;
  if (tpl.workUnits != null && !tpl.startTime) return Number(tpl.workUnits) || 0;
  const mins = parseMinutes(tpl.endTime) - parseMinutes(tpl.startTime) - Number(tpl.lunchBreakMinutes || 0);
  return minutesToHours(Math.max(0, mins));
}

function staffMatchesAssignment(s: any, a: any): boolean {
  if (!a.targetId) return false;
  const sA: any[] = s.assignments || [];
  if (a.targetType === "staff") return s.id === a.targetId;
  if (a.targetType === "department")
    return sA.some(sa => sa.departmentId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
  if (a.targetType === "role")
    return sA.some(sa => sa.roleId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
  return false;
}
function getShiftIdsForStaffOnDate(s: any, date: Date, shiftAssignments: any[]): string[] {
  const ymd = format(date, "yyyy-MM-dd");
  const dowKey = String(date.getDay());
  const ids: string[] = [];
  for (const a of shiftAssignments) {
    if (!staffMatchesAssignment(s, a)) continue;
    if (a.effectiveFrom && ymd < format(new Date(a.effectiveFrom), "yyyy-MM-dd")) continue;
    if (a.effectiveTo && ymd > format(new Date(a.effectiveTo), "yyyy-MM-dd")) continue;
    if (a.byWeekday) {
      const list: string[] = (a.weekdaySchedule && a.weekdaySchedule[dowKey]) || [];
      for (const id of list) if (id && !ids.includes(id)) ids.push(id);
    } else if (a.shiftTemplateId) {
      if (!ids.includes(a.shiftTemplateId)) ids.push(a.shiftTemplateId);
    }
  }
  return ids;
}

// ─── Types ─────────────────────────────────────────────────────────────────
type AttendanceEntry = {
  timeIn: string;
  timeOut: string;
  shiftId: string;
  tongCong: number; // computed on save
};
type DialogCell = {
  staff: any;
  day: { date: Date; day: number; dow: number; ymd: string; isWeekend: boolean; isHoliday: boolean };
  shiftIds: string[];
};

// ─── Status helpers ─────────────────────────────────────────────────────────
type AttStatus = "late" | "ok" | "overtime" | null;
function computeStatus(tongCong: number, soCoong: number): AttStatus {
  if (tongCong <= 0) return null;
  if (tongCong < soCoong - 0.01) return "late";
  if (tongCong > soCoong + 0.01) return "overtime";
  return "ok";
}
const STATUS_META: Record<string, { label: string; icon: any; cls: string; bg: string }> = {
  ok: { label: "Đủ giờ", icon: CheckCircle2, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  late: { label: "Đi muộn", icon: AlertCircle, cls: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  overtime: { label: "Tăng ca", icon: Zap, cls: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
};

// ─── Cell content ───────────────────────────────────────────────────────────
function CellContent({ status, tongCong, leaveType, otHours }: {
  status: AttStatus; tongCong: number; leaveType?: string; otHours?: number
}) {
  // Đơn nghỉ phép → P (không tính công)
  if (leaveType === "nghi_phep") {
    return (
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-purple-700">P</span>
    );
  }
  // Đơn nghỉ phép năm → PN + số công đủ
  if (leaveType === "nghi_co_luong") {
    return (
      <>
        <span className="absolute top-0.5 right-0.5 text-[9px] font-bold leading-none px-0.5 rounded text-green-700 bg-green-100">PN</span>
        {tongCong > 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-green-700 leading-none">
            {tongCong % 1 === 0 ? tongCong.toFixed(0) : parseFloat(tongCong.toFixed(4)).toString()}
          </span>
        )}
      </>
    );
  }

  const labelMap: Record<string, { text: string; cls: string }> = {
    late:     { text: "M",  cls: "text-amber-600 bg-amber-50" },
    overtime: { text: "TC", cls: "text-blue-600 bg-blue-50" },
  };
  // Tăng ca từ đơn duyệt → ưu tiên hiển thị badge TC với giờ, thay badge overtime
  const otBadge = leaveType === "tang_ca" && (otHours ?? 0) > 0;
  const badge = !otBadge && status && status !== "ok" ? labelMap[status] : null;
  const showCong = tongCong > 0;
  return (
    <>
      {otBadge && (
        <span className="absolute top-0.5 right-0.5 text-[9px] font-bold leading-none px-0.5 rounded text-blue-700 bg-blue-100">
          TC {otHours}h
        </span>
      )}
      {badge && (
        <span className={cn("absolute top-0.5 right-0.5 text-[9px] font-bold leading-none px-0.5 rounded", badge.cls)}>
          {badge.text}
        </span>
      )}
      {showCong && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-violet-700 leading-none">
          {tongCong % 1 === 0 ? tongCong.toFixed(0) : parseFloat(tongCong.toFixed(4)).toString()}
        </span>
      )}
    </>
  );
}

// ─── MultiSelect with search ────────────────────────────────────────────────
function MultiSelect({
  options, selected, onChange, placeholder, className,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  }

  const label = selected.length === 0
    ? placeholder ?? "Tất cả"
    : selected.length === options.length
    ? "Tất cả"
    : selected.length === 1
    ? options.find(o => o.value === selected[0])?.label ?? `${selected.length} đã chọn`
    : `${selected.length} đã chọn`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-8 min-w-[160px] max-w-[240px] px-3 flex items-center justify-between gap-2 rounded-md border border-input bg-white text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        <span className="truncate text-sm">{label}</span>
        <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open ? "-rotate-90" : "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm..."
              className="w-full h-7 px-2 text-sm rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Không tìm thấy</p>
            ) : filtered.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-violet-50 cursor-pointer rounded mx-1">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="accent-violet-600"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 p-2">
              <button type="button" onClick={() => onChange([])} className="text-xs text-violet-600 hover:underline w-full text-center">
                Bỏ chọn tất cả
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export function ChamCong() {
  const { data: myPerms } = useMyPermissions();
  const chamCongPerm = myPerms?.permissions?.["/cham-cong"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canEdit = isSuperAdmin || !!chamCongPerm?.canEdit;
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk attendance dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDateFrom, setBulkDateFrom] = useState(() => format(today, "yyyy-MM-dd"));
  const [bulkDateTo, setBulkDateTo] = useState(() => format(today, "yyyy-MM-dd"));
  const [bulkType, setBulkType] = useState<"full" | "late">("full");
  const [bulkLateMinutes, setBulkLateMinutes] = useState(5);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; skipped: number } | null>(null);

  const queryClient = useQueryClient();

  // dialog chấm công
  const [dialogCell, setDialogCell] = useState<DialogCell | null>(null);
  // Per-shift time state: shiftId → { timeIn, timeOut }
  const [dlgShiftTimes, setDlgShiftTimes] = useState<Record<string, { timeIn: string; timeOut: string }>>({});
  // Per-shift expanded state for collapsible cards
  const [dlgExpanded, setDlgExpanded] = useState<Record<string, boolean>>({});

  // dialog tải lên / import
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<"download" | "import">("download");
  const [uploadLocationId, setUploadLocationId] = useState<string>("");
  const [uploadDate, setUploadDate] = useState<string>(() => format(today, "yyyy-MM-dd"));
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiFetch("/api/locations"),
    retry: false,
  });
  const { data: staff = [], isLoading: staffLoading, isError: staffError } = useQuery<any[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: () => apiFetch("/api/staff?minimal=true"),
    retry: false,
  });
  const { data: shiftAssignments = [], isLoading: saLoading, isError: saError } = useQuery<any[]>({
    queryKey: ["/api/shift-assignments"],
    queryFn: () => apiFetch("/api/shift-assignments"),
    retry: false,
  });
  const { data: shiftTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", "work"],
    queryFn: () => apiFetch("/api/shift-templates?type=work"),
    retry: false,
  });
  const { data: publicHolidays = [] } = useQuery<any[]>({
    queryKey: ["/api/public-holidays"],
    queryFn: () => apiFetch("/api/public-holidays"),
    retry: false,
  });
  const { data: attendanceRows = [] } = useQuery<any[]>({
    queryKey: ["/api/staff-attendances", month, year],
    queryFn: () => apiFetch(`/api/staff-attendances?month=${month}&year=${year}`),
    retry: false,
  });
  const { data: approvedLeaves = [] } = useQuery<any[]>({
    queryKey: ["/api/leave-requests", "approved"],
    queryFn: () => apiFetch("/api/leave-requests?status=approved"),
    retry: false,
  });

  const dataLoading = staffLoading || saLoading;
  const dataError = staffError || saError;

  // Build leaveMap: staffId__ymd → { type, otHours? }  (chỉ đơn đã duyệt trong tháng)
  const leaveMap = useMemo<Record<string, { type: string; otHours?: number }>>(() => {
    const map: Record<string, { type: string; otHours?: number }> = {};
    const monthStr = String(month).padStart(2, "0");
    const dateFrom = `${year}-${monthStr}-01`;
    const daysInM = new Date(year, month, 0).getDate();
    const dateTo   = `${year}-${monthStr}-${String(daysInM).padStart(2, "0")}`;
    for (const lr of approvedLeaves as any[]) {
      if (!lr.fromDate) continue;
      if (lr.type === "tang_ca") {
        // tang_ca: chỉ 1 ngày
        const ymd = lr.fromDate;
        if (ymd >= dateFrom && ymd <= dateTo) {
          const otHours = lr.hours ? parseFloat(lr.hours) : 0;
          const existing = map[`${lr.staffId}__${ymd}`];
          if (existing?.type === "tang_ca") {
            // Cộng dồn nếu có nhiều đơn tăng ca trong 1 ngày
            map[`${lr.staffId}__${ymd}`] = { type: "tang_ca", otHours: (existing.otHours ?? 0) + otHours };
          } else {
            map[`${lr.staffId}__${ymd}`] = { type: "tang_ca", otHours };
          }
        }
      } else {
        if (!lr.toDate) continue;
        const cur = new Date(lr.fromDate > dateFrom ? lr.fromDate : dateFrom);
        const end = new Date(lr.toDate   < dateTo   ? lr.toDate   : dateTo);
        while (cur <= end) {
          const ymd = format(cur, "yyyy-MM-dd");
          map[`${lr.staffId}__${ymd}`] = { type: lr.type };
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return map;
  }, [approvedLeaves, month, year]);

  // Build attendanceMap from server data — key: staffId__workDate__shiftId
  const attendanceMap = useMemo<Record<string, AttendanceEntry>>(() => {
    const map: Record<string, AttendanceEntry> = {};
    for (const row of attendanceRows as any[]) {
      const key = `${row.staffId}__${row.workDate}__${row.shiftTemplateId ?? ""}`;
      map[key] = {
        timeIn: row.timeIn ?? "",
        timeOut: row.timeOut ?? "",
        shiftId: row.shiftTemplateId ?? "",
        tongCong: Number(row.tongCong ?? 0),
      };
    }
    return map;
  }, [attendanceRows]);

  // Get total tongCong for a day across all shifts
  function getDayTongCong(staffId: string, ymd: string, shiftIds: string[]): number {
    return shiftIds.reduce((sum, shiftId) => {
      const entry = attendanceMap[`${staffId}__${ymd}__${shiftId}`];
      return sum + (entry ? entry.tongCong : 0);
    }, 0);
  }

  // Get aggregate status for a day (late if any shift late, overtime if total > total soCong)
  function getDayStatus(staffId: string, ymd: string, shiftIds: string[]): AttStatus {
    if (!shiftIds.length) return null;
    const entries = shiftIds.map(id => attendanceMap[`${staffId}__${ymd}__${id}`]).filter(Boolean);
    if (!entries.length) return null;
    const totalWorked = entries.reduce((s, e) => s + e!.tongCong, 0);
    const totalExpected = shiftIds.reduce((s, id) => {
      const tpl = getTpl(id);
      return s + (tpl?.workUnits != null ? Number(tpl.workUnits) : 1);
    }, 0);
    return computeStatus(totalWorked, totalExpected);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      staffId: string; workDate: string; shiftTemplateId: string;
      timeIn: string; timeOut: string; workedHours: number; tongCong: number;
    }) => {
      const r = await fetch("/api/staff-attendances", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-attendances", month, year] });
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const holidaySet = useMemo(() => {
    const s = new Set<string>();
    for (const h of publicHolidays as any[]) {
      const start = new Date(h.startDate);
      const end = h.endDate ? new Date(h.endDate) : start;
      const cur = new Date(start);
      while (cur <= end) { s.add(format(cur, "yyyy-MM-dd")); cur.setDate(cur.getDate() + 1); }
    }
    return s;
  }, [publicHolidays]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    const dow = d.getDay();
    const ymd = format(d, "yyyy-MM-dd");
    return { date: d, day: i + 1, dow, ymd, isWeekend: dow === 0 || dow === 6, isHoliday: holidaySet.has(ymd) };
  }), [year, month, daysInMonth, holidaySet]);

  const goPrev = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); setPage(1); };
  const goNext = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); setPage(1); };

  // Staff list available for the selected locations (used for dropdown options)
  const staffInSelectedLocs = useMemo(() => {
    if (locationIds.length === 0) return staff as any[];
    return (staff as any[]).filter(s => (s.assignments || []).some((a: any) => locationIds.includes(a.locationId)));
  }, [staff, locationIds]);

  // Only keep staffIds that are still valid after location filter changes
  const effectiveStaffIds = useMemo(
    () => staffIds.filter(id => staffInSelectedLocs.some(s => s.id === id)),
    [staffIds, staffInSelectedLocs]
  );

  const filteredStaff = useMemo(() => {
    if (effectiveStaffIds.length > 0) {
      return staffInSelectedLocs.filter(s => effectiveStaffIds.includes(s.id));
    }
    return staffInSelectedLocs;
  }, [staffInSelectedLocs, effectiveStaffIds]);

  const allRows = useMemo(() =>
    filteredStaff
      .map(s => {
        const perDay = days.map(d => getShiftIdsForStaffOnDate(s, d.date, shiftAssignments as any[]));
        return { staff: s, perDay, hasAny: perDay.some(ids => ids.length > 0) };
      })
      .filter(r => r.hasAny),
    [filteredStaff, days, shiftAssignments]);

  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = allRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 2 + i);

  // ── Dialog helpers ───────────────────────────────────────────────────────
  function getTpl(id: string) {
    return (shiftTemplates as any[]).find((t: any) => t.id === id) ?? null;
  }
  function attKey(staffId: string, ymd: string) {
    return `${staffId}__${ymd}`;
  }

  function openDialog(staff: any, day: typeof days[0], shiftIds: string[]) {
    if (!shiftIds.length) return;
    const times: Record<string, { timeIn: string; timeOut: string }> = {};
    const expanded: Record<string, boolean> = {};
    for (const shiftId of shiftIds) {
      const saved = attendanceMap[`${staff.id}__${day.ymd}__${shiftId}`];
      const tpl = getTpl(shiftId);
      times[shiftId] = {
        timeIn:  saved?.timeIn  ?? tpl?.startTime?.slice(0, 5) ?? "08:00",
        timeOut: saved?.timeOut ?? tpl?.endTime?.slice(0, 5)   ?? "17:00",
      };
      expanded[shiftId] = true; // all expanded by default
    }
    setDlgShiftTimes(times);
    setDlgExpanded(expanded);
    setDialogCell({ staff, day, shiftIds });
  }

  // Per-shift computed values
  function getDlgShiftData(shiftId: string) {
    const tpl = getTpl(shiftId);
    const times = dlgShiftTimes[shiftId] ?? { timeIn: "08:00", timeOut: "17:00" };
    const shiftHours   = tpl ? getShiftTotalHours(tpl) : 0;
    const soCong       = tpl?.workUnits != null ? Number(tpl.workUnits) : 1;
    const lunchMinutes = tpl ? Number(tpl.lunchBreakMinutes || 0) : 0;
    const rawMinutes   = Math.max(0, parseMinutes(times.timeOut) - parseMinutes(times.timeIn));
    const lunchDeduct  = rawMinutes > lunchMinutes ? lunchMinutes : 0;
    const workedMinutes = rawMinutes - lunchDeduct;
    const workedHours  = minutesToHours(workedMinutes);
    const tongCong     = shiftHours > 0 ? (workedHours * soCong) / shiftHours : 0;
    const otHours      = Math.max(0, workedHours - shiftHours);
    const status       = computeStatus(tongCong, soCong);
    return { tpl, times, shiftHours, soCong, lunchMinutes, workedHours, tongCong, otHours, status };
  }

  function setShiftTime(shiftId: string, field: "timeIn" | "timeOut", value: string) {
    setDlgShiftTimes(prev => ({
      ...prev,
      [shiftId]: { ...(prev[shiftId] ?? { timeIn: "08:00", timeOut: "17:00" }), [field]: value },
    }));
  }

  // Đơn từ của ngày đang xem trong dialog
  const dlgLeaveEntry = dialogCell ? leaveMap[attKey(dialogCell.staff.id, dialogCell.day.ymd)] : null;
  const dlgLeaveRequests = dialogCell
    ? (approvedLeaves as any[]).filter(lr =>
        lr.staffId === dialogCell.staff.id &&
        lr.fromDate <= dialogCell.day.ymd &&
        (lr.type === "tang_ca" ? lr.fromDate === dialogCell.day.ymd : lr.toDate >= dialogCell.day.ymd))
    : [];

  async function saveAttendance() {
    if (!dialogCell) return;
    const records = dialogCell.shiftIds.map(shiftId => {
      const d = getDlgShiftData(shiftId);
      return {
        staffId:         dialogCell.staff.id,
        workDate:        dialogCell.day.ymd,
        shiftTemplateId: shiftId,
        timeIn:          d.times.timeIn,
        timeOut:         d.times.timeOut,
        workedHours:     d.workedHours,
        tongCong:        d.tongCong,
      };
    });
    // Save each shift via single-shift endpoint (works for both 1 and N shifts)
    for (const record of records) {
      const r = await fetch("/api/staff-attendances", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(record),
      });
      if (!r.ok) {
        console.error("[saveAttendance] failed:", await r.text());
        return; // stop on first error
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/staff-attendances", month, year] });
    setDialogCell(null);
  }

  function addMinutes(t: string, mins: number): string {
    const total = parseMinutes(t) + mins;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  async function saveBulkAttendance() {
    if (selectedIds.size === 0 || !bulkDateFrom || !bulkDateTo) return;
    if (bulkDateFrom > bulkDateTo) return;
    setBulkSaving(true);
    setBulkResult(null);

    // Sinh danh sách ngày trong khoảng
    const dateList: string[] = [];
    const cur = new Date(bulkDateFrom + "T00:00:00");
    const end = new Date(bulkDateTo + "T00:00:00");
    while (cur <= end) {
      dateList.push(format(cur, "yyyy-MM-dd"));
      cur.setDate(cur.getDate() + 1);
    }

    const records: any[] = [];
    let totalSkipped = 0;

    for (const ymd of dateList) {
      const dateObj = new Date(ymd + "T00:00:00");
      for (const staffId of Array.from(selectedIds)) {
        const staffRow = allRows.find(r => r.staff.id === staffId);
        if (!staffRow) { totalSkipped++; continue; }

        // Dùng hàm getShiftIdsForStaffOnDate để tìm ca theo ngày bất kỳ
        const shiftIds = getShiftIdsForStaffOnDate(staffRow.staff, dateObj, shiftAssignments as any[]);
        if (shiftIds.length === 0) { totalSkipped++; continue; }

        const tpl = getTpl(shiftIds[0]);
        if (!tpl || !tpl.startTime || !tpl.endTime) { totalSkipped++; continue; }

        const shiftStart = tpl.startTime.slice(0, 5);
        const shiftEnd   = tpl.endTime.slice(0, 5);
        const timeIn  = bulkType === "late" ? addMinutes(shiftStart, bulkLateMinutes) : shiftStart;
        const timeOut = shiftEnd;

        const lunchBreak = Number(tpl.lunchBreakMinutes || 0);
        const workedMins = Math.max(0, parseMinutes(timeOut) - parseMinutes(timeIn) - lunchBreak);
        const workedHours = workedMins / 60;
        const shiftHours  = getShiftTotalHours(tpl);
        const soCong      = tpl.workUnits != null ? Number(tpl.workUnits) : 1;
        const tongCong    = shiftHours > 0 ? (workedHours * soCong) / shiftHours : 0;

        records.push({ staffId, workDate: ymd, shiftTemplateId: shiftIds[0], timeIn, timeOut, workedHours, tongCong });
      }
    }

    if (records.length === 0) {
      setBulkResult({ success: 0, skipped: totalSkipped });
      setBulkSaving(false);
      return;
    }

    try {
      const r = await fetch("/api/staff-attendances/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ records }),
      });
      const result = await r.json();
      setBulkResult({ success: result.success ?? 0, skipped: totalSkipped });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-attendances", month, year] });
    } catch {
      setBulkResult({ success: 0, skipped: totalSkipped });
    } finally {
      setBulkSaving(false);
    }
  }

  // ── Row totals from saved attendance ─────────────────────────────────────
  function rowSummary(s: any, perDay: string[][]) {
    let tongCong = 0, nghi = 0, muon = 0, tangCa = 0;
    perDay.forEach((ids, i) => {
      const d = days[i];
      const key = attKey(s.id, d.ymd);
      const leaveEntry = leaveMap[key];

      // Tăng ca từ đơn duyệt → cộng giờ TC, không block xử lý chấm công
      if (leaveEntry?.type === "tang_ca") {
        tangCa += leaveEntry.otHours ?? 0;
        // Tiếp tục xử lý chấm công bình thường bên dưới
      } else if (leaveEntry) {
        if (leaveEntry.type === "nghi_phep") {
          nghi++;
        } else if (leaveEntry.type === "nghi_co_luong") {
          const tpl = ids.length > 0 ? getTpl(ids[0]) : null;
          const soCong = tpl?.workUnits != null ? Number(tpl.workUnits) : 1;
          tongCong += soCong;
        }
        return;
      }

      if (!ids.length) return;
      // Sum across all shifts for this day
      let dayHasSaved = false;
      for (const shiftId of ids) {
        const saved = attendanceMap[`${s.id}__${d.ymd}__${shiftId}`];
        if (!saved) continue;
        dayHasSaved = true;
        tongCong += parseFloat(saved.tongCong.toFixed(4));
        const tpl = getTpl(shiftId);
        const soCong = tpl?.workUnits != null ? Number(tpl.workUnits) : 1;
        const st = computeStatus(saved.tongCong, soCong);
        if (st === "late") muon++;
      }
    });
    return { tongCong, nghi, muon, tangCa };
  }

  // ── Cell classes ─────────────────────────────────────────────────────────
  const thBase = "border-b border-r border-gray-200 text-xs font-semibold whitespace-nowrap";
  const tdBase = "border-b border-r border-gray-200 text-sm";

  // ── Download template ────────────────────────────────────────────────────
  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Chấm công");

    const templateRows = uploadLocationId
      ? allRows.filter(r => (r.staff.assignments || []).some((a: any) => a.locationId === uploadLocationId))
      : allRows;

    // Tìm index ngày được chọn trong mảng days
    const targetDayIdx = days.findIndex(d => d.ymd === uploadDate);
    const targetDay = targetDayIdx >= 0 ? days[targetDayIdx] : null;

    ws.columns = [
      { key: "staffId",        width: 5 },
      { key: "stt",            header: "STT",              width: 6 },
      { key: "code",           header: "Mã",               width: 14 },
      { key: "fullName",       header: "Họ tên",           width: 26 },
      { key: "role",           header: "Vai trò",          width: 22 },
      { key: "workDate",       header: "Ngày chấm công",   width: 18 },
      { key: "shiftName",      header: "Ca đăng ký",       width: 22 },
      { key: "shiftTemplateId",width: 5 },
      { key: "timeFrom",       header: "Thời gian từ",     width: 15 },
      { key: "timeTo",         header: "Thời gian đến",    width: 15 },
      { key: "timeIn",         header: "Thời gian vào",    width: 15 },
      { key: "timeOut",        header: "Thời gian ra",     width: 15 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: "FF3B1FA3" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E0F7" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    headerRow.height = 22;

    ws.getCell("K1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFDDB0" } };
    ws.getCell("L1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFDDB0" } };
    ws.getColumn(1).hidden = true;
    ws.getColumn(8).hidden = true;
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const orangeFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF0D8" } };

    let stt = 1;
    for (const r of templateRows) {
      const roleName = Array.isArray(r.staff.roleNames) && r.staff.roleNames.length > 0 ? r.staff.roleNames[0] : "";

      if (targetDay && targetDayIdx >= 0) {
        // Chỉ xuất ngày được chọn
        const shiftIds = r.perDay[targetDayIdx] ?? [];
        if (!shiftIds.length) continue;
        const tpl = getTpl(shiftIds[0]);
        const shiftName = tpl ? (tpl.name || tpl.code || "") : "";
        const timeFrom = tpl?.startTime ? tpl.startTime.slice(0, 5) : "";
        const timeTo   = tpl?.endTime   ? tpl.endTime.slice(0, 5)   : "";
        const row = ws.addRow({
          staffId: r.staff.id,
          stt: stt++,
          code: r.staff.code || "",
          fullName: r.staff.fullName || "",
          role: roleName,
          workDate: targetDay.ymd,
          shiftName,
          shiftTemplateId: shiftIds[0],
          timeFrom,
          timeTo,
          timeIn: timeFrom,
          timeOut: timeTo,
        });
        row.getCell(11).fill = orangeFill;
        row.getCell(12).fill = orangeFill;
        row.getCell(11).alignment = { horizontal: "center" };
        row.getCell(12).alignment = { horizontal: "center" };
      } else {
        // Fallback: xuất tất cả ngày nếu ngày chọn không thuộc tháng hiện tại
        r.perDay.forEach((shiftIds, dayIdx) => {
          if (!shiftIds.length) return;
          const d = days[dayIdx];
          const tpl = getTpl(shiftIds[0]);
          const shiftName = tpl ? (tpl.name || tpl.code || "") : "";
          const timeFrom = tpl?.startTime ? tpl.startTime.slice(0, 5) : "";
          const timeTo   = tpl?.endTime   ? tpl.endTime.slice(0, 5)   : "";
          const row = ws.addRow({
            staffId: r.staff.id,
            stt: stt++,
            code: r.staff.code || "",
            fullName: r.staff.fullName || "",
            role: roleName,
            workDate: d.ymd,
            shiftName,
            shiftTemplateId: shiftIds[0],
            timeFrom,
            timeTo,
            timeIn: timeFrom,
            timeOut: timeTo,
          });
          row.getCell(11).fill = orangeFill;
          row.getCell(12).fill = orangeFill;
          row.getCell(11).alignment = { horizontal: "center" };
          row.getCell(12).alignment = { horizontal: "center" };
        });
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mau-cham-cong-${uploadDate || `thang-${month}-${year}`}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import file ──────────────────────────────────────────────────────────
  async function handleImport() {
    if (!uploadFile) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await uploadFile.arrayBuffer());
      const ws = wb.worksheets[0];

      // ExcelJS trả về Date object với ô time (Excel lưu time là số 0–1)
      function cellToHHMM(val: any): string {
        if (!val) return "";
        if (val instanceof Date) {
          const h = String(val.getUTCHours()).padStart(2, "0");
          const m = String(val.getUTCMinutes()).padStart(2, "0");
          return `${h}:${m}`;
        }
        if (typeof val === "number" && val >= 0 && val < 1) {
          const totalMin = Math.round(val * 24 * 60);
          const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
          const m = String(totalMin % 60).padStart(2, "0");
          return `${h}:${m}`;
        }
        // Chuỗi: lấy 5 ký tự đầu HH:MM
        return String(val).trim().slice(0, 5);
      }

      function cellToYYYYMMDD(val: any): string {
        if (!val) return "";
        if (val instanceof Date) {
          const y = val.getUTCFullYear();
          const m = String(val.getUTCMonth() + 1).padStart(2, "0");
          const d = String(val.getUTCDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
        return String(val).trim().slice(0, 10);
      }

      const records: any[] = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const staffId        = String(row.getCell(1).value ?? "").trim();
        const workDate       = cellToYYYYMMDD(row.getCell(6).value);
        const shiftTemplateId= String(row.getCell(8).value ?? "").trim();
        const timeIn         = cellToHHMM(row.getCell(11).value);
        const timeOut        = cellToHHMM(row.getCell(12).value);
        if (!staffId || !workDate) return;
        records.push({ staffId, workDate, shiftTemplateId, timeIn, timeOut });
      });

      if (records.length === 0) {
        setImportResult({ success: 0, errors: ["File không có dòng dữ liệu hợp lệ"] });
        return;
      }

      const r = await fetch("/api/staff-attendances/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ records }),
      });
      const result = await r.json();
      setImportResult(result);
      if ((result.success ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/staff-attendances", month, year] });
      }
    } catch (err: any) {
      setImportResult({ success: 0, errors: [err.message] });
    } finally {
      setIsImporting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-[#ECEEF4]">

        {/* Header */}
        <div className="shrink-0 bg-[#ECEEF4] px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-violet-600" />
            <h1 className="text-xl font-bold text-foreground">
              Bảng chấm công – Tháng {month} {year}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(month)} onValueChange={v => { setMonth(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[108px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(m => <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => { setYear(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[90px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="shrink-0 px-6 pb-2 flex flex-wrap items-center gap-2">
          {(locations as any[]).length > 1 && (
            <MultiSelect
              options={(locations as any[]).map(l => ({ value: l.id, label: l.name }))}
              selected={locationIds}
              onChange={v => { setLocationIds(v); setPage(1); }}
              placeholder="Tất cả cơ sở"
            />
          )}
          <MultiSelect
            options={staffInSelectedLocs.map(s => ({ value: s.id, label: s.fullName || s.code || s.id }))}
            selected={effectiveStaffIds}
            onChange={v => { setStaffIds(v); setPage(1); }}
            placeholder="Tất cả nhân sự"
          />
          {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-sm font-medium border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => {
              setUploadOpen(true);
              setUploadTab("download");
              setUploadFile(null);
              setImportResult(null);
              const todayYmd = format(today, "yyyy-MM-dd");
              const isInMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
              setUploadDate(isInMonth ? todayYmd : `${year}-${String(month).padStart(2, "0")}-01`);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Tải lên
          </Button>
          )}
          {/* ── Bulk attendance button (only when rows selected) ── */}
          {canEdit && selectedIds.size > 0 && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
              onClick={() => {
                setBulkOpen(true);
                setBulkResult(null);
                setBulkType("full");
                setBulkLateMinutes(5);
                const todayYmd = format(today, "yyyy-MM-dd");
                const isInMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
                const defaultDate = isInMonth ? todayYmd : `${year}-${String(month).padStart(2, "0")}-01`;
                setBulkDateFrom(defaultDate);
                setBulkDateTo(defaultDate);
              }}
            >
              <Users className="h-3.5 w-3.5" />
              Chấm công hàng loạt ({selectedIds.size})
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden px-6 pb-4 flex flex-col">
          <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table
              className="text-sm"
              style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: LEFT_FIXED_W + days.length * DAY_W + RIGHT_FIXED_W }}
            >
              <thead>
                <tr className="bg-gray-50">
                  {/* ── Checkbox select-all ── */}
                  <th className={cn(thBase, "sticky left-0 z-30 bg-gray-50 text-center border-l")} style={{ width: COL_CB, minWidth: COL_CB }}>
                    <input
                      type="checkbox"
                      className="accent-violet-600 cursor-pointer"
                      checked={rows.length > 0 && rows.every(r => selectedIds.has(r.staff.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(rows.map(r => r.staff.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-center border-l")} style={{ left: COL_CB, width: COL_NV, minWidth: COL_NV }}>NV</th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-left px-3")} style={{ left: COL_CB + COL_NV, width: COL_NAME, minWidth: COL_NAME }}>Họ tên</th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-left px-3")} style={{ left: COL_CB + COL_NV + COL_NAME, width: COL_ROLE, minWidth: COL_ROLE, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>Vai trò</th>
                  {days.map(d => (
                    <th key={d.day} className={cn(thBase, "text-center py-1", (d.isWeekend || d.isHoliday) ? "bg-orange-50 text-orange-600" : "bg-gray-50")} style={{ width: DAY_W, minWidth: DAY_W }}>
                      <div>{DOW_SHORT[d.dow]}</div>
                      <div>{d.day}</div>
                    </th>
                  ))}
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-center text-violet-700")} style={{ right: COL_NGHI + COL_MUON + COL_TANG, width: COL_TONG, minWidth: COL_TONG, boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)" }}>Tổng<br />công</th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-center")} style={{ right: COL_MUON + COL_TANG, width: COL_NGHI, minWidth: COL_NGHI }}>Nghỉ</th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-center")} style={{ right: COL_TANG, width: COL_MUON, minWidth: COL_MUON }}>Muộn</th>
                  <th className={cn(thBase, "sticky z-30 bg-gray-50 text-center border-r-0")} style={{ right: 0, width: COL_TANG, minWidth: COL_TANG }}>Tăng ca</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr><td colSpan={days.length + 8} className="text-center py-16 text-muted-foreground border-b border-l border-gray-200">Đang tải dữ liệu…</td></tr>
                ) : dataError ? (
                  <tr><td colSpan={days.length + 8} className="text-center py-16 border-b border-l border-gray-200">
                    <p className="text-red-500 text-sm mb-2">Không tải được dữ liệu. Vui lòng đăng nhập lại hoặc tải lại trang.</p>
                    <button onClick={() => window.location.reload()} className="text-xs px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700">Tải lại</button>
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={days.length + 8} className="text-center py-16 text-muted-foreground border-b border-l border-gray-200">Chưa có nhân viên nào được phân ca trong tháng này.</td></tr>
                ) : (
                  rows.map((r, idx) => {
                    const roleName = Array.isArray(r.staff.roleNames) && r.staff.roleNames.length > 0 ? r.staff.roleNames[0] : "—";
                    const sum = rowSummary(r.staff, r.perDay);
                    const isSelected = selectedIds.has(r.staff.id);
                    return (
                      <tr key={r.staff.id} className={cn("hover:bg-gray-50/40", isSelected && "bg-violet-50/60")}>
                        {/* Checkbox */}
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center border-l", isSelected && "bg-violet-50/60")} style={{ left: 0, width: COL_CB }}>
                          <input
                            type="checkbox"
                            className="accent-violet-600 cursor-pointer"
                            checked={isSelected}
                            onChange={e => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(r.staff.id);
                              else next.delete(r.staff.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center text-muted-foreground border-l", isSelected && "bg-violet-50/60")} style={{ left: COL_CB, width: COL_NV }}>{(safePage - 1) * pageSize + idx + 1}</td>
                        <td className={cn(tdBase, "sticky z-20 bg-white px-3 py-2", isSelected && "bg-violet-50/60")} style={{ left: COL_CB + COL_NV, width: COL_NAME }}>
                          <div className="font-medium truncate">{r.staff.fullName || r.staff.code}</div>
                          {r.staff.code && <div className="text-xs text-muted-foreground">{r.staff.code}</div>}
                        </td>
                        <td className={cn(tdBase, "sticky z-20 bg-white px-3 py-2 text-muted-foreground", isSelected && "bg-violet-50/60")} style={{ left: COL_CB + COL_NV + COL_NAME, width: COL_ROLE, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>{roleName}</td>
                        {r.perDay.map((ids, dayIdx) => {
                          const d = days[dayIdx];
                          const hasShift = ids.length > 0;
                          const isSpecial = d.isWeekend || d.isHoliday;
                          const key = attKey(r.staff.id, d.ymd);
                          const leaveEntry = leaveMap[key];
                          // Multi-shift: aggregate all shifts for this day
                          const dayEntries = ids.map(id => attendanceMap[`${r.staff.id}__${d.ymd}__${id}`]).filter(Boolean);
                          const totalTongCong = dayEntries.reduce((s, e) => s + e!.tongCong, 0);
                          const totalSoCong = ids.reduce((s, id) => {
                            const t = getTpl(id); return s + (t?.workUnits != null ? Number(t.workUnits) : 1);
                          }, 0);
                          const hasSaved = dayEntries.length > 0;
                          const status = hasSaved ? computeStatus(totalTongCong, totalSoCong) : null;
                          // synthetic "saved" for CellContent compat
                          const saved = hasSaved ? { tongCong: totalTongCong, shiftId: dayEntries[0]!.shiftId } : null;

                          // Công hiển thị trong cell nghỉ phép năm = tổng soCong các ca
                          const leavePNTongCong = leaveEntry?.type === "nghi_co_luong" && hasShift ? totalSoCong : 0;

                          const isTangCa = leaveEntry?.type === "tang_ca";
                          const isLeaveBlock = !!leaveEntry && !isTangCa;

                          const cellBg = isLeaveBlock
                            ? leaveEntry!.type === "nghi_phep"    ? "bg-purple-50"
                            : leaveEntry!.type === "nghi_co_luong" ? "bg-green-50"
                            : ""
                            : isSpecial ? "bg-orange-50"
                            : hasShift  ? cn("bg-violet-50", !saved && !isTangCa && "hover:bg-violet-100 transition-colors")
                            : "";

                          const cellTitle = isLeaveBlock
                            ? leaveEntry!.type === "nghi_phep" ? "Nghỉ phép" : "Nghỉ phép năm"
                            : isTangCa
                            ? `Tăng ca: ${leaveEntry!.otHours}h`
                            : hasShift ? "Bấm để chấm công" : undefined;

                          return (
                            <td
                              key={dayIdx}
                              className={cn(
                                "border-b border-r border-gray-200 p-0 relative",
                                hasShift && "cursor-pointer",
                                cellBg
                              )}
                              style={{ width: DAY_W, height: 36 }}
                              onClick={() => hasShift && canEdit && openDialog(r.staff, d, ids)}
                              title={cellTitle}
                            >
                              <CellContent
                                status={status}
                                tongCong={isLeaveBlock ? leavePNTongCong : (saved?.tongCong ?? 0)}
                                leaveType={leaveEntry?.type}
                                otHours={leaveEntry?.otHours}
                              />
                            </td>
                          );
                        })}
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center font-semibold", sum.tongCong > 0 ? "text-violet-700" : "text-muted-foreground")} style={{ right: COL_NGHI + COL_MUON + COL_TANG, width: COL_TONG, boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                          {sum.tongCong > 0 ? parseFloat(sum.tongCong.toFixed(4)).toString() : "0"}
                        </td>
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center text-muted-foreground")} style={{ right: COL_MUON + COL_TANG, width: COL_NGHI }}>{sum.nghi || 0}</td>
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center", sum.muon > 0 ? "text-amber-600 font-medium" : "text-muted-foreground")} style={{ right: COL_TANG, width: COL_MUON }}>{sum.muon || 0}</td>
                        <td className={cn(tdBase, "sticky z-20 bg-white text-center border-r-0", sum.tangCa > 0 ? "text-blue-600 font-medium" : "text-muted-foreground")} style={{ right: 0, width: COL_TANG }}>{sum.tangCa || 0}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="shrink-0 bg-white rounded-b-xl border-x border-b border-gray-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground -mt-px">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="font-medium text-foreground">Chú thích:</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-100 border border-violet-200 inline-block" /> Có ca làm việc</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center px-1 h-4 rounded bg-amber-50 text-amber-600 text-[9px] font-bold border border-amber-200">M</span> Đi muộn</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center px-1 h-4 rounded bg-blue-50 text-blue-600 text-[9px] font-bold border border-blue-200">TC</span> Tăng ca</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center px-1 h-4 rounded bg-purple-50 text-purple-600 text-[9px] font-bold border border-purple-200">P</span> Nghỉ phép</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center px-1 h-4 rounded bg-green-50 text-green-700 text-[9px] font-bold border border-green-200">PN</span> Phép năm (tính lương)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span>Hiển thị</span>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-[68px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>/ {totalRows} nhân sự</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs px-2">Trang {safePage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ DIALOG CHẤM CÔNG ══ */}
      <Dialog open={!!dialogCell} onOpenChange={open => !open && setDialogCell(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl max-h-[95vh] flex flex-col">
          {dialogCell && (() => {
            const dateLabel = format(dialogCell.day.date, "EEEE, dd/MM/yyyy", { locale: vi });
            const initials = (dialogCell.staff.fullName || "?").split(" ").map((w: string) => w[0]).slice(-2).join("").toUpperCase();
            const multiShift = dialogCell.shiftIds.length > 1;
            // Compute per-shift data for all shifts
            const allShiftData = dialogCell.shiftIds.map(id => ({ id, ...getDlgShiftData(id) }));
            const totalWorkedHours = allShiftData.reduce((s, d) => s + d.workedHours, 0);
            const totalTongCongDlg = allShiftData.reduce((s, d) => s + d.tongCong, 0);
            const canSave = allShiftData.some(d => d.workedHours > 0);

            return (
              <>
                {/* ── Light gray header ── */}
                <div className="bg-gray-100 border-b border-gray-200 px-5 py-4 shrink-0">
                  <DialogHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-violet-100 border-2 border-violet-200 flex items-center justify-center text-base font-bold text-violet-700 shrink-0">
                          {initials}
                        </div>
                        <div>
                          <DialogTitle className="text-gray-800 text-sm font-bold leading-tight">
                            {dialogCell.staff.fullName || dialogCell.staff.code}
                          </DialogTitle>
                          {dialogCell.staff.code && (
                            <p className="text-gray-500 text-xs mt-0.5">{dialogCell.staff.code}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-violet-100 text-violet-700 rounded-full px-3 py-1 text-xs font-semibold shrink-0">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Chấm công{multiShift ? ` (${dialogCell.shiftIds.length} ca)` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 mt-3">
                      <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-gray-400 text-[10px] uppercase tracking-wide font-medium">Ngày làm việc</p>
                        <p className="text-gray-700 text-sm font-semibold capitalize">{dateLabel}</p>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                {/* ── Body ── */}
                <div className="bg-gray-200 px-4 py-4 space-y-3 overflow-y-auto flex-1">

                  {/* Đơn từ ngày này */}
                  {dlgLeaveRequests.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                          <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Đơn từ đã duyệt</span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {dlgLeaveRequests.map((lr: any) => {
                          if (lr.type === "nghi_phep") return (
                            <div key={lr.id} className="flex items-center gap-3 bg-purple-50 rounded-lg px-3 py-2.5">
                              <span className="text-[11px] font-bold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5 shrink-0">P</span>
                              <div><p className="text-sm font-medium text-purple-800">Nghỉ phép</p></div>
                            </div>
                          );
                          if (lr.type === "nghi_co_luong") return (
                            <div key={lr.id} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2.5">
                              <span className="text-[11px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5 shrink-0">PN</span>
                              <div><p className="text-sm font-medium text-green-800">Nghỉ phép năm</p></div>
                            </div>
                          );
                          if (lr.type === "tang_ca") {
                            const otH = lr.hours ? parseFloat(lr.hours) : 0;
                            const fromFmt = lr.overtimeFrom ? formatTime12(lr.overtimeFrom.slice(0,5)) : null;
                            const toFmt = lr.overtimeTo ? formatTime12(lr.overtimeTo.slice(0,5)) : null;
                            return (
                              <div key={lr.id} className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2.5">
                                <span className="text-[11px] font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5 shrink-0">TC</span>
                                <p className="text-sm font-medium text-blue-800">
                                  Tăng ca{otH > 0 ? `: ${otH}h` : ""}
                                  {fromFmt && toFmt && <span className="text-blue-600 font-normal ml-1">({fromFmt} – {toFmt})</span>}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Per-shift collapsible cards ── */}
                  {allShiftData.map((sd, idx) => {
                    const sm = sd.status ? STATUS_META[sd.status] : null;
                    const StatusIcon = sm?.icon;
                    const isExpanded = dlgExpanded[sd.id] ?? true;
                    const tplCode = sd.tpl?.code || sd.tpl?.name || "—";
                    return (
                      <div key={sd.id} className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
                        {/* Collapsible header */}
                        <button
                          type="button"
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                          onClick={() => setDlgExpanded(prev => ({ ...prev, [sd.id]: !isExpanded }))}
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-violet-500 shrink-0" />
                            <span className="text-sm font-semibold text-gray-700">
                              {multiShift ? `Ca ${idx + 1}: ` : ""}
                              <span className="text-violet-600">{tplCode}</span>
                            </span>
                            {!isExpanded && sd.workedHours > 0 && (
                              <span className="ml-1 text-xs text-gray-400">
                                · {formatHours(sd.workedHours)} · {sd.tongCong > 0 ? sd.tongCong.toFixed(4).replace(/\.?0+$/, "") : "0"} công
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {sm && StatusIcon && !isExpanded && (
                              <StatusIcon className={cn("h-4 w-4", sm.cls)} />
                            )}
                            <span className="text-xs text-gray-400 font-medium">
                              {sd.tpl?.startTime ? formatTime12(sd.tpl.startTime.slice(0,5)) : "—"}–{sd.tpl?.endTime ? formatTime12(sd.tpl.endTime.slice(0,5)) : "—"}
                            </span>
                            <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                          </div>
                        </button>

                        {/* Expandable content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-violet-50 rounded-lg px-3 py-1.5 text-center">
                                <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wide">Tổng giờ ca</p>
                                <p className="text-sm font-bold text-violet-800">{formatHours(sd.shiftHours)}</p>
                              </div>
                              <div className="bg-purple-50 rounded-lg px-3 py-1.5 text-center">
                                <p className="text-[10px] text-purple-500 font-medium uppercase tracking-wide">Số công</p>
                                <p className="text-sm font-bold text-purple-800">{sd.soCong}</p>
                              </div>
                            </div>

                            {/* Time inputs */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Thời gian vào</label>
                                <div className="relative">
                                  <input
                                    type="time"
                                    value={sd.times.timeIn}
                                    min={sd.tpl?.startTime?.slice(0,5)}
                                    max={sd.tpl?.endTime?.slice(0,5)}
                                    onChange={e => {
                                      let val = e.target.value;
                                      const s = sd.tpl?.startTime?.slice(0,5), en = sd.tpl?.endTime?.slice(0,5);
                                      if (s && val < s) val = s;
                                      if (en && val > en) val = en;
                                      setShiftTime(sd.id, "timeIn", val);
                                    }}
                                    onBlur={e => {
                                      let val = e.target.value;
                                      const s = sd.tpl?.startTime?.slice(0,5), en = sd.tpl?.endTime?.slice(0,5);
                                      if (s && val < s) val = s;
                                      if (en && val > en) val = en;
                                      setShiftTime(sd.id, "timeIn", val);
                                    }}
                                    className="w-full h-9 px-2 pr-8 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all bg-gray-50 hover:bg-white"
                                  />
                                  <Clock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                                </div>
                                <p className="text-[10px] text-violet-600 font-medium mt-0.5 text-center">{formatTime12(sd.times.timeIn)}</p>
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Thời gian ra</label>
                                <div className="relative">
                                  <input
                                    type="time"
                                    value={sd.times.timeOut}
                                    min={sd.tpl?.startTime?.slice(0,5)}
                                    max={sd.tpl?.endTime?.slice(0,5)}
                                    onChange={e => {
                                      let val = e.target.value;
                                      const s = sd.tpl?.startTime?.slice(0,5), en = sd.tpl?.endTime?.slice(0,5);
                                      if (s && val < s) val = s;
                                      if (en && val > en) val = en;
                                      setShiftTime(sd.id, "timeOut", val);
                                    }}
                                    onBlur={e => {
                                      let val = e.target.value;
                                      const s = sd.tpl?.startTime?.slice(0,5), en = sd.tpl?.endTime?.slice(0,5);
                                      if (s && val < s) val = s;
                                      if (en && val > en) val = en;
                                      setShiftTime(sd.id, "timeOut", val);
                                    }}
                                    className="w-full h-9 px-2 pr-8 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all bg-gray-50 hover:bg-white"
                                  />
                                  <Clock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                                </div>
                                <p className="text-[10px] text-violet-600 font-medium mt-0.5 text-center">{formatTime12(sd.times.timeOut)}</p>
                              </div>
                            </div>

                            {/* Computed */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center border border-gray-100">
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Giờ làm</p>
                                <p className="text-sm font-bold text-gray-800">{formatHours(sd.workedHours)}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center border border-gray-100">
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Công ca này</p>
                                <p className="text-sm font-bold text-gray-800">
                                  {sd.tongCong > 0 ? sd.tongCong.toFixed(4).replace(/\.?0+$/, "") : "0"}
                                </p>
                              </div>
                            </div>

                            {/* Status badge */}
                            {sm && StatusIcon && (
                              <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 border", sm.bg)}>
                                <StatusIcon className={cn("h-4 w-4 shrink-0", sm.cls)} />
                                <div>
                                  <p className={cn("text-sm font-semibold", sm.cls)}>{sm.label}</p>
                                  {sd.status === "overtime" && sd.otHours > 0 && (
                                    <p className="text-xs text-blue-600">Tăng ca: {formatHours(sd.otHours)}</p>
                                  )}
                                  {sd.status === "late" && (
                                    <p className="text-xs text-amber-600">Thiếu {formatHours(Math.max(0, sd.shiftHours - sd.workedHours))} so với ca</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Multi-shift summary */}
                  {multiShift && (
                    <div className="bg-violet-600 rounded-xl px-4 py-3 flex items-center justify-between text-white">
                      <span className="text-sm font-semibold">Tổng cộng ({dialogCell.shiftIds.length} ca)</span>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] text-violet-200 uppercase tracking-wide">Tổng giờ</p>
                          <p className="text-sm font-bold">{formatHours(totalWorkedHours)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-violet-200 uppercase tracking-wide">Tổng công</p>
                          <p className="text-sm font-bold">{totalTongCongDlg.toFixed(4).replace(/\.?0+$/, "")}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <DialogFooter className="bg-white px-5 py-4 border-t border-gray-100 gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDialogCell(null)}>Hủy</Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm"
                    onClick={saveAttendance}
                    disabled={!canSave}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Lưu chấm công
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* ══ DIALOG TẢI LÊN ══ */}
      <Dialog open={uploadOpen} onOpenChange={open => { setUploadOpen(open); if (!open) { setUploadFile(null); setImportResult(null); } }}>
        <DialogContent className="p-0 overflow-hidden rounded-2xl border-0 shadow-2xl flex flex-col" style={{ width: "65vw", maxWidth: "65vw" }}>
          {/* Header */}
          <div className="bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 px-6 pt-5 pb-4 text-white relative overflow-hidden shrink-0">
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/10" />
            <DialogHeader className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Upload className="h-5 w-5" />
                </div>
                <DialogTitle className="text-white text-base font-bold">Import chấm công – Tháng {month}/{year}</DialogTitle>
              </div>
            </DialogHeader>
          </div>

          {/* Body — 2 cột ngang */}
          <div className="bg-gray-50 p-5 flex gap-4 flex-1">

            {/* ─── Cột trái: Tải file mẫu ─── */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <Download className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-sm font-semibold text-gray-800">Tải file mẫu</span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 flex-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Chọn <strong>ngày</strong> cần xuất — file chứa nhân sự có ca hôm đó. Điền cột{" "}
                  <span className="text-orange-600 font-semibold">Thời gian vào/ra</span> (nền cam) rồi import lại.
                </p>

                {/* Chọn ngày */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ngày chấm công</label>
                  <input
                    type="date"
                    value={uploadDate}
                    min={`${year}-${String(month).padStart(2, "0")}-01`}
                    max={`${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`}
                    onChange={e => setUploadDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                {/* Chọn cơ sở */}
                {(locations as any[]).length > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cơ sở (tùy chọn)</label>
                    <Select value={uploadLocationId || "_all"} onValueChange={v => setUploadLocationId(v === "_all" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">Tất cả cơ sở</SelectItem>
                        {(locations as any[]).map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

              </div>

              <Button
                className="w-full h-9 bg-orange-500 hover:bg-orange-600 text-white gap-2 text-sm shrink-0"
                onClick={downloadTemplate}
                disabled={!uploadDate}
              >
                <Download className="h-3.5 w-3.5" />
                Tải xuống file mẫu (.xlsx)
              </Button>
            </div>

            {/* Divider dọc */}
            <div className="w-px bg-gray-200 shrink-0 self-stretch" />

            {/* ─── Cột phải: Import file ─── */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <FileUp className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-sm font-semibold text-gray-800">Import file</span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 flex-1">
                {/* Chọn cơ sở */}
                {(locations as any[]).length > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cơ sở</label>
                    <Select value={uploadLocationId || "_all"} onValueChange={v => setUploadLocationId(v === "_all" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">Tất cả cơ sở</SelectItem>
                        {(locations as any[]).map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Upload file */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Chọn file Excel</label>
                  <label className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
                    (locations as any[]).length > 1 ? "h-[106px]" : "h-[140px]",
                    uploadFile ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
                  )}>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setImportResult(null); }}
                    />
                    {uploadFile ? (
                      <>
                        <FileUp className="h-6 w-6 text-orange-500" />
                        <span className="text-xs font-medium text-orange-700 text-center px-2 truncate max-w-full">{uploadFile.name}</span>
                        <span className="text-[10px] text-muted-foreground">Nhấp để đổi file</span>
                      </>
                    ) : (
                      <>
                        <FileUp className="h-6 w-6 text-gray-400" />
                        <span className="text-xs text-muted-foreground">Nhấp để chọn file .xlsx</span>
                      </>
                    )}
                  </label>
                </div>

                {/* Kết quả import */}
                {importResult && (
                  <div className={cn(
                    "rounded-lg border p-2.5 text-xs space-y-1",
                    importResult.success > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                  )}>
                    <p className="font-semibold">
                      {importResult.success > 0 ? `✓ Đã import thành công ${importResult.success} bản ghi` : "Không có bản ghi nào được import"}
                    </p>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <ul className="space-y-0.5 mt-1 max-h-20 overflow-y-auto">
                        {importResult.errors.map((e, i) => <li key={i} className="text-red-600">• {e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <Button
                className="w-full h-9 bg-orange-500 hover:bg-orange-600 text-white gap-2 text-sm shrink-0"
                onClick={handleImport}
                disabled={!uploadFile || isImporting}
              >
                {isImporting ? (
                  <><span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" /> Đang import…</>
                ) : (
                  <><FileUp className="h-3.5 w-3.5" /> Import chấm công</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Attendance Dialog ── */}
      <Dialog open={bulkOpen} onOpenChange={v => { if (!bulkSaving) setBulkOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-violet-600" />
              Chấm công hàng loạt
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Chọn khoảng ngày */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Khoảng ngày chấm công</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Từ ngày</span>
                  <input
                    type="date"
                    value={bulkDateFrom}
                    onChange={e => {
                      setBulkDateFrom(e.target.value);
                      if (e.target.value > bulkDateTo) setBulkDateTo(e.target.value);
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Đến ngày</span>
                  <input
                    type="date"
                    value={bulkDateTo}
                    min={bulkDateFrom}
                    onChange={e => setBulkDateTo(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              {bulkDateFrom && bulkDateTo && bulkDateFrom !== bulkDateTo && (
                <p className="text-xs text-violet-600 bg-violet-50 rounded-md px-2.5 py-1.5 border border-violet-100">
                  {(() => {
                    const from = new Date(bulkDateFrom + "T00:00:00");
                    const to   = new Date(bulkDateTo   + "T00:00:00");
                    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
                    return `${days} ngày — từ ${format(from, "dd/MM/yyyy")} đến ${format(to, "dd/MM/yyyy")}`;
                  })()}
                </p>
              )}
            </div>

            {/* Loại chấm công */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loại chấm công</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkType("full")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    bulkType === "full"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <CheckCircle2 className={cn("h-4 w-4", bulkType === "full" ? "text-emerald-500" : "text-muted-foreground")} />
                  Đủ giờ
                </button>
                <button
                  type="button"
                  onClick={() => setBulkType("late")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    bulkType === "late"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <AlertCircle className={cn("h-4 w-4", bulkType === "late" ? "text-amber-500" : "text-muted-foreground")} />
                  Thiếu giờ
                </button>
              </div>
            </div>

            {/* Nhập số phút thiếu */}
            {bulkType === "late" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Giờ thiếu (phút)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={bulkLateMinutes}
                    onChange={e => setBulkLateMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
                    className="w-24 h-9 rounded-md border border-input bg-background px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-sm text-muted-foreground">phút muộn giờ vào</span>
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-2.5 py-1.5 border border-amber-100">
                  Ví dụ: ca 08:00–17:00 → vào lúc {addMinutes("08:00", bulkLateMinutes)}. Mỗi nhân sự tính theo ca của họ.
                </p>
              </div>
            )}

            {/* Thống kê chọn */}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Áp dụng cho <span className="font-semibold text-foreground">{selectedIds.size} nhân sự</span> đã chọn
            </div>

            {/* Kết quả */}
            {bulkResult && (
              <div className={cn(
                "rounded-lg border px-3 py-2 text-xs space-y-0.5",
                bulkResult.success > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
              )}>
                {bulkResult.success > 0 && (
                  <p className="font-semibold">✓ Đã lưu {bulkResult.success} bản ghi chấm công</p>
                )}
                {bulkResult.skipped > 0 && (
                  <p className="text-amber-700">⚠ Bỏ qua {bulkResult.skipped} lượt (không có ca trong ngày đó)</p>
                )}
                {bulkResult.success === 0 && bulkResult.skipped === 0 && (
                  <p className="font-semibold">Không có bản ghi nào được lưu</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              {bulkResult ? "Đóng" : "Hủy"}
            </Button>
            {!bulkResult && (
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
                onClick={saveBulkAttendance}
                disabled={bulkSaving || !bulkDateFrom || !bulkDateTo || bulkDateFrom > bulkDateTo}
              >
                {bulkSaving ? (
                  <><span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" /> Đang lưu…</>
                ) : (
                  <><ClipboardCheck className="h-3.5 w-3.5" /> Xác nhận chấm công</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
