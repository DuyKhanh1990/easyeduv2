import { eachDayOfInterval, endOfMonth, endOfWeek, format, isToday, startOfMonth, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { getClassCalendarColor } from "@/lib/class-calendar-colors";
import { getAttendanceStatus } from "@/lib/attendance-status";
import type { MyCalendarSessionLight } from "@/types/my-calendar";

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

interface CalendarMonthGridProps {
  year: number;
  month: number;
  sessions: MyCalendarSessionLight[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSessionClick?: (session: MyCalendarSessionLight) => void;
  mode: "student" | "staff";
}

function toDateString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function sessionTitle(session: MyCalendarSessionLight, mode: CalendarMonthGridProps["mode"]) {
  if (mode === "student" && session.classCode === "TEST") return session.className;
  return session.classCode || session.className;
}

function sessionTone(session: MyCalendarSessionLight) {
  if (session.sessionStatus === "cancelled" || session.sessionStatus === "canceled") {
    return { className: "border-red-200 bg-red-50 text-red-800", style: undefined };
  }

  if (session.classColor) {
    return {
      className: "",
      style: {
        backgroundColor: `${session.classColor}18`,
        borderColor: `${session.classColor}66`,
        color: session.classColor,
      },
    };
  }

  return {
    className: getClassCalendarColor(session.classId ?? session.classCode),
    style: undefined,
  };
}

export function CalendarMonthGrid({
  year,
  month,
  sessions,
  selectedDate,
  onSelectDate,
  onSessionClick,
  mode,
}: CalendarMonthGridProps) {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
  const byDay = new Map<string, MyCalendarSessionLight[]>();

  sessions.forEach((session) => {
    const existing = byDay.get(session.sessionDate) ?? [];
    existing.push(session);
    byDay.set(session.sessionDate, existing);
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card touch-pan-x">
      <div className="min-w-0">
      <div className="grid grid-cols-7 border-b bg-secondary/40">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-r last:border-r-0 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:py-2 sm:text-[11px]"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid auto-rows-[minmax(76px,auto)] grid-cols-7 sm:auto-rows-[minmax(112px,auto)]">
        {days.map((day) => {
          const dateStr = toDateString(day);
          const daySessions = (byDay.get(dateStr) ?? []).slice().sort((a, b) =>
            (a.startTime ?? "").localeCompare(b.startTime ?? "")
          );
          const inCurrentMonth = day.getMonth() === month;
          const today = isToday(day);
          const selected = dateStr === selectedDate;

          return (
            <div
              key={dateStr}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDate(dateStr)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDate(dateStr);
                }
              }}
              className={cn(
                "min-w-0 cursor-pointer border-r border-b p-1 text-left transition-colors last:border-r-0 hover:bg-primary/[0.03] sm:p-1.5",
                !inCurrentMonth && "bg-muted/20",
                today && "bg-blue-50/40",
                selected && "bg-primary/[0.06] ring-1 ring-inset ring-primary/35"
              )}
              data-testid={`month-day-${dateStr}`}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold sm:h-6 sm:w-6 sm:text-xs",
                    today && "bg-primary text-primary-foreground",
                    !today && inCurrentMonth && "text-foreground",
                    !inCurrentMonth && "text-muted-foreground/45"
                  )}
                >
                  {format(day, "d")}
                </span>
                {daySessions.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1 py-0.5 text-[8px] font-semibold text-primary sm:px-1.5 sm:text-[9px]">
                    {daySessions.length}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {daySessions.map((session) => {
                  const tone = sessionTone(session);
                  return (
                    <button
                      key={`${session.classSessionId}-${session.studentId ?? ""}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectDate(dateStr);
                        onSessionClick?.(session);
                      }}
                      className={cn(
                        "block w-full min-w-0 rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-75 sm:px-1.5 sm:py-1",
                        tone.className
                      )}
                      style={tone.style}
                      data-testid={`month-session-${session.classSessionId}`}
                    >
                      <div className="truncate text-[9px] font-bold leading-tight sm:text-[10px]">
                        {sessionTitle(session, mode)}
                      </div>
                      <div className="truncate text-[8px] font-medium leading-tight sm:text-[9px]">
                        {session.startTime?.slice(0, 5)} – {session.endTime?.slice(0, 5)}
                      </div>
                      <div className="hidden truncate text-[9px] leading-tight opacity-75 sm:block">
                        {session.learningFormat === "online" || session.onlineLink ? "Online" : "Offline"}
                      {mode === "student" && session.attendanceStatus
                        ? ` · ${getAttendanceStatus(session.attendanceStatus).label}`
                        : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}