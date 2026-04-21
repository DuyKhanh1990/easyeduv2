import { useState, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarStrip } from "@/components/my-space/calendar/CalendarStrip";
import { StaffSessionCard } from "@/components/my-space/calendar/StaffSessionCard";
import { StaffSessionDetailSheet } from "@/components/my-space/calendar/StaffSessionDetailSheet";
import { useStaffCalendar } from "@/hooks/use-staff-calendar";
import { cn } from "@/lib/utils";
import { MyCalendarSession } from "@/types/my-calendar";

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number) {
  return `Tháng ${String(month + 1).padStart(2, "0")}/${year}`;
}

function formatSelectedDateLabel(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  const weekdays = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const wd = weekdays[date.getDay()];
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${wd}, ${d}/${m}`;
}

export function StaffCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateString(today));
  const [detailSession, setDetailSession] = useState<MyCalendarSession | null>(null);

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { data, isLoading, isError } = useStaffCalendar(monthStr);

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
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(toDateString(now));
  };

  const sessionCount = sessionsForDate.length;
  const sessionCountLabel = sessionCount > 0 ? `${sessionCount} CA HỌC` : "KHÔNG CÓ LỊCH";

  return (
    <>
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

      {/* Title row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Lịch cá nhân</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, month)}</p>
        </div>
        <button
          onClick={goToToday}
          data-testid="btn-today"
          className="text-sm px-4 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-colors font-medium"
        >
          Hôm nay
        </button>
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
          <span className="text-sm font-semibold text-foreground">{formatMonthLabel(year, month)}</span>
          <button
            onClick={goToNextMonth}
            data-testid="btn-next-month"
            className="h-7 w-7 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <CalendarStrip
          year={year}
          month={month}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          datesWithSessions={data?.datesWithSessions ?? []}
        />
      </div>

      {/* Date header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-base font-bold text-foreground">{formatSelectedDateLabel(selectedDate)}</h2>
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
          Không thể tải lịch. Vui lòng thử lại.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && sessionCount === 0 && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
          <CalendarDays className="h-10 w-10 opacity-25" />
          <p className="text-sm">Không có buổi dạy nào trong ngày này</p>
        </div>
      )}

      {/* Session cards */}
      {!isLoading && !isError && sessionCount > 0 && (
        <div className="space-y-3">
          {sessionsForDate.map((session) => (
            <StaffSessionCard
              key={session.classSessionId}
              session={session}
              onViewDetail={setDetailSession}
            />
          ))}
        </div>
      )}

    </div>

    <StaffSessionDetailSheet
      session={detailSession}
      onClose={() => setDetailSession(null)}
    />
    </>
  );
}
