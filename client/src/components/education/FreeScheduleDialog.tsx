import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FreeScheduleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  students: any[];
  classData: any;
  onConfirm: (configs: any[]) => void;
  isPending: boolean;
}

export function FreeScheduleDialog({
  isOpen,
  onOpenChange,
  students,
  classData,
  onConfirm,
  isPending,
}: FreeScheduleDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalSessions, setTotalSessions] = useState("40");

  useEffect(() => {
    if (!isOpen) return;
    setStartDate(String(classData?.startDate || new Date().toISOString().slice(0, 10)).slice(0, 10));
    setEndDate(String(classData?.endDate || "").slice(0, 10));
  }, [isOpen, classData]);

  const handleConfirm = () => {
    if (!startDate || !endDate || Number(totalSessions) < 1) return;
    onConfirm(students.map((student) => ({
      studentId: student.studentId,
      fullName: student.student?.fullName || student.fullName,
      startDate,
      endType: "date",
      endDate,
      totalSessions: Number(totalSessions),
      packageId: classData?.feePackageId || undefined,
      autoInvoice: false,
    })));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xếp lịch lớp tự do</DialogTitle>
          <DialogDescription>
            Cấu hình này áp dụng cho {students.length} học viên đã chọn. Đăng ký ngày không trừ buổi;
            chỉ khi điểm danh mới cập nhật số buổi đã dùng.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>Ngày bắt đầu</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ngày giới hạn</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Số buổi được sử dụng trong khoảng thời gian</Label>
            <Input type="number" min={1} max={500} value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Hủy</Button>
          <Button onClick={handleConfirm} disabled={isPending || !startDate || !endDate || Number(totalSessions) < 1}>
            {isPending ? "Đang lưu..." : "Xếp lịch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}