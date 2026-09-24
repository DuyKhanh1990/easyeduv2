import { useState, useMemo, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Calendar, List } from "lucide-react";
import { CalendarStrip } from "@/components/my-space/calendar/CalendarStrip";
import { CalendarMonthGrid } from "@/components/my-space/calendar/CalendarMonthGrid";
import { StaffSessionCard } from "@/components/my-space/calendar/StaffSessionCard";
import { StaffSessionDetailSheet } from "@/components/my-space/calendar/StaffSessionDetailSheet";
import { TestSessionDetailDialog, AddTestContentDialog, type TestSession } from "@/components/education/TestSessionDetailDialog";
import { apiRequest } from "@/lib/queryClient";
import { useStaffCalendar } from "@/hooks/use-staff-calendar";
import { useOnlineLearningRules } from "@/hooks/use-online-learning-rules";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { MyCalendarSession, OnlineRuleConfig } from "@/types/my-calendar";
import { useStaffSessionDetail } from "@/hooks/use-staff-session-detail";
import { useCenterTimeZone } from "@/hooks/use-center-time-zone";
import { getCenterDateKey } from "@shared/center-time";

function dateKeyParts(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, dateKey };
}

function formatMonthLabel(year: number, month: number, lang: string) {
  if (lang === "en") {
    return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `Tháng ${String(month + 1).padStart(2, "0")}/${year}`;
}

function formatSelectedDateLabel(dateStr: string, lang: string) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (lang === "en") {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `${weekdays[date.getUTCDay()]}, ${m}/${d}`;
  }
  const weekdays = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${weekdays[date.getUTCDay()]}, ${d}/${m}`;
}

export function StaffCalendar() {
  const search = useSearch();
  const { t, lang } = useLanguage();
  const centerTimeZoneQuery = useCenterTimeZone();
  const centerTimeZone = centerTimeZoneQuery.data;
  const urlDateParam = new URLSearchParams(search).get("date");
  const initialDate = urlDateParam ? dateKeyParts(urlDateParam) : null;
  const [year, setYear] = useState(initialDate?.year ?? 1970);
  const [month, setMonth] = useState(initialDate?.month ?? 0);
  const [selectedDate, setSelectedDate] = useState(initialDate?.dateKey ?? "");
  const [calendarReady, setCalendarReady] = useState(Boolean(initialDate));
  const todayDateKey = centerTimeZone ? getCenterDateKey(new Date(), centerTimeZone) : "";
  const [view, setView] = useState<"calendar" | "month">("calendar");
  const [detailSession, setDetailSession] = useState<MyCalendarSession | null>(null);
  const [monthDetailSessionId, setMonthDetailSessionId] = useState<string | null>(null);
  const [testDetailSessionId, setTestDetailSessionId] = useState<string | null>(null);
  const [testContentSession, setTestContentSession] = useState<TestSession | null>(null);

  // Khi URL param ?date= thay đổi (VD: click noti khi đang ở trang này),
  // cập nhật state để hiển thị đúng ngày — useState chỉ init 1 lần nên cần effect này
  const prevSearchRef = useRef(search);
  useEffect(() => {
    if (search === prevSearchRef.current) return;
    prevSearchRef.current = search;
    const p = new URLSearchParams(search).get("date");
    if (!p) return;
    const parts = dateKeyParts(p);
    if (!parts) return;
    setYear(parts.year);
    setMonth(parts.month);
    setSelectedDate(parts.dateKey);
    setCalendarReady(true);
  }, [search]);

  useEffect(() => {
    if (calendarReady || !centerTimeZone) return;
    const parts = dateKeyParts(getCenterDateKey(new Date(), centerTimeZone));
    if (!parts) return;
    setYear(parts.year);
    setMonth(parts.month);
    setSelectedDate(parts.dateKey);
    setCalendarReady(true);
  }, [calendarReady, centerTimeZone]);

  const queryClient = useQueryClient();
  const saveTestContentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => {
      const res = await apiRequest("PUT", `/api/test-sessions/${id}`, body);
      if (!res.ok) throw new Error("Lưu thất bại");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-sessions", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/staff"] });
      setTestContentSession(null);
    },
  });

  const monthStr = calendarReady
    ? `${year}-${String(month + 1).padStart(2, "0")}`
    : "";
  const { data, isLoading, isError } = useStaffCalendar(monthStr);
  const { data: monthDetailSession } = useStaffSessionDetail(monthDetailSessionId);
  const { data: onlineRules = [] } = useOnlineLearningRules();

  useEffect(() => {
    if (monthDetailSession) {
      setDetailSession(monthDetailSession);
    }
  }, [monthDetailSession]);

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
    const parts = todayDateKey ? dateKeyParts(todayDateKey) : null;
    if (!parts) return;
    setYear(parts.year);
    setMonth(parts.month);
    setSelectedDate(parts.dateKey);
  };

  const sessionCount = sessionsForDate.length;
  const sessionCountLabel = sessionCount > 0 ? `${sessionCount} ${t("calendar.sessionCount")}` : t("calendar.noSchedule");

  if (centerTimeZoneQuery.isError) {
    return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Không tải được múi giờ của trung tâm.</div>;
  }
  if (!calendarReady) {
    return <div role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Đang tải múi giờ trung tâm…</div>;
  }

  return (
    <>
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">

      {/* Title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">{t("calendar.title")}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, month, lang)}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-1 rounded-lg border border-border bg-secondary p-1 sm:w-auto">
            <button
              onClick={() => setView("calendar")}
              data-testid="btn-view-calendar"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none",
                view === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lịch ngày
            </button>
            <button
              onClick={() => setView("month")}
              data-testid="btn-view-month"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none",
                view === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Tháng
            </button>
          </div>
          <button
            onClick={goToToday}
            data-testid="btn-today"
            className="w-full rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium transition-colors hover:bg-secondary sm:w-auto"
          >
            {t("calendar.today")}
          </button>
        </div>
      </div>

      {/* Calendar strip */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevMonth}
            data-testid="btn-prev-month"
            className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground">{formatMonthLabel(year, month, lang)}</span>
          <button
            onClick={goToNextMonth}
            data-testid="btn-next-month"
            className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {view === "month" ? (
          <CalendarMonthGrid
            year={year}
            month={month}
            sessions={data?.sessions ?? []}
            selectedDate={selectedDate}
            todayDateKey={todayDateKey}
            onSelectDate={setSelectedDate}
            onSessionClick={(session) => {
              if (!session.isFreeSession) setMonthDetailSessionId(session.classSessionId);
            }}
            mode="staff"
          />
        ) : (
          <CalendarStrip
            year={year}
            month={month}
            selectedDate={selectedDate}
            todayDateKey={todayDateKey}
            onSelectDate={setSelectedDate}
            datesWithSessions={data?.datesWithSessions ?? []}
          />
        )}
      </div>

      {view === "calendar" && (
        <>
          {/* Date header */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-base font-bold text-foreground">{formatSelectedDateLabel(selectedDate, lang)}</h2>
            </div>
            <span className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full border",
              sessionCount > 0
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-secondary text-muted-foreground border-border"
            )}>
              {sessionCountLabel}
            </span>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-secondary/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="text-center py-10 text-sm text-red-500">
              {t("calendar.errorLoad")}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && sessionCount === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <CalendarDays className="h-10 w-10 opacity-25" />
              <p className="text-sm">{t("calendar.staff.noSessions")}</p>
            </div>
          )}

          {/* Session cards */}
          {!isLoading && !isError && sessionCount > 0 && (
            <div className="space-y-3">
              {(() => {
                const classIdParam = new URLSearchParams(search).get("classId");
                return sessionsForDate.map((session, idx) => {
                  const highlighted = !!urlDateParam && (
                    classIdParam ? session.classId === classIdParam : idx === 0
                  );
                  return (
                    <StaffSessionCard
                      key={session.classSessionId}
                      session={session}
                      onViewDetail={setDetailSession}
                      onOpenTestDetail={(id) => setTestDetailSessionId(id)}
                      onAddTestContent={(ts) => setTestContentSession(ts)}
                      onlineRule={findRule(session.locationId)}
                      staffId={data?.staffId}
                      highlighted={highlighted}
                    />
                  );
                });
              })()}
            </div>
          )}
        </>
      )}

    </div>

    <StaffSessionDetailSheet
      session={detailSession}
      onClose={() => {
        setDetailSession(null);
        setMonthDetailSessionId(null);
      }}
    />

    <TestSessionDetailDialog
      sessionId={testDetailSessionId}
      onClose={() => setTestDetailSessionId(null)}
    />

    <AddTestContentDialog
      open={!!testContentSession}
      onOpenChange={(v) => { if (!v) setTestContentSession(null); }}
      session={testContentSession}
      onSave={(assignmentIds, examIds, contentSettings) => {
        if (testContentSession) {
          saveTestContentMutation.mutate({
            id: testContentSession.id,
            body: { assignmentIds, examIds, contentSettings },
          });
        }
      }}
    />
    </>
  );
}
