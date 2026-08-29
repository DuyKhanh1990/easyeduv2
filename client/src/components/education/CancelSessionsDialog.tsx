import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

export function CancelSessionsDialog({
  isOpen,
  onOpenChange,
  classSessions,
  selectedSessionId,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classSessions: any[];
  selectedSessionId?: string;
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      if (selectedSessionId) {
        setFromSessionId(selectedSessionId);
      } else if (classSessions?.length > 0) {
        setFromSessionId(classSessions[0].id);
      }

      if (classSessions?.length > 0) {
        setToSessionId(classSessions[classSessions.length - 1].id);
      }
      setReason("");
    }
  }, [isOpen, selectedSessionId, classSessions]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Hủy buổi học</DialogTitle>
          <DialogDescription>Chọn phạm vi buổi học muốn hủy và lý do.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Từ buổi</Label>
              <Select value={fromSessionId} onValueChange={setFromSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn buổi" />
                </SelectTrigger>
                <SelectContent>
                  {classSessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Buổi {String(s.sessionIndex || "").padStart(2, "0")} -{" "}
                      {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Đến buổi</Label>
              <Select value={toSessionId} onValueChange={setToSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn buổi" />
                </SelectTrigger>
                <SelectContent>
                  {classSessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Buổi {String(s.sessionIndex || "").padStart(2, "0")} -{" "}
                      {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lý do hủy</Label>
            <Textarea
              placeholder="Nhập lý do hủy buổi học..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-md text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Việc hủy buổi sẽ không xóa buổi học hay làm thay đổi số buổi của học viên.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            disabled={!fromSessionId || !toSessionId || !reason.trim() || isPending}
            onClick={() => onConfirm({ fromSessionId, toSessionId, reason })}
          >
            {isPending ? "Đang xử lý..." : "Xác nhận hủy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
