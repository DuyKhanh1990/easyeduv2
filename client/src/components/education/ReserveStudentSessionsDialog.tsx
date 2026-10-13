import { useState } from "react";
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

type ReserveStudentSessionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSessionId: string;
  studentName: string;
  studentCode?: string | null;
  defaultFromDate: string;
};

export function ReserveStudentSessionsDialog({
  open,
  onOpenChange,
  studentSessionId,
  studentName,
  studentCode,
  defaultFromDate,
}: ReserveStudentSessionsDialogProps) {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState(defaultFromDate);
  const [dateTo, setDateTo] = useState(defaultFromDate);
  const [description, setDescription] = useState("");

  const reserveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/student-sessions/reserve-range", {
        studentSessionId,
        dateFrom,
        dateTo,
        description,
      });
      return response.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (result) => {
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
        description: `Đã cập nhật điểm danh bảo lưu cho ${result.updatedCount} buổi học.`,
      });
      setDescription("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Không thể bảo lưu", description: error.message, variant: "destructive" });
    },
  });

  const invalidRange = !dateFrom || !dateTo || dateTo < dateFrom;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!reserveMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Bảo lưu học viên</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Thông tin học viên</div>
            <div className="mt-1 font-medium">{studentName}</div>
            {studentCode && <div className="text-sm text-muted-foreground">{studentCode}</div>}
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
            Các buổi học của học viên trong khoảng ngày đã chọn sẽ được điểm danh là Bảo lưu.
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
