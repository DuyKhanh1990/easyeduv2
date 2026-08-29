import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar, UserCog, XCircle, Trash2, CalendarDays, Plus,
} from "lucide-react";
import { ScheduleTabContent } from "@/components/education/ScheduleTabContent";
import { ScheduleHeaderActions } from "@/hooks/use-schedule-tab";

interface SessionDetailSheetProps {
  sessionId: string | null;
  classId: string | null;
  onClose: () => void;
}

export function SessionDetailSheet({ sessionId, classId, onClose }: SessionDetailSheetProps) {
  const isOpen = !!(sessionId && classId);
  const [scheduleActions, setScheduleActions] = useState<ScheduleHeaderActions | null>(null);
  const actionBtn = (grad: string, extra?: string) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r ${grad} text-white text-[11px] font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0 ${extra ?? ""}`;

  const { data: classData } = useQuery<any>({
    queryKey: [`/api/classes/${classId}`],
    enabled: !!classId,
  });

  const { data: classSessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: !!classId,
  });

  const { data: waitingStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/waiting-students`],
    enabled: !!classId,
    staleTime: 0,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: !!classId,
    staleTime: 0,
  });

  const { data: feePackages } = useQuery<any[]>({
    queryKey: [`/api/courses/${classData?.courseId}/fee-packages`],
    enabled: !!classData?.courseId,
    staleTime: 0,
  });

  if (!isOpen || !classData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-full w-full h-[100dvh] max-h-[100dvh] flex flex-col p-0 my-0 rounded-none bg-[#ECEEF4]" style={{ margin: 0 }}>
        <DialogHeader className="px-6 pt-4 pb-3 border-b flex-shrink-0 bg-white">
          <div className="relative flex items-center min-h-[32px]">
            {/* Left: title */}
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 shrink-0 max-w-[260px] truncate">
              <CalendarDays className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{classData.classCode} – {classData.name}</span>
            </DialogTitle>

            {/* Center: action buttons */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 flex-nowrap justify-center">
              <button
                onClick={() => scheduleActions?.openContent()}
                className={actionBtn("from-violet-500 to-indigo-600")}
              >
                <Plus className="h-3 w-3" /> Nội dung
              </button>
              {scheduleActions && (
                <>
                  <button onClick={() => scheduleActions.openUpdateSession()} className={actionBtn("from-sky-500 to-blue-500")}>
                    <Calendar className="h-3 w-3" /> Cập nhật buổi
                  </button>
                  <button onClick={() => scheduleActions.openChangeTeacher()} className={actionBtn("from-amber-500 to-orange-500")}>
                    <UserCog className="h-3 w-3" /> Đổi giáo viên
                  </button>
                  <button
                    className={actionBtn("from-red-500 to-rose-500", scheduleActions.isCancelled ? "opacity-50 cursor-not-allowed" : "")}
                    onClick={() => scheduleActions.openCancelSession()}
                    disabled={scheduleActions.isCancelled}
                  >
                    <XCircle className="h-3 w-3" /> Huỷ buổi
                  </button>
                  <button onClick={() => scheduleActions.openUpdateCycle()} className={actionBtn("from-emerald-500 to-teal-500")}>
                    <Calendar className="h-3 w-3" /> Cập nhật chu kỳ
                  </button>
                  <button onClick={() => scheduleActions.openExcludeSession()} className={actionBtn("from-slate-500 to-slate-600")}>
                    Loại trừ ngày
                  </button>
                  <button onClick={() => scheduleActions.openDeleteSchedule()} className={actionBtn("from-rose-500 to-red-600")}>
                    <Trash2 className="h-3 w-3" /> Xoá lịch
                  </button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 bg-[#ECEEF4]">
          <div className="space-y-4">
            <ScheduleTabContent
              classId={classId}
              classData={classData}
              classSessions={classSessions}
              waitingStudents={waitingStudents}
              activeStudents={activeStudents}
              feePackages={feePackages}
              onActionsChange={setScheduleActions}
              initialSessionId={sessionId}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
