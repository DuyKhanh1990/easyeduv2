import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatCycle(weekdays: number[] | null | undefined, classWeekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return "Tất cả";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const classSorted = [...classWeekdays].sort((a, b) => a - b);
  if (sorted.length === classSorted.length && sorted.every((v, i) => v === classSorted[i])) return "Tất cả";
  return sorted.map((w) => WEEKDAY_LABELS[w] || w.toString()).join(", ");
}

interface ChangeCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentClassId: string;
  studentId: string;
  studentName: string;
  fromSessionOrder: number;
  classSessionIndex?: number;
  currentWeekdays: number[] | null;
  classWeekdays: number[];
  classId: string;
  selectedClassSessionId: string | null;
}

export function ChangeCycleDialog({
  open,
  onOpenChange,
  studentClassId,
  studentId,
  studentName,
  fromSessionOrder,
  classSessionIndex,
  currentWeekdays,
  classWeekdays,
  classId,
  selectedClassSessionId,
}: ChangeCycleDialogProps) {
  const { toast } = useToast();
  const sortedClassWeekdays = [...classWeekdays].sort((a, b) => a - b);

  const getInitialCycleKey = () => {
    if (!currentWeekdays || currentWeekdays.length === 0) return "all";
    const sorted = [...currentWeekdays].sort((a, b) => a - b);
    if (sorted.length === sortedClassWeekdays.length && sorted.every((v, i) => v === sortedClassWeekdays[i])) return "all";
    if (sorted.length === 1) return String(sorted[0]);
    return "all";
  };

  const [cycleKey, setCycleKey] = useState<string>(getInitialCycleKey);
  const [mode, setMode] = useState<"all" | "unattended_only">("unattended_only");

  const { data: allStudentSessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/student/${studentId}/sessions`],
    enabled: open && !!classId && !!studentId,
  });

  const fromOrderSessions = (allStudentSessions as any[]).filter((ss) => {
    const order = ss.sessionOrder ?? ss.classSession?.sessionIndex;
    return order !== undefined && order >= fromSessionOrder;
  });

  const attendedInRange = fromOrderSessions.filter(
    (ss) => ss.attendanceStatus && ss.attendanceStatus !== "pending"
  );

  const countToAffect = mode === "all" ? fromOrderSessions.length : fromOrderSessions.filter(ss => ss.attendanceStatus === "pending").length;

  const getEffectiveWeekdays = (): number[] | null => {
    if (cycleKey === "all") return null;
    const wd = parseInt(cycleKey);
    return isNaN(wd) ? null : [wd];
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/student-classes/${studentClassId}/change-cycle`, {
        fromSessionOrder,
        weekdays: getEffectiveWeekdays() ?? sortedClassWeekdays,
        mode,
      }),
    onSuccess: async (res: any) => {
      const data = res instanceof Response ? await res.json() : res;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/student/${studentId}/sessions`] }),
      ]);
      const msg = `Đã thay đổi chu kỳ: xóa ${data.deleted} buổi, tạo ${data.created} buổi mới.${data.warning ? ` ${data.warning}` : ""}`;
      toast({ title: "Thành công", description: msg });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể thay đổi chu kỳ", variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Đổi chu kỳ học — {studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Áp dụng từ <span className="font-semibold text-foreground">buổi thứ {classSessionIndex ?? fromSessionOrder}</span> trở đi.
          </div>

          <div className="text-sm">
            <span className="text-muted-foreground">Chu kỳ hiện tại: </span>
            <span className="font-medium">{formatCycle(currentWeekdays, classWeekdays)}</span>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Chu kỳ mới</div>
            <RadioGroup value={cycleKey} onValueChange={setCycleKey} className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted">
                <RadioGroupItem value="all" id="cycle-all" />
                <Label htmlFor="cycle-all" className="cursor-pointer font-normal">
                  Tất cả ({sortedClassWeekdays.map((w) => WEEKDAY_LABELS[w]).join(", ")})
                </Label>
              </label>
              {sortedClassWeekdays.map((wd) => (
                <label key={wd} className="flex items-center gap-2 cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted">
                  <RadioGroupItem value={String(wd)} id={`cycle-${wd}`} />
                  <Label htmlFor={`cycle-${wd}`} className="cursor-pointer font-normal">
                    {WEEKDAY_LABELS[wd]}
                  </Label>
                </label>
              ))}
            </RadioGroup>
          </div>

          {attendedInRange.length > 0 && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-700 p-3 space-y-2">
              <div className="flex items-start gap-2 text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm font-medium">
                  Có {attendedInRange.length} buổi đã điểm danh từ buổi {fromSessionOrder} trở đi
                </span>
              </div>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "all" | "unattended_only")} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unattended_only" id="unattended_only" />
                  <Label htmlFor="unattended_only" className="text-sm cursor-pointer">
                    Chỉ những buổi chưa điểm danh ({fromOrderSessions.filter(ss => ss.attendanceStatus === "pending").length} buổi)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all" className="text-sm cursor-pointer text-red-600 dark:text-red-400">
                    Cập nhật tất cả — bao gồm {attendedInRange.length} buổi đã điểm danh
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {attendedInRange.length === 0 && fromOrderSessions.length > 0 && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
              Sẽ sắp xếp lại <span className="font-medium text-foreground">{fromOrderSessions.length} buổi</span> theo chu kỳ mới.
            </div>
          )}

          {fromOrderSessions.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Đang tải dữ liệu...</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Đang xử lý..." : `Xác nhận đổi chu kỳ (${countToAffect} buổi)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
