import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { AlertTriangle, CalendarX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CloseClassDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className?: string;
}

export function CloseClassDialog({ open, onClose, classId, className }: CloseClassDialogProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [closeDate, setCloseDate] = useState(today);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!closeDate) return;
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/classes/${classId}/close`, { closeDate });
      const data = await res.json();
      toast({
        title: "Đã đóng lớp",
        description: `Xóa ${data.deletedCount} buổi học từ ${format(new Date(closeDate + "T00:00:00"), "dd/MM/yyyy", { locale: vi })} trở đi.`,
      });
      // Invalidate all class-related queries
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      onClose();
    } catch (err: any) {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể đóng lớp",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayDate = closeDate
    ? format(new Date(closeDate + "T00:00:00"), "dd/MM/yyyy", { locale: vi })
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="close-class-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CalendarX className="h-5 w-5" />
            Đóng lớp{className ? `: ${className}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1" id="close-class-desc">
          {/* Explanation */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 leading-relaxed">
              Chọn ngày đóng lớp. Tất cả các buổi học <strong>từ ngày đó trở đi</strong> sẽ bị
              xóa vĩnh viễn. Các buổi trước ngày này vẫn giữ nguyên.
              Trạng thái lớp sẽ chuyển sang <strong>Đã đóng</strong>.
            </p>
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label htmlFor="close-date">Ngày bắt đầu đóng lớp</Label>
            <Input
              id="close-date"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full"
            />
            {closeDate && (
              <p className="text-xs text-muted-foreground">
                Các buổi từ <span className="font-semibold text-destructive">{displayDate}</span> trở đi sẽ bị xóa.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!closeDate || isSubmitting}
          >
            {isSubmitting ? "Đang xử lý..." : "Xác nhận đóng lớp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
