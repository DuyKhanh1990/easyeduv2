import {
  Plus,
  Calendar,
  UserCog,
  XCircle,
  Trash2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

interface SessionActionBarProps {
  selectedClassSessionId: string | null;
  classSessions: any[] | undefined;
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
  onRestoreCancelledSession?: (sessionId: string) => void;
  isRestoringCancelledSession?: boolean;
}

const btn = (grad: string, extra?: string) =>
  `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r ${grad} text-white text-[11px] font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0 ${extra ?? ""}`;

export function SessionActionBar({
  selectedClassSessionId,
  classSessions,
  setIsSessionContentDialogOpen,
  setIsUpdateSessionOpen,
  setIsChangeTeacherOpen,
  setSelectedSessionId,
  setIsCancelSessionsDialogOpen,
  setIsUpdateCycleOpen,
  setIsExcludeSessionsOpen,
  setIsDeleteScheduleOpen,
  classPerm,
  onRestoreCancelledSession,
  isRestoringCancelledSession = false,
}: SessionActionBarProps) {
  const canAdd = classPerm?.canAdd ?? true;
  const canEdit = classPerm?.canEdit ?? true;
  const canDelete = classPerm?.canDelete ?? true;

  const isCancelled =
    classSessions?.find((s: any) => s.id === selectedClassSessionId)?.status === "cancelled";

  return (
    <>
      {canAdd && (
        <button
          className={btn("from-violet-500 to-indigo-600")}
          onClick={() => setIsSessionContentDialogOpen(true)}
          data-testid="button-session-content"
        >
          <Plus className="h-3 w-3" /> Nội dung
        </button>
      )}

      {selectedClassSessionId && (
        <>
          {canEdit && (
            <button
              className={btn("from-sky-500 to-blue-500")}
              onClick={() => setIsUpdateSessionOpen(true)}
            >
              <RefreshCw className="h-3 w-3" /> Cập nhật buổi
            </button>
          )}
          {canEdit && (
            <button
              className={btn("from-amber-500 to-orange-500")}
              onClick={() => setIsChangeTeacherOpen(true)}
            >
              <UserCog className="h-3 w-3" /> Đổi giáo viên
            </button>
          )}
          {canEdit && (isCancelled ? (
            <button
              className={btn("from-emerald-500 to-teal-600", isRestoringCancelledSession ? "opacity-60 cursor-wait" : "")}
              disabled={isRestoringCancelledSession}
              onClick={() => onRestoreCancelledSession?.(selectedClassSessionId)}
              data-testid="button-restore-cancelled-session"
            >
              <RotateCcw className="h-3 w-3" /> {isRestoringCancelledSession ? "Đang hoàn hủy..." : "Hoàn hủy buổi"}
            </button>
          ) : (
            <button
              className={btn("from-red-500 to-rose-500")}
              onClick={() => {
                setSelectedSessionId(selectedClassSessionId || undefined);
                setIsCancelSessionsDialogOpen(true);
              }}
            >
              <XCircle className="h-3 w-3" /> Huỷ buổi
            </button>
          ))}
          {canEdit && (
            <button
              className={btn("from-emerald-500 to-teal-500")}
              onClick={() => setIsUpdateCycleOpen(true)}
            >
              <Calendar className="h-3 w-3" /> Cập nhật chu kỳ
            </button>
          )}
          {canEdit && (
            <button
              className={btn("from-slate-500 to-slate-600")}
              onClick={() => setIsExcludeSessionsOpen(true)}
              data-testid="button-exclude-sessions"
            >
              ··· Loại trừ ngày
            </button>
          )}
          {canDelete && (
            <button
              className={btn("from-rose-500 to-red-600")}
              onClick={() => setIsDeleteScheduleOpen(true)}
            >
              <Trash2 className="h-3 w-3" /> Xoá lịch
            </button>
          )}
        </>
      )}
    </>
  );
}
