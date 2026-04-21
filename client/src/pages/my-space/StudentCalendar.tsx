import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List, Calendar } from "lucide-react";
import { CalendarStrip } from "@/components/my-space/calendar/CalendarStrip";
import { SessionCard } from "@/components/my-space/calendar/SessionCard";
import { useStudentCalendar } from "@/hooks/use-student-calendar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatMonthLabel(year: number, month: number) {
  return `Tháng ${String(month + 1).padStart(2, "0")}/${year}`;
}
function formatSelectedDateLabel(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  const weekdays = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${weekdays[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const ATTENDANCE_LABELS: Record<string, { label: string; cls: string }> = {
  present:  { label: "Có mặt",   cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  absent:   { label: "Vắng",     cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  late:     { label: "Đi muộn", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  excused:  { label: "Có phép",  cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
};

type ClassMeta = {
  classId: string;
  className: string;
  classCode: string;
  totalSessions: number;
};

type SessionRow = {
  classSessionId: string;
  sessionIndex: number | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  attendanceStatus: string | null;
  attendanceNote: string | null;
};

type SessionsPage = {
  sessions: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE_OPTIONS = [20, 30, 50];

// ─── Sessions table for the selected class ───────────────────────────────────

function ClassSessionsTable({ classId, page, pageSize, onPageChange, onPageSizeChange }: {
  classId: string;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const { data, isLoading, isError } = useQuery<SessionsPage>({
    queryKey: ["/api/my-space/calendar/student/class", classId, "sessions", page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/my-space/calendar/student/class/${classId}/sessions?page=${page}&pageSize=${pageSize}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Lỗi tải buổi học");
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-secondary/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <div className="text-center py-10 text-sm text-red-500">Không thể tải buổi học. Vui lòng thử lại.</div>;
  }

  const sessions = data?.sessions ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3 mt-4">
      <div className="rounded-xl border border-border overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="text-xs font-semibold w-12 text-center">STT</TableHead>
              <TableHead className="text-xs font-semibold">Buổi học</TableHead>
              <TableHead className="text-xs font-semibold">Ca học</TableHead>
              <TableHead className="text-xs font-semibold">Ngày</TableHead>
              <TableHead className="text-xs font-semibold text-center">Điểm danh</TableHead>
              <TableHead className="text-xs font-semibold">Nhận xét</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  Chưa có buổi học nào
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s, idx) => {
                const att = s.attendanceStatus ? ATTENDANCE_LABELS[s.attendanceStatus] : null;
                const dateObj = s.sessionDate ? new Date(s.sessionDate + "T00:00:00") : null;
                const DOW = dateObj ? ["CN","T2","T3","T4","T5","T6","T7"][dateObj.getDay()] : "";
                const dateStr = dateObj ? format(dateObj, "dd/MM/yyyy") : "—";
                const rowNum = startItem + idx;

                return (
                  <TableRow key={s.classSessionId} data-testid={`row-session-${s.classSessionId}`}>
                    <TableCell className="text-center text-sm text-muted-foreground">{rowNum}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {s.sessionIndex != null ? `Buổi ${s.sessionIndex}` : `#${rowNum}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {s.startTime && s.endTime ? `${s.startTime} – ${s.endTime}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="text-muted-foreground mr-1">{DOW}</span>
                      {dateStr}
                    </TableCell>
                    <TableCell className="text-center">
                      {att ? (
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", att.cls)}>
                          {att.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {s.attendanceNote ? (
                        <span className="whitespace-pre-wrap leading-snug">{s.attendanceNote}</span>
                      ) : (
                        <span className="text-xs italic">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Hiển thị</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}
          >
            <SelectTrigger className="h-7 w-16 text-xs" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>/ trang</span>
          {total > 0 && (
            <span className="ml-1">
              ({startItem}–{endItem} / {total} buổi)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            data-testid="btn-prev-page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            data-testid="btn-next-page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── List view ───────────────────────────────────────────────────────────────

function StudentListView() {
  const { data: classList, isLoading, isError } = useQuery<ClassMeta[]>({
    queryKey: ["/api/my-space/calendar/student/classes"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/calendar/student/classes", { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải danh sách lớp");
      return res.json();
    },
  });

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const classes = classList ?? [];

  // Auto-focus first class when data loads
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].classId);
    }
  }, [classes, selectedClassId]);

  const handleSelectClass = (classId: string) => {
    if (classId !== selectedClassId) {
      setSelectedClassId(classId);
      setPage(1);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-secondary/50 animate-pulse" />)}
      </div>
    );
  }
  if (isError) {
    return <div className="text-center py-10 text-sm text-red-500">Không thể tải danh sách. Vui lòng thử lại.</div>;
  }
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <CalendarDays className="h-10 w-10 opacity-25" />
        <p className="text-sm">Chưa có buổi học nào được ghi nhận</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Class tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-secondary/50 rounded-xl border border-border">
        {classes.map((c) => {
          const isActive = c.classId === selectedClassId;
          return (
            <button
              key={c.classId}
              onClick={() => handleSelectClass(c.classId)}
              data-testid={`tab-class-${c.classId}`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <span>{c.classCode}</span>
              {c.className && c.className !== c.classCode && (
                <span className="hidden sm:inline text-muted-foreground">— {c.className}</span>
              )}
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="text-[10px] font-normal px-1.5 py-0 ml-0.5"
              >
                {c.totalSessions}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Sessions table (loaded on-demand per class) */}
      {selectedClassId && (
        <ClassSessionsTable
          classId={selectedClassId}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}

// ─── Calendar view (unchanged) ───────────────────────────────────────────────

function StudentCalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateString(today));

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { data, isLoading, isError } = useStudentCalendar(monthStr);

  const sessionsForDate = useMemo(() => {
    if (!data) return [];
    return data.sessions.filter((s) => s.sessionDate === selectedDate);
  }, [data, selectedDate]);

  const goToPrevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToToday = () => {
    const now = new Date();
    setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDate(toDateString(now));
  };

  return (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, month)}</p>
        <button
          onClick={goToToday}
          data-testid="btn-today"
          className="text-sm px-4 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-colors font-medium"
        >
          Hôm nay
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <button onClick={goToPrevMonth} data-testid="btn-prev-month" className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground">{formatMonthLabel(year, month)}</span>
          <button onClick={goToNextMonth} data-testid="btn-next-month" className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <CalendarStrip
          year={year} month={month}
          selectedDate={selectedDate} onSelectDate={setSelectedDate}
          datesWithSessions={data?.datesWithSessions ?? []}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-base font-bold text-foreground">{formatSelectedDateLabel(selectedDate)}</h2>
        </div>
        <span className={cn(
          "text-xs font-semibold px-3 py-1 rounded-full border",
          sessionsForDate.length > 0
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-secondary text-muted-foreground border-border"
        )}>
          {sessionsForDate.length > 0 ? `${sessionsForDate.length} CA HỌC` : "KHÔNG CÓ LỊCH"}
        </span>
      </div>

      {isLoading && <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-36 rounded-2xl bg-secondary/50 animate-pulse" />)}</div>}
      {isError && <div className="text-center py-10 text-sm text-red-500">Không thể tải lịch. Vui lòng thử lại.</div>}

      {!isLoading && !isError && sessionsForDate.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
          <CalendarDays className="h-10 w-10 opacity-25" />
          <p className="text-sm">Không có buổi học nào trong ngày này</p>
        </div>
      )}
      {!isLoading && !isError && sessionsForDate.length > 0 && (
        <div className="space-y-3">
          {sessionsForDate.map((session) => (
            <SessionCard
              key={`${session.studentId ?? ""}_${session.classSessionId}`}
              session={session}
              sessionDate={selectedDate}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StudentCalendar() {
  const [view, setView] = useState<"calendar" | "list">("calendar");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Lịch cá nhân</h1>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border">
          <button
            onClick={() => setView("list")}
            data-testid="btn-view-list"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" />
            Danh sách
          </button>
          <button
            onClick={() => setView("calendar")}
            data-testid="btn-view-calendar"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "calendar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Lịch
          </button>
        </div>
      </div>

      {view === "list" ? <StudentListView /> : <StudentCalendarView />}
    </div>
  );
}
