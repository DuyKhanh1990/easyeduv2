import { isSameDay } from "date-fns";
import { XCircle } from "lucide-react";

interface VerticalSessionListProps {
  classSessions: any[] | undefined;
  selectedClassSessionId: string | null;
  onSessionSelect: (id: string) => void;
}

const DAY_FULL_LABELS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function VerticalSessionList({
  classSessions,
  selectedClassSessionId,
  onSessionSelect,
}: VerticalSessionListProps) {
  if (!classSessions?.length) return null;

  const now = new Date();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Buổi</span>
        <span className="ml-auto text-[11px] font-semibold text-slate-400">{classSessions.length}</span>
      </div>

      {/* 6-per-row grid */}
      <div
        className="overflow-y-auto p-3"
        style={{ maxHeight: "calc(100vh - 240px)" }}
      >
        <div className="grid grid-cols-6 gap-x-1 gap-y-3">
          {classSessions.map((session, index) => {
            const isSelected = selectedClassSessionId === session.id;
            const date = new Date(session.sessionDate);
            const isPast = date < now && !isSameDay(date, now);
            const isToday = isSameDay(date, now);
            const isCancelled = session.status === "cancelled";
            const sessionNum = index + 1;
            const dayLabel = DAY_FULL_LABELS[date.getDay()];
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
            const timeStr = session.shiftTemplate?.startTime?.slice(0, 5) || "";

            let circleClass: string;
            if (isSelected)
              circleClass = "bg-blue-600 text-white shadow-md shadow-blue-300 ring-2 ring-offset-1 ring-blue-400";
            else if (isCancelled)
              circleClass = "bg-red-50 text-red-400 border border-red-200";
            else if (isToday)
              circleClass = "bg-blue-500 text-white shadow-sm";
            else if (isPast)
              circleClass = "bg-slate-300 text-white";
            else
              circleClass = "bg-blue-500 text-white hover:bg-blue-600";

            return (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className="flex flex-col items-center cursor-pointer transition-transform duration-100 hover:scale-105"
              >
                <div
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] transition-all duration-150 ${circleClass}`}
                >
                  {sessionNum}
                  {isCancelled && (
                    <div className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full p-[1px] z-10">
                      <XCircle className="h-2.5 w-2.5" />
                    </div>
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute inset-0 rounded-full ring-2 ring-sky-400 ring-offset-1 animate-pulse pointer-events-none" />
                  )}
                </div>
                <span className="text-[10px] text-slate-800 font-semibold mt-1 leading-none text-center">{dayLabel}</span>
                <span className="text-[10px] text-slate-700 font-medium leading-none mt-0.5">{dateStr}</span>
                {timeStr && (
                  <span className="text-[10px] text-slate-600 font-medium leading-none mt-0.5">{timeStr}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
