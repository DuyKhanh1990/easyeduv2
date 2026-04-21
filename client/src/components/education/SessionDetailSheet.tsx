import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="max-w-full w-full h-[100dvh] max-h-[100dvh] flex flex-col p-0 my-0 rounded-none" style={{ margin: 0 }}>
        <DialogHeader className="px-6 pt-4 pb-3 border-b flex-shrink-0">
          <div className="relative flex items-center min-h-[32px]">
            {/* Left: title */}
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 shrink-0 max-w-[260px] truncate">
              <CalendarDays className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{classData.classCode} – {classData.name}</span>
            </DialogTitle>

            {/* Center: action buttons */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 flex-nowrap justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => scheduleActions?.openContent()}
                className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm"
              >
                <Plus className="mr-1 h-3 w-3" /> Nội dung
              </Button>
              {scheduleActions && (
                <>
                  <Button size="sm" variant="outline" onClick={() => scheduleActions.openUpdateSession()} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
                    <Calendar className="mr-1 h-3 w-3" /> Cập nhật buổi
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => scheduleActions.openChangeTeacher()} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
                    <UserCog className="mr-1 h-3 w-3" /> Đổi giáo viên
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-[11px] px-1.5 h-6 shrink-0 text-destructive border-destructive/15 shadow-sm hover:bg-destructive/10"
                    onClick={() => scheduleActions.openCancelSession()}
                    disabled={scheduleActions.isCancelled}
                  >
                    <XCircle className="mr-1 h-3 w-3" /> Huỷ buổi
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => scheduleActions.openUpdateCycle()} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
                    <Calendar className="mr-1 h-3 w-3" /> Cập nhật chu kỳ
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-[11px] px-1.5 h-6 shrink-0 text-orange-600 border-orange-200/60 shadow-sm hover:bg-orange-50"
                    onClick={() => scheduleActions.openExcludeSession()}
                  >
                    Loại trừ ngày
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-[11px] px-1.5 h-6 shrink-0 text-destructive border-destructive/15 shadow-sm hover:bg-destructive/10"
                    onClick={() => scheduleActions.openDeleteSchedule()}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Xoá lịch
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
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
