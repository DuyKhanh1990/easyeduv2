import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeleteScheduleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  sessionId: string;
  sessionIndex: number;
}

export function DeleteScheduleDialog({
  isOpen,
  onOpenChange,
  classId,
  sessionId,
  sessionIndex
}: DeleteScheduleDialogProps) {
  const [deleteType, setDeleteType] = useState<"single" | "next" | "all">("single");
  const [showWarning, setShowWarning] = useState(false);
  const [hasAttendedSessions, setHasAttendedSessions] = useState(false);
  const { toast } = useToast();

  const checkAttendanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/check-attendance-before-delete", {
        classId,
        sessionId,
        deleteType
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.hasAttended) {
        setHasAttendedSessions(true);
        setShowWarning(true);
      } else {
        executeDelete("skip_attended");
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (mode: "force" | "skip_attended") => {
      await apiRequest("POST", "/api/classes/delete-sessions", {
        classId,
        sessionId,
        deleteType,
        mode
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      toast({
        title: "Thành công",
        description: "Đã xóa lịch học thành công",
      });
      onOpenChange(false);
      setShowWarning(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa lịch học",
        variant: "destructive"
      });
    }
  });

  const handleDeleteClick = () => {
    checkAttendanceMutation.mutate();
  };

  const executeDelete = (mode: "force" | "skip_attended") => {
    deleteMutation.mutate(mode);
  };

  return (
    <>
      <Dialog open={isOpen && !showWarning} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Xoá lịch học
            </DialogTitle>
            <DialogDescription>
              Bạn đang chọn xoá lịch bắt đầu từ buổi {sessionIndex}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup 
              value={deleteType} 
              onValueChange={(v: any) => setDeleteType(v)}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 space-y-0 border rounded-md p-3 cursor-pointer hover:bg-accent transition-colors">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="flex-1 cursor-pointer font-medium">Xóa buổi này (Buổi {sessionIndex})</Label>
              </div>
              <div className="flex items-center space-x-3 space-y-0 border rounded-md p-3 cursor-pointer hover:bg-accent transition-colors">
                <RadioGroupItem value="next" id="next" />
                <Label htmlFor="next" className="flex-1 cursor-pointer font-medium">Xóa các buổi kế tiếp (Từ buổi {sessionIndex} đến hết)</Label>
              </div>
              <div className="flex items-center space-x-3 space-y-0 border rounded-md p-3 cursor-pointer hover:bg-accent transition-colors">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="flex-1 cursor-pointer font-medium">Xóa toàn bộ lịch của lớp</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteClick}
              disabled={checkAttendanceMutation.isPending || deleteMutation.isPending}
            >
              {checkAttendanceMutation.isPending ? "Đang kiểm tra..." : "Xác nhận xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Cảnh báo điểm danh
            </DialogTitle>
            <DialogDescription className="text-foreground pt-2">
              Một số buổi học trong phạm vi xoá đã có dữ liệu điểm danh. 
              Bạn muốn xử lý các buổi đã điểm danh này như thế nào?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-md text-sm border border-amber-200 dark:border-amber-800">
              Lưu ý: "Xác nhận xoá" sẽ xoá vĩnh viễn cả các buổi đã điểm danh.
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              className="sm:flex-1"
              onClick={() => executeDelete("skip_attended")}
              disabled={deleteMutation.isPending}
            >
              Chỉ xóa buổi chưa điểm danh
            </Button>
            <Button 
              variant="destructive" 
              className="sm:flex-1"
              onClick={() => executeDelete("force")}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Đang xử lý..." : "Xác nhận xóa tất cả"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
