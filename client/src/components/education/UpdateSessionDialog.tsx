import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
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
import { Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { ShiftSelectWithCreate } from "@/components/ui/shift-select-with-create";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { ConflictDetailSheet } from "@/components/education/ConflictDetailSheet";
import type { ConflictItem } from "@/components/education/ConflictDetailSheet";

export function UpdateSessionDialog({
  isOpen,
  onOpenChange,
  session,
  sessionId,
  classData,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  session: any;
  sessionId?: string;
  classData: any;
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [sessionDate, setSessionDate] = useState<string>("");
  const [shiftTemplateId, setShiftTemplateId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [changeReason, setChangeReason] = useState<string>("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [confirmIndexChange, setConfirmIndexChange] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  // Live conflict check state
  const [liveConflicts, setLiveConflicts] = useState<ConflictItem[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && session) {
      setSessionDate(session.sessionDate);
      setShiftTemplateId(session.shiftTemplateId || "");
      setRoomId(session.roomId || "");
      setTeacherIds(Array.isArray(session.teacherIds) ? session.teacherIds : []);
      setChangeReason(session.changeReason || "");
      setLiveConflicts([]);
      setPreviewIndex(session.sessionIndex ?? null);
      setConfirmIndexChange(false);
      setPendingUpdate(null);
    }
  }, [isOpen, session]);

  // Debounced live conflict check
  useEffect(() => {
    if (!isOpen || !sessionId || !sessionDate || !shiftTemplateId) {
      setLiveConflicts([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLiveChecking(true);
      try {
        const res = await fetch(`/api/class-sessions/${sessionId}/preview-conflicts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ sessionDate, shiftTemplateId, roomId: roomId || null, teacherIds }),
        });
        if (res.ok) {
          const data = await res.json();
          setLiveConflicts(data.conflicts || []);
           setPreviewIndex(data.newSessionIndex ?? session?.sessionIndex ?? null);
        }
      } catch {
        setLiveConflicts([]);
      } finally {
        setIsLiveChecking(false);
      }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [isOpen, sessionId, sessionDate, shiftTemplateId, roomId, teacherIds]);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/classrooms?locationId=${classData?.locationId}`);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });

  const activeTeachers = (staffList || []).map((s: any) => ({ ...s, _isActive: s.status === "Hoạt động" }));
  const roomConflicts = liveConflicts.filter(c => c.type === "room");
  const teacherConflicts = liveConflicts.filter(c => c.type === "teacher");
  const submitUpdate = () => {
    const data = { sessionDate, shiftTemplateId, roomId: roomId || null, teacherIds, changeReason };
    if (previewIndex != null && session?.sessionIndex != null && previewIndex !== session.sessionIndex) {
      setPendingUpdate(data);
      setConfirmIndexChange(true);
      return;
    }
    onConfirm({ ...data, indexChangeMode: "move_all" });
  };

  return (
    <>
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
              <ShiftSelectWithCreate
                value={shiftTemplateId}
                onValueChange={setShiftTemplateId}
                locationId={classData?.locationId}
                placeholder="Chọn ca học"
              />
            </div>
            <div className="space-y-2">
              <Label>Phòng học</Label>
              <Select
                value={roomId || "none"}
                onValueChange={(v) => setRoomId(v === "none" ? "" : v)}
              >
                <SelectTrigger className={roomConflicts.length > 0 ? "border-orange-400 text-orange-700" : ""}>
                  <SelectValue placeholder="Chọn phòng học" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Chưa chọn phòng</SelectItem>
                  {classrooms?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Giáo viên</Label>
              <SearchableMultiSelect
                options={activeTeachers.map((t: any) => ({ value: t.id, label: t.fullName, isActive: t._isActive }))}
                value={teacherIds}
                onChange={setTeacherIds}
                placeholder="Chọn giáo viên..."
              />
            </div>

            {/* Live conflict banner */}
            {isLiveChecking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang kiểm tra trùng lịch...
              </div>
            )}
            {!isLiveChecking && liveConflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="w-full text-left rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 hover:bg-orange-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                  <span className="text-sm font-medium text-orange-700">
                    Phát hiện {liveConflicts.length} xung đột lịch
                  </span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-orange-600">
                  {roomConflicts.length > 0 && <span>🏠 {roomConflicts.length} trùng phòng</span>}
                  {teacherConflicts.length > 0 && <span>👤 {teacherConflicts.length} trùng GV</span>}
                  <span className="underline ml-auto">Xem chi tiết →</span>
                </div>
              </button>
            )}

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
              onClick={submitUpdate}
            >
              {isPending ? "Đang lưu..." : "Cập nhật"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmIndexChange} onOpenChange={setConfirmIndexChange}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Thay đổi vị trí buổi học</DialogTitle>
            <DialogDescription>
              Buổi {session?.sessionIndex} sẽ chuyển thành buổi {previewIndex}. Hãy chọn cách xử lý dữ liệu đã gắn với các buổi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium">Di chuyển toàn bộ thông tin theo buổi</p>
              <p className="mt-1 text-muted-foreground">Học viên, điểm danh, nội dung, BTVN và chương trình của buổi {session?.sessionIndex} sẽ đi theo sang vị trí {previewIndex}.</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Chỉ di chuyển lịch</p>
              <p className="mt-1 text-muted-foreground">Chỉ ngày, ca, phòng và giáo viên được dịch chuyển. Toàn bộ dữ liệu khác giữ nguyên theo từng số buổi.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmIndexChange(false)}>Quay lại</Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => onConfirm({ ...pendingUpdate, indexChangeMode: "preserve_slots" })}
            >
              Chỉ di chuyển lịch
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onConfirm({ ...pendingUpdate, indexChangeMode: "move_all" })}
            >
              Di chuyển toàn bộ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictDetailSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        conflicts={liveConflicts}
        title={`${liveConflicts.length} buổi trùng lịch — Buổi ${session?.sessionIndex}`}
      />
    </>
  );
}
