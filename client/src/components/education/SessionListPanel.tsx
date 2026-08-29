import { format, isSameDay } from "date-fns";
import { XCircle } from "lucide-react";
import { SessionActionBar } from "@/components/education/SessionActionBar";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

// 3 rows × 60px cell + 2 row-gaps × 8px = 196px visible before scroll kicks in
const MAX_VISIBLE_HEIGHT = 196;

interface SessionListPanelProps {
  classSessions: any[] | undefined;
  selectedClassSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onActionsChange?: ((actions: any) => void) | null;
  setIsSessionContentDialogOpen: (open: boolean) => void;
  setIsUpdateSessionOpen: (open: boolean) => void;
  setIsChangeTeacherOpen: (open: boolean) => void;
  setSelectedSessionId: (id: string | undefined) => void;
  setIsCancelSessionsDialogOpen: (open: boolean) => void;
  setIsUpdateCycleOpen: (open: boolean) => void;
  setIsExcludeSessionsOpen: (open: boolean) => void;
  setIsDeleteScheduleOpen: (open: boolean) => void;
  classPerm?: ClassPermissions;
  classId?: string;
  /** When true (default), render the session grid. Set false to show only the action bar. */
  showGrid?: boolean;
}

export function SessionListPanel({
  classSessions,
  selectedClassSessionId,
  onSessionSelect,
  onActionsChange,
  setIsSessionContentDialogOpen,
  setIsUpdateSessionOpen,
  setIsChangeTeacherOpen,
  setSelectedSessionId,
  setIsCancelSessionsDialogOpen,
  setIsUpdateCycleOpen,
  setIsExcludeSessionsOpen,
  setIsDeleteScheduleOpen,
  classPerm,
  classId,
  showGrid = true,
}: SessionListPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm shadow-slate-100">
      {!onActionsChange && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500" />
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Lịch buổi học</span>
            {classSessions && (
              <span className="ml-auto text-[10px] text-slate-400 font-medium">{classSessions.length} buổi</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <SessionActionBar
              selectedClassSessionId={selectedClassSessionId}
              classSessions={classSessions}
              setIsSessionContentDialogOpen={setIsSessionContentDialogOpen}
              setIsUpdateSessionOpen={setIsUpdateSessionOpen}
              setIsChangeTeacherOpen={setIsChangeTeacherOpen}
              setSelectedSessionId={setSelectedSessionId}
              setIsCancelSessionsDialogOpen={setIsCancelSessionsDialogOpen}
              setIsUpdateCycleOpen={setIsUpdateCycleOpen}
              setIsExcludeSessionsOpen={setIsExcludeSessionsOpen}
              setIsDeleteScheduleOpen={setIsDeleteScheduleOpen}
              classPerm={classPerm}
              classId={classId}
            />
          </div>
        </div>
      )}
      {showGrid && (
        <div className={`px-4 pb-4 ${!onActionsChange ? "pt-2" : "pt-4"}`}>
          <div
            className="overflow-y-auto"
            style={{ maxHeight: MAX_VISIBLE_HEIGHT }}
          >
            <div className="grid grid-cols-10 gap-2 pr-0.5">
              {classSessions?.map((session) => {
                const isSelected = selectedClassSessionId === session.id;
                const date = new Date(session.sessionDate);
                const isPast = date < new Date() && !isSameDay(date, new Date());
                const isToday = isSameDay(date, new Date());
                const index = classSessions.indexOf(session) + 1;
                const isCancelled = session.status === "cancelled";

                let statusColor: string;
                if (isSelected)
                  statusColor = "bg-gradient-to-br from-violet-500 to-indigo-600 text-white border-transparent shadow-lg shadow-violet-200 scale-[1.06] z-10";
                else if (isCancelled)
                  statusColor = "bg-red-50 text-red-400 border-red-200";
                else if (isToday)
                  statusColor = "bg-gradient-to-br from-sky-400 to-blue-500 text-white border-transparent shadow-md shadow-blue-200";
                else if (date > new Date())
                  statusColor = "bg-white text-indigo-600 border-indigo-100 hover:border-indigo-300";
                else if (isPast)
                  statusColor = "bg-slate-50 text-slate-400 border-slate-100";
                else
                  statusColor = "bg-white text-slate-400 border-slate-200";

                const dayLabel = (() => {
                  const d = date.getDay();
                  return d === 0 ? "CN" : `T${d + 1}`;
                })();

                return (
                  <div
                    key={session.id}
                    onClick={() => onSessionSelect(session.id)}
                    className={`relative flex flex-col justify-between py-1.5 px-1.5 rounded-xl border cursor-pointer transition-all duration-200 h-[60px] ${statusColor}`}
                  >
                    {isCancelled && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm z-20">
                        <XCircle className="h-2.5 w-2.5" />
                      </div>
                    )}
                    {isToday && !isSelected && (
                      <span className="absolute inset-0 rounded-xl ring-2 ring-sky-400 ring-offset-1 animate-pulse pointer-events-none" />
                    )}
                    <div className="flex items-start justify-between gap-0.5">
                      <span className="text-[17px] font-extrabold leading-none">{index}</span>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold leading-tight">{dayLabel}</span>
                        <span className="text-[9px] leading-tight opacity-75">
                          {session.shiftTemplate?.startTime?.slice(0, 5) || ""}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold">{format(date, "d/M/yy")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
