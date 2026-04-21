import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatCycle(weekdays: number[] | null | undefined, classWeekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return "Tất cả";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const classSorted = [...classWeekdays].sort((a, b) => a - b);
  if (sorted.length === classSorted.length && sorted.every((v, i) => v === classSorted[i])) return "Tất cả";
  return sorted.map((w) => WEEKDAY_LABELS[w] ?? w.toString()).join(", ");
}

function cycleKey(weekdays: number[] | null | undefined, classWeekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return "all";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const classSorted = [...classWeekdays].sort((a, b) => a - b);
  if (sorted.length === classSorted.length && sorted.every((v, i) => v === classSorted[i])) return "all";
  return sorted.join(",");
}

function keyToWeekdays(key: string, classWeekdays: number[]): number[] | null {
  if (key === "all") return null;
  return key.split(",").map(Number).sort((a, b) => a - b);
}

function buildOptions(classWeekdays: number[]): Array<{ value: string; label: string }> {
  const sorted = [...classWeekdays].sort((a, b) => a - b);
  const opts: Array<{ value: string; label: string }> = [
    { value: "all", label: `Tất cả (${sorted.map((w) => WEEKDAY_LABELS[w]).join(", ")})` },
  ];
  for (const wd of sorted) {
    opts.push({ value: String(wd), label: WEEKDAY_LABELS[wd] ?? String(wd) });
  }
  if (sorted.length >= 3) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const combo = [sorted[i], sorted[j]];
        opts.push({
          value: combo.join(","),
          label: combo.map((w) => WEEKDAY_LABELS[w]).join(", "),
        });
      }
    }
  }
  return opts;
}

interface BulkChangeCycleStudent {
  studentId: string;
  studentClassId: string;
  studentName: string;
  currentWeekdays: number[] | null;
}

interface BulkChangeCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: BulkChangeCycleStudent[];
  classWeekdays: number[];
  classId: string;
  selectedClassSessionId: string;
}

export function BulkChangeCycleDialog({
  open,
  onOpenChange,
  students,
  classWeekdays,
  classId,
  selectedClassSessionId,
}: BulkChangeCycleDialogProps) {
  const { toast } = useToast();
  const options = buildOptions(classWeekdays);

  const [cycleMap, setCycleMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const s of students) {
      map[s.studentClassId] = cycleKey(s.currentWeekdays, classWeekdays);
    }
    return map;
  });

  const [mode, setMode] = useState<"all" | "unattended_only">("unattended_only");

  const changedStudents = students.filter((s) => {
    const original = cycleKey(s.currentWeekdays, classWeekdays);
    return (cycleMap[s.studentClassId] ?? original) !== original;
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = changedStudents.map((s) => ({
        studentClassId: s.studentClassId,
        weekdays: keyToWeekdays(cycleMap[s.studentClassId] ?? "all", classWeekdays),
      }));
      return apiRequest("POST", `/api/class-sessions/${selectedClassSessionId}/bulk-change-cycle`, {
        students: payload,
        mode,
      });
    },
    onSuccess: async (data: any[]) => {
      const succeeded = data.filter((r) => !r.error).length;
      const failed = data.filter((r) => r.error).length;
      const totalDeleted = data.reduce((sum, r) => sum + (r.deleted ?? 0), 0);
      const totalCreated = data.reduce((sum, r) => sum + (r.created ?? 0), 0);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`] }),
      ]);
      let desc = `Đã cập nhật ${succeeded}/${changedStudents.length} học viên (xóa ${totalDeleted} buổi, tạo ${totalCreated} buổi mới).`;
      if (failed > 0) desc += ` ${failed} học viên gặp lỗi.`;
      toast({ title: "Thành công", description: desc });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể đổi chu kỳ hàng loạt", variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    if (changedStudents.length === 0) {
      toast({ title: "Không có thay đổi", description: "Vui lòng chỉnh chu kỳ mới khác chu kỳ hiện tại cho ít nhất một học viên.", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-purple-500" />
            Đổi chu kỳ học hàng loạt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Học viên</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">Chu kỳ hiện tại</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-44">Chu kỳ mới</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const currentKey = cycleKey(s.currentWeekdays, classWeekdays);
                  const selectedKey = cycleMap[s.studentClassId] ?? currentKey;
                  const changed = selectedKey !== currentKey;
                  return (
                    <tr
                      key={s.studentClassId}
                      className={`border-t ${changed ? "bg-purple-50 dark:bg-purple-950/30" : ""}`}
                      data-testid={`row-bulk-cycle-${s.studentId}`}
                    >
                      <td className="px-3 py-2 font-medium">{s.studentName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatCycle(s.currentWeekdays, classWeekdays)}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={selectedKey}
                          onValueChange={(val) =>
                            setCycleMap((prev) => ({ ...prev, [s.studentClassId]: val }))
                          }
                        >
                          <SelectTrigger
                            className="h-7 text-xs"
                            data-testid={`select-new-cycle-${s.studentId}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Chế độ áp dụng</div>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "all" | "unattended_only")}
              className="flex gap-4"
              data-testid="radio-bulk-cycle-mode"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="unattended_only" id="bulk-unattended" />
                <Label htmlFor="bulk-unattended" className="text-xs cursor-pointer">
                  Chỉ buổi chưa điểm danh
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="bulk-all" />
                <Label htmlFor="bulk-all" className="text-xs cursor-pointer text-red-600 dark:text-red-400">
                  Tất cả (kể cả đã điểm danh)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {changedStudents.length > 0 ? (
            <div className="text-xs text-muted-foreground bg-purple-50 dark:bg-purple-950/30 rounded px-3 py-2 border border-purple-200 dark:border-purple-800">
              Sẽ đổi chu kỳ cho{" "}
              <span className="font-semibold text-purple-700 dark:text-purple-300">
                {changedStudents.length}/{students.length} học viên
              </span>
              :{" "}
              {changedStudents.map((s) => s.studentName).join(", ")}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              Chưa có thay đổi nào — hãy chọn chu kỳ mới khác chu kỳ hiện tại.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={mutation.isPending || changedStudents.length === 0}
            data-testid="button-confirm-bulk-cycle"
          >
            {mutation.isPending
              ? "Đang xử lý..."
              : `Xác nhận (${changedStudents.length} học viên)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
