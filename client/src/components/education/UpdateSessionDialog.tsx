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
import { usePastSchedulePolicy } from "@/hooks/use-past-schedule-policy";
import { getCenterDateString, isPastCenterDate } from "@/lib/center-time-format";

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
  const { data: pastSchedulePolicy } = usePastSchedulePolicy(isOpen);
  const canRunPast = pastSchedulePolicy?.canRunPast === true;
  const today = getCenterDateString();

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
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.25rem)] gap-0 overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[1120px] [&>button]:text-slate-200 [&>button:hover]:text-white">
          <DialogHeader className="relative border-b border-slate-800 bg-slate-950 px-5 py-5 text-left text-white sm:px-7">
            <div className="flex items-start gap-3 pr-8">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-300/20 bg-indigo-500/15 text-indigo-200">
                <Calendar className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                    Cập nhật buổi học {session?.sessionIndex}
                  </DialogTitle>
                  {(classData?.classCode || classData?.name) && (
                    <span className="rounded-md border border-indigo-300/25 bg-indigo-400/10 px-2 py-0.5 text-xs font-medium text-indigo-100">
                      {classData.classCode || classData.name}
                    </span>
                  )}
                </div>
                <DialogDescription className="mt-1 text-sm text-slate-300">
                  Điều chỉnh ngày, ca học, phòng học và phân công giảng dạy.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[calc(92dvh-145px)] overflow-y-auto">
            <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)] md:divide-x md:divide-y-0">
              <section className="space-y-5 bg-slate-50/70 px-5 py-6 sm:px-7" aria-label="Thông tin buổi học">
                <div className="border-b border-slate-200 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Thông tin buổi học</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Ngày học</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-11 w-full justify-start rounded-xl border-slate-200 bg-white text-left font-medium shadow-sm">
                        <Calendar className="mr-2 h-4 w-4 text-slate-500" />
                        {sessionDate ? format(new Date(sessionDate), "dd/MM/yyyy") : "Chọn ngày"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={sessionDate ? new Date(sessionDate) : undefined}
                        onSelect={(date) => date && setSessionDate(format(date, "yyyy-MM-dd"))}
                        disabled={(date) => !canRunPast && isPastCenterDate(date, today)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Ca học</Label>
                  <ShiftSelectWithCreate
                    value={shiftTemplateId}
                    onValueChange={setShiftTemplateId}
                    locationId={classData?.locationId}
                    placeholder="Chọn ca học"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Phòng học</Label>
                  <Select
                    value={roomId || "none"}
                    onValueChange={(v) => setRoomId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm ${roomConflicts.length > 0 ? "border-orange-400 text-orange-700" : ""}`}>
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
                <div className="space-y-2 pt-1">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Lý do thay đổi</Label>
                  <Textarea
                    className="min-h-[112px] resize-y rounded-xl border-slate-200 bg-white shadow-sm"
                    placeholder="Nhập lý do thay đổi lịch..."
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                  />
                </div>
              </section>

              <section className="min-w-0 space-y-5 px-5 py-6 sm:px-7" aria-label="Phân công giáo viên">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 sm:text-base">Phân công giáo viên &amp; ca dạy</h3>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{teacherIds.length} nhân sự đã chọn</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Chọn giáo viên giảng dạy</Label>
                  <SearchableMultiSelect
                    options={activeTeachers.map((t: any) => ({ value: t.id, label: t.fullName, isActive: t._isActive }))}
                    value={teacherIds}
                    onChange={handleTeacherIdsChange}
                    placeholder="Gõ tên để thêm giáo viên..."
                  />
                </div>

                {teacherIds.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-900">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 text-[10px] font-bold">i</span>
                      <p>
                        Ca chung giới hạn: <span className="font-semibold">{shiftRangeLabel}</span>.
                        {" "}Giáo viên không chia riêng sẽ dùng toàn bộ khung giờ ca này.
                      </p>
                    </div>
                    <div className="hidden gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(130px,0.8fr)_minmax(145px,0.8fr)_minmax(285px,1.4fr)]">
                      <span>Tên giáo viên</span>
                      <span>Vai trò</span>
                      <span className="text-right">Phân công giờ dạy</span>
                    </div>
                    <div className="divide-y divide-slate-100">
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
                          <div key={teacherId} className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(130px,0.8fr)_minmax(145px,0.8fr)_minmax(285px,1.4fr)] lg:items-center lg:gap-3">
                            <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={teacher?.fullName || teacherId}>
                              {teacher?.fullName || teacherId}
                            </span>
                            <div className="min-w-0 space-y-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:hidden">Vai trò</span>
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
                                <SelectTrigger className={`h-10 rounded-lg border-slate-200 bg-white ${missingRole ? "border-destructive" : ""}`}>
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
                            <div className="min-w-0 space-y-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:hidden">Phân công giờ dạy</span>
                              <div className="flex min-w-0 items-center gap-2">
                                <label className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className="text-xs text-slate-500">Từ</span>
                                  <input
                                    type="time"
                                    aria-label={`Giờ bắt đầu của ${teacher?.fullName || teacherId}`}
                                    min={shiftStartTime || undefined}
                                    max={shiftEndTime || undefined}
                                    value={timeRange.startTime}
                                    onChange={(event) => updateTeacherTimeRange(teacherId, "startTime", event.target.value)}
                                    disabled={!shiftStartTime || !shiftEndTime}
                                    className={`h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-sm ${invalidTime ? "border-destructive" : ""}`}
                                  />
                                </label>
                                <label className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className="text-xs text-slate-500">Đến</span>
                                  <input
                                    type="time"
                                    aria-label={`Giờ kết thúc của ${teacher?.fullName || teacherId}`}
                                    min={shiftStartTime || undefined}
                                    max={shiftEndTime || undefined}
                                    value={timeRange.endTime}
                                    onChange={(event) => updateTeacherTimeRange(teacherId, "endTime", event.target.value)}
                                    disabled={!shiftStartTime || !shiftEndTime}
                                    className={`h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-sm ${invalidTime ? "border-destructive" : ""}`}
                                  />
                                </label>
                              </div>
                              <p className={invalidTime
                                ? "text-xs text-destructive"
                                : isFullShift
                                  ? "text-right text-xs text-slate-500"
                                  : "text-right text-[10px] leading-3 text-slate-500"
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
                      <p className="border-t border-slate-200 px-4 py-3 text-xs text-destructive">
                        Chọn vai trò cho giáo viên có nhiều vai trò tại cơ sở.
                      </p>
                    )}
                    {teacherIds.length > 0 && (!shiftStartTime || !shiftEndTime) && (
                      <p className="border-t border-slate-200 px-4 py-3 text-xs text-destructive">
                        Ca học chung chưa có giờ bắt đầu hoặc kết thúc; cần bổ sung giờ cho ca trước khi lưu phân công giáo viên.
                      </p>
                    )}
                  </div>
                )}

                {isLiveChecking && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang kiểm tra trùng lịch...
                  </div>
                )}
                {!isLiveChecking && liveConflicts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left transition-colors hover:bg-orange-100"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
                      <span className="text-sm font-semibold text-orange-800">
                        Phát hiện {liveConflicts.length} xung đột lịch
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-orange-700">
                      {roomConflicts.length > 0 && <span>{roomConflicts.length} trùng phòng</span>}
                      {teacherConflicts.length > 0 && <span>{teacherConflicts.length} trùng giáo viên</span>}
                      <span className="ml-auto underline">Xem chi tiết</span>
                    </div>
                  </button>
                )}
              </section>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
            <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              className="rounded-xl bg-indigo-600 shadow-sm hover:bg-indigo-700"
              disabled={!sessionInitialized || !sessionDate || !shiftTemplateId || !changeReason.trim() || isPending || hasMissingTeacherRole || hasInvalidTeacherTimeRanges}
              onClick={submitUpdate}
            >
              {isPending ? "Đang lưu..." : "Lưu thay đổi"}
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
