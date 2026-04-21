import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { AlertCircle, CalendarIcon, Check, ChevronsUpDown, Search, UserCheck, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MakeupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStudents: any[];
  classSessions: any[];
  allClasses?: any[];
  classId?: string;
  locationId?: string;
  onConfirm: (data: any) => void;
  isPending: boolean;
}

const DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getDayName(dateStr: string) {
  return DAY_NAMES[new Date(dateStr).getDay()];
}

function formatSessionLabel(s: any) {
  return `Buổi ${s.sessionIndex} - ${getDayName(s.sessionDate)}, ${format(
    parseISO(s.sessionDate),
    "dd/MM/yyyy"
  )} ${s.shiftTemplate?.startTime ?? ""}${
    s.shiftTemplate?.endTime ? ` – ${s.shiftTemplate.endTime}` : ""
  }`;
}

export function MakeupDialog({
  isOpen,
  onOpenChange,
  selectedStudents,
  classSessions,
  allClasses = [],
  classId,
  locationId,
  onConfirm,
  isPending,
}: MakeupDialogProps) {
  const [option, setOption] = useState<string>("current_class");
  const [subOption, setSubOption] = useState<string>("specific_session");
  const [selectedTargetSessionId, setSelectedTargetSessionId] = useState<string>("");
  const [selectedTargetClassId, setSelectedTargetClassId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<"same" | "other">("same");
  const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    code: `MAKEUP_${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`,
    name: "Lớp bù",
  });
  const [newScheduleWeekdays, setNewScheduleWeekdays] = useState<number[]>([]);
  const [newScheduleConfig, setNewScheduleConfig] = useState<{weekday: number; date?: Date; shifts: {shiftTemplateId: string; roomId: string}[]}[]>([]);
  const [newScheduleTeachers, setNewScheduleTeachers] = useState<string[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState<Record<number, boolean>>({});

  // Reset session selection when switching options
  useEffect(() => {
    setSelectedTargetSessionId("");
  }, [option, subOption]);

  // Sync weekdays → scheduleConfig (like CreateClass Step 2)
  useEffect(() => {
    setNewScheduleConfig((prev) => {
      return newScheduleWeekdays.map((day) => {
        const existing = prev.find((c) => c.weekday === day);
        if (existing) return existing;
        return { weekday: day, shifts: [{ shiftTemplateId: "", roomId: "" }] };
      });
    });
  }, [newScheduleWeekdays]);

  // Reset class + session selection when location filter changes
  useEffect(() => {
    setSelectedTargetClassId("");
    setSelectedTargetSessionId("");
  }, [locationFilter]);

  // Fetch all classes for "other_class" option
  const { data: allClassesFetched = [], isLoading: loadingClasses } = useQuery<any[]>({
    queryKey: ["/api/classes?minimal=true"],
    enabled: option === "other_class",
  });

  // Filter out current class and separate by location
  const otherClasses = allClassesFetched.filter((c) => c.id !== classId);
  const sameLocationClasses = otherClasses.filter((c) => locationId && c.locationId === locationId);
  const otherLocationClasses = otherClasses.filter((c) => !locationId || c.locationId !== locationId);

  // Classes shown based on the location filter toggle
  const filteredClassList = locationFilter === "same" ? sameLocationClasses : otherLocationClasses;

  // Fetch sessions for selected other class
  const { data: targetClassSessions = [], isLoading: loadingTargetSessions } = useQuery<any[]>({
    queryKey: ["/api/classes", selectedTargetClassId, "sessions"],
    enabled: option === "other_class" && !!selectedTargetClassId,
  });

  // Fetch active students of target class to know which sessions the student is already enrolled in
  const { data: targetClassActiveStudents = [] } = useQuery<any[]>({
    queryKey: ["/api/classes", selectedTargetClassId, "active-students"],
    enabled: option === "other_class" && !!selectedTargetClassId,
  });

  // Fetch shift templates, classrooms and staff for "new_schedule" option
  const { data: allShiftTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates"],
    enabled: option === "new_schedule",
  });
  const { data: allClassrooms = [] } = useQuery<any[]>({
    queryKey: ["/api/classrooms"],
    enabled: option === "new_schedule",
  });
  const { data: allStaff = [] } = useQuery<any[]>({
    queryKey: [locationId ? `/api/staff?locationId=${locationId}&minimal=true` : "/api/staff?minimal=true"],
    enabled: option === "new_schedule",
  });
  const filteredShifts = locationId
    ? allShiftTemplates.filter((s) => String(s.locationId) === String(locationId))
    : allShiftTemplates;
  const filteredClassrooms = locationId
    ? allClassrooms.filter((r) => String(r.locationId) === String(locationId))
    : allClassrooms;
  const teacherStaff = allStaff.filter((s: any) =>
    s.assignments?.some((a: any) =>
      a.department?.name === "Phòng Đào tạo" ||
      a.role?.name?.includes("Giáo viên") ||
      a.role?.name?.includes("Trợ giảng")
    )
  );

  const todayForOther = new Date();
  todayForOther.setHours(0, 0, 0, 0);
  const futureTargetSessions = targetClassSessions.filter(
    (s) => new Date(s.sessionDate) >= todayForOther
  );

  // ── Categorize other-class sessions (available vs occupied) ────────────────
  const { otherAvailableSessions, otherOccupiedSessions, otherOccupiedStatusMap } = useMemo(() => {
    const available: any[] = [];
    const occupied: any[] = [];
    const statusMap: Record<string, string> = {};

    for (const session of futureTargetSessions) {
      const sessionDate = new Date(session.sessionDate);
      let enrolledAttendanceStatus: string | undefined;

      const anyEnrolled = selectedStudents.some((st) => {
        // Find this student's record in the target class
        const targetStudentRec = (targetClassActiveStudents as any[]).find(
          (ts: any) => ts.studentId === st.studentId
        );
        const targetSS: any[] = targetStudentRec?.studentSessions ?? [];

        // Check if enrolled in this exact session (non-cancelled)
        const matchingSS = targetSS.find((ss: any) => {
          return (
            ss.classSessionId === session.id &&
            ss.status !== "cancelled" &&
            ss.attendanceStatus !== "cancelled"
          );
        });
        if (matchingSS) {
          enrolledAttendanceStatus = matchingSS.attendanceStatus;
          return true;
        }

        // Same-day conflict in target class
        const sameDaySS = targetSS.find((ss: any) => {
          const ssDate = ss.sessionDate;
          return (
            ssDate &&
            new Date(ssDate).toDateString() === sessionDate.toDateString() &&
            ss.status !== "cancelled" &&
            ss.attendanceStatus !== "cancelled"
          );
        });
        if (sameDaySS) {
          enrolledAttendanceStatus = sameDaySS.attendanceStatus;
          return true;
        }

        return false;
      });

      if (anyEnrolled) {
        occupied.push(session);
        statusMap[session.id] = enrolledAttendanceStatus ?? "pending";
      } else {
        available.push(session);
      }
    }

    return {
      otherAvailableSessions: available,
      otherOccupiedSessions: occupied,
      otherOccupiedStatusMap: statusMap,
    };
  }, [futureTargetSessions, selectedStudents, targetClassActiveStudents]);

  // ── Attendance status → Vietnamese label ───────────────────────────────────
  function getAttendanceLabel(status: string | undefined): string {
    switch (status) {
      case "attended":    return "Có mặt";
      case "absent":      return "Vắng mặt";
      case "makeup_wait": return "Nghỉ chờ bù";
      case "makeup_done": return "Đã bù";
      case "pending":     return "Chưa điểm danh";
      case "cancelled":   return "Đã huỷ";
      default:            return "Đã xếp lịch";
    }
  }

  // ── Categorize sessions ────────────────────────────────────────────────────
  // allAvailableSessions : ALL selected students can attend (fully selectable)
  // partialSessions      : SOME students can attend (selectable, but with warning)
  // occupiedSessions     : NO students can attend (dimmed, not selectable)
  // partialSessionMap    : sessionId → { canAttend[], cannotAttend[] }
  // occupiedStatusMap    : sessionId → attendanceStatus
  const { allAvailableSessions, partialSessions, partialSessionMap, occupiedSessions, occupiedStatusMap } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const future = classSessions.filter((session) => {
      const sessionDate = new Date(session.sessionDate);
      if (sessionDate < today) return false;
      const isOriginal = selectedStudents.some(
        (st) =>
          st.original_session_id === session.id ||
          st.classSessionId === session.id
      );
      return !isOriginal;
    });

    const allAvailable: typeof classSessions = [];
    const partial: typeof classSessions = [];
    const occupied: typeof classSessions = [];
    const statusMap: Record<string, string> = {};
    const partialMap: Record<string, { canAttend: any[]; cannotAttend: any[] }> = {};

    for (const session of future) {
      const sessionDate = new Date(session.sessionDate);

      const canAttendStudents: any[] = [];
      const cannotAttendStudents: any[] = [];
      let enrolledAttendanceStatus: string | undefined;

      for (const st of selectedStudents) {
        const allSS = st.allStudentSessions || [];

        // enrolled in this exact session (non-cancelled)
        const matchingSS = allSS.find((ss: any) => {
          const sessId = ss.classSessionId || ss.class_session_id;
          return (
            sessId === session.id &&
            ss.status !== "cancelled" &&
            ss.attendanceStatus !== "cancelled"
          );
        });
        if (matchingSS) {
          enrolledAttendanceStatus = matchingSS.attendanceStatus;
          cannotAttendStudents.push(st);
          continue;
        }

        // same calendar day conflict — only within the same class
        const sameDaySS = allSS.find((ss: any) => {
          const ssDate = ss.classSession?.sessionDate || ss.sessionDate;
          const ssClassId = ss.classId || ss.class_id;
          return (
            ssDate &&
            new Date(ssDate).toDateString() === sessionDate.toDateString() &&
            ss.status !== "cancelled" &&
            ss.attendanceStatus !== "cancelled" &&
            (!classId || ssClassId === classId)
          );
        });
        if (sameDaySS) {
          enrolledAttendanceStatus = sameDaySS.attendanceStatus;
          cannotAttendStudents.push(st);
          continue;
        }

        canAttendStudents.push(st);
      }

      if (canAttendStudents.length === 0) {
        // All students have conflicts → fully occupied
        occupied.push(session);
        statusMap[session.id] = enrolledAttendanceStatus ?? "pending";
      } else if (cannotAttendStudents.length === 0) {
        // All students can attend → fully available
        allAvailable.push(session);
      } else {
        // Some can, some can't → partial
        partial.push(session);
        partialMap[session.id] = { canAttend: canAttendStudents, cannotAttend: cannotAttendStudents };
      }
    }

    return {
      allAvailableSessions: allAvailable,
      partialSessions: partial,
      partialSessionMap: partialMap,
      occupiedSessions: occupied,
      occupiedStatusMap: statusMap,
    };
  }, [classSessions, selectedStudents]);

  // Backward-compat alias: "available" = all sessions that are at least partially bookable
  const availableSessions = [...allAvailableSessions, ...partialSessions];

  const noSessionsAvailable =
    option === "current_class" &&
    subOption === "specific_session" &&
    availableSessions.length === 0;

  const selectedSessionLabel = useMemo(() => {
    const s = availableSessions.find(
      (sess) => sess.id === selectedTargetSessionId
    );
    return s ? formatSessionLabel(s) : "Chọn buổi học";
  }, [selectedTargetSessionId, availableSessions]);

  // Info about the currently selected session (if it's a partial session)
  const selectedPartialInfo = useMemo(() => {
    if (!selectedTargetSessionId) return null;
    return partialSessionMap[selectedTargetSessionId] ?? null;
  }, [selectedTargetSessionId, partialSessionMap]);

  const newScheduleValid =
    newScheduleWeekdays.length > 0 &&
    newScheduleConfig.every((c) => !!c.date && c.shifts.every((s) => s.shiftTemplateId !== ""));

  const isConfirmDisabled =
    isPending ||
    (option === "current_class" &&
      subOption === "specific_session" &&
      !selectedTargetSessionId) ||
    (option === "other_class" &&
      (!selectedTargetClassId || !selectedTargetSessionId)) ||
    (option === "new_schedule" && !newScheduleValid);

  const handleConfirm = () => {
    // For partial sessions, only schedule students who can actually attend
    const eligibleStudents =
      option === "current_class" &&
      subOption === "specific_session" &&
      selectedPartialInfo
        ? selectedPartialInfo.canAttend
        : selectedStudents;

    onConfirm({
      option,
      subOption,
      selectedTargetSessionId,
      selectedTargetClassId,
      newSchedule: {
        ...newSchedule,
        scheduleConfig: newScheduleConfig.map((c) => ({
          ...c,
          date: c.date ? format(c.date, "yyyy-MM-dd") : undefined,
        })),
        weekdays: newScheduleWeekdays,
        teacherIds: newScheduleTeachers,
      },
      students: eligibleStudents,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-wide">
            XẾP BÙ BUỔI HỌC
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── 1. Danh sách học viên đang xếp bù ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-medium">
                Học viên đang xếp bù{" "}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {selectedStudents.length}
                </Badge>
              </p>
            </div>
            <div className="max-h-[130px] overflow-y-auto rounded-md border bg-muted/20 p-2 space-y-1">
              {selectedStudents.length > 0 ? (
                selectedStudents.map((s) => (
                  <div
                    key={s.id ?? s.studentId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox checked disabled />
                    <span className="font-medium">
                      {s.student?.fullName || s.fullName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      — Buổi&nbsp;{s.sessionIndex}{" "}
                      {s.sessionDate
                        ? `${getDayName(s.sessionDate)}, ${format(
                            parseISO(s.sessionDate),
                            "dd/MM/yyyy"
                          )}`
                        : ""}
                      {s.startTime ? ` ${s.startTime}` : ""}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Chưa có học viên nào được chọn
                </p>
              )}
            </div>
          </div>

          {/* ── 2. Chọn hình thức xếp bù ── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Chọn hình thức xếp bù</Label>
            <RadioGroup
              value={option}
              onValueChange={setOption}
              className="space-y-2"
            >
              {[
                { value: "current_class", label: "Xếp bù vào lớp hiện tại" },
                { value: "other_class", label: "Xếp bù sang lớp khác" },
                { value: "new_schedule", label: "Tạo riêng lịch bù" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`opt-${opt.value}`}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                    option === opt.value
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-muted/40"
                  )}
                >
                  <RadioGroupItem value={opt.value} id={`opt-${opt.value}`} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* ── 3. Lớp hiện tại ── */}
          {option === "current_class" && (
            <div className="space-y-4 border-t pt-4">
              <RadioGroup
                value={subOption}
                onValueChange={setSubOption}
                className="flex gap-6"
              >
                <label
                  htmlFor="sub-specific"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RadioGroupItem value="specific_session" id="sub-specific" />
                  <span className="text-sm">Buổi cụ thể</span>
                </label>
                <label
                  htmlFor="sub-end"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RadioGroupItem value="end_of_schedule" id="sub-end" />
                  <span className="text-sm">Cuối lịch</span>
                </label>
              </RadioGroup>

              {/* Buổi cụ thể */}
              {subOption === "specific_session" && (
                <div className="space-y-2">
                  <Label className="text-sm">Chọn buổi học</Label>

                  {noSessionsAvailable && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Không có buổi phù hợp để xếp bù. Tất cả buổi còn lại
                        đều đã qua, đã có mặt học viên, hoặc trùng ngày.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Popover
                    open={isSessionPopoverOpen}
                    onOpenChange={setIsSessionPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isSessionPopoverOpen}
                        className="w-full justify-between bg-white text-xs font-normal h-10"
                        disabled={noSessionsAvailable}
                        data-testid="button-select-makeup-session"
                      >
                        <span className="truncate">{selectedSessionLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0 bg-white"
                      align="start"
                    >
                      <Command className="bg-white">
                        <CommandInput
                          placeholder="Tìm buổi học..."
                          className="h-9 text-xs"
                        />
                        <CommandList className="max-h-[290px]">
                          {availableSessions.length === 0 && occupiedSessions.length === 0 && (
                            <CommandEmpty>Không có buổi nào hợp lệ</CommandEmpty>
                          )}

                          {/* Nhóm 1: Tất cả học viên có thể xếp bù */}
                          {allAvailableSessions.length > 0 && (
                            <CommandGroup heading={`Tất cả có thể xếp bù (${selectedStudents.length}/${selectedStudents.length})`}>
                              {allAvailableSessions.map((s) => (
                                <CommandItem
                                  key={s.id}
                                  value={formatSessionLabel(s)}
                                  onSelect={() => {
                                    setSelectedTargetSessionId(s.id);
                                    setIsSessionPopoverOpen(false);
                                  }}
                                  className="text-xs cursor-pointer"
                                  data-testid={`session-option-${s.id}`}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 shrink-0",
                                      selectedTargetSessionId === s.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {formatSessionLabel(s)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}

                          {/* Nhóm 2: Chỉ một phần học viên có thể xếp bù */}
                          {partialSessions.length > 0 && (
                            <CommandGroup heading="Chỉ một phần học viên xếp bù được">
                              {partialSessions.map((s) => {
                                const info = partialSessionMap[s.id];
                                const canCount = info?.canAttend.length ?? 0;
                                const total = selectedStudents.length;
                                return (
                                  <CommandItem
                                    key={s.id}
                                    value={`partial-${formatSessionLabel(s)}`}
                                    onSelect={() => {
                                      setSelectedTargetSessionId(s.id);
                                      setIsSessionPopoverOpen(false);
                                    }}
                                    className="text-xs cursor-pointer"
                                    data-testid={`session-partial-${s.id}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        selectedTargetSessionId === s.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="flex-1">{formatSessionLabel(s)}</span>
                                    <span className="ml-2 shrink-0 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5">
                                      {canCount}/{total}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          )}

                          {/* Nhóm 3: Đã có lịch — không chọn được */}
                          {occupiedSessions.length > 0 && (
                            <CommandGroup heading="Đã có lịch (không chọn được)">
                              {occupiedSessions.map((s) => (
                                <CommandItem
                                  key={s.id}
                                  value={`occupied-${s.id}`}
                                  disabled
                                  className="text-xs opacity-40 cursor-not-allowed"
                                  data-testid={`session-occupied-${s.id}`}
                                >
                                  <div className="mr-2 h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                                      <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2"/>
                                    </svg>
                                  </div>
                                  {formatSessionLabel(s)}
                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    {getAttendanceLabel(occupiedStatusMap[s.id])}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Cảnh báo khi chọn buổi chỉ một phần học viên có thể tham gia */}
                  {selectedPartialInfo && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 font-medium">
                          Buổi này chỉ xếp bù được cho {selectedPartialInfo.canAttend.length}/{selectedStudents.length} học viên.
                          Hệ thống sẽ bỏ qua các học viên có xung đột lịch.
                        </p>
                      </div>
                      <div className="pl-6 space-y-1">
                        <p className="text-[11px] font-semibold text-green-700">
                          Sẽ được xếp bù ({selectedPartialInfo.canAttend.length}):
                        </p>
                        {selectedPartialInfo.canAttend.map((st: any) => (
                          <div key={st.id ?? st.studentId} className="text-[11px] text-green-700 flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                            {st.student?.fullName || st.fullName}
                          </div>
                        ))}
                        <p className="text-[11px] font-semibold text-red-600 pt-1">
                          Không thể xếp bù ({selectedPartialInfo.cannotAttend.length}):
                        </p>
                        {selectedPartialInfo.cannotAttend.map((st: any) => (
                          <div key={st.id ?? st.studentId} className="text-[11px] text-red-600 flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                            {st.student?.fullName || st.fullName} — đã có lịch trùng
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cuối lịch */}
              {subOption === "end_of_schedule" && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <p>
                    Số buổi xếp bù:{" "}
                    <span className="font-semibold">
                      {selectedStudents.length} buổi
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Hệ thống sẽ tự động gán vào sau buổi cuối cùng trong lịch
                    hiện tại.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── 4. Lớp khác ── */}
          {option === "other_class" && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label className="text-sm">Tìm & chọn lớp</Label>

                {/* Location filter toggle */}
                <div className="flex gap-2">
                  {(["same", "other"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLocationFilter(f)}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        locationFilter === f
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-muted hover:bg-muted/40 text-muted-foreground"
                      )}
                      data-testid={`filter-location-${f}`}
                    >
                      {f === "same" ? "Cơ sở hiện tại" : "Cơ sở khác"}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm lớp..."
                    className="pl-8 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-class"
                  />
                </div>
                <Select
                  value={selectedTargetClassId}
                  onValueChange={(v) => {
                    setSelectedTargetClassId(v);
                    setSelectedTargetSessionId("");
                  }}
                >
                  <SelectTrigger className="bg-white" data-testid="select-target-class">
                    <SelectValue placeholder="Chọn lớp trong danh sách" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {loadingClasses ? (
                      <SelectItem value="__loading" disabled>
                        Đang tải danh sách lớp...
                      </SelectItem>
                    ) : filteredClassList.filter((c) =>
                        `${c.name} ${c.classCode}`.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Không có lớp nào
                      </SelectItem>
                    ) : (
                      filteredClassList
                        .filter((c) =>
                          `${c.name} ${c.classCode}`.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.classCode ? ` (${c.classCode})` : ""}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedTargetClassId && (
                <div className="space-y-2">
                  <Label className="text-sm">Chọn buổi</Label>
                  <Select
                    value={selectedTargetSessionId}
                    onValueChange={setSelectedTargetSessionId}
                  >
                    <SelectTrigger className="bg-white" data-testid="select-target-session">
                      <SelectValue placeholder="Chọn buổi học của lớp đã chọn" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {loadingTargetSessions ? (
                        <SelectItem value="__loading" disabled>
                          Đang tải buổi học...
                        </SelectItem>
                      ) : futureTargetSessions.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Không có buổi học nào
                        </SelectItem>
                      ) : (
                        <>
                          {otherAvailableSessions.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Có thể xếp bù</SelectLabel>
                              {otherAvailableSessions.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {formatSessionLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {otherOccupiedSessions.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="text-muted-foreground">Đã có lịch (không chọn được)</SelectLabel>
                              {otherOccupiedSessions.map((s) => (
                                <SelectItem
                                  key={s.id}
                                  value={`occupied-${s.id}`}
                                  disabled
                                  className="opacity-40"
                                >
                                  {formatSessionLabel(s)} — {getAttendanceLabel(otherOccupiedStatusMap[s.id])}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ── 5. Tạo riêng lịch bù ── */}
          {option === "new_schedule" && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Mã lớp</Label>
                  <Input
                    value={newSchedule.code}
                    onChange={(e) =>
                      setNewSchedule({ ...newSchedule, code: e.target.value })
                    }
                    data-testid="input-new-class-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Tên lớp</Label>
                  <Input
                    value={newSchedule.name}
                    onChange={(e) =>
                      setNewSchedule({ ...newSchedule, name: e.target.value })
                    }
                    data-testid="input-new-class-name"
                  />
                </div>
              </div>

              {/* PHẦN 1: CHỌN CHU KỲ THỨ (chỉ chọn 1 ngày) */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">CHỌN CHU KỲ THỨ</Label>
                <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg border border-border">
                  {[
                    { value: 1, label: "T2" },
                    { value: 2, label: "T3" },
                    { value: 3, label: "T4" },
                    { value: 4, label: "T5" },
                    { value: 5, label: "T6" },
                    { value: 6, label: "T7" },
                    { value: 0, label: "CN" },
                  ].map((day) => (
                    <div key={day.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`makeup-day-${day.value}`}
                        checked={newScheduleWeekdays.includes(day.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewScheduleWeekdays([day.value]);
                          } else {
                            setNewScheduleWeekdays([]);
                          }
                        }}
                        data-testid={`checkbox-weekday-${day.label}`}
                      />
                      <Label htmlFor={`makeup-day-${day.value}`} className="cursor-pointer font-medium text-sm">
                        {day.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* PHẦN 2: CẤU HÌNH CA THEO THỨ */}
              {newScheduleConfig.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">CẤU HÌNH CA THEO THỨ</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 bg-muted/50 p-2 text-xs font-semibold border-b">
                      <div className="col-span-1">Thứ</div>
                      <div className="col-span-3">Ngày học</div>
                      <div className="col-span-4">Ca học</div>
                      <div className="col-span-3">Phòng học</div>
                      <div className="col-span-1" />
                    </div>
                    <div className="divide-y">
                      {newScheduleConfig.map((dayConfig, dayIdx) => {
                        const DAY_MAP = [
                          { value: 0, label: "CN" },
                          { value: 1, label: "T2" },
                          { value: 2, label: "T3" },
                          { value: 3, label: "T4" },
                          { value: 4, label: "T5" },
                          { value: 5, label: "T6" },
                          { value: 6, label: "T7" },
                        ];
                        const dayLabel = DAY_MAP.find((d) => d.value === dayConfig.weekday)?.label || "";

                        return dayConfig.shifts.map((shift, shiftIdx) => (
                          <div key={`${dayIdx}-${shiftIdx}`} className="grid grid-cols-12 p-2 items-center gap-1">
                            <div className="col-span-1 text-xs font-bold text-primary">
                              {shiftIdx === 0 ? dayLabel : ""}
                            </div>
                            {/* Ngày học - date picker (chỉ hiện ở hàng đầu của mỗi thứ) */}
                            <div className="col-span-3">
                              {shiftIdx === 0 ? (
                                <Popover
                                  open={datePickerOpen[dayIdx]}
                                  onOpenChange={(open) =>
                                    setDatePickerOpen((prev) => ({ ...prev, [dayIdx]: open }))
                                  }
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "h-8 w-full text-xs px-2 justify-start font-normal",
                                        !dayConfig.date && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                                      {dayConfig.date
                                        ? format(dayConfig.date, "dd/MM/yyyy")
                                        : "Chọn ngày"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0 bg-white" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={dayConfig.date}
                                      onSelect={(date) => {
                                        const next = [...newScheduleConfig];
                                        next[dayIdx].date = date ?? undefined;
                                        setNewScheduleConfig(next);
                                        setDatePickerOpen((prev) => ({ ...prev, [dayIdx]: false }));
                                      }}
                                      disabled={(date) => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        return date < today || date.getDay() !== dayConfig.weekday;
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              ) : <div />}
                            </div>
                            <div className="col-span-4">
                              <Select
                                value={shift.shiftTemplateId}
                                onValueChange={(val) => {
                                  const next = [...newScheduleConfig];
                                  next[dayIdx].shifts[shiftIdx].shiftTemplateId = val;
                                  setNewScheduleConfig(next);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Chọn ca" />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                  {filteredShifts.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name} ({s.startTime}–{s.endTime})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-3">
                              <Select
                                value={shift.roomId || "_none"}
                                onValueChange={(val) => {
                                  const next = [...newScheduleConfig];
                                  next[dayIdx].shifts[shiftIdx].roomId = val === "_none" ? "" : val;
                                  setNewScheduleConfig(next);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Phòng" />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                  <SelectItem value="_none">Không chọn</SelectItem>
                                  {filteredClassrooms.map((r: any) => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {shiftIdx === 0 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary hover:bg-primary/10"
                                  onClick={() => {
                                    const next = [...newScheduleConfig];
                                    next[dayIdx].shifts.push({ shiftTemplateId: "", roomId: "" });
                                    setNewScheduleConfig(next);
                                  }}
                                >
                                  <span className="text-base leading-none">+</span>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    const next = [...newScheduleConfig];
                                    next[dayIdx].shifts.splice(shiftIdx, 1);
                                    setNewScheduleConfig(next);
                                  }}
                                >
                                  <span className="text-base leading-none">×</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* PHẦN 3: CHỌN GIÁO VIÊN */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">CHỌN GIÁO VIÊN</Label>
                  <Select
                    value=""
                    onValueChange={(val) => {
                      if (!newScheduleTeachers.includes(val)) {
                        setNewScheduleTeachers((prev) => [...prev, val]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Thêm giáo viên..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {(teacherStaff.length > 0 ? teacherStaff : allStaff).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newScheduleTeachers.length === 0 ? (
                  <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">
                    Chưa có giáo viên nào được chọn.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {newScheduleTeachers.map((tid) => {
                      const staff = allStaff.find((s: any) => s.id === tid);
                      return (
                        <div key={tid} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                          <span>{staff?.fullName || tid}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => setNewScheduleTeachers((prev) => prev.filter((id) => id !== tid))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-makeup"
          >
            Hủy
          </Button>
          <Button
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
            data-testid="button-confirm-makeup"
          >
            {isPending
              ? "Đang xử lý..."
              : option === "new_schedule"
              ? "Tạo và xếp bù"
              : "Xác nhận xếp bù"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
