import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, addDays, subDays,
  eachDayOfInterval, isToday, parseISO,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, List, Calendar, LayoutGrid,
  User, Building2, Search, ClipboardList, Table2, CalendarClock, Check, ChevronsUpDown, X, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { SessionDetailSheet } from "@/components/education/SessionDetailSheet";
import { TestSessionDetailDialog } from "@/components/education/TestSessionDetailDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/queryClient";
import ExcelJS from "exceljs";

type ViewMode = "list-day" | "list-week" | "week" | "month" | "room" | "teacher";

interface ScheduleSession {
  id: string;
  classId: string;
  classCode: string;
  className: string;
  locationId: string;
  locationName: string;
  sessionDate: string;
  weekday: number;
  sessionIndex: number;
  totalSessions: number;
  enrolledCount: number;
  status: string;
  teachers: string[];
  shiftStart: string;
  shiftEnd: string;
  shiftName: string;
  learningFormat: string;
  teacherIds: string[];
  classColor?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  lessons?: string[];
  homeworks?: string[];
  tests?: string[];
  curriculums?: string[];
  isTestSession?: boolean;
}

const CLASS_COLORS = [
  "bg-pink-50 text-pink-800 border-pink-200",
  "bg-blue-50 text-blue-800 border-blue-200",
  "bg-purple-50 text-purple-800 border-purple-200",
  "bg-green-50 text-green-800 border-green-200",
  "bg-orange-50 text-orange-800 border-orange-200",
  "bg-yellow-50 text-yellow-800 border-yellow-200",
  "bg-teal-50 text-teal-800 border-teal-200",
  "bg-red-50 text-red-800 border-red-200",
  "bg-indigo-50 text-indigo-800 border-indigo-200",
  "bg-cyan-50 text-cyan-800 border-cyan-200",
];

function getClassColor(classId: string) {
  let hash = 0;
  for (let i = 0; i < classId.length; i++) hash = (hash * 31 + classId.charCodeAt(i)) & 0xffffffff;
  return CLASS_COLORS[Math.abs(hash) % CLASS_COLORS.length];
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatShiftTime(start: string, end: string) {
  return `${start?.slice(0, 5) ?? ""} – ${end?.slice(0, 5) ?? ""}`;
}

export function Schedule() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [filterTeachers, setFilterTeachers] = useState<string[]>([]);
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [filterClasses, setFilterClasses] = useState<string[]>([]);
  const [filterTimeFrom, setFilterTimeFrom] = useState("");
  const [filterTimeTo, setFilterTimeTo] = useState("");
  const [selectedSession, setSelectedSession] = useState<{ sessionId: string; classId: string } | null>(null);
  const [selectedTestSessionId, setSelectedTestSessionId] = useState<string | null>(null);

  const [holidayUpdateOpen, setHolidayUpdateOpen] = useState(false);
  const [hlLocations, setHlLocations] = useState<string[]>([]);
  const [hlTeachers, setHlTeachers] = useState<string[]>([]);
  const [hlHolidays, setHlHolidays] = useState<string[]>([]);

  const { from, to } = useMemo(() => {
    if (viewMode === "month") {
      const s = startOfMonth(currentDate);
      const e = endOfMonth(currentDate);
      return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
    }
    if (viewMode === "list-day") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { from: d, to: d };
    }
    const s = startOfWeek(currentDate, { weekStartsOn: 1 });
    const e = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
  }, [viewMode, currentDate]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const dateLabel = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: vi })
    : viewMode === "list-day"
    ? format(currentDate, "EEEE, dd/MM/yyyy", { locale: vi })
    : `Tuần ${format(weekStart, "dd/MM")} – ${format(weekEnd, "dd/MM/yyyy")}`;

  const { data: sessions = [], isLoading } = useQuery<ScheduleSession[]>({
    queryKey: ["/api/schedule", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/schedule?${params}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: locationsRaw } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
  });
  const locations = locationsRaw ?? [];

  const { data: holidaysRaw } = useQuery<{ id: string; name: string; startDate: string; endDate: string }[]>({
    queryKey: ["/api/public-holidays"],
    staleTime: 5 * 60 * 1000,
  });
  const holidays = holidaysRaw ?? [];

  const { data: allStaffRaw } = useQuery<{ id: string; fullName: string; code: string; locationId?: string | null }[]>({
    queryKey: ["/api/staff?minimal=true"],
    staleTime: 5 * 60 * 1000,
  });
  const allStaff = allStaffRaw ?? [];

  const { data: allClassesRaw } = useQuery<{ id: string; name: string; classCode: string; locationId: string }[]>({
    queryKey: ["/api/classes?minimal=true"],
    queryFn: async () => {
      const res = await fetch("/api/classes?minimal=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch classes");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const allClasses = (allClassesRaw ?? []).map(c => ({ id: c.id, label: c.classCode || c.name }));

  const filtered = useMemo(() => sessions.filter(s => {
    if (filterTeachers.length > 0 && !filterTeachers.some(id => s.teacherIds?.includes(id))) return false;
    if (filterLocations.length > 0 && !filterLocations.includes(s.locationId)) return false;
    if (filterClasses.length > 0 && !filterClasses.includes(s.classId)) return false;
    if (filterTimeFrom && s.shiftStart && s.shiftStart.slice(0, 5) < filterTimeFrom) return false;
    if (filterTimeTo && s.shiftEnd && s.shiftEnd.slice(0, 5) > filterTimeTo) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.classCode.toLowerCase().includes(q)
        || s.className.toLowerCase().includes(q)
        || s.locationName.toLowerCase().includes(q)
        || s.teachers.some(t => t.toLowerCase().includes(q));
    }
    return true;
  }), [sessions, filterTeachers, filterLocations, filterClasses, filterTimeFrom, filterTimeTo, search]);

  function navigate(dir: 1 | -1) {
    if (viewMode === "month") setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    else if (viewMode === "list-day") setCurrentDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1));
    else setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
  }

  function openSession(session: ScheduleSession) {
    if (session.isTestSession) {
      setSelectedTestSessionId(session.id);
    } else {
      setSelectedSession({ sessionId: session.id, classId: session.classId });
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">
        {/* ── Toolbar ── */}
        <div className="flex-shrink-0 bg-white rounded-xl border shadow-sm px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {([
                { id: "list-day",  label: "Ngày",        icon: CalendarClock },
                { id: "list-week", label: "Danh sách",   icon: List },
                { id: "month",     label: "Tháng",       icon: Calendar },
                { id: "week",      label: "Tuần",        icon: LayoutGrid },
                { id: "room",      label: "Theo phòng",  icon: Table2 },
                { id: "teacher",   label: "Theo GV",     icon: User },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  data-testid={`view-${id}`}
                  onClick={() => setViewMode(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === id ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)} data-testid="btn-prev">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-white text-sm font-medium min-w-[220px] justify-center">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span data-testid="date-label">{dateLabel}</span>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)} data-testid="btn-next">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Button
              size="sm"
              className="h-8 text-sm gap-1.5"
              onClick={() => setHolidayUpdateOpen(true)}
              variant="outline"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Cập nhật nghỉ lễ
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative w-[160px] shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search"
              />
            </div>

            {/* Lớp học */}
            <div className="flex items-center gap-1 shrink-0">
              <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <MultiSelect
                options={allClasses.map(c => ({ value: c.id, label: c.label }))}
                selected={filterClasses}
                onChange={setFilterClasses}
                placeholder="Tất cả lớp"
                searchPlaceholder="Tìm lớp..."
                allLabel="Tất cả lớp"
                className="w-[140px]"
              />
            </div>

            {/* Giáo viên */}
            <div className="flex items-center gap-1 shrink-0">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <MultiSelect
                options={allStaff.map(t => ({ value: t.id, label: t.fullName, sub: t.code }))}
                selected={filterTeachers}
                onChange={setFilterTeachers}
                placeholder="Tất cả GV"
                searchPlaceholder="Tìm giáo viên..."
                allLabel="Tất cả GV"
                className="w-[140px]"
              />
            </div>

            {/* Cơ sở */}
            <div className="flex items-center gap-1 shrink-0">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <MultiSelect
                options={locations.map(l => ({ value: l.id, label: l.name }))}
                selected={filterLocations}
                onChange={setFilterLocations}
                placeholder="Tất cả cơ sở"
                searchPlaceholder="Tìm cơ sở..."
                allLabel="Tất cả cơ sở"
                className="w-[130px]"
              />
            </div>

            {/* Khung giờ */}
            <div className="flex items-center gap-1 border rounded-md px-2 h-8 bg-white text-sm shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Giờ:</span>
              <input
                type="time"
                value={filterTimeFrom}
                onChange={e => setFilterTimeFrom(e.target.value)}
                className="h-6 text-xs border-0 outline-none bg-transparent w-[70px]"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="time"
                value={filterTimeTo}
                onChange={e => setFilterTimeTo(e.target.value)}
                className="h-6 text-xs border-0 outline-none bg-transparent w-[70px]"
              />
              {(filterTimeFrom || filterTimeTo) && (
                <button
                  onClick={() => { setFilterTimeFrom(""); setFilterTimeTo(""); }}
                  className="ml-0.5 text-muted-foreground hover:text-foreground text-xs leading-none"
                  title="Xóa"
                >✕</button>
              )}
            </div>

            <PageGuideButton pageTitle="Lịch học" className="ml-auto shrink-0" />
          </div>
        </div>

        {/* ── Calendar ── */}
        <div className="flex-1 bg-white rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Đang tải lịch học...
            </div>
          ) : viewMode === "list-day" || viewMode === "list-week" ? (
            <ListView sessions={filtered} onSessionClick={openSession} holidays={holidays} />
          ) : viewMode === "week" ? (
            <WeekView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} holidays={holidays} />
          ) : viewMode === "room" ? (
            <RoomView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} filterLocation={filterLocations.length === 1 ? filterLocations[0] : "all"} holidays={holidays} />
          ) : viewMode === "teacher" ? (
            <TeacherView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} holidays={holidays} />
          ) : (
            <MonthView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} holidays={holidays} />
          )}
        </div>
      </div>

      {/* Session detail sheet (lớp học thường) */}
      <SessionDetailSheet
        sessionId={selectedSession?.sessionId ?? null}
        classId={selectedSession?.classId ?? null}
        onClose={() => setSelectedSession(null)}
      />

      {/* Test session detail dialog (lớp TEST) */}
      <TestSessionDetailDialog
        sessionId={selectedTestSessionId}
        onClose={() => setSelectedTestSessionId(null)}
      />

      {/* Cập nhật nghỉ lễ dialog */}
      <HolidayUpdateDialog
        open={holidayUpdateOpen}
        onClose={() => setHolidayUpdateOpen(false)}
        onApplied={() => queryClient.invalidateQueries({ queryKey: ["/api/schedule"] })}
        locations={locations}
        allStaff={allStaff}
        holidays={holidays}
        selectedLocations={hlLocations}
        onChangeLocations={setHlLocations}
        selectedTeachers={hlTeachers}
        onChangeTeachers={setHlTeachers}
        selectedHolidays={hlHolidays}
        onChangeHolidays={setHlHolidays}
      />
    </DashboardLayout>
  );
}

