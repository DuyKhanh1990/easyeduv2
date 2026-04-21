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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

export function UpdateSessionDialog({
  isOpen,
  onOpenChange,
  session,
  classData,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  session: any;
  classData: any;
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [sessionDate, setSessionDate] = useState<string>("");
  const [shiftTemplateId, setShiftTemplateId] = useState<string>("");
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [changeReason, setChangeReason] = useState<string>("");

  useEffect(() => {
    if (isOpen && session) {
      setSessionDate(session.sessionDate);
      setShiftTemplateId(session.shiftTemplateId || "");
      setTeacherIds(Array.isArray(session.teacherIds) ? session.teacherIds : []);
      setChangeReason(session.changeReason || "");
    }
  }, [isOpen, session]);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const { data: shifts } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/shift-templates?locationId=${classData?.locationId}`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });

  const activeTeachers = staffList?.filter((s) => s.status === "Hoạt động") || [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cập nhật buổi học {session?.sessionIndex}</DialogTitle>
          <DialogDescription>
            Thay đổi thông tin ngày, ca và giáo viên cho buổi học này.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Ngày học</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <Calendar className="mr-2 h-4 w-4" />
                  {sessionDate ? format(new Date(sessionDate), "dd/MM/yyyy") : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={sessionDate ? new Date(sessionDate) : undefined}
                  onSelect={(date) => date && setSessionDate(format(date, "yyyy-MM-dd"))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Ca học</Label>
            <Select value={shiftTemplateId} onValueChange={setShiftTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn ca học" />
              </SelectTrigger>
              <SelectContent>
                {shifts?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Giáo viên</Label>
            <SearchableMultiSelect
              options={activeTeachers.map((t: any) => ({ value: t.id, label: t.fullName }))}
              value={teacherIds}
              onChange={setTeacherIds}
              placeholder="Chọn giáo viên..."
            />
          </div>
          <div className="space-y-2">
            <Label>Lý do thay đổi</Label>
            <Textarea
              placeholder="Nhập lý do thay đổi..."
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={!sessionDate || !shiftTemplateId || !changeReason.trim() || isPending}
            onClick={() => onConfirm({ sessionDate, shiftTemplateId, teacherIds, changeReason })}
          >
            {isPending ? "Đang lưu..." : "Cập nhật"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
