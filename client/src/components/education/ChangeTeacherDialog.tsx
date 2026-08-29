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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, AlertCircle, Search, X } from "lucide-react";

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
  const [teacherSearch, setTeacherSearch] = useState<string>("");

  const selectedSession = classSessions?.find((s) => s.id === selectedSessionId);
  const currentSessionTeachers: { id: string; fullName: string }[] =
    selectedSession?.teachers ?? classData?.teachers ?? [];

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

      const sessionTeacherIds = (selectedSession?.teachers ?? []).map((t: any) => t.id);
      setNewTeacherIds(sessionTeacherIds);
      setTeacherSearch("");
    }
  }, [isOpen, selectedSessionId, classSessions]);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const allTeachers = [...(staffList || [])].sort((a: any, b: any) => {
    const aActive = a.status !== "Không hoạt động";
    const bActive = b.status !== "Không hoạt động";
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  const filteredTeachers = teacherSearch.trim()
    ? allTeachers.filter((t: any) =>
        (t.fullName || "").toLowerCase().includes(teacherSearch.toLowerCase()) ||
        (t.code || "").toLowerCase().includes(teacherSearch.toLowerCase())
      )
    : allTeachers;

  const handleTeacherToggle = (id: string) => {
    setNewTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    );
  };

  const selectedTeacherNames = allTeachers
    .filter((t: any) => newTeacherIds.includes(t.id))
    .map((t: any) => t.fullName);

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
            <div className="p-2 bg-muted rounded-md text-sm font-medium min-h-[36px]">
              {currentSessionTeachers.length > 0
                ? currentSessionTeachers.map((t) => t.fullName).join(", ")
                : "Chưa phân công"}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chọn giáo viên mới (có thể chọn nhiều)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {newTeacherIds.length > 0
                      ? `${newTeacherIds.length} giáo viên được chọn`
                      : "Chọn giáo viên"}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Tìm giáo viên..."
                      className="pl-7 h-8 text-sm"
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                    />
                  </div>
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="p-2 space-y-1">
                    {filteredTeachers.map((t: any) => {
                      const isInactive = t.status === "Không hoạt động";
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center space-x-2 p-2 rounded-sm ${isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                          onClick={() => !isInactive && handleTeacherToggle(t.id)}
                        >
                          <Checkbox checked={newTeacherIds.includes(t.id)} disabled={isInactive} />
                          <span className="text-sm flex-1">{t.fullName}</span>
                          {isInactive && (
                            <span title="Không hoạt động">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {filteredTeachers.length === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Không tìm thấy giáo viên
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {newTeacherIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allTeachers
                  .filter((t: any) => newTeacherIds.includes(t.id))
                  .map((t: any) => (
                    <Badge key={t.id} variant="secondary" className="text-xs gap-1 pr-1">
                      {t.fullName}
                      <button
                        type="button"
                        onClick={() => handleTeacherToggle(t.id)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            )}
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
