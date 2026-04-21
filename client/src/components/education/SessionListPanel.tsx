import { format, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { SessionActionBar } from "@/components/education/SessionActionBar";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

const SESSIONS_PER_PAGE = 40;

interface SessionListPanelProps {
  classSessions: any[] | undefined;
  sessionPage: number;
  setSessionPage: (fn: (p: number) => number) => void;
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
}

export function SessionListPanel({
  classSessions,
  sessionPage,
  setSessionPage,
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
}: SessionListPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {!onActionsChange && (
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
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
            disabled={sessionPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-1">
            {sessionPage + 1}/{Math.ceil((classSessions?.length || 0) / SESSIONS_PER_PAGE)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSessionPage((p) => p + 1)}
            disabled={
              (sessionPage + 1) * SESSIONS_PER_PAGE >= (classSessions?.length || 0)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-10 gap-2">
          {classSessions
            ?.slice(
              sessionPage * SESSIONS_PER_PAGE,
              (sessionPage + 1) * SESSIONS_PER_PAGE
            )
            .map((session) => {
              const isSelected = selectedClassSessionId === session.id;
              const date = new Date(session.sessionDate);
              const isPast = date < new Date() && !isSameDay(date, new Date());
              const isToday = isSameDay(date, new Date());
              const index = classSessions.indexOf(session) + 1;
              const isCancelled = session.status === "cancelled";

              let statusColor = "bg-white text-slate-400 border-slate-200";
              if (isSelected)
                statusColor = "bg-primary text-primary-foreground border-primary shadow-sm";
              else if (isCancelled)
                statusColor = "bg-red-50 text-red-400 border-red-200";
              else if (isToday)
                statusColor = "bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-300";
              else if (date > new Date())
                statusColor = "bg-white text-blue-600 border-blue-100";
              else if (isPast)
                statusColor = "bg-white text-slate-400 border-slate-200";

              const dayLabel = (() => {
                const d = date.getDay();
                return d === 0 ? "CN" : `Thứ ${d + 1}`;
              })();

              return (
                <div
                  key={session.id}
                  onClick={() => onSessionSelect(session.id)}
                  className={`relative flex flex-col justify-between py-1 px-1.5 rounded-md border cursor-pointer transition-all hover:border-primary/60 h-[58px] ${statusColor}`}
                >
                  {isCancelled && (
                    <div className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 shadow-sm z-20">
                      <XCircle className="h-2.5 w-2.5" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-0.5">
                    <span className="text-[16px] font-bold leading-none mt-0.5">{index}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-semibold leading-tight">{dayLabel}</span>
                      <span className="text-[9px] leading-tight opacity-80">
                        {session.shiftTemplate?.startTime?.slice(0, 5) || ""}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium">{format(date, "d/M/yy")}</span>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
