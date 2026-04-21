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
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Clock } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface ExcludeSessionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  currentSessionIndex?: number;
  classSessions: any[];
}

export function ExcludeSessionsDialog({
  isOpen,
  onOpenChange,
  classId,
  currentSessionIndex = 0,
  classSessions
}: ExcludeSessionsDialogProps) {
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [showWarning, setShowWarning] = useState(false);
  const [hasAttendance, setHasAttendance] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && classSessions.length > 0 && currentSessionIndex > 0) {
      const defaultSession = classSessions[Math.min(currentSessionIndex - 1, classSessions.length - 1)];
      if (defaultSession) {
        setFromSessionId(defaultSession.id);
        setToSessionId(defaultSession.id);
      }
    }
  }, [isOpen, currentSessionIndex, classSessions]);

  const checkAttendanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/check-attendance-for-exclusion", {
        classId,
        fromSessionId,
        toSessionId
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.hasAttendance) {
        setHasAttendance(true);
        setShowWarning(true);
      } else {
        executeExclude();
      }
    }
  });

  const excludeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/classes/exclude-sessions", {
        classId,
        fromSessionId,
        toSessionId,
        reason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/exclusions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      toast({
        title: "Thành công",
        description: "Đã loại trừ buổi học thành công",
      });
      onOpenChange(false);
      resetForm();
      setShowWarning(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể loại trừ buổi học",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFromSessionId("");
    setToSessionId("");
    setReason("");
    setHasAttendance(false);
  };

  const handleExcludeClick = () => {
    checkAttendanceMutation.mutate();
  };

  const executeExclude = () => {
    excludeMutation.mutate();
  };

  const fromIndex = classSessions.findIndex(s => s.id === fromSessionId);
  const toIndex = classSessions.findIndex(s => s.id === toSessionId);
  const sessionCount = fromIndex >= 0 && toIndex >= 0 ? Math.abs(toIndex - fromIndex) + 1 : 0;

  const { data: exclusionsData } = useQuery({
    queryKey: [`/api/classes/${classId}/exclusions`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/classes/${classId}/exclusions`);
      return res.json();
    },
    enabled: isOpen
  });

  return (
    <>
      <Dialog open={isOpen && !showWarning} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh]">
          <DialogHeader>
            <DialogTitle>Loại trừ ngày học</DialogTitle>
            <DialogDescription>
              Chọn khoảng buổi học để loại trừ khỏi lịch học. Các buổi phía sau sẽ dồn lên thế chỗ.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 py-4 h-[400px]">
            <div className="flex-1 space-y-4 overflow-y-auto pr-4">
              <div className="space-y-2">
                <Label>Từ buổi</Label>
                <Select value={fromSessionId} onValueChange={setFromSessionId}>
                  <SelectTrigger data-testid="select-from-session">
                    <SelectValue placeholder="Chọn buổi" />
                  </SelectTrigger>
                  <SelectContent>
                    {classSessions.map((s, idx) => (
                      <SelectItem key={s.id} value={s.id}>
                        Buổi {String(idx + 1).padStart(2, '0')}: {format(new Date(s.sessionDate), "EEE, d/M/yyyy HH:mm", { locale: vi })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Đến buổi</Label>
                <Select value={toSessionId} onValueChange={setToSessionId}>
                  <SelectTrigger data-testid="select-to-session">
                    <SelectValue placeholder="Chọn buổi" />
                  </SelectTrigger>
                  <SelectContent>
                    {classSessions.map((s, idx) => (
                      <SelectItem key={s.id} value={s.id}>
                        Buổi {String(idx + 1).padStart(2, '0')}: {format(new Date(s.sessionDate), "EEE, d/M/yyyy HH:mm", { locale: vi })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {sessionCount > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-900">
                    <strong>Số buổi bị loại trừ: {sessionCount}</strong>
                  </p>
                  <p className="text-xs text-blue-800 mt-1">
                    Sau khi loại trừ, hệ thống sẽ tự động thêm {sessionCount} buổi mới vào cuối lịch học.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Lý do loại trừ (không bắt buộc)</Label>
                <Textarea
                  data-testid="textarea-reason"
                  placeholder="Ví dụ: Nghỉ lễ, Giáo viên bận, Trung tâm nghỉ..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>

            <div className="w-80 border-l pl-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Lịch sử loại trừ
              </h3>
              <ScrollArea className="h-[calc(100%-2rem)]">
                {exclusionsData && exclusionsData.length > 0 ? (
                  <div className="space-y-3 pr-4">
                    {exclusionsData.map((exclusion: any, idx: number) => (
                      <div key={exclusion.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 text-xs space-y-2">
                        <div className="font-semibold text-gray-900">
                          Buổi {String(exclusion.fromSessionOrder).padStart(2, '0')}{exclusion.fromSessionOrder !== exclusion.toSessionOrder ? ` - Buổi ${String(exclusion.toSessionOrder).padStart(2, '0')}` : ''}
                        </div>
                        <div className="text-gray-600">
                          {format(new Date(exclusion.fromSessionDate), "EEE d/M/yyyy", { locale: vi })}
                          {exclusion.fromSessionDate !== exclusion.toSessionDate && (
                            <>
                              {" - "}
                              {format(new Date(exclusion.toSessionDate), "EEE d/M/yyyy", { locale: vi })}
                            </>
                          )}
                        </div>
                        {exclusion.reason && (
                          <div className="text-gray-700 italic">
                            <strong className="text-gray-900">Lý do:</strong> {exclusion.reason}
                          </div>
                        )}
                        <div className="text-gray-500 text-[10px]">
                          {format(new Date(exclusion.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 text-center py-8">Chưa có lịch sử loại trừ</p>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
              Hủy
            </Button>
            <Button
              data-testid="button-exclude"
              disabled={!fromSessionId || !toSessionId || checkAttendanceMutation.isPending || excludeMutation.isPending}
              onClick={handleExcludeClick}
            >
              {checkAttendanceMutation.isPending || excludeMutation.isPending ? "Đang xử lý..." : "Loại trừ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Cảnh báo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Có {sessionCount} buổi trong khoảng bị chọn đã có học viên điểm danh.
            </p>
            <p className="text-sm font-medium">
              Bạn có chắc chắn muốn loại trừ các buổi này không?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarning(false)} data-testid="button-warning-cancel">
              Hủy
            </Button>
            <Button
              data-testid="button-warning-continue"
              onClick={executeExclude}
              disabled={excludeMutation.isPending}
            >
              {excludeMutation.isPending ? "Đang xử lý..." : "Tiếp tục loại trừ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
