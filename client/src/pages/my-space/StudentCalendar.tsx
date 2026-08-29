import { useState, useMemo, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List, Calendar, Eye, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { CalendarStrip } from "@/components/my-space/calendar/CalendarStrip";
import { CalendarMonthGrid } from "@/components/my-space/calendar/CalendarMonthGrid";
import { SessionCard } from "@/components/my-space/calendar/SessionCard";
import { FeedbackModal } from "@/components/my-space/calendar/FeedbackModal";
import { MyCalendarSessionLight, TeacherReview } from "@/types/my-calendar";
import { useStudentCalendar } from "@/hooks/use-student-calendar";
import { useOnlineLearningRules } from "@/hooks/use-online-learning-rules";
import { OnlineRuleConfig } from "@/types/my-calendar";
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
import { getAttendanceStatus } from "@/lib/attendance-status";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── helpers ────────────────────────────────────────────────────────────────

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatMonthLabel(year: number, month: number, lang: string) {
  if (lang === "en") {
    return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `Tháng ${String(month + 1).padStart(2, "0")}/${year}`;
}
function formatSelectedDateLabel(dateStr: string, lang: string) {
  const date = new Date(dateStr + "T00:00:00");
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  if (lang === "en") {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `${weekdays[date.getDay()]}, ${m}/${d}`;
  }
  const weekdays = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${weekdays[date.getDay()]}, ${d}/${m}`;
}

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
  reviewPublished: boolean | null;
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

function ClassSessionsTable({ classId, classCode, className: classNameLabel, page, pageSize, onPageChange, onPageSizeChange }: {
  classId: string;
  classCode: string;
  className: string;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const { t, lang } = useLanguage();
  const DOW_SHORT = lang === "en"
    ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    : ["CN","T2","T3","T4","T5","T6","T7"];
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackData, setFeedbackData] = useState<TeacherReview[]>([]);
  const [feedbackSessionDate, setFeedbackSessionDate] = useState("");

  const handleViewFeedback = async (classSessionId: string, sessionDate: string) => {
    setFeedbackLoading(true);
    setFeedbackOpen(true);
    setFeedbackSessionDate(
      new Date(sessionDate + "T00:00:00").toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })
    );
    try {
      const res = await fetch(`/api/my-space/calendar/student/session/${classSessionId}`, { credentials: "include" });
      if (res.ok) {
        const detail = await res.json();
        setFeedbackData(Array.isArray(detail.reviewData) ? detail.reviewData : []);
      }
    } finally {
      setFeedbackLoading(false);
    }
  };

  const { data, isLoading, isError } = useQuery<SessionsPage>({
    queryKey: ["/api/my-space/calendar/student/class", classId, "sessions", page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/my-space/calendar/student/class/${classId}/sessions?page=${page}&pageSize=${pageSize}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Error loading sessions");
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
    return <div className="text-center py-10 text-sm text-red-500">{t("calendar.student.errorLoadSessions")}</div>;
  }

  const sessions = data?.sessions ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2 sm:hidden">
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-6 text-center text-sm text-muted-foreground dark:bg-zinc-950">
            {t("calendar.student.table.noSessions")}
          </div>
        ) : (
          sessions.map((s, idx) => {
            const att = s.attendanceStatus ? getAttendanceStatus(s.attendanceStatus) : null;
            const dateObj = s.sessionDate ? new Date(s.sessionDate + "T00:00:00") : null;
            const DOW = dateObj ? DOW_SHORT[dateObj.getDay()] : "";
            const dateStr = dateObj ? format(dateObj, "dd/MM/yyyy") : "—";
            const rowNum = startItem + idx;

            return (
              <article key={s.classSessionId} className="rounded-xl border border-border bg-white p-3 shadow-sm dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">#{rowNum}</p>
                    <p className="truncate text-sm font-semibold">
                      {s.sessionIndex != null ? `Buổi ${s.sessionIndex}` : `#${rowNum}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {DOW} {dateStr} · {s.startTime && s.endTime ? `${s.startTime} – ${s.endTime}` : "—"}
                    </p>
                  </div>
                  {att ? (
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", att.badgeClass)}>
                      {att.label}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">—</span>
                  )}
                </div>
                {s.reviewPublished && (
                  <button
                    onClick={() => handleViewFeedback(s.classSessionId, s.sessionDate)}
                    className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-border pt-3 text-xs font-medium text-primary"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Xem nhận xét
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="hidden rounded-xl border border-border bg-white shadow-sm sm:block sm:overflow-auto dark:bg-zinc-950">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="text-xs font-semibold w-12 text-center">#</TableHead>
              <TableHead className="text-xs font-semibold">{t("calendar.student.table.session")}</TableHead>
              <TableHead className="text-xs font-semibold">{t("calendar.student.table.slot")}</TableHead>
              <TableHead className="text-xs font-semibold">{t("calendar.student.table.date")}</TableHead>
              <TableHead className="text-xs font-semibold text-center">{t("calendar.student.table.attendance")}</TableHead>
              <TableHead className="text-xs font-semibold">{t("calendar.student.table.feedback")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  {t("calendar.student.table.noSessions")}
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s, idx) => {
                const att = s.attendanceStatus ? getAttendanceStatus(s.attendanceStatus) : null;
                const dateObj = s.sessionDate ? new Date(s.sessionDate + "T00:00:00") : null;
                const DOW = dateObj ? DOW_SHORT[dateObj.getDay()] : "";
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
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", att.badgeClass)}>
                          {att.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.reviewPublished ? (
                        <button
                          onClick={() => handleViewFeedback(s.classSessionId, s.sessionDate)}
                          className="flex items-center gap-1.5 text-primary text-xs font-medium hover:text-primary/70 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Xem nhận xét
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
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
      <div className="flex flex-col items-start justify-between gap-3 pt-1 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => { setFeedbackOpen(false); setFeedbackData([]); }}
        reviewData={feedbackLoading ? [] : feedbackData}
        className={classNameLabel || classCode}
        sessionDate={feedbackSessionDate}
        loading={feedbackLoading}
      />
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
       <div className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl border border-border bg-muted p-1.5 shadow-sm scrollbar-hide touch-pan-x sm:flex-wrap">
        {classes.map((c) => {
          const isActive = c.classId === selectedClassId;
          return (
            <button
              key={c.classId}
              onClick={() => handleSelectClass(c.classId)}
              data-testid={`tab-class-${c.classId}`}
               className={cn(
                 "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground border border-border/40 hover:text-foreground hover:bg-card/60"
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
      {selectedClassId && (() => {
        const sel = classes.find(c => c.classId === selectedClassId);
        return (
          <ClassSessionsTable
            classId={selectedClassId}
            classCode={sel?.classCode ?? ""}
            className={sel?.className ?? sel?.classCode ?? ""}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        );
      })()}
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function parseDateParam(search: string): Date | null {
  const p = new URLSearchParams(search).get("date");
  if (!p) return null;
  const d = new Date(p + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function StudentCalendarView({ viewMode }: { viewMode: "calendar" | "month" }) {
  const search = useSearch();
  const { lang } = useLanguage();
  const initDate = parseDateParam(search) ?? new Date();
  const today = new Date();
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateString(initDate));
  const [monthSession, setMonthSession] = useState<{
    session: MyCalendarSessionLight;
    date: string;
  } | null>(null);

  // Khi URL param ?date= thay đổi (VD: click noti khi đang ở trang này),
  // cập nhật state để hiển thị đúng ngày — useState chỉ init 1 lần nên cần effect này
  const prevSearchRef = useRef(search);
  useEffect(() => {
    if (search === prevSearchRef.current) return;
    prevSearchRef.current = search;
    const dateFromUrl = parseDateParam(search);
    if (dateFromUrl) {
      setYear(dateFromUrl.getFullYear());
      setMonth(dateFromUrl.getMonth());
      setSelectedDate(toDateString(dateFromUrl));
    }
  }, [search]);

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { data, isLoading, isError } = useStudentCalendar(monthStr);
  const { data: onlineRules = [] } = useOnlineLearningRules();

  const findRule = (locationId: string | null | undefined): OnlineRuleConfig | null => {
    if (!locationId) return null;
    return onlineRules.find((r) => r.locationId === locationId) ?? null;
  };

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
        <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, month, lang)}</p>
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
          <span className="text-sm font-semibold text-foreground">{formatMonthLabel(year, month, lang)}</span>
          <button onClick={goToNextMonth} data-testid="btn-next-month" className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {viewMode === "month" ? (
          <CalendarMonthGrid
            year={year}
            month={month}
            sessions={data?.sessions ?? []}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSessionClick={(session) => {
              setSelectedDate(session.sessionDate);
              setMonthSession({ session, date: session.sessionDate });
            }}
            mode="student"
          />
        ) : (
          <CalendarStrip
            year={year} month={month}
            selectedDate={selectedDate} onSelectDate={setSelectedDate}
            datesWithSessions={data?.datesWithSessions ?? []}
          />
        )}
      </div>

      {viewMode === "calendar" && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-base font-bold text-foreground">{formatSelectedDateLabel(selectedDate, lang)}</h2>
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
              {(() => {
                const classIdParam = new URLSearchParams(search).get("classId");
                return sessionsForDate.map((session, idx) => {
                  const highlighted = !!parseDateParam(search) && (
                    classIdParam ? session.classId === classIdParam : idx === 0
                  );
                  return (
                    <SessionCard
                      key={`${session.studentId ?? ""}_${session.classSessionId}`}
                      session={session}
                      sessionDate={selectedDate}
                      onlineRule={findRule(session.locationId)}
                      highlighted={highlighted}
                    />
                  );
                });
              })()}
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!monthSession}
        onOpenChange={(open) => {
          if (!open) setMonthSession(null);
        }}
      >
        <DialogContent className="max-w-[min(95vw,900px)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base">
              Chi tiết buổi học
            </DialogTitle>
          </DialogHeader>
          {monthSession && (
            <SessionCard
              session={monthSession.session}
              sessionDate={monthSession.date}
              onlineRule={findRule(monthSession.session.locationId)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StudentCalendar() {
  const [view, setView] = useState<"calendar" | "month" | "list">("calendar");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Lịch cá nhân</h1>
        </div>

        {/* View toggle */}
        <div className="flex w-full items-center gap-1 rounded-lg border border-border bg-secondary p-1 sm:w-auto">
          <button
            onClick={() => setView("list")}
            data-testid="btn-view-list"
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:flex-none",
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
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:flex-none",
              view === "calendar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Lịch
          </button>
          <button
            onClick={() => setView("month")}
            data-testid="btn-view-month"
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:flex-none",
              view === "month"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Tháng
          </button>
        </div>
      </div>

      {view === "list" ? <StudentListView /> : <StudentCalendarView viewMode={view} />}
    </div>
  );
}
