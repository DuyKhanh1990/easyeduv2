import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReserveStudentSessionsTarget = {
  studentSessionId: string;
  studentId: string;
  classId: string;
  studentName: string;
  studentCode?: string | null;
};

type ReserveStudentSessionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: ReserveStudentSessionsTarget[];
  defaultFromDate: string;
  maxDate: string;
};

export function ReserveStudentSessionsDialog({
  open,
  onOpenChange,
  students,
  defaultFromDate,
  maxDate,
}: ReserveStudentSessionsDialogProps) {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState(defaultFromDate);
  const [dateTo, setDateTo] = useState(defaultFromDate);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setDateFrom(defaultFromDate);
    setDateTo(defaultFromDate);
    setDescription("");
  }, [open, defaultFromDate]);

  const reserveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/student-sessions/reserve-range", {
        studentSessionIds: students.map((student) => student.studentSessionId),
        dateFrom,
        dateTo,
        description,
      });
      return response.json() as Promise<{ updatedCount: number; changedCount: number }>;
    },
    onSuccess: (result) => {
      for (const student of students) {
        queryClient.invalidateQueries({
          queryKey: [`/api/students/${student.studentId}/classes/${student.classId}/sessions`],
        });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && (
            key.includes("/student-sessions")
            || key.includes("/class-sessions")
            || key === "/api/schedule"
          );
        },
      });
      toast({
        title: "Đã bảo lưu",
        description: `Đã cập nhật ${result.changedCount} buổi học cho ${students.length} học viên.`,
      });
      setDescription("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Không thể bảo lưu", description: error.message, variant: "destructive" });
    },
  });

  const invalidRange = students.length === 0 || !dateFrom || !dateTo || dateTo < dateFrom;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!reserveMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{students.length > 1 ? "Bảo lưu nhiều học viên" : "Bảo lưu học viên"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              {students.length > 1 ? `Học viên được chọn (${students.length})` : "Thông tin học viên"}
            </div>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
              {students.map((student) => (
                <div key={student.studentSessionId} className="font-medium">
                  {student.studentName}
                  {student.studentCode && <span className="ml-2 text-sm font-normal text-muted-foreground">{student.studentCode}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Từ</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Đến</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                max={maxDate}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Mô tả</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Nhập lý do hoặc mô tả bảo lưu..."
              className="min-h-20 resize-y"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Các buổi học của học viên được chọn trong khoảng ngày sẽ được điểm danh là Bảo lưu.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reserveMutation.isPending}
          >
            Huỷ
          </Button>
          <Button
            onClick={() => reserveMutation.mutate()}
            disabled={invalidRange || reserveMutation.isPending}
          >
            {reserveMutation.isPending ? "Đang xử lý..." : "Bảo lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
