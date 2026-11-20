import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Home, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ConflictItem {
  type: "room" | "teacher";
  sessionDate: string;
  shiftName: string;
  shiftTime: string;
  resourceName: string;
  conflictClassName: string;
  conflictClassCode: string;
}

interface ConflictWarningDialogProps {
  conflicts: ConflictItem[];
  onClose: () => void;
  mode?: "confirm" | "notify";
  onConfirm?: () => void;
  confirmLabel?: string;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const dayLabel = day === 0 ? "CN" : `T${day + 1}`;
    return `${dayLabel}, ${format(d, "dd/MM/yyyy")}`;
  } catch {
    return dateStr;
  }
}

export function ConflictWarningDialog({
  conflicts,
  onClose,
  mode = "notify",
  onConfirm,
  confirmLabel,
}: ConflictWarningDialogProps) {
  const isOpen = conflicts.length > 0;

  const roomConflicts = conflicts.filter(c => c.type === "room");
  const teacherConflicts = conflicts.filter(c => c.type === "teacher");

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        {isOpen && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Cảnh báo trùng lịch
              </DialogTitle>
              <DialogDescription>
                {mode === "confirm" ? (
                  <>
                    Hệ thống phát hiện{" "}
                    <span className="font-semibold text-foreground">{conflicts.length} trùng lịch</span>
                    . Vui lòng kiểm tra lại trước khi quyết định lưu.
                  </>
                ) : (
                  <>
                    Dữ liệu đã được lưu. Tuy nhiên phát hiện{" "}
                    <span className="font-semibold text-foreground">{conflicts.length} trùng lịch</span>{" "}
                    cần kiểm tra lại.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[360px] pr-1">
              <div className="space-y-3">
                {roomConflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                      <Home className="h-3.5 w-3.5" />
                      Trùng phòng học ({roomConflicts.length})
                    </div>
                    <div className="space-y-1.5">
                      {roomConflicts.map((c, i) => (
                        <div key={i} className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-orange-800">{c.resourceName}</span>
                            <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
                              {c.shiftTime}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-orange-600">
                            {formatDate(c.sessionDate)} • Đang dùng bởi:{" "}
                            <span className="font-medium">{c.conflictClassCode || c.conflictClassName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teacherConflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                      <User className="h-3.5 w-3.5" />
                      Trùng lịch giáo viên ({teacherConflicts.length})
                    </div>
                    <div className="space-y-1.5">
                      {teacherConflicts.map((c, i) => (
                        <div key={i} className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-blue-800">{c.resourceName}</span>
                            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
                              {c.shiftTime}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-blue-600">
                            {formatDate(c.sessionDate)} • Đang dạy lớp:{" "}
                            <span className="font-medium">{c.conflictClassCode || c.conflictClassName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              {mode === "confirm" ? (
                <>
                  <Button variant="outline" onClick={onClose}>Hủy</Button>
                  <Button onClick={() => { onConfirm?.(); onClose(); }}>
                    {confirmLabel ?? "Vẫn lưu"}
                  </Button>
                </>
              ) : (
                <Button onClick={onClose}>Đã hiểu</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
