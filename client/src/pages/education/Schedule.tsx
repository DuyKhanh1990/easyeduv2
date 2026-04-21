import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths,
  eachDayOfInterval, isToday, parseISO,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, List, Calendar, LayoutGrid,
  User, Building2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SessionDetailSheet } from "@/components/education/SessionDetailSheet";

type ViewMode = "list" | "week" | "month";

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
  roomName?: string | null;
  lessons?: string[];
  homeworks?: string[];
  tests?: string[];
  curriculums?: string[];
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
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [selectedSession, setSelectedSession] = useState<{ sessionId: string; classId: string } | null>(null);

  const { from, to } = useMemo(() => {
    if (viewMode === "month") {
      const s = startOfMonth(currentDate);
      const e = endOfMonth(currentDate);
      return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
    }
    const s = startOfWeek(currentDate, { weekStartsOn: 1 });
    const e = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
  }, [viewMode, currentDate]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const dateLabel = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: vi })
    : `Tuần ${format(weekStart, "dd/MM")} – ${format(weekEnd, "dd/MM/yyyy")}`;

  const { data: sessions = [], isLoading } = useQuery<ScheduleSession[]>({
    queryKey: ["/api/schedule", from, to, filterLocation !== "all" ? filterLocation : undefined],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (filterLocation !== "all") params.set("locationId", filterLocation);
      const res = await fetch(`/api/schedule?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: locations = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
  });

  const allTeachers = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => {
      s.teachers.forEach((name, i) => {
        const id = s.teacherIds?.[i];
        if (id) map.set(id, name);
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const filtered = useMemo(() => sessions.filter(s => {
    if (filterTeacher !== "all" && !s.teacherIds?.includes(filterTeacher)) return false;
    if (filterLocation !== "all" && s.locationId !== filterLocation) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.classCode.toLowerCase().includes(q)
        || s.className.toLowerCase().includes(q)
        || s.locationName.toLowerCase().includes(q)
        || s.teachers.some(t => t.toLowerCase().includes(q));
    }
    return true;
  }), [sessions, filterTeacher, filterLocation, search]);

  function navigate(dir: 1 | -1) {
    if (viewMode === "month") setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    else setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
  }

  function openSession(session: ScheduleSession) {
    setSelectedSession({ sessionId: session.id, classId: session.classId });
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">
        {/* ── Toolbar ── */}
        <div className="flex-shrink-0 bg-white rounded-xl border shadow-sm px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {([
                { id: "list", label: "Danh sách", icon: List },
                { id: "month", label: "Tháng", icon: Calendar },
                { id: "week", label: "Tuần", icon: LayoutGrid },
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
              onClick={() => setCurrentDate(new Date())}
              variant="outline"
              data-testid="btn-today"
            >
              Hôm nay
            </Button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm lớp, giáo viên, cơ sở..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
                data-testid="input-search"
              />
            </div>
            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-teacher">
                <User className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Tất cả giáo viên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả giáo viên</SelectItem>
                {allTeachers.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-location">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Tất cả cơ sở" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả cơ sở</SelectItem>
                {locations.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Calendar ── */}
        <div className="flex-1 bg-white rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Đang tải lịch học...
            </div>
          ) : viewMode === "list" ? (
            <ListView sessions={filtered} onSessionClick={openSession} />
          ) : viewMode === "week" ? (
            <WeekView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} />
          ) : (
            <MonthView sessions={filtered} currentDate={currentDate} onSessionClick={openSession} />
          )}
        </div>
      </div>

      {/* Session detail sheet */}
      <SessionDetailSheet
        sessionId={selectedSession?.sessionId ?? null}
        classId={selectedSession?.classId ?? null}
        onClose={() => setSelectedSession(null)}
      />
    </DashboardLayout>
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

// ── List view ──────────────────────────────────────────────────────────────
function ListView({
  sessions,
  onSessionClick,
}: {
  sessions: ScheduleSession[];
  onSessionClick: (s: ScheduleSession) => void;
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
        {byDay.map(([date, daySessions]) => {
          const d = parseISO(date);
          const dayLabel = `${WEEKDAY_LABELS[d.getDay()]} – ${format(d, "dd/MM/yyyy")}`;
          return (
            <div key={date} className="rounded-xl border overflow-hidden">
              <div className={`px-5 py-2.5 border-b ${isToday(d) ? "bg-blue-100" : "bg-muted/60"}`}>
                <h3 className="font-semibold text-sm" data-testid={`day-header-${date}`}>{dayLabel}</h3>
              </div>
              <div className="overflow-x-auto">
              <table className="text-sm min-w-[1500px] w-full table-fixed">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 110 }} />
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
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Buổi</th>
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Thời gian</th>
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
                      <td className="px-4 py-2.5 overflow-hidden max-w-0">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border max-w-full truncate ${getClassColor(s.classId)}`}>
                          {s.classCode}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {s.sessionIndex}/{s.totalSessions}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                        {formatShiftTime(s.shiftStart, s.shiftEnd)}
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
  sessions, currentDate, onSessionClick,
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
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

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b bg-muted/20 flex-shrink-0">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const count = (byDay.get(dateStr) || []).length;
          const today = isToday(day);
          return (
            <div key={dateStr} className="border-r last:border-0 px-1.5 py-2 text-center">
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
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 h-full min-h-[360px]">
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const daySessions = (byDay.get(dateStr) || []).sort((a, b) => a.shiftStart.localeCompare(b.shiftStart));
            const today = isToday(day);
            return (
              <div key={dateStr} className={`border-r last:border-0 p-2 space-y-1.5 ${today ? "bg-blue-50/40" : ""}`}>
                {daySessions.length === 0
                  ? <div className="h-full flex items-center justify-center text-xs text-muted-foreground/40 select-none">—</div>
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
  sessions, currentDate, onSessionClick,
}: {
  sessions: ScheduleSession[];
  currentDate: Date;
  onSessionClick: (s: ScheduleSession) => void;
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
    <div className="h-full overflow-y-scroll">
      <div className="grid grid-cols-7 border-b bg-muted/20 sticky top-0 z-10">
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
            <div key={dateStr} className={`border-r border-b last:border-r-0 p-1.5 ${!inMonth ? "bg-muted/20" : today ? "bg-blue-50/40" : "bg-white"}`}>
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-white" : inMonth ? "text-foreground" : "text-muted-foreground/40"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map(s => (
                  <SessionCard key={s.id} session={s} micro onClick={() => onSessionClick(s)} />
                ))}
                {daySessions.length > 3 && (
                  <div className="text-xs text-muted-foreground pl-1">+{daySessions.length - 3} buổi</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Session card ───────────────────────────────────────────────────────────
function SessionCard({
  session: s, micro, onClick,
}: {
  session: ScheduleSession;
  micro?: boolean;
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
      <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Tên lịch:</span><span className="font-medium">{s.classCode}</span></div>
      {formatLabel && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Hình thức:</span><span className="font-medium">{formatLabel}</span></div>}
      <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Thời gian:</span><span className="font-medium">{timeStr}</span></div>
      {s.enrolledCount > 0 && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Sĩ số:</span><span className="font-medium">{s.enrolledCount}</span></div>}
      {teacherStr && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Giáo viên:</span><span className="font-medium">{teacherStr}</span></div>}
    </div>
  );

  if (micro) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={`w-full rounded px-1.5 py-0.5 border cursor-pointer hover:opacity-80 transition-opacity text-left ${hasCustomColor ? "" : fallbackColor}`}
              style={customStyle}
              data-testid={`session-card-${s.id}`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="font-bold text-[10px] shrink-0">{s.classCode}</span>
                {formatLabel && <span className="text-[9px] font-semibold opacity-80 shrink-0">{formatLabel}</span>}
              </div>
              <div className="text-[9px] font-medium leading-tight">{timeStr}</div>
              {s.teachers.length > 0 && (
                <div className="text-[9px] font-medium opacity-80 truncate leading-tight">{teacherStr}</div>
              )}
            </button>
          </TooltipTrigger>
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
              <span className="font-bold text-xs shrink-0">{s.classCode}</span>
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
