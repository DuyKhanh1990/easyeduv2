import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Calendar,
  UserCog,
  XCircle,
  Trash2,
  BookOpen,
} from "lucide-react";
import { ClassActivityLogDialog } from "@/components/education/ClassActivityLogDialog";
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
}

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
  classId,
}: SessionActionBarProps) {
  const canAdd = classPerm?.canAdd ?? true;
  const canEdit = classPerm?.canEdit ?? true;
  const canDelete = classPerm?.canDelete ?? true;

  const [isLogOpen, setIsLogOpen] = useState(false);

  return (
    <>
      {canAdd && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsSessionContentDialogOpen(true)}
          className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm"
          data-testid="button-session-content"
        >
          <Plus className="mr-1 h-3 w-3" /> Nội dung
        </Button>
      )}
      {selectedClassSessionId && (
        <>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setIsUpdateSessionOpen(true)} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
              <Calendar className="mr-1 h-3 w-3" /> Cập nhật buổi
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setIsChangeTeacherOpen(true)} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
              <UserCog className="mr-1 h-3 w-3" /> Đổi giáo viên
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm" variant="outline"
              className="text-[11px] px-1.5 h-6 shrink-0 text-destructive border-destructive/15 shadow-sm hover:bg-destructive/10"
              onClick={() => { setSelectedSessionId(selectedClassSessionId || undefined); setIsCancelSessionsDialogOpen(true); }}
              disabled={classSessions?.find((s: any) => s.id === selectedClassSessionId)?.status === "cancelled"}
            >
              <XCircle className="mr-1 h-3 w-3" /> Huỷ buổi
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setIsUpdateCycleOpen(true)} className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm">
              <Calendar className="mr-1 h-3 w-3" /> Cập nhật chu kỳ
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm" variant="outline"
              className="text-[11px] px-1.5 h-6 shrink-0 text-orange-600 border-orange-200/60 shadow-sm hover:bg-orange-50"
              onClick={() => setIsExcludeSessionsOpen(true)}
              data-testid="button-exclude-sessions"
            >
              Loại trừ ngày
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm" variant="outline"
              className="text-[11px] px-1.5 h-6 shrink-0 text-destructive border-destructive/15 shadow-sm hover:bg-destructive/10"
              onClick={() => setIsDeleteScheduleOpen(true)}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Xoá lịch
            </Button>
          )}
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        className="text-[11px] px-1.5 h-6 shrink-0 border-border/40 shadow-sm"
        onClick={() => setIsLogOpen(true)}
        data-testid="button-schedule-activity-log"
      >
        <BookOpen className="mr-1 h-3 w-3" /> Nhật ký
      </Button>
      <ClassActivityLogDialog
        open={isLogOpen}
        onOpenChange={setIsLogOpen}
        classId={classId}
        filterActions={["Thêm Nội dung", "Xoá Nội dung", "Cập nhật buổi", "Xoá lịch", "Đổi giáo viên"]}
      />
    </>
  );
}
