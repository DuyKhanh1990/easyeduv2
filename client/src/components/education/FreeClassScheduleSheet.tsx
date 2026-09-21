import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FreeClassCalendar } from "@/components/education/FreeClassCalendar";
import { useMyPermissions } from "@/hooks/use-my-permissions";

export function FreeClassScheduleSheet({
  classId,
  initialDate,
  onClose,
  onUpdated,
}: {
  classId: string | null;
  initialDate?: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const isOpen = !!classId;
  const { data: classData } = useQuery<any>({
    queryKey: [`/api/classes/${classId}`],
    enabled: isOpen,
  });
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const classPermission = myPerms?.permissions?.["/classes"];
  const classPerm = {
    canEdit: isSuperAdmin || !!(classPermission?.canEdit || classPermission?.canDelete),
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-full w-full h-[100dvh] max-h-[100dvh] flex flex-col p-0 my-0 rounded-none bg-[#ECEEF4]"
        style={{ margin: 0 }}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-800">
              {classData?.name || "Lịch lớp tự do"}
            </span>
            {classData?.classCode && (
              <span className="ml-2 text-xs text-slate-400">{classData.classCode}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng lịch"
            title="Đóng lịch"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-2">
          {classData ? (
            <FreeClassCalendar
              classId={classId!}
              classData={classData}
              classPerm={classPerm}
              initialDate={initialDate}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Đang tải lịch học...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}