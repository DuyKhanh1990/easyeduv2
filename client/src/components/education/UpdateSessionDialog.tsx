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
import {
  getStaffRoleOptions,
  isDefaultTrainingDepartmentStaff,
  resolveTeacherRoleId,
} from "@/lib/staff-role-options";
import { isTeacherTimeRangeWithinShift } from "@shared/teacher-time-assignments";

const USE_DEFAULT_ROLE = "__use_default_role__";

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
  const [teacherTimeRanges, setTeacherTimeRanges] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [customTeacherTimeRanges, setCustomTeacherTimeRanges] = useState<Record<string, boolean>>({});
  const [teacherRoleOverrides, setTeacherRoleOverrides] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState<string>("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [confirmIndexChange, setConfirmIndexChange] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  // Live conflict check state
  const [liveConflicts, setLiveConflicts] = useState<ConflictItem[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedSessionRef = useRef<string | null>(null);

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

  const { data: shiftTemplates = [], isFetched: shiftsFetched } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: classData?.locationId }],
    queryFn: async () => {
      const params = new URLSearchParams({ type: "class" });
      if (classData?.locationId) params.set("locationId", classData.locationId);
      const res = await fetch(`/api/shift-templates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });
  const sessionInitializationKey = session
    ? String(session.id || session.sessionIndex || session.sessionDate)
    : null;
  const sessionInitialized = !!sessionInitializationKey &&
    initializedSessionRef.current === sessionInitializationKey;

  useEffect(() => {
    if (!isOpen) {
      initializedSessionRef.current = null;
      return;
    }
    if (!session) return;
    const initializationKey = String(session.id || session.sessionIndex || session.sessionDate);
    if (initializedSessionRef.current === initializationKey) return;
    if (
      session.shiftTemplateId &&
      (!session.shiftTemplate?.startTime || !session.shiftTemplate?.endTime) &&
      !shiftsFetched &&
      classData?.locationId
    ) return;

    setSessionDate(session.sessionDate);
    setShiftTemplateId(session.shiftTemplateId || "");
    setRoomId(session.roomId || "");
    const selectedTeacherIds = Array.isArray(session.teacherIds) ? session.teacherIds : [];
    setTeacherIds(selectedTeacherIds);
    const sessionShift = shiftTemplates.find((shift: any) => shift.id === session.shiftTemplateId);
    const defaultStartTime = String(session.shiftTemplate?.startTime || sessionShift?.startTime || "").slice(0, 5);
    const defaultEndTime = String(session.shiftTemplate?.endTime || sessionShift?.endTime || "").slice(0, 5);
    const initialTimeRanges: Record<string, { startTime: string; endTime: string }> = {};
    const initialCustomRanges: Record<string, boolean> = {};
    for (const teacherId of selectedTeacherIds) {
      const assignment = session.teacherTimeAssignments?.find((row: any) => row.teacherId === teacherId);
      const startTime = String(assignment?.startTime ?? defaultStartTime).slice(0, 5);
      const endTime = String(assignment?.endTime ?? defaultEndTime).slice(0, 5);
      initialTimeRanges[teacherId] = { startTime, endTime };
      initialCustomRanges[teacherId] = !!assignment &&
        (!defaultStartTime || !defaultEndTime ||
          startTime !== defaultStartTime || endTime !== defaultEndTime);
    }
    setTeacherTimeRanges(initialTimeRanges);
    setCustomTeacherTimeRanges(initialCustomRanges);
    const roleOverrides = session.teacherRoleIds;
    const validRoleOverrides: Record<string, string> = {};
    if (roleOverrides && typeof roleOverrides === "object" && !Array.isArray(roleOverrides)) {
      for (const [teacherId, roleId] of Object.entries(roleOverrides)) {
        if (teacherId && typeof roleId === "string" && roleId) {
          validRoleOverrides[teacherId] = roleId;
        }
      }
    }
    setTeacherRoleOverrides(validRoleOverrides);
    setChangeReason(session.changeReason || "");
    setLiveConflicts([]);
    setPreviewIndex(session.sessionIndex ?? null);
    setConfirmIndexChange(false);
    setPendingUpdate(null);
    initializedSessionRef.current = initializationKey;
  }, [isOpen, session, shiftTemplates, shiftsFetched, classData?.locationId]);

  const selectedShift = shiftTemplates.find((shift: any) => shift.id === shiftTemplateId);
  const normalizeTime = (value?: string | null) => value ? String(value).slice(0, 5) : "";
  const shiftStartTime = normalizeTime(
    selectedShift?.startTime ||
    (shiftTemplateId === session?.shiftTemplateId ? session?.shiftTemplate?.startTime : ""),
  );
  const shiftEndTime = normalizeTime(
    selectedShift?.endTime ||
    (shiftTemplateId === session?.shiftTemplateId ? session?.shiftTemplate?.endTime : ""),
  );
  const shiftRangeLabel = shiftStartTime && shiftEndTime
    ? `${shiftStartTime}–${shiftEndTime}`
    : "chưa có giờ";
  const teacherTimeAssignments = teacherIds.map((teacherId) => ({
    teacherId,
    startTime: customTeacherTimeRanges[teacherId] ? teacherTimeRanges[teacherId]?.startTime ?? shiftStartTime : shiftStartTime,
    endTime: customTeacherTimeRanges[teacherId] ? teacherTimeRanges[teacherId]?.endTime ?? shiftEndTime : shiftEndTime,
  }));

  // Debounced live conflict check
  useEffect(() => {
    if (!isOpen || !sessionInitialized || !sessionId || !sessionDate || !shiftTemplateId) {
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
          body: JSON.stringify({
            sessionDate,
            shiftTemplateId,
            roomId: roomId || null,
            teacherIds,
            teacherTimeAssignments,
          }),
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
  }, [
    isOpen,
    sessionInitialized,
    sessionId,
    sessionDate,
    shiftTemplateId,
    roomId,
    teacherIds,
    teacherTimeRanges,
    shiftStartTime,
    shiftEndTime,
  ]);

  const activeTeachers = (staffList || [])
    .filter(isDefaultTrainingDepartmentStaff)
    .map((s: any) => ({ ...s, _isActive: s.status === "Hoạt động" }));
  const roomConflicts = liveConflicts.filter(c => c.type === "room");
  const teacherConflicts = liveConflicts.filter(c => c.type === "teacher");
  const invalidTimeTeacherIds = teacherTimeAssignments
    .filter((assignment) => !isTeacherTimeRangeWithinShift(
      assignment.startTime,
      assignment.endTime,
      shiftStartTime,
      shiftEndTime,
    ))
    .map((assignment) => assignment.teacherId);
  const hasInvalidTeacherTimeRanges = invalidTimeTeacherIds.length > 0;

  const handleTeacherIdsChange = (nextIds: string[]) => {
    const normalizedIds = [...new Set(nextIds)];
    setTeacherIds(normalizedIds);
    setTeacherRoleOverrides((current) => Object.fromEntries(
      Object.entries(current).filter(([teacherId]) => normalizedIds.includes(teacherId)),
    ));
    setTeacherTimeRanges((current) => Object.fromEntries(normalizedIds.map((teacherId) => [
      teacherId,
      current[teacherId] || { startTime: shiftStartTime, endTime: shiftEndTime },
    ])));
    setCustomTeacherTimeRanges((current) => Object.fromEntries(
      normalizedIds
        .filter((teacherId) => current[teacherId] === true)
        .map((teacherId) => [teacherId, true]),
    ));
  };

  const updateTeacherTimeRange = (
    teacherId: string,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    const current = customTeacherTimeRanges[teacherId] && teacherTimeRanges[teacherId]
      ? teacherTimeRanges[teacherId]
      : { startTime: shiftStartTime, endTime: shiftEndTime };
    const next = { ...current, [field]: value };
    setTeacherTimeRanges((ranges) => ({ ...ranges, [teacherId]: next }));
    setCustomTeacherTimeRanges((ranges) => ({
      ...ranges,
      [teacherId]: next.startTime !== shiftStartTime || next.endTime !== shiftEndTime,
    }));
  };

  const getTeacherRoleDetails = (teacherId: string) => {
    const member = activeTeachers.find((teacher: any) => teacher.id === teacherId);
    const sessionTeacher = session?.teachers?.find((teacher: any) => teacher.id === teacherId);
    const roleOptions = getStaffRoleOptions(member, classData?.locationId);
    const classTeacherConfig = (Array.isArray(classData?.teachersConfig) ? classData.teachersConfig : [])
      .find((teacher: any) => String(teacher?.teacher_id ?? teacher?.teacherId ?? "") === teacherId);
    const defaultRoleId = sessionTeacher?.defaultRoleId ||
      resolveTeacherRoleId(classTeacherConfig, roleOptions) ||
      resolveTeacherRoleId({}, roleOptions);
    const hasOverride = Object.prototype.hasOwnProperty.call(teacherRoleOverrides, teacherId);
    const selectedRoleId = hasOverride
      ? teacherRoleOverrides[teacherId]
      : defaultRoleId || sessionTeacher?.roleId || "";
    const selectedRoleName = sessionTeacher?.roleId === selectedRoleId
      ? sessionTeacher?.roleName
      : undefined;
    const availableRoleOptions = selectedRoleId && !roleOptions.some((option) => option.id === selectedRoleId)
      ? [...roleOptions, { id: selectedRoleId, name: selectedRoleName || "Vai trò hiện tại" }]
      : roleOptions;
    return {
      member,
      roleOptions: availableRoleOptions,
      defaultRoleId,
      selectedRoleId,
      hasOverride,
    };
  };
  const hasMissingTeacherRole = teacherIds.some((teacherId) => {
    const details = getTeacherRoleDetails(teacherId);
    return details.roleOptions.length > 1 && !details.selectedRoleId;
  });
  const submitUpdate = () => {
    const sessionTeacherRoleIds: Record<string, string> = {};
    for (const teacherId of teacherIds) {
      const roleId = teacherRoleOverrides[teacherId];
      if (roleId) sessionTeacherRoleIds[teacherId] = roleId;
    }
    const data = {
      sessionDate,
      shiftTemplateId,
      roomId: roomId || null,
      teacherIds,
      teacherRoleIds: sessionTeacherRoleIds,
      teacherTimeAssignments,
      changeReason,
    };
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[1020px]">
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
                onChange={handleTeacherIdsChange}
                placeholder="Chọn giáo viên..."
              />
            </div>
            {teacherIds.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Ca chung giới hạn: <span className="font-medium text-foreground">{shiftRangeLabel}</span>.
                  {" "}Giáo viên không chia riêng sẽ dùng toàn bộ ca này.
                </div>
                <div className="hidden gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(140px,0.85fr)_minmax(160px,0.95fr)_minmax(360px,1.8fr)]">
                  <span>Tên giáo viên</span>
                  <span>Vai trò</span>
                  <span>Phân công ca dạy</span>
                </div>
                <div className="divide-y">
                  {teacherIds.map((teacherId) => {
                    const teacher = activeTeachers.find((item: any) => item.id === teacherId) ||
                      session?.teachers?.find((item: any) => item.id === teacherId);
                    const details = getTeacherRoleDetails(teacherId);
                    const missingRole = details.roleOptions.length > 1 && !details.selectedRoleId;
                    const timeRange = customTeacherTimeRanges[teacherId] && teacherTimeRanges[teacherId]
                      ? teacherTimeRanges[teacherId]
                      : { startTime: shiftStartTime, endTime: shiftEndTime };
                    const invalidTime = invalidTimeTeacherIds.includes(teacherId);
                    const isFullShift = timeRange.startTime === shiftStartTime && timeRange.endTime === shiftEndTime;
                    return (
                      <div key={teacherId} className="grid grid-cols-1 gap-2 px-3 py-3 lg:grid-cols-[minmax(140px,0.85fr)_minmax(160px,0.95fr)_minmax(360px,1.8fr)] lg:items-start lg:gap-3">
                        <span className="min-w-0 truncate text-sm font-medium lg:pt-2" title={teacher?.fullName || teacherId}>
                          {teacher?.fullName || teacherId}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <span className="text-xs text-muted-foreground sm:hidden">Vai trò</span>
                          <Select
                            value={details.selectedRoleId || ""}
                            onValueChange={(value) => {
                              if (value === USE_DEFAULT_ROLE) {
                                setTeacherRoleOverrides((current) => {
                                  const next = { ...current };
                                  delete next[teacherId];
                                  return next;
                                });
                              } else {
                                setTeacherRoleOverrides((current) => ({ ...current, [teacherId]: value }));
                              }
                            }}
                            disabled={details.roleOptions.length === 0}
                          >
                            <SelectTrigger className={`h-9 ${missingRole ? "border-destructive" : ""}`}>
                              <SelectValue placeholder="Chọn vai trò" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={USE_DEFAULT_ROLE}>Theo mặc định</SelectItem>
                              {details.roleOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <span className="text-xs text-muted-foreground sm:hidden">Phân công ca dạy</span>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <label className="flex min-w-0 flex-1 items-center gap-1">
                              <span className="text-xs text-muted-foreground">Từ</span>
                              <input
                                type="time"
                                aria-label={`Giờ bắt đầu của ${teacher?.fullName || teacherId}`}
                                min={shiftStartTime || undefined}
                                max={shiftEndTime || undefined}
                                value={timeRange.startTime}
                                onChange={(event) => updateTeacherTimeRange(teacherId, "startTime", event.target.value)}
                                disabled={!shiftStartTime || !shiftEndTime}
                                className={`h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm ${invalidTime ? "border-destructive" : ""}`}
                              />
                            </label>
                            <label className="flex min-w-0 flex-1 items-center gap-1">
                              <span className="text-xs text-muted-foreground">Đến</span>
                              <input
                                type="time"
                                aria-label={`Giờ kết thúc của ${teacher?.fullName || teacherId}`}
                                min={shiftStartTime || undefined}
                                max={shiftEndTime || undefined}
                                value={timeRange.endTime}
                                onChange={(event) => updateTeacherTimeRange(teacherId, "endTime", event.target.value)}
                                disabled={!shiftStartTime || !shiftEndTime}
                                className={`h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm ${invalidTime ? "border-destructive" : ""}`}
                              />
                            </label>
                          </div>
                          <p className={invalidTime
                            ? "text-xs text-destructive"
                            : isFullShift
                              ? "text-xs text-muted-foreground"
                              : "whitespace-nowrap text-[9px] leading-3 text-muted-foreground"
                          }>
                            {invalidTime
                              ? `Giờ phải nằm trong ca chung ${shiftRangeLabel} và giờ bắt đầu phải trước giờ kết thúc.`
                              : isFullShift
                                ? "Dùng toàn bộ ca chung"
                                : `Ca riêng trong ${shiftRangeLabel}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasMissingTeacherRole && (
                  <p className="border-t px-3 py-2 text-xs text-destructive">
                    Chọn vai trò cho giáo viên có nhiều vai trò tại cơ sở.
                  </p>
                )}
                {teacherIds.length > 0 && (!shiftStartTime || !shiftEndTime) && (
                  <p className="border-t px-3 py-2 text-xs text-destructive">
                    Ca học chung chưa có giờ bắt đầu hoặc kết thúc; cần bổ sung giờ cho ca trước khi lưu phân công giáo viên.
                  </p>
                )}
              </div>
            )}

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
              disabled={!sessionInitialized || !sessionDate || !shiftTemplateId || !changeReason.trim() || isPending || hasMissingTeacherRole || hasInvalidTeacherTimeRanges}
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