// ── Multi-select dropdown ──────────────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = "Tìm kiếm...",
  allLabel = "Tất cả",
  renderLabel,
  className,
}: {
  options: { value: string; label: string; sub?: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  allLabel?: string;
  renderLabel?: (o: { value: string; label: string; sub?: string }) => React.ReactNode;
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

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const displayText = selected.length === 0
    ? allLabel
    : selected.length === options.length
      ? allLabel
      : selected.length === 1
        ? (options.find(o => o.value === selected[0])?.label ?? placeholder)
        : `${selected.length} đã chọn`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 w-full border rounded-md px-3 py-1.5 bg-white text-sm text-left hover:bg-muted/30 transition-colors"
      >
        <span className={cn("flex-1 truncate", selected.length === 0 || selected.length === options.length ? "text-muted-foreground" : "text-foreground")}>
          {displayText}
        </span>
        {selected.length > 0 && selected.length < options.length && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] max-w-[360px] bg-white border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => onChange([])}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 text-left",
                (selected.length === 0 || selected.length === options.length) && "font-medium text-primary"
              )}
            >
              <div className={cn("w-4 h-4 border rounded flex items-center justify-center shrink-0",
                (selected.length === 0 || selected.length === options.length) ? "bg-primary border-primary" : "border-input"
              )}>
                {(selected.length === 0 || selected.length === options.length) && <Check className="w-3 h-3 text-white" />}
              </div>
              {allLabel}
            </button>
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 text-left"
              >
                <div className={cn("w-4 h-4 border rounded flex items-center justify-center shrink-0",
                  selected.includes(o.value) ? "bg-primary border-primary" : "border-input"
                )}>
                  {selected.includes(o.value) && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="flex-1 truncate">
                  {renderLabel ? renderLabel(o) : (
                    <span>
                      {o.label}
                      {o.sub && <span className="ml-1.5 text-xs text-muted-foreground">({o.sub})</span>}
                    </span>
                  )}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Holiday Update Dialog ───────────────────────────────────────────────────
type HolidayPlan = {
  holidays: { id: string; name: string; startDate: string; endDate: string }[];
  classes: { classId: string; className: string; ranges: { fromSessionId: string; toSessionId: string; fromIndex: number; toIndex: number }[]; totalSessions: number }[];
  totalSessions: number;
};
type ApplyResult = { success: number; failed: number; results: { classId: string; className: string; excluded: number; error?: string }[] };
type DialogStep = "select" | "preview" | "applying" | "done";

function HolidayUpdateDialog({
  open, onClose, onApplied,
  locations, allStaff, holidays,
  selectedLocations, onChangeLocations,
  selectedTeachers, onChangeTeachers,
  selectedHolidays, onChangeHolidays,
}: {
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
  locations: { id: string; name: string }[];
  allStaff: { id: string; fullName: string; code: string; locationId?: string | null }[];
  holidays: { id: string; name: string; startDate: string; endDate: string }[];
  selectedLocations: string[];
  onChangeLocations: (v: string[]) => void;
  selectedTeachers: string[];
  onChangeTeachers: (v: string[]) => void;
  selectedHolidays: string[];
  onChangeHolidays: (v: string[]) => void;
}) {
  const [step, setStep] = useState<DialogStep>("select");
  const [plan, setPlan] = useState<HolidayPlan | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset internal state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setPlan(null);
      setApplyResult(null);
      setLoading(false);
      setErrorMsg(null);
    }
  }, [open]);

  const activeLocationIds = selectedLocations.length === 0 ? null : selectedLocations;

  const filteredStaff = useMemo(() => {
    const staff = allStaff ?? [];
    if (!activeLocationIds) return staff;
    return staff.filter(s => s.locationId && activeLocationIds.includes(s.locationId));
  }, [allStaff, activeLocationIds]);

  useEffect(() => {
    if (selectedTeachers.length > 0 && filteredStaff.length > 0) {
      const validIds = new Set(filteredStaff.map(s => s.id));
      const stillValid = selectedTeachers.filter(id => validIds.has(id));
      if (stillValid.length !== selectedTeachers.length) onChangeTeachers(stillValid);
    }
  }, [filteredStaff]);

  const locationOptions = (locations ?? []).map(l => ({ value: l.id, label: l.name }));
  const teacherOptions = (filteredStaff ?? []).map(s => ({ value: s.id, label: s.fullName, sub: s.code }));
  const holidayOptions = (holidays ?? []).map(h => ({
    value: h.id,
    label: h.name,
    sub: `${h.startDate} – ${h.endDate}`,
  }));

  const fmt = (d: string) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const effectiveHolidayIds = selectedHolidays.length === 0 ? holidays.map(h => h.id) : selectedHolidays;

  async function callApi(path: string, body: object): Promise<any> {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = `Lỗi ${res.status}`;
      try { msg = JSON.parse(text).message || msg; } catch { /* non-JSON error body */ }
      throw new Error(msg);
    }
    return res.json();
  }

  async function handlePreview() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data: HolidayPlan = await callApi("/api/schedule/preview-apply-holidays", {
        locationIds: selectedLocations.length > 0 ? selectedLocations : undefined,
        teacherIds: selectedTeachers.length > 0 ? selectedTeachers : undefined,
        holidayIds: effectiveHolidayIds,
      });
      setPlan(data);
      setStep("preview");
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setStep("applying");
    setLoading(true);
    setErrorMsg(null);
    try {
      const data: ApplyResult = await callApi("/api/schedule/apply-holidays", {
        locationIds: selectedLocations.length > 0 ? selectedLocations : undefined,
        teacherIds: selectedTeachers.length > 0 ? selectedTeachers : undefined,
        holidayIds: effectiveHolidayIds,
      });
      setApplyResult(data);
      setStep("done");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  const noHolidaysAvailable = (holidays ?? []).length === 0;
  const canPreview = effectiveHolidayIds.length > 0 && !noHolidaysAvailable;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            Cập nhật nghỉ lễ
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Chọn phạm vi áp dụng ngày nghỉ lễ cho lịch học."}
            {step === "preview" && "Xem trước những lớp sẽ bị ảnh hưởng trước khi xác nhận."}
            {step === "applying" && "Đang xử lý…"}
            {step === "done" && "Hoàn tất cập nhật nghỉ lễ."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: Select ── */}
        {step === "select" && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Cơ sở áp dụng</label>
              <MultiSelect
                options={locationOptions}
                selected={selectedLocations}
                onChange={onChangeLocations}
                placeholder="Chọn cơ sở"
                searchPlaceholder="Tìm cơ sở..."
                allLabel="Tất cả cơ sở"
              />
              {selectedLocations.length > 0 && selectedLocations.length < (locations ?? []).length && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedLocations.map(id => {
                    const loc = (locations ?? []).find(l => l.id === id);
                    return loc ? (
                      <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                        {loc.name}
                        <button onClick={() => onChangeLocations(selectedLocations.filter(v => v !== id))}><X className="w-3 h-3" /></button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Giáo viên áp dụng
                {selectedLocations.length > 0 && selectedLocations.length < (locations ?? []).length && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(theo cơ sở đã chọn)</span>
                )}
              </label>
              <MultiSelect
                options={teacherOptions}
                selected={selectedTeachers}
                onChange={onChangeTeachers}
                placeholder="Chọn giáo viên"
                searchPlaceholder="Tìm tên hoặc mã GV..."
                allLabel="Tất cả giáo viên"
              />
              {selectedTeachers.length > 0 && selectedTeachers.length < (filteredStaff ?? []).length && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedTeachers.map(id => {
                    const s = (filteredStaff ?? []).find(t => t.id === id);
                    return s ? (
                      <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                        {s.fullName} <span className="opacity-60">({s.code})</span>
                        <button onClick={() => onChangeTeachers(selectedTeachers.filter(v => v !== id))}><X className="w-3 h-3" /></button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Ngày nghỉ lễ áp dụng</label>
              {noHolidaysAvailable ? (
                <p className="text-sm text-muted-foreground italic">
                  Chưa có ngày nghỉ lễ nào. Vào{" "}
                  <a href="/settings?tab=holidays" className="text-primary underline underline-offset-2">Cài đặt → Ngày nghỉ lễ</a>{" "}
                  để thêm.
                </p>
              ) : (
                <>
                  <MultiSelect
                    options={holidayOptions}
                    selected={selectedHolidays}
                    onChange={onChangeHolidays}
                    placeholder="Chọn kỳ nghỉ"
                    searchPlaceholder="Tìm ngày nghỉ..."
                    allLabel="Tất cả ngày nghỉ lễ"
                  />
                  {selectedHolidays.length > 0 && selectedHolidays.length < (holidays ?? []).length && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedHolidays.map(id => {
                        const h = (holidays ?? []).find(x => x.id === id);
                        return h ? (
                          <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                            {h.name}
                            <span className="opacity-60 text-[10px]">{fmt(h.startDate)}–{fmt(h.endDate)}</span>
                            <button onClick={() => onChangeHolidays(selectedHolidays.filter(v => v !== id))}><X className="w-3 h-3" /></button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === "preview" && plan && (
          <div className="py-2 space-y-4">
            {plan.classes.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Không có buổi học nào rơi vào ngày nghỉ lễ đã chọn.
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2 items-start">
                  <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Sẽ loại trừ <strong>{plan.totalSessions} buổi</strong> thuộc <strong>{plan.classes.length} lớp</strong> — mỗi lớp sẽ được bù buổi tương ứng vào cuối lịch.
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {plan.classes.map(c => (
                    <div key={c.classId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="font-medium truncate flex-1 mr-2">{c.className}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {c.totalSessions} buổi
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        {/* ── Step: Applying ── */}
        {step === "applying" && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground text-sm">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Đang xử lý {plan?.classes.length ?? 0} lớp…
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === "done" && applyResult && (
          <div className="py-2 space-y-4">
            <div className={`rounded-lg border px-4 py-3 text-sm flex gap-2 items-start ${applyResult.failed === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Hoàn tất: <strong>{applyResult.success} lớp</strong> thành công
                {applyResult.failed > 0 && <>, <strong className="text-red-700">{applyResult.failed} lớp</strong> gặp lỗi</>}.
              </span>
            </div>
            {applyResult.failed > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {applyResult.results.filter(r => r.error).map(r => (
                  <div key={r.classId} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <span className="font-medium">{r.className}</span>: {r.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "select" && (
            <>
              <Button variant="outline" onClick={onClose}>Hủy</Button>
              <Button className="gap-1.5" disabled={!canPreview || loading} onClick={handlePreview}>
                {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                Xem trước
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>Quay lại</Button>
              {(plan?.classes.length ?? 0) > 0 && (
                <Button className="gap-1.5" onClick={handleApply} disabled={loading}>
                  <CalendarClock className="w-3.5 h-3.5" />
                  Xác nhận áp dụng
                </Button>
              )}
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { onApplied?.(); onClose(); }}>Đóng</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Content lines cell ─────────────────────────────────────────────────────
const MAX_LABEL_LEN = 30;

function ContentLines({
  items,
  emptyLabel = "–",
  emptyItalic = false,
}: {
  items: string[];
  emptyLabel?: string;
  emptyItalic?: boolean;
}) {
  if (!items || items.length === 0) {
    return <span className={`text-muted-foreground${emptyItalic ? " italic" : ""}`}>{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item, i) => {
        const isLong = item.length > MAX_LABEL_LEN;
        const label = isLong ? item.slice(0, MAX_LABEL_LEN) + "…" : item;
        if (isLong) {
          return (
            <TooltipProvider key={i} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-foreground cursor-default truncate block max-w-full">{label}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs break-words">
                  {item}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        return <span key={i} className="text-foreground block">{item}</span>;
      })}
    </div>
  );
}

// ── Holiday helper ─────────────────────────────────────────────────────────
function isHolidayDate(dateStr: string, holidays: { startDate: string; endDate: string }[]): boolean {
  return holidays.some(h => dateStr >= h.startDate && dateStr <= h.endDate);
}

// ── Schedule list export ────────────────────────────────────────────────────
const EXPORT_COLS = 13; // number of data columns (no Ngày/Thứ — those are in day-header rows)

async function exportScheduleListToExcel(sessions: ScheduleSession[]) {
  const statusLabel = (s: string) => {
    switch (s) {
      case "completed":  return "Đã dạy";
      case "cancelled":  return "Đã huỷ";
      case "substitute": return "Dạy thay";
      default:           return "Chưa dạy";
    }
  };

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Lịch học");

  const colHeaders = [
    "Cơ sở", "Tên lớp", "Mã lớp", "Giờ học", "Buổi",
    "Giáo viên", "Sĩ số", "Phòng học",
    "Bài học", "BTVN", "Bài kiểm tra", "Giáo trình", "Trạng thái",
  ];

  ws.columns = [
    { width: 16 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 8 },
    { width: 30 }, { width: 8 }, { width: 14 },
    { width: 28 }, { width: 28 }, { width: 22 }, { width: 22 }, { width: 14 },
  ];

  // Column header row (frozen)
  const headerRow = ws.addRow(colHeaders);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5FA3" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  });

  // Group sessions by date
  const byDay = new Map<string, ScheduleSession[]>();
  [...sessions]
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || (a.shiftStart ?? "").localeCompare(b.shiftStart ?? ""))
    .forEach(s => {
      if (!byDay.has(s.sessionDate)) byDay.set(s.sessionDate, []);
      byDay.get(s.sessionDate)!.push(s);
    });

  // Alternating day background (light blue vs very light gray)
  const DAY_COLORS = ["FFDBEAFE", "FFF3F4F6"]; // blue-50 / gray-100
  let dayIdx = 0;

  byDay.forEach((daySessions, date) => {
    const d = parseISO(date);
    const dayLabel = `${WEEKDAY_LABELS[d.getDay()]} – ${format(d, "dd/MM/yyyy")}`;
    const dayColor = DAY_COLORS[dayIdx % 2];
    dayIdx++;

    // Day header row (merged across all columns)
    const dayHeaderRow = ws.addRow([dayLabel]);
    ws.mergeCells(dayHeaderRow.number, 1, dayHeaderRow.number, EXPORT_COLS);
    dayHeaderRow.height = 22;
    const hc = dayHeaderRow.getCell(1);
    hc.font = { bold: true, size: 10, color: { argb: "FF1E40AF" } };
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dayColor } };
    hc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    hc.border = {
      top: { style: "thin", color: { argb: "FFBFDBFE" } },
      bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
      left: { style: "thin" }, right: { style: "thin" },
    };

    // Session rows for this day
    daySessions.forEach((s) => {
      const row = ws.addRow([
        s.locationName || "",
        s.className || "",
        s.classCode || "",
        s.shiftStart && s.shiftEnd ? `${s.shiftStart.slice(0, 5)} – ${s.shiftEnd.slice(0, 5)}` : "",
        s.totalSessions > 0 ? `${s.sessionIndex}/${s.totalSessions}` : "",
        (s.teachers ?? []).join("\n"),
        s.enrolledCount > 0 ? s.enrolledCount : "",
        s.roomName || "",
        (s.lessons ?? []).join("\n"),
        (s.homeworks ?? []).join("\n"),
        (s.tests ?? []).join("\n"),
        (s.curriculums ?? []).join("\n"),
        statusLabel(s.status),
      ]);

      row.eachCell((cell, colIdx) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
        cell.alignment = { vertical: "middle" };
        // Center: Giờ học, Buổi, Sĩ số, Trạng thái
        if ([4, 5, 7, 13].includes(colIdx)) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
        // Wrap + top: Giáo viên, Bài học, BTVN, Bài KT, Giáo trình
        if ([6, 9, 10, 11, 12].includes(colIdx)) {
          cell.alignment = { vertical: "top", wrapText: true };
        }
      });

      const maxLines = Math.max(
        (s.teachers ?? []).length,
        (s.lessons ?? []).length,
        (s.homeworks ?? []).length,
        (s.tests ?? []).length,
        (s.curriculums ?? []).length,
        1,
      );
      row.height = Math.max(22, maxLines * 18);
    });
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lich_hoc_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── List view ──────────────────────────────────────────────────────────────
function ListView({
  sessions,
  onSessionClick,
  holidays = [],
}: {
  sessions: ScheduleSession[];
  onSessionClick: (s: ScheduleSession) => void;
  holidays?: { startDate: string; endDate: string }[];
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    sessions.forEach(s => {
      if (!map.has(s.sessionDate)) map.set(s.sessionDate, []);
      map.get(s.sessionDate)!.push(s);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);

  if (byDay.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Calendar className="w-12 h-12 opacity-30" />
        <p>Không có buổi học nào trong khoảng thời gian này</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <div className="p-5 space-y-5">
        {/* Download button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => exportScheduleListToExcel(sessions)}
          >
            <Download className="w-3.5 h-3.5" />
            Tải xuống
          </Button>
        </div>
        {byDay.map(([date, daySessions]) => {
          const d = parseISO(date);
          const dayLabel = `${WEEKDAY_LABELS[d.getDay()]} – ${format(d, "dd/MM/yyyy")}`;
          return (
            <div key={date} className="rounded-xl border overflow-hidden">
              <div className={`px-5 py-2.5 border-b ${isHolidayDate(date, holidays) ? "bg-red-100" : isToday(d) ? "bg-blue-100" : "bg-muted/60"}`}>
                <h3 className="font-semibold text-sm" data-testid={`day-header-${date}`}>{dayLabel}</h3>
              </div>
              <div className="overflow-x-auto">
              <table className="text-sm min-w-[1200px] w-full table-fixed">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 210 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr className="border-b text-foreground text-xs bg-muted/10">
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Cơ sở</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Lớp</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Giáo viên</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Sĩ số</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Phòng học</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Bài học</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">BTVN</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Bài kiểm tra</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Giáo trình</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {daySessions.map(s => (
                    <tr
                      key={s.id}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => onSessionClick(s)}
                      data-testid={`session-row-${s.id}`}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap overflow-hidden text-ellipsis">{s.locationName}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <div className="flex flex-col gap-0.5">
                          <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border w-fit max-w-full ${s.isTestSession ? "" : getClassColor(s.classId)}`}
                            style={s.isTestSession ? { backgroundColor: "#f59e0b18", borderColor: "#f59e0b66", color: "#f59e0b" } : undefined}>
                            {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{s.className}</span>
                            {!s.isTestSession && s.totalSessions > 0 && (
                              <span className="shrink-0 opacity-70 font-normal">({s.sessionIndex}/{s.totalSessions})</span>
                            )}
                          </div>
                          {!s.isTestSession && (
                            <span className="text-[10px] italic text-muted-foreground px-0.5">{s.classCode}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground px-0.5">{s.shiftStart?.slice(0,5)} – {s.shiftEnd?.slice(0,5)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <ContentLines items={s.teachers.length > 0 ? s.teachers : []} emptyLabel="Chưa phân công" emptyItalic />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-center whitespace-nowrap">
                        {s.enrolledCount > 0 ? s.enrolledCount : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                        {s.roomName
                          ? <span className="text-foreground">{s.roomName}</span>
                          : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <ContentLines items={s.lessons ?? []} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <ContentLines items={s.homeworks ?? []} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <ContentLines items={s.tests ?? []} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <ContentLines items={s.curriculums ?? []} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────────────────
function WeekView({
  sessions, currentDate, onSessionClick, holidays = [],
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
  holidays?: { startDate: string; endDate: string }[];
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    sessions.forEach(s => {
      if (!map.has(s.sessionDate)) map.set(s.sessionDate, []);
      map.get(s.sessionDate)!.push(s);
    });
    return map;
  }, [sessions]);

  const colTemplate = "repeat(7, minmax(0, 1fr))";

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden w-full">
      {/* Header row — sticky, separate grid to allow content to flex-grow */}
      <div className="grid flex-shrink-0 border-b w-full" style={{ gridTemplateColumns: colTemplate }}>
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const count = (byDay.get(dateStr) || []).length;
          const today = isToday(day);
          return (
            <div
              key={`hdr-${dateStr}`}
              className={`border-r last:border-r-0 px-1.5 text-center flex flex-col items-center justify-center h-[52px] min-w-0 ${isHolidayDate(dateStr, holidays) ? "bg-red-100" : today ? "bg-blue-100" : "bg-white"}`}
            >
              <div className={`text-xs font-bold leading-tight ${today ? "text-primary" : "text-foreground"}`}>
                {WEEKDAY_LABELS[day.getDay()]} {format(day, "d/M")}
              </div>
              {count > 0 ? (
                <div className="mt-1">
                  <span className="inline-flex items-center bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium">{count}</span>
                </div>
              ) : <div className="mt-1 h-4" />}
            </div>
          );
        })}
      </div>
      {/* Content row — flex-1 so it always fills remaining height, overflow-y-auto for many sessions */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full">
        <div className="grid min-h-full w-full" style={{ gridTemplateColumns: colTemplate }}>
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const daySessions = (byDay.get(dateStr) || []).sort((a, b) => a.shiftStart.localeCompare(b.shiftStart));
            const today = isToday(day);
            return (
              <div key={`body-${dateStr}`} className={`border-r last:border-r-0 p-2 space-y-1.5 min-w-0 overflow-visible ${isHolidayDate(dateStr, holidays) ? "bg-red-50" : today ? "bg-blue-50/40" : ""}`}>
                {daySessions.length === 0
                  ? <div className="h-full min-h-[300px] flex items-center justify-center text-xs text-muted-foreground/40 select-none">—</div>
                  : daySessions.map(s => (
                    <SessionCard key={s.id} session={s} onClick={() => onSessionClick(s)} />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────────────────
function MonthView({
  sessions, currentDate, onSessionClick, holidays = [],
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
  holidays?: { startDate: string; endDate: string }[];
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    sessions.forEach(s => {
      if (!map.has(s.sessionDate)) map.set(s.sessionDate, []);
      map.get(s.sessionDate)!.push(s);
    });
    return map;
  }, [sessions]);

  const inCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-scroll">
        <div className="grid grid-cols-7 border-b bg-white sticky top-0 z-10">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(d => (
            <div key={d} className="border-r last:border-0 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(110px, auto)" }}>
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const daySessions = (byDay.get(dateStr) || []).sort((a, b) => a.shiftStart.localeCompare(b.shiftStart));
            const today = isToday(day);
            const inMonth = inCurrentMonth(day);
            return (
              <div key={dateStr} className={`border-r border-b last:border-r-0 p-1.5 ${isHolidayDate(dateStr, holidays) ? "bg-red-50" : !inMonth ? "bg-muted/20" : today ? "bg-blue-50/40" : "bg-white"}`}>
                <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-white" : inMonth ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {daySessions.map(s => (
                    <SessionCard key={s.id} session={s} micro noProvider onClick={() => onSessionClick(s)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Session card ───────────────────────────────────────────────────────────
function SessionCard({
  session: s, micro, noProvider, onClick,
}: {
  session: ScheduleSession;
  micro?: boolean;
  noProvider?: boolean;
  onClick: () => void;
}) {
  const fallbackColor = getClassColor(s.classId);
  const hasCustomColor = !!s.classColor;
  const customStyle = hasCustomColor ? {
    backgroundColor: s.classColor + "18",
    borderColor: s.classColor + "66",
    color: s.classColor,
  } : undefined;
  const timeStr = `${s.shiftStart?.slice(0, 5) ?? ""} – ${s.shiftEnd?.slice(0, 5) ?? ""}`;
  const formatLabel = s.learningFormat === "offline" ? "Offline" : s.learningFormat === "online" ? "Online" : (s.learningFormat ?? "");
  const teacherStr = s.teachers.join(", ");

  const tooltipContent = (
    <div className="text-xs space-y-1 min-w-[180px]">
      {s.isTestSession && (
        <div className="flex gap-2 items-center">
          <ClipboardList className="w-3 h-3 shrink-0" />
          <span className="font-semibold">Lớp TEST</span>
        </div>
      )}
      <div className="flex gap-2"><span className="text-muted-foreground shrink-0">{s.isTestSession ? "Tên kỳ thi:" : "Tên lịch:"}</span><span className="font-medium">{s.isTestSession ? s.className : s.classCode}</span></div>
      {formatLabel && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Hình thức:</span><span className="font-medium">{formatLabel}</span></div>}
      <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Thời gian:</span><span className="font-medium">{timeStr}</span></div>
      {s.enrolledCount > 0 && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Sĩ số:</span><span className="font-medium">{s.enrolledCount}</span></div>}
      {teacherStr && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Giáo viên:</span><span className="font-medium">{teacherStr}</span></div>}
    </div>
  );

  if (micro) {
    const btn = (
      <button
        onClick={onClick}
        className={`w-full rounded px-1.5 py-0.5 border cursor-pointer hover:opacity-80 transition-opacity text-left ${hasCustomColor ? "" : fallbackColor}`}
        style={customStyle}
        data-testid={`session-card-${s.id}`}
      >
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="flex items-center gap-0.5 font-bold text-[10px] min-w-0">
            {s.isTestSession && <ClipboardList className="w-2.5 h-2.5 shrink-0" />}
            <span className="truncate">{s.isTestSession ? s.className : s.classCode}</span>
          </span>
          {formatLabel && <span className="text-[9px] font-semibold opacity-80 shrink-0">{formatLabel}</span>}
        </div>
        <div className="text-[9px] font-medium leading-tight">{timeStr}</div>
        {s.teachers.length > 0 && (
          <div className="text-[9px] font-medium opacity-80 truncate leading-tight">{teacherStr}</div>
        )}
      </button>
    );
    if (noProvider) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="z-50">{tooltipContent}</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="z-50">{tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`w-full rounded-lg px-2 py-1.5 border cursor-pointer hover:opacity-90 transition-opacity text-left ${hasCustomColor ? "" : fallbackColor}`}
            style={customStyle}
            data-testid={`session-card-${s.id}`}
          >
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="flex items-center gap-1 font-bold text-xs min-w-0">
                {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0" />}
                <span className="truncate">{s.isTestSession ? s.className : s.classCode}</span>
              </span>
              {formatLabel && <span className="text-[10px] font-semibold opacity-85 shrink-0">{formatLabel}</span>}
            </div>
            {s.teachers.length > 0 && (
              <div className="text-[10px] font-medium leading-tight truncate mt-0.5">{teacherStr}</div>
            )}
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] font-medium leading-tight">{timeStr}</span>
              {s.enrolledCount > 0 && (
                <span className="text-[10px] font-bold shrink-0 ml-1">{s.enrolledCount}</span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-50">{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Time helpers ────────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Assigns non-overlapping vertical lanes to sessions in a room row
function computeLanes(roomSessions: ScheduleSession[]): Map<string, { lane: number; laneCount: number }> {
  const sorted = [...roomSessions].sort((a, b) => timeToMinutes(a.shiftStart) - timeToMinutes(b.shiftStart));
  const laneEndTimes: number[] = [];
  const sessionLaneMap = new Map<string, number>();
  for (const s of sorted) {
    const startMin = timeToMinutes(s.shiftStart);
    let lane = laneEndTimes.findIndex(end => end <= startMin);
    if (lane === -1) { lane = laneEndTimes.length; laneEndTimes.push(0); }
    laneEndTimes[lane] = timeToMinutes(s.shiftEnd);
    sessionLaneMap.set(s.id, lane);
  }
  const totalLanes = Math.max(1, laneEndTimes.length);
  const result = new Map<string, { lane: number; laneCount: number }>();
  for (const [id, lane] of sessionLaneMap.entries()) result.set(id, { lane, laneCount: totalLanes });
  return result;
}

// ── Room view ───────────────────────────────────────────────────────────────
function RoomView({
  sessions,
  currentDate,
  onSessionClick,
  filterLocation,
  holidays = [],
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
  filterLocation: string;
  holidays?: { startDate: string; endDate: string }[];
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const dayStrs = days.map(d => format(d, "yyyy-MM-dd"));
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    dayStrs.includes(todayStr) ? todayStr : dayStrs[0]
  );
  const [weekMode, setWeekMode] = useState(false);

  useEffect(() => {
    setSelectedDate(dayStrs.includes(todayStr) ? todayStr : dayStrs[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const { data: classroomsList = [] } = useQuery<{ id: string; name: string; capacity?: number | null; locationId: string }[]>({
    queryKey: ["/api/classrooms", filterLocation !== "all" ? filterLocation : undefined],
    queryFn: async () => {
      const url = filterLocation !== "all" ? `/api/classrooms?locationId=${filterLocation}` : "/api/classrooms";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      return res.json();
    },
  });

  const capacityMap = useMemo(() => {
    const map = new Map<string, number | null>();
    classroomsList.forEach(r => map.set(r.id, r.capacity ?? null));
    return map;
  }, [classroomsList]);

  const daySessions = useMemo(() =>
    sessions.filter(s => s.sessionDate === selectedDate),
    [sessions, selectedDate]
  );

  // All rooms across the full week (for week mode)
  const allWeekRooms = useMemo(() => {
    const map = new Map<string, { key: string; name: string; capacity: number | null }>();
    sessions.forEach(s => {
      if (!s.roomName) return;
      const key = s.roomId || s.roomName;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: s.roomName,
          capacity: s.roomId ? (capacityMap.get(s.roomId) ?? null) : null,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [sessions, capacityMap]);

  const rooms = useMemo(() => {
    const map = new Map<string, { key: string; name: string; capacity: number | null }>();
    daySessions.forEach(s => {
      if (!s.roomName) return;
      const key = s.roomId || s.roomName;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: s.roomName,
          capacity: s.roomId ? (capacityMap.get(s.roomId) ?? null) : null,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [daySessions, capacityMap]);

  const { gridStartH, gridEndH } = useMemo(() => {
    if (daySessions.length === 0) return { gridStartH: 7, gridEndH: 20 };
    const starts = daySessions.map(s => timeToMinutes(s.shiftStart));
    const ends = daySessions.map(s => timeToMinutes(s.shiftEnd));
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    return {
      gridStartH: Math.max(0, Math.floor(minStart / 60)),
      gridEndH: Math.min(24, Math.ceil(maxEnd / 60)),
    };
  }, [daySessions]);

  const HOUR_WIDTH = 100;
  const LEFT_COL_WIDTH = 140;
  const ROW_MIN_HEIGHT = 110;
  const CARD_TOP = 8;
  const CARD_BOTTOM = 8;

  const hourCount = gridEndH - gridStartH;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => gridStartH + i);
  const totalGridWidth = LEFT_COL_WIDTH + HOUR_WIDTH * (hourCount + 1);

  // ── Week-grid (full week) mode ──────────────────────────────────────────
  if (weekMode) {
    const WEEK_LEFT_COL = 140;
    const WEEK_DAY_MIN_W = 140;
    return (
      <div className="h-full flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-end border-b bg-muted/20 flex-shrink-0 px-3 py-2">
          <button
            onClick={() => setWeekMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Xem từng ngày
          </button>
        </div>

        {/* Week table */}
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: WEEK_LEFT_COL + WEEK_DAY_MIN_W * 7 }}>
            {/* Sticky column headers */}
            <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
              <div
                style={{ width: WEEK_LEFT_COL, minWidth: WEEK_LEFT_COL }}
                className="border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground shrink-0 flex items-center"
              >
                Phòng học
              </div>
              {days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                const isHoliday = isHolidayDate(dateStr, holidays);
                return (
                  <div
                    key={dateStr}
                    style={{ minWidth: WEEK_DAY_MIN_W }}
                    className={`flex-1 border-r last:border-0 px-2 py-2.5 text-xs font-semibold text-center
                      ${isHoliday ? "bg-red-100 text-red-700" : today ? "bg-blue-50 text-primary" : "text-muted-foreground"}`}
                  >
                    {WEEKDAY_LABELS[day.getDay()]}, ngày {format(day, "dd/MM")}
                  </div>
                );
              })}
            </div>

            {/* Room rows */}
            {allWeekRooms.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <Calendar className="w-5 h-5 opacity-40" />
                Không có buổi học nào trong tuần này
              </div>
            ) : (
              allWeekRooms.map((room, rowIdx) => {
                const weekSessions = sessions.filter(s =>
                  s.roomId === room.key || s.roomName === room.name
                );
                const totalCount = weekSessions.length;
                return (
                  <div
                    key={room.key}
                    className={`flex border-b ${rowIdx % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                  >
                    {/* Room info cell */}
                    <div
                      style={{ width: WEEK_LEFT_COL, minWidth: WEEK_LEFT_COL }}
                      className="border-r px-3 py-3 shrink-0 flex flex-col justify-center"
                    >
                      <div className="font-semibold text-sm">{room.name}</div>
                      {weekSessions[0]?.locationName && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {weekSessions[0].locationName}
                        </div>
                      )}
                      {room.capacity != null && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Sức chứa: {room.capacity}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {totalCount} buổi / tuần
                      </div>
                    </div>

                    {/* Day cells */}
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const today = isToday(day);
                      const isHoliday = isHolidayDate(dateStr, holidays);
                      const cellSessions = weekSessions.filter(s => s.sessionDate === dateStr)
                        .sort((a, b) => a.shiftStart.localeCompare(b.shiftStart));
                      return (
                        <div
                          key={dateStr}
                          style={{ minWidth: WEEK_DAY_MIN_W }}
                          className={`flex-1 border-r last:border-0 p-1.5 flex flex-col gap-1
                            ${isHoliday ? "bg-red-50" : today ? "bg-blue-50/40" : ""}`}
                        >
                          {cellSessions.length === 0 ? (
                            <div className="h-full min-h-[60px]" />
                          ) : (
                            <TooltipProvider delayDuration={300}>
                              {cellSessions.map(s => {
                                const fallbackColor = getClassColor(s.classId);
                                const hasCustomColor = !!s.classColor;
                                const customStyle = hasCustomColor ? {
                                  backgroundColor: s.classColor + "18",
                                  borderColor: s.classColor + "66",
                                  color: s.classColor,
                                } : undefined;
                                return (
                                  <Tooltip key={s.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => onSessionClick(s)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-left hover:opacity-90 hover:shadow-sm transition-all cursor-pointer
                                          ${hasCustomColor ? "" : fallbackColor}`}
                                        style={customStyle}
                                      >
                                        <div className="text-[10px] font-semibold leading-tight text-muted-foreground/80">
                                          {s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}
                                        </div>
                                        <div className="flex items-center gap-0.5 min-w-0 mt-0.5">
                                          {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0" />}
                                          <span className="font-bold text-xs leading-tight truncate">
                                            {s.isTestSession ? s.className : s.classCode}
                                          </span>
                                        </div>
                                        {s.teachers.length > 0 && (
                                          <div className="text-[10px] leading-tight truncate mt-0.5 opacity-70">
                                            {s.teachers.join(", ")}
                                          </div>
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[260px] p-3 space-y-1.5 text-xs">
                                      <div className="font-bold text-sm leading-tight">
                                        {s.isTestSession && <ClipboardList className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                                        {s.isTestSession ? s.className : `${s.classCode} – ${s.className}`}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <span>🕐</span>
                                        <span>{s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}</span>
                                        {s.shiftName && <span className="text-muted-foreground/70">({s.shiftName})</span>}
                                      </div>
                                      {s.locationName && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                          <Building2 className="w-3 h-3 shrink-0" />
                                          <span>{s.locationName}{room.name ? ` – ${room.name}` : ""}</span>
                                        </div>
                                      )}
                                      {s.teachers.length > 0 && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                          <User className="w-3 h-3 shrink-0" />
                                          <span>{s.teachers.join(", ")}</span>
                                        </div>
                                      )}
                                      {s.enrolledCount > 0 && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                          <span>👥</span>
                                          <span>{s.enrolledCount} học viên</span>
                                        </div>
                                      )}
                                      <div className="pt-1 border-t text-[10px] text-muted-foreground/60">
                                        Buổi {s.sessionIndex}/{s.totalSessions}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </TooltipProvider>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Single-day (default) mode ───────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Day selector */}
      <div className="flex items-center border-b bg-muted/20 flex-shrink-0">
        <div className="flex flex-1">
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const count = sessions.filter(s => s.sessionDate === dateStr).length;
            const today = isToday(day);
            const selected = dateStr === selectedDate;
            const isHoliday = isHolidayDate(dateStr, holidays);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex-1 px-2 py-2 text-center border-r last:border-r-0 transition-colors cursor-pointer
                  ${selected ? "bg-primary/10 border-b-2 border-b-primary" : isHoliday ? "bg-red-50 hover:bg-red-100" : "hover:bg-muted/40"}`}
              >
                <div className={`text-xs font-bold leading-tight ${isHoliday ? "text-red-600" : today ? "text-primary" : "text-foreground"}`}>
                  {WEEKDAY_LABELS[day.getDay()]} {format(day, "d/M")}
                </div>
                {count > 0
                  ? <span className="inline-flex items-center bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium mt-0.5">{count}</span>
                  : <div className="h-4 mt-0.5" />}
              </button>
            );
          })}
        </div>
        {/* Week mode toggle */}
        <button
          onClick={() => setWeekMode(true)}
          className="flex items-center gap-1.5 mx-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Table2 className="w-3.5 h-3.5" />
          Xem cả tuần
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalGridWidth }}>
          {/* Time header (sticky) */}
          <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground shrink-0 flex items-center"
            >
              Phòng / Giờ
            </div>
            <div className="flex">
              {hours.slice(0, -1).map(h => (
                <div
                  key={h}
                  style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
                  className="border-r last:border-0 py-2.5 text-xs font-medium text-muted-foreground text-center"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
              <div
                style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
                className="py-2.5 text-xs font-medium text-muted-foreground text-center"
              >
                {String(gridEndH).padStart(2, "0")}:00
              </div>
            </div>
          </div>

          {/* Room rows */}
          {rooms.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <Calendar className="w-5 h-5 opacity-40" />
              Không có buổi học nào trong ngày này
            </div>
          ) : (
            rooms.map((room, roomIdx) => {
              const roomSessions = daySessions.filter(s =>
                s.roomId === room.key || s.roomName === room.name
              );
              const laneMap = computeLanes(roomSessions);
              const maxLanes = roomSessions.length === 0 ? 1 : Math.max(...Array.from(laneMap.values()).map(v => v.laneCount));
              const LANE_MIN = 72;
              const rowMinH = Math.max(ROW_MIN_HEIGHT, maxLanes * LANE_MIN);

              return (
                <div
                  key={room.key}
                  className={`flex border-b ${roomIdx % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                  style={{ minHeight: rowMinH }}
                >
                  {/* Room info */}
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="border-r px-3 py-3 shrink-0 flex flex-col justify-center"
                  >
                    <div className="font-semibold text-sm">{room.name}</div>
                    {roomSessions[0]?.locationName && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {roomSessions[0].locationName}
                      </div>
                    )}
                    {room.capacity != null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Sức chứa: {room.capacity}
                      </div>
                    )}
                  </div>

                  {/* Time grid */}
                  <div
                    className="relative flex-1"
                    style={{ minHeight: rowMinH }}
                  >
                    {/* Background hour grid lines */}
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 border-r border-muted/40"
                        style={{ left: i * HOUR_WIDTH, width: 1 }}
                      />
                    ))}

                    {roomSessions.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50 select-none">
                        Trống cả ngày
                      </div>
                    ) : (
                      <TooltipProvider delayDuration={300}>
                        {roomSessions.map(s => {
                          const startMin = timeToMinutes(s.shiftStart);
                          const endMin = timeToMinutes(s.shiftEnd);
                          const left = ((startMin - gridStartH * 60) / 60) * HOUR_WIDTH + 4;
                          const width = Math.max(((endMin - startMin) / 60) * HOUR_WIDTH - 8, 40);
                          const fallbackColor = getClassColor(s.classId);
                          const hasCustomColor = !!s.classColor;
                          const customStyle = hasCustomColor ? {
                            backgroundColor: s.classColor + "18",
                            borderColor: s.classColor + "66",
                            color: s.classColor,
                          } : undefined;

                          const { lane, laneCount } = laneMap.get(s.id) ?? { lane: 0, laneCount: 1 };
                          const usableH = rowMinH - CARD_TOP - CARD_BOTTOM;
                          const laneH = usableH / laneCount;
                          const cardTop = CARD_TOP + lane * laneH;
                          const cardHeight = laneH - 4;

                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onSessionClick(s)}
                                  className={`absolute rounded-lg border px-2 py-1.5 text-left hover:opacity-90 hover:shadow-md transition-all cursor-pointer overflow-hidden
                                    ${hasCustomColor ? "" : fallbackColor}`}
                                  style={{
                                    left,
                                    width,
                                    top: cardTop,
                                    height: cardHeight,
                                    ...customStyle,
                                  }}
                                >
                                  <div className="flex items-start gap-0.5 min-w-0">
                                    {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0 mt-0.5" />}
                                    <span className="font-bold text-xs leading-tight truncate">
                                      {s.isTestSession ? s.className : s.classCode}
                                    </span>
                                  </div>
                                  {cardHeight > 50 && s.teachers.length > 0 && (
                                    <div className="text-[10px] font-medium leading-tight truncate mt-0.5 flex items-center gap-0.5">
                                      <User className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                      <span className="truncate">{s.teachers.join(", ")}</span>
                                    </div>
                                  )}
                                  {cardHeight > 36 && (
                                    <div className="text-[10px] font-medium leading-tight mt-0.5">
                                      {s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}
                                    </div>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px] p-3 space-y-1.5 text-xs">
                                <div className="font-bold text-sm leading-tight">
                                  {s.isTestSession && <ClipboardList className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                                  {s.isTestSession ? s.className : `${s.classCode} – ${s.className}`}
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <span>🕐</span>
                                  <span>{s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}</span>
                                  {s.shiftName && <span className="text-muted-foreground/70">({s.shiftName})</span>}
                                </div>
                                {s.locationName && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    <span>{s.locationName}{room.name ? ` – ${room.name}` : ""}</span>
                                  </div>
                                )}
                                {s.teachers.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <User className="w-3 h-3 shrink-0" />
                                    <span>{s.teachers.join(", ")}</span>
                                  </div>
                                )}
                                {s.enrolledCount > 0 && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <span>👥</span>
                                    <span>{s.enrolledCount} học viên</span>
                                  </div>
                                )}
                                {s.learningFormat && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <span>📖</span>
                                    <span>{s.learningFormat}</span>
                                  </div>
                                )}
                                <div className="pt-1 border-t text-[10px] text-muted-foreground/60">
                                  Buổi {s.sessionIndex}/{s.totalSessions}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Teacher view ────────────────────────────────────────────────────────────
function TeacherView({
  sessions,
  currentDate,
  onSessionClick,
  holidays = [],
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
  holidays?: { startDate: string; endDate: string }[];
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const dayStrs = days.map(d => format(d, "yyyy-MM-dd"));
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    dayStrs.includes(todayStr) ? todayStr : dayStrs[0]
  );
  const [weekMode, setWeekMode] = useState(false);

  useEffect(() => {
    setSelectedDate(dayStrs.includes(todayStr) ? todayStr : dayStrs[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const daySessions = useMemo(() =>
    sessions.filter(s => s.sessionDate === selectedDate),
    [sessions, selectedDate]
  );

  // All teachers visible in the current week (for week mode)
  const allWeekTeacherRows = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    sessions.forEach(s => {
      s.teachers.forEach((name, i) => {
        const id = s.teacherIds?.[i] ?? name;
        if (!map.has(id)) map.set(id, { key: id, name });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [sessions]);

  // Build a flat list of (teacherId, teacherName, session) entries —
  // a session with N teachers appears N times (once per teacher row).
  const teacherRows = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    daySessions.forEach(s => {
      s.teachers.forEach((name, i) => {
        const id = s.teacherIds?.[i] ?? name;
        if (!map.has(id)) map.set(id, { key: id, name });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [daySessions]);

  const { gridStartH, gridEndH } = useMemo(() => {
    if (daySessions.length === 0) return { gridStartH: 7, gridEndH: 20 };
    const starts = daySessions.map(s => timeToMinutes(s.shiftStart));
    const ends = daySessions.map(s => timeToMinutes(s.shiftEnd));
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    return {
      gridStartH: Math.max(0, Math.floor(minStart / 60)),
      gridEndH: Math.min(24, Math.ceil(maxEnd / 60)),
    };
  }, [daySessions]);

  const HOUR_WIDTH = 100;
  const LEFT_COL_WIDTH = 160;
  const ROW_MIN_HEIGHT = 110;
  const CARD_TOP = 8;
  const CARD_BOTTOM = 8;

  const hourCount = gridEndH - gridStartH;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => gridStartH + i);
  const totalGridWidth = LEFT_COL_WIDTH + HOUR_WIDTH * (hourCount + 1);

  // ── Week-grid (full week) mode ──────────────────────────────────────────
  if (weekMode) {
    const WEEK_LEFT_COL = 160;
    const WEEK_DAY_MIN_W = 140;
    return (
      <div className="h-full flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-end border-b bg-muted/20 flex-shrink-0 px-3 py-2">
          <button
            onClick={() => setWeekMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Xem từng ngày
          </button>
        </div>

        {/* Week table */}
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: WEEK_LEFT_COL + WEEK_DAY_MIN_W * 7 }}>
            {/* Sticky column headers */}
            <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
              <div
                style={{ width: WEEK_LEFT_COL, minWidth: WEEK_LEFT_COL }}
                className="border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground shrink-0 flex items-center"
              >
                Giáo viên
              </div>
              {days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                const isHoliday = isHolidayDate(dateStr, holidays);
                return (
                  <div
                    key={dateStr}
                    style={{ minWidth: WEEK_DAY_MIN_W }}
                    className={`flex-1 border-r last:border-0 px-2 py-2.5 text-xs font-semibold text-center
                      ${isHoliday ? "bg-red-100 text-red-700" : today ? "bg-blue-50 text-primary" : "text-muted-foreground"}`}
                  >
                    {WEEKDAY_LABELS[day.getDay()]}, ngày {format(day, "dd/MM")}
                  </div>
                );
              })}
            </div>

            {/* Teacher rows */}
            {allWeekTeacherRows.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <Calendar className="w-5 h-5 opacity-40" />
                Không có buổi học nào trong tuần này
              </div>
            ) : (
              allWeekTeacherRows.map((teacher, rowIdx) => {
                const weekSessions = sessions.filter(s =>
                  s.teacherIds?.includes(teacher.key) || s.teachers.includes(teacher.name)
                );
                const totalCount = weekSessions.length;
                return (
                  <div
                    key={teacher.key}
                    className={`flex border-b ${rowIdx % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                  >
                    {/* Teacher info cell */}
                    <div
                      style={{ width: WEEK_LEFT_COL, minWidth: WEEK_LEFT_COL }}
                      className="border-r px-3 py-3 shrink-0 flex flex-col justify-center"
                    >
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm leading-tight">{teacher.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                        {totalCount} buổi / tuần
                      </div>
                    </div>

                    {/* Day cells */}
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const today = isToday(day);
                      const isHoliday = isHolidayDate(dateStr, holidays);
                      const cellSessions = weekSessions.filter(s => s.sessionDate === dateStr)
                        .sort((a, b) => a.shiftStart.localeCompare(b.shiftStart));
                      return (
                        <div
                          key={dateStr}
                          style={{ minWidth: WEEK_DAY_MIN_W }}
                          className={`flex-1 border-r last:border-0 p-1.5 flex flex-col gap-1 align-top
                            ${isHoliday ? "bg-red-50" : today ? "bg-blue-50/40" : ""}`}
                        >
                          {cellSessions.length === 0 ? (
                            <div className="h-full min-h-[60px]" />
                          ) : (
                            <TooltipProvider delayDuration={300}>
                              {cellSessions.map(s => {
                                const fallbackColor = getClassColor(s.classId);
                                const hasCustomColor = !!s.classColor;
                                const customStyle = hasCustomColor ? {
                                  backgroundColor: s.classColor + "18",
                                  borderColor: s.classColor + "66",
                                  color: s.classColor,
                                } : undefined;
                                return (
                                  <Tooltip key={s.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => onSessionClick(s)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-left hover:opacity-90 hover:shadow-sm transition-all cursor-pointer
                                          ${hasCustomColor ? "" : fallbackColor}`}
                                        style={customStyle}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[10px] font-semibold leading-tight text-muted-foreground/80">
                                            {s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}
                                          </span>
                                          {s.learningFormat && (
                                            <span className="text-[9px] font-medium shrink-0 opacity-75 leading-tight whitespace-nowrap">
                                              {s.learningFormat}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5 min-w-0 mt-0.5">
                                          {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0" />}
                                          <span className="font-bold text-xs leading-tight truncate">
                                            {s.isTestSession ? s.className : s.classCode}
                                          </span>
                                        </div>
                                        {s.locationName && (
                                          <div className="text-[10px] leading-tight truncate mt-0.5 opacity-70">
                                            {s.locationName}
                                          </div>
                                        )}
                                        {s.roomName && (
                                          <div className="text-[10px] leading-tight truncate mt-0.5 opacity-70">
                                            {s.roomName}
                                          </div>
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[260px] p-3 space-y-1.5 text-xs">
                                      <div className="font-bold text-sm leading-tight">
                                        {s.isTestSession && <ClipboardList className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                                        {s.isTestSession ? s.className : `${s.classCode} – ${s.className}`}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <span>🕐</span>
                                        <span>{s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}</span>
                                        {s.shiftName && <span className="text-muted-foreground/70">({s.shiftName})</span>}
                                      </div>
                                      {s.locationName && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                          <Building2 className="w-3 h-3 shrink-0" />
                                          <span>{s.locationName}{s.roomName ? ` – ${s.roomName}` : ""}</span>
                                        </div>
                                      )}
                                      {s.enrolledCount > 0 && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                          <span>👥</span>
                                          <span>{s.enrolledCount} học viên</span>
                                        </div>
                                      )}
                                      <div className="pt-1 border-t text-[10px] text-muted-foreground/60">
                                        Buổi {s.sessionIndex}/{s.totalSessions}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </TooltipProvider>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Single-day (default) mode ───────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Day selector */}
      <div className="flex items-center border-b bg-muted/20 flex-shrink-0">
        <div className="flex flex-1">
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const count = sessions.filter(s => s.sessionDate === dateStr).length;
            const today = isToday(day);
            const selected = dateStr === selectedDate;
            const isHoliday = isHolidayDate(dateStr, holidays);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex-1 px-2 py-2 text-center border-r last:border-r-0 transition-colors cursor-pointer
                  ${selected ? "bg-primary/10 border-b-2 border-b-primary" : isHoliday ? "bg-red-50 hover:bg-red-100" : "hover:bg-muted/40"}`}
              >
                <div className={`text-xs font-bold leading-tight ${isHoliday ? "text-red-600" : today ? "text-primary" : "text-foreground"}`}>
                  {WEEKDAY_LABELS[day.getDay()]} {format(day, "d/M")}
                </div>
                {count > 0
                  ? <span className="inline-flex items-center bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium mt-0.5">{count}</span>
                  : <div className="h-4 mt-0.5" />}
              </button>
            );
          })}
        </div>
        {/* Week mode toggle */}
        <button
          onClick={() => setWeekMode(true)}
          className="flex items-center gap-1.5 mx-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Table2 className="w-3.5 h-3.5" />
          Xem cả tuần
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalGridWidth }}>
          {/* Time header (sticky) */}
          <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground shrink-0 flex items-center"
            >
              GV / Giờ
            </div>
            <div className="flex">
              {hours.slice(0, -1).map(h => (
                <div
                  key={h}
                  style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
                  className="border-r last:border-0 py-2.5 text-xs font-medium text-muted-foreground text-center"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
              <div
                style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
                className="py-2.5 text-xs font-medium text-muted-foreground text-center"
              >
                {String(gridEndH).padStart(2, "0")}:00
              </div>
            </div>
          </div>

          {/* Teacher rows */}
          {teacherRows.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <Calendar className="w-5 h-5 opacity-40" />
              Không có buổi học nào trong ngày này
            </div>
          ) : (
            teacherRows.map((teacher, rowIdx) => {
              const rowSessions = daySessions.filter(s =>
                s.teacherIds?.includes(teacher.key) || s.teachers.includes(teacher.name)
              );
              const laneMap = computeLanes(rowSessions);
              const maxLanes = rowSessions.length === 0 ? 1 : Math.max(...Array.from(laneMap.values()).map(v => v.laneCount));
              const LANE_MIN = 72;
              const rowMinH = Math.max(ROW_MIN_HEIGHT, maxLanes * LANE_MIN);

              return (
                <div
                  key={teacher.key}
                  className={`flex border-b ${rowIdx % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                  style={{ minHeight: rowMinH }}
                >
                  {/* Teacher info */}
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="border-r px-3 py-3 shrink-0 flex flex-col justify-center"
                  >
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm leading-tight">{teacher.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                      {rowSessions.length} buổi
                    </div>
                  </div>

                  {/* Time grid */}
                  <div
                    className="relative flex-1"
                    style={{ minHeight: rowMinH }}
                  >
                    {/* Background hour grid lines */}
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 border-r border-muted/40"
                        style={{ left: i * HOUR_WIDTH, width: 1 }}
                      />
                    ))}

                    {rowSessions.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50 select-none">
                        Không có buổi
                      </div>
                    ) : (
                      <TooltipProvider delayDuration={300}>
                        {rowSessions.map(s => {
                          const startMin = timeToMinutes(s.shiftStart);
                          const endMin = timeToMinutes(s.shiftEnd);
                          const left = ((startMin - gridStartH * 60) / 60) * HOUR_WIDTH + 4;
                          const width = Math.max(((endMin - startMin) / 60) * HOUR_WIDTH - 8, 40);
                          const fallbackColor = getClassColor(s.classId);
                          const hasCustomColor = !!s.classColor;
                          const customStyle = hasCustomColor ? {
                            backgroundColor: s.classColor + "18",
                            borderColor: s.classColor + "66",
                            color: s.classColor,
                          } : undefined;

                          const { lane, laneCount } = laneMap.get(s.id) ?? { lane: 0, laneCount: 1 };
                          const usableH = rowMinH - CARD_TOP - CARD_BOTTOM;
                          const laneH = usableH / laneCount;
                          const cardTop = CARD_TOP + lane * laneH;
                          const cardHeight = laneH - 4;

                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onSessionClick(s)}
                                  className={`absolute rounded-lg border px-2 py-1.5 text-left hover:opacity-90 hover:shadow-md transition-all cursor-pointer overflow-hidden
                                    ${hasCustomColor ? "" : fallbackColor}`}
                                  style={{
                                    left,
                                    width,
                                    top: cardTop,
                                    height: cardHeight,
                                    ...customStyle,
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-1 min-w-0">
                                    <div className="flex items-start gap-0.5 min-w-0 flex-1">
                                      {s.isTestSession && <ClipboardList className="w-3 h-3 shrink-0 mt-0.5" />}
                                      <span className="font-bold text-xs leading-tight truncate">
                                        {s.isTestSession ? s.className : s.classCode}
                                      </span>
                                    </div>
                                    {s.learningFormat && cardHeight > 36 && (
                                      <span className="text-[9px] font-medium shrink-0 opacity-75 leading-tight whitespace-nowrap">
                                        {s.learningFormat}
                                      </span>
                                    )}
                                  </div>
                                  {cardHeight > 50 && s.locationName && (
                                    <div className="text-[10px] leading-tight truncate mt-0.5 opacity-70">
                                      {s.locationName}
                                    </div>
                                  )}
                                  {cardHeight > 50 && s.roomName && (
                                    <div className="text-[10px] font-medium leading-tight truncate mt-0.5 flex items-center gap-0.5">
                                      <Building2 className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                      <span className="truncate">{s.roomName}</span>
                                    </div>
                                  )}
                                  {cardHeight > 36 && (
                                    <div className="text-[10px] font-medium leading-tight mt-0.5">
                                      {s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}
                                    </div>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px] p-3 space-y-1.5 text-xs">
                                <div className="font-bold text-sm leading-tight">
                                  {s.isTestSession && <ClipboardList className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                                  {s.isTestSession ? s.className : `${s.classCode} – ${s.className}`}
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <span>🕐</span>
                                  <span>{s.shiftStart?.slice(0, 5)} – {s.shiftEnd?.slice(0, 5)}</span>
                                  {s.shiftName && <span className="text-muted-foreground/70">({s.shiftName})</span>}
                                </div>
                                {s.locationName && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    <span>{s.locationName}{s.roomName ? ` – ${s.roomName}` : ""}</span>
                                  </div>
                                )}
                                {s.teachers.length > 1 && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <User className="w-3 h-3 shrink-0" />
                                    <span>{s.teachers.join(", ")}</span>
                                  </div>
                                )}
                                {s.enrolledCount > 0 && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <span>👥</span>
                                    <span>{s.enrolledCount} học viên</span>
                                  </div>
                                )}
                                {s.learningFormat && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <span>📖</span>
                                    <span>{s.learningFormat}</span>
                                  </div>
                                )}
                                <div className="pt-1 border-t text-[10px] text-muted-foreground/60">
                                  Buổi {s.sessionIndex}/{s.totalSessions}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status badge (used in list view) ───────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Chưa dạy", cls: "bg-blue-100 text-blue-700" },
    completed: { label: "Đã xong", cls: "bg-green-100 text-green-700" },
    cancelled: { label: "Đã hủy", cls: "bg-red-100 text-red-700" },
  };
  const cfg = map[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
