import { useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getDaysInMonth(year: number, month: number) {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface CalendarStripProps {
  year: number;
  month: number; // 0-indexed
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  datesWithSessions: string[];
}

export function CalendarStrip({ year, month, selectedDate, onSelectDate, datesWithSessions }: CalendarStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = toDateString(new Date());
  const days = getDaysInMonth(year, month);
  const datesSet = new Set(datesWithSessions);

  useEffect(() => {
    if (!scrollRef.current) return;
    const btn = scrollRef.current.querySelector<HTMLElement>(`[data-testid="btn-day-${selectedDate}"]`);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDate, year, month]);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        onClick={() => scroll("left")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-secondary/80 sm:h-8 sm:w-8"
        data-testid="btn-strip-left"
      >
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
      </button>

      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-smooth pb-1 scrollbar-hide touch-pan-x sm:gap-2"
        style={{ scrollbarWidth: "none" }}
      >
        {days.map((day) => {
          const dateStr = toDateString(day);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasSessions = datesSet.has(dateStr);
          const weekday = WEEKDAY_LABELS[day.getDay()];

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              data-testid={`btn-day-${dateStr}`}
              className={cn(
                "flex min-w-[48px] shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2.5 transition-all duration-200 sm:min-w-[52px] sm:px-3",
                isSelected
                  ? "bg-green-600 text-white shadow-md"
                  : isToday
                  ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                  : "bg-secondary/60 hover:bg-secondary"
              )}
            >
              <span className={cn(
                "text-xs font-medium",
                isSelected ? "text-white/80" : "text-muted-foreground"
              )}>
                {weekday}
              </span>
              <span className={cn(
                "text-base font-bold leading-none",
                isSelected ? "text-white" : isToday ? "text-green-600" : "text-foreground"
              )}>
                {day.getDate()}
              </span>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full mt-0.5",
                hasSessions
                  ? isSelected ? "bg-white" : "bg-orange-400"
                  : "invisible"
              )} />
            </button>
          );
        })}
      </div>

      <button
        onClick={() => scroll("right")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-secondary/80 sm:h-8 sm:w-8"
        data-testid="btn-strip-right"
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
