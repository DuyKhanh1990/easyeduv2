import { useState } from "react";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RemoveStudentFromSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  studentClassId: string;
  fromSessionOrder: number;
  toSessionOrder: number;
  classId: string;
  classSessions?: any[];
}

export function RemoveStudentFromSessionDialog({
  isOpen,
  onOpenChange,
  studentIds,
  studentClassId,
  fromSessionOrder: initialFromSessionOrder,
  toSessionOrder: initialToSessionOrder,
  classId,
  classSessions = []
}: RemoveStudentFromSessionDialogProps) {
  const [showScopeSelection, setShowScopeSelection] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [hasAttendedSessions, setHasAttendedSessions] = useState(false);
  const [deleteOption, setDeleteOption] = useState<"all" | "unattended">("all");
  const [deletionScope, setDeletionScope] = useState<"current" | "toEnd" | "range">("current");
  const [fromSessionOrder, setFromSessionOrder] = useState(initialFromSessionOrder);
  const [toSessionOrder, setToSessionOrder] = useState(initialToSessionOrder);
  const [customToSession, setCustomToSession] = useState(initialToSessionOrder);
  const { toast } = useToast();

  const maxSessionOrder = Math.max(...(classSessions?.map(s => s.sessionIndex || 0) || [0]));

  const updateSessionRange = (scope: string) => {
    setDeletionScope(scope as any);
    setFromSessionOrder(initialFromSessionOrder);
    if (scope === "current") {
      setToSessionOrder(initialFromSessionOrder);
    } else if (scope === "toEnd") {
      setToSessionOrder(maxSessionOrder);
    } else {
      setToSessionOrder(customToSession);
    }
  };

  const checkAttendanceMutation = useMutation({
    mutationFn: async () => {
      const validStudentIds = studentIds.filter(id => id);
      if (!validStudentIds.length) {
        throw new Error("Không tìm thấy ID học viên hợp lệ");
      }
      if (!studentClassId) {
        throw new Error("Không tìm thấy ID lớp học hợp lệ");
      }
      const res = await apiRequest("POST", "/api/students/remove-from-sessions", {
        studentIds: validStudentIds,
        studentClassId,
        fromSessionOrder,
        toSessionOrder,
        deleteMode: fromSessionOrder === toSessionOrder ? "single" : "range"
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.hasAttendedSessions) {
        setHasAttendedSessions(true);
        setShowWarning(true);
      } else {
        executeDelete(false);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể kiểm tra buổi học",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (deleteOnlyUnattended: boolean) => {
      const validStudentIds = studentIds.filter(id => id);
      if (!validStudentIds.length) {
        throw new Error("Không tìm thấy ID học viên hợp lệ");
      }
      if (!studentClassId) {
        throw new Error("Không tìm thấy ID lớp học hợp lệ");
      }
      await apiRequest("POST", "/api/students/remove-from-sessions-confirm", {
        studentIds: validStudentIds,
        studentClassId,
        fromSessionOrder,
        toSessionOrder,
        deleteMode: fromSessionOrder === toSessionOrder ? "single" : "range",
        deleteOnlyUnattended
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      toast({
        title: "Thành công",
        description: "Đã xoá học viên khỏi buổi học thành công",
      });
      onOpenChange(false);
      setShowWarning(false);
      setShowScopeSelection(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xoá học viên khỏi buổi học",
        variant: "destructive"
      });
    }
  });

  const handleDeleteClick = () => {
    setShowScopeSelection(false);
    checkAttendanceMutation.mutate();
  };

  const executeDelete = (deleteOnlyUnattended: boolean) => {
    deleteMutation.mutate(deleteOnlyUnattended);
  };

  return (
    <>
      <Dialog open={isOpen && showScopeSelection && !showWarning} onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setShowScopeSelection(true);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Chọn phạm vi xoá học viên
            </DialogTitle>
            <DialogDescription>
              Chọn kiểu xoá phù hợp với nhu cầu của bạn
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("current")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "current" ? "#ef4444" : undefined, backgroundColor: deletionScope === "current" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">Xoá buổi hiện tại</p>
                  <p className="text-xs text-muted-foreground">Chỉ xoá từ buổi {initialFromSessionOrder}</p>
                </div>
              </div>
            </div>

            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("toEnd")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "toEnd" ? "#ef4444" : undefined, backgroundColor: deletionScope === "toEnd" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">Xoá đến hết lịch</p>
                  <p className="text-xs text-muted-foreground">Xoá từ buổi {initialFromSessionOrder} đến buổi {maxSessionOrder}</p>
                </div>
              </div>
            </div>

            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("range")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "range" ? "#ef4444" : undefined, backgroundColor: deletionScope === "range" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">Xoá khoảng tùy chỉnh</p>
                  <p className="text-xs text-muted-foreground">Chọn khoảng buổi học cụ thể</p>
                  {deletionScope === "range" && (
                    <div className="mt-3 flex gap-2">
                      <select 
                        value={customToSession} 
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setCustomToSession(val);
                          setToSessionOrder(val);
                        }}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      >
                        {classSessions?.filter(s => (s.sessionIndex || 0) >= initialFromSessionOrder).map(s => (
                          <option key={s.id} value={s.sessionIndex || 0}>
                            Buổi {s.sessionIndex}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
            >
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpen && !showScopeSelection && !showWarning} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Xoá học viên khỏi buổi học
            </DialogTitle>
            <DialogDescription>
              Bạn chắc chắn muốn xoá {studentIds.length} học viên khỏi {fromSessionOrder === toSessionOrder ? "buổi này" : `buổi ${fromSessionOrder} đến buổi ${toSessionOrder}`}?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Hành động này không thể hoàn tác
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={checkAttendanceMutation.isPending}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={checkAttendanceMutation.isPending}
            >
              {checkAttendanceMutation.isPending ? "Đang kiểm tra..." : "Xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarning} onOpenChange={(open) => {
        if (!open) {
          setShowWarning(false);
          onOpenChange(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Cảnh báo: Có buổi học đã điểm danh
            </DialogTitle>
            <DialogDescription>
              Một số buổi học trong khoảng này đã được điểm danh. Bạn muốn xoá như thế nào?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <RadioGroup value={deleteOption} onValueChange={(value: any) => setDeleteOption(value)}>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="all" id="delete-all" />
                <Label htmlFor="delete-all" className="cursor-pointer flex-1">
                  <div>
                    <p className="font-medium">Xoá tất cả</p>
                    <p className="text-xs text-muted-foreground">Xoá tất cả buổi học trong khoảng, bao gồm cả buổi đã điểm danh</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unattended" id="delete-unattended" />
                <Label htmlFor="delete-unattended" className="cursor-pointer flex-1">
                  <div>
                    <p className="font-medium">Chỉ xoá buổi chưa điểm danh</p>
                    <p className="text-xs text-muted-foreground">Chỉ xoá các buổi học viên chưa điểm danh, giữ lại các buổi đã điểm danh</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWarning(false);
                onOpenChange(false);
              }}
              disabled={deleteMutation.isPending}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={() => executeDelete(deleteOption === "unattended")}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Đang xoá..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
