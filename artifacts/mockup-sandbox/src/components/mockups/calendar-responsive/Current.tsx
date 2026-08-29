import "./_group.css";
import { CalendarDays, Calendar, ChevronLeft, ChevronRight, List } from "lucide-react";
import { useState } from "react";

const days: [string, string, boolean][] = [
  ["T2", "24", false],
  ["T3", "25", true],
  ["T4", "26", true],
  ["T5", "27", false],
  ["T6", "28", true],
  ["T7", "29", false],
  ["CN", "30", false],
];

const sessions = [
  { time: "08:00 - 09:30", code: "IELTS 6.5", teacher: "Nguyễn Minh Anh", mode: "Offline", tone: "blue" },
  { time: "14:00 - 15:30", code: "Giao tiếp cơ bản", teacher: "Trần Hoàng Nam", mode: "Online", tone: "orange" },
];

function CalendarStrip() {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary sm:h-8 sm:w-8" aria-label="Tháng trước">
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="calendar-mockup-scrollbar-hide flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 sm:gap-2">
        {days.map(([weekday, date, active]) => (
          <button
            key={date}
            className={`flex min-w-[48px] shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2.5 sm:min-w-[52px] sm:px-3 ${
              date === "26" ? "bg-green-600 text-white shadow-md" : active ? "border border-green-200 bg-green-50" : "bg-secondary/60"
            }`}
          >
            <span className={`text-xs font-medium ${date === "26" ? "text-white/80" : "text-muted-foreground"}`}>{weekday}</span>
            <span className={`text-base font-bold leading-none ${date === "26" ? "text-white" : active ? "text-green-600" : "text-foreground"}`}>{date}</span>
            <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${active ? date === "26" ? "bg-white" : "bg-orange-400" : "invisible"}`} />
          </button>
        ))}
      </div>
      <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary sm:h-8 sm:w-8" aria-label="Tháng sau">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function SessionCard({ session }: { session: typeof sessions[number] }) {
  return (
    <article className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            Thời gian: <span className="font-bold text-foreground">{session.time}</span>
          </p>
          <p className="font-bold text-foreground">{session.code}</p>
          <p className="truncate text-sm text-muted-foreground">GV: <span className="font-medium text-foreground">{session.teacher}</span></p>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
          <span className={`text-sm font-medium ${session.tone === "blue" ? "text-blue-500" : "text-muted-foreground"}`}>{session.mode}</span>
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">Đã điểm danh</span>
        </div>
      </div>
      {session.mode === "Online" && (
        <div className="border-t border-border/50 pt-3">
          <button className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white sm:w-auto">
            Vào Google Meet
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border/50 pt-3 text-sm">
        <span className="text-muted-foreground">Nhận xét:</span>
        <button className="font-medium text-primary">Xem nhận xét</button>
      </div>
    </article>
  );
}

export function Current() {
  const [view, setView] = useState<"calendar" | "month">("calendar");

  return (
    <div className="min-h-screen bg-[#ECEEF4] p-3 text-sm sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Lịch cá nhân</h1>
          </div>
          <div className="flex w-full items-center gap-1 rounded-lg border border-border bg-secondary p-1 sm:w-auto">
            <button onClick={() => setView("calendar")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium sm:flex-none ${view === "calendar" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              <List className="h-3.5 w-3.5" /> Lịch
            </button>
            <button onClick={() => setView("month")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium sm:flex-none ${view === "month" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              <Calendar className="h-3.5 w-3.5" /> Tháng
            </button>
          </div>
        </header>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex items-center justify-between">
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary" aria-label="Tháng trước"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold">Tháng 08/2026</span>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary" aria-label="Tháng sau"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {view === "calendar" ? (
            <CalendarStrip />
          ) : (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {Array.from({ length: 35 }, (_, index) => (
                <div key={index} className="min-h-[66px] bg-card p-1.5 text-xs sm:min-h-[112px]">
                  <span className={index === 9 ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white" : "text-muted-foreground"}>{(index % 31) + 1}</span>
                  {index % 7 === 2 && <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-1 text-[9px] font-medium text-blue-700">IELTS<br />08:00</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {view === "calendar" && (
          <>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="border-l-4 border-primary pl-2 text-base font-bold">Thứ Tư, 26/08</h2>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">2 CA HỌC</span>
            </div>
            <div className="space-y-3">
              {sessions.map((session) => <SessionCard key={session.code} session={session} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}