import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Calendar, UserCog, XCircle, Trash2, CalendarDays, Plus, RotateCcw, Split,
} from "lucide-react";
import { ScheduleTabContent } from "@/components/education/ScheduleTabContent";
import { ScheduleHeaderActions } from "@/hooks/use-schedule-tab";
import type { ClassPermissions } from "@/pages/education/ClassDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCenterDateString } from "@/lib/center-time-format";
import { useLocation } from "wouter";

interface SessionDetailSheetProps {
  sessionId: string | null;
  classId: string | null;
  onClose: () => void;
  readOnly?: boolean;
  classPerm?: ClassPermissions;
}

export function SessionDetailSheet({ sessionId, classId, onClose, readOnly = false, classPerm }: SessionDetailSheetProps) {
  const isOpen = !!(sessionId && classId);
  const [scheduleActions, setScheduleActions] = useState<ScheduleHeaderActions | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitCode, setSplitCode] = useState("");
  const [splitName, setSplitName] = useState("");
  const [isSplitting, setIsSplitting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const effectiveClassPerm = readOnly
    ? { canAdd: false, canEdit: false, canDelete: false }
    : classPerm;
  const canAdd = effectiveClassPerm?.canAdd ?? true;
  const canEdit = effectiveClassPerm?.canEdit ?? true;
  const canDelete = effectiveClassPerm?.canDelete ?? true;
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
    queryKey: [`/api/courses/${classData?.courseId}/fee-packages${classData?.feePackageId ? `?includeInactiveId=${encodeURIComponent(classData.feePackageId)}` : ""}`],
    enabled: !!classData?.courseId,
    staleTime: 0,
  });

  if (!isOpen || !classData) return null;
  const selectedSession = classSessions.find((session) => session.id === sessionId);
  const todayAtCenter = getCenterDateString();
  const selectedSessionDate = String(selectedSession?.sessionDate ?? "").slice(0, 10);
  const selectedStartTime = String(selectedSession?.shiftTemplate?.startTime ?? "").slice(0, 5);
  const currentTimeAtCenter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const canSplitSelectedSession = Boolean(
    selectedSession
    && !["cancelled", "completed"].includes(String(selectedSession.status ?? ""))
    && (
      selectedSessionDate > todayAtCenter
      || (selectedSessionDate === todayAtCenter && (!selectedStartTime || selectedStartTime > currentTimeAtCenter))
    ),
  );
  const splitSessions = [...classSessions]
    .filter((session) => (session.sessionIndex ?? 0) >= (selectedSession?.sessionIndex ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
  const openSplitDialog = () => {
    setSplitCode(`COPY-${String(classData.classCode ?? "").slice(0, 35)}`);
    setSplitName(`${classData.name ?? ""} - Tách`);
    setSplitOpen(true);
  };
  const submitSplit = async () => {
    if (!classId || !sessionId) return;
    setIsSplitting(true);
    try {
      const response = await apiRequest("POST", `/api/classes/${classId}/split-from-session`, {
        classSessionId: sessionId,
        classCode: splitCode.trim(),
        name: splitName.trim(),
      });
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setSplitOpen(false);
      onClose();
      toast({ title: "Tách lớp thành công", description: `Đã chuyển ${result.movedSessions} buổi sang lớp ${result.class?.classCode}.` });
      setLocation(`/classes/${result.class.id}`);
    } catch (error: any) {
      toast({ title: "Không thể tách lớp", description: error.message || "Vui lòng thử lại.", variant: "destructive" });
    } finally {
      setIsSplitting(false);
    }
  };

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
              <>
                {canAdd && (
                  <button
                    onClick={() => scheduleActions?.openContent()}
                    className={actionBtn("from-violet-500 to-indigo-600")}
                  >
                    <Plus className="h-3 w-3" /> Nội dung
                  </button>
                )}
                {scheduleActions && (
                  <>
                    {canEdit && (
                      <button onClick={() => scheduleActions.openUpdateSession()} className={actionBtn("from-sky-500 to-blue-500")}>
                        <Calendar className="h-3 w-3" /> Cập nhật buổi
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => scheduleActions.openChangeTeacher()} className={actionBtn("from-amber-500 to-orange-500")}>
                        <UserCog className="h-3 w-3" /> Đổi giáo viên
                      </button>
                    )}
                    {canEdit && scheduleActions.isCancelled ? (
                      <button
                        className={actionBtn("from-emerald-500 to-teal-600", scheduleActions.isRestoringCancelledSession ? "opacity-60 cursor-wait" : "")}
                        onClick={scheduleActions.restoreCancelledSession}
                        disabled={scheduleActions.isRestoringCancelledSession}
                        data-testid="button-restore-cancelled-session"
                      >
                        <RotateCcw className="h-3 w-3" /> {scheduleActions.isRestoringCancelledSession ? "Đang hoàn hủy..." : "Hoàn hủy buổi"}
                      </button>
                    ) : canEdit && !scheduleActions.isCancelled ? (
                      <button
                        className={actionBtn("from-red-500 to-rose-500")}
                        onClick={() => scheduleActions.openCancelSession()}
                      >
                        <XCircle className="h-3 w-3" /> Huỷ buổi
                      </button>
                    ) : null}
                    {canEdit && (
                      <button onClick={() => scheduleActions.openUpdateCycle()} className={actionBtn("from-emerald-500 to-teal-600")}>
                        <Calendar className="h-3 w-3" /> Cập nhật chu kỳ
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => scheduleActions.openExcludeSession()} className={actionBtn("from-slate-500 to-slate-600")}>
                        Loại trừ ngày
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => scheduleActions.openDeleteSchedule()} className={actionBtn("from-rose-500 to-red-600")}>
                        <Trash2 className="h-3 w-3" /> Xoá lịch
                      </button>
                    )}
                    {canEdit && canAdd && canSplitSelectedSession && (
                      <button onClick={openSplitDialog} className={actionBtn("from-indigo-500 to-violet-600")} data-testid="button-split-class">
                        <Split className="h-3 w-3" /> Tách lớp
                      </button>
                    )}
                  </>
                )}
              </>
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
              classPerm={effectiveClassPerm}
            />
          </div>
        </div>
      </DialogContent>
      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tách lớp từ buổi {selectedSession?.sessionIndex}</DialogTitle>
            <DialogDescription>
              Các buổi từ buổi được chọn đến cuối lịch sẽ được chuyển nguyên sang lớp mới. Không thể tách buổi đã diễn ra.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><label className="mb-1 block text-sm font-medium">Mã lớp mới</label><Input value={splitCode} onChange={(event) => setSplitCode(event.target.value)} maxLength={50} /></div>
            <div><label className="mb-1 block text-sm font-medium">Tên lớp mới</label><Input value={splitName} onChange={(event) => setSplitName(event.target.value)} maxLength={255} /></div>
            <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">Buổi sẽ chuyển ({splitSessions.length})</div>
              {splitSessions.map((session) => (
                <div key={session.id} className="flex justify-between border-t py-1.5 text-muted-foreground">
                  <span>Buổi {session.sessionIndex}</span>
                  <span>
                    {String(session.sessionDate).slice(0, 10)}
                    {session.shiftTemplate?.startTime && ` · ${String(session.shiftTemplate.startTime).slice(0, 5)}`}
                    {session.shiftTemplate?.endTime && `–${String(session.shiftTemplate.endTime).slice(0, 5)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitOpen(false)} disabled={isSplitting}>Hủy</Button>
            <Button onClick={submitSplit} disabled={isSplitting || !splitCode.trim() || !splitName.trim()}>
              {isSplitting ? "Đang tách..." : "Tách lớp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
