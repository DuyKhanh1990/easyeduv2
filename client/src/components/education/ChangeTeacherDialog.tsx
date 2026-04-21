import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight } from "lucide-react";

export function ChangeTeacherDialog({
  isOpen,
  onOpenChange,
  classData,
  classSessions,
  selectedSessionId,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  classSessions: any[];
  selectedSessionId?: string;
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [newTeacherIds, setNewTeacherIds] = useState<string[]>([]);
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");

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

      setNewTeacherIds([]);
    }
  }, [isOpen, selectedSessionId, classSessions]);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const activeTeachers = staffList?.filter((s) => s.status === "Hoạt động") || [];

  const handleTeacherChange = (id: string) => {
    setNewTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Đổi giáo viên</DialogTitle>
          <DialogDescription>Chọn giáo viên mới và phạm vi buổi áp dụng.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Giáo viên hiện tại</Label>
            <div className="p-2 bg-muted rounded-md text-sm font-medium">
              {classData?.teachers?.length > 0
                ? classData.teachers.map((t: any) => t.fullName).join(", ")
                : "Chưa phân công"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Chọn giáo viên mới (có thể chọn nhiều)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {newTeacherIds.length > 0
                      ? activeTeachers
                          .filter((t) => newTeacherIds.includes(t.id))
                          .map((t) => t.fullName)
                          .join(", ")
                      : "Chọn giáo viên"}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0" align="start">
                <ScrollArea className="h-[200px]">
                  <div className="p-2 space-y-1">
                    {activeTeachers.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm cursor-pointer"
                        onClick={() => handleTeacherChange(t.id)}
                      >
                        <Checkbox checked={newTeacherIds.includes(t.id)} />
                        <span className="text-sm">{t.fullName}</span>
                      </div>
                    ))}
                    {activeTeachers.length === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Không có giáo viên hoạt động
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Từ buổi</Label>
              <Select value={fromSessionId} onValueChange={setFromSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn buổi" />
                </SelectTrigger>
                <SelectContent>
                  {classSessions?.map((s, idx) => (
                    <SelectItem key={s.id} value={s.id}>
                      Buổi {String(idx + 1).padStart(2, "0")} -{" "}
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
                  {classSessions?.map((s, idx) => (
                    <SelectItem key={s.id} value={s.id}>
                      Buổi {String(idx + 1).padStart(2, "0")} -{" "}
                      {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={newTeacherIds.length === 0 || !fromSessionId || !toSessionId || isPending}
            onClick={() => onConfirm({ newTeacherIds, fromSessionId, toSessionId })}
          >
            {isPending ? "Đang xử lý..." : "Xác nhận đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
