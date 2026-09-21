import { useEffect, useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, startOfMonth, subMonths } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CalendarDays,
  BookOpen,
  MapPin,
  UserRound,
  Users,
  Star,
  HelpCircle,
  PauseCircle,
  Pencil,
  Plus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ReviewDialog } from "@/components/education/ReviewDialog";
import { SessionContentDialog } from "@/components/education/SessionContentDialog";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FreeClassCalendarProps {
  classId: string;
  classData: any;
  classPerm?: { canEdit: boolean };
}

type CalendarMode = "register" | "attend";

type FreeSessionContentSummary = {
  id: string;
  contentType: string;
  title: string;
  description?: string | null;
  resourceUrl?: string | null;
  dueDate?: string | null;
  studentId?: string | null;
};

const formatStudentDate = (value: unknown) => {
  const normalized = String(value || "").slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return "—";
  return `${Number(day)}/${Number(month)}/${year}`;
};

export function FreeClassCalendar({ classId, classData, classPerm }: FreeClassCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [mode, setMode] = useState<CalendarMode>("register");
  const [selectedAttendDate, setSelectedAttendDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [noteDialog, setNoteDialog] = useState<{
    studentClassId: string;
    registrationId?: string;
    date?: string;
    value: string;
    status: "registered" | "attended" | "reserved";
  } | null>(null);
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<{
    student: any;
    registration: any;
  } | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, {
    reviewData: Record<string, any>;
    published: boolean;
  }>>({});
  const [selectedAttendStudentIds, setSelectedAttendStudentIds] = useState<string[]>([]);
  const [contentDialogDate, setContentDialogDate] = useState<string | null>(null);
  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState<string[]>([]);
  const [criteriaOverride, setCriteriaOverride] = useState<string[] | undefined>();
  const [bulkAttendanceDialogOpen, setBulkAttendanceDialogOpen] = useState(false);
  const [bulkAttendanceStatus, setBulkAttendanceStatus] = useState<
    "registered" | "attended" | "reserved"
  >("attended");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const month = format(monthDate, "yyyy-MM");
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/classes/${classId}/free-schedule`, month],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/free-schedule?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải lịch lớp tự do");
      return res.json();
    },
  });
  const selectedContentPath = selectedDate
    ? `/api/free-class-sessions/${classId}/${selectedDate}/contents`
    : "";
  const {
    data: selectedDateContents,
    isLoading: isLoadingSelectedDateContents,
  } = useQuery<{
    common?: FreeSessionContentSummary[];
    personal?: FreeSessionContentSummary[];
  }>({
    queryKey: [selectedContentPath],
    queryFn: async () => {
      const res = await fetch(selectedContentPath, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải nội dung buổi học");
      return res.json();
    },
    enabled: !!selectedContentPath,
  });
  const { data: allEvaluationCriteria = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      studentClassId: string;
      date: string;
      action: CalendarMode;
      value: boolean;
      status?: "registered" | "attended" | "reserved";
      note?: string;
    }) => {
      await apiRequest("PATCH", `/api/classes/${classId}/free-schedule`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
    },
    onError: (error: any) => toast({ title: "Không thể cập nhật", description: error.message, variant: "destructive" }),
  });

  const days = useMemo(() => {
    const count = getDaysInMonth(monthDate);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
      return { date, value: format(date, "yyyy-MM-dd"), label: index + 1, weekday: format(date, "EE") };
    });
  }, [monthDate]);

  const registrations = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of data?.registrations || []) map.set(`${row.studentClassId}:${row.registrationDate}`, row);
    return map;
  }, [data?.registrations]);

  const students = (data?.students || []).filter((student: any) => student.status === "active");
  const classStart = String(classData?.startDate || "").slice(0, 10);
  const classEnd = String(classData?.endDate || "").slice(0, 10);
  const today = format(new Date(), "yyyy-MM-dd");
  const monthLabel = format(monthDate, "M");
  const scheduleWindow = useMemo(() => {
    const starts = students
      .map((student: any) => String(student.startDate || classStart || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const ends = students
      .map((student: any) => String(student.endDate || classEnd || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    return {
      start: starts[0] || classStart,
      end: ends[ends.length - 1] || classEnd,
    };
  }, [students, classStart, classEnd]);
  const selectedDayStudentIds = selectedDate
    ? students
        .filter((student: any) => registrations.has(`${student.id}:${selectedDate}`))
        .map((student: any) => student.id)
    : [];
  const selectedDayStudentIdSet = new Set(selectedDayStudentIds);
  const selectableStudentsForDate = selectedDate
    ? students.filter((student: any) =>
        (!student.startDate || selectedDate >= String(student.startDate).slice(0, 10))
        && (!student.endDate || selectedDate <= String(student.endDate).slice(0, 10)),
      )
    : [];
  const allSelectedDayStudents = selectableStudentsForDate.length > 0
    && selectableStudentsForDate.every((student: any) => selectedStudentIds.includes(student.id));
  const monthlyStats = useMemo(() => {
    const stats = new Map<string, { registered: number; attended: number }>();
    for (const student of students) {
      const registrationsInMonth = days
        .map((day) => registrations.get(`${student.id}:${day.value}`))
        .filter(Boolean);
      stats.set(student.id, {
        registered: registrationsInMonth.length,
        attended: registrationsInMonth.filter((registration: any) => registration.status === "attended").length,
      });
    }
    return stats;
  }, [days, registrations, students]);
  const visibleDays = mode === "attend"
    ? days.filter((day) => students.some((student: any) => registrations.has(`${student.id}:${day.value}`)))
    : days.filter((day) =>
        (!scheduleWindow.start || day.value >= scheduleWindow.start)
        && (!scheduleWindow.end || day.value <= scheduleWindow.end),
      );

  useEffect(() => {
    const currentMonth = today.slice(0, 7);
    setSelectedDate((current) => {
      if (current && visibleDays.some((day) => day.value === current)) return current;
      return month === currentMonth && visibleDays.some((day) => day.value === today)
        ? today
        : null;
    });
  }, [month, today, visibleDays]);

  useEffect(() => {
    setSelectedStudentIds(selectedDayStudentIds);
  }, [selectedDate, data?.registrations]);

  useEffect(() => {
    if (mode !== "attend") return;
    setSelectedAttendDate((current) =>
      current && visibleDays.some((day) => day.value === current)
        ? current
        : visibleDays[0]?.value ?? null,
    );
  }, [mode, month, visibleDays]);

  const selectedAttendDay = visibleDays.find((day) => day.value === selectedAttendDate) ?? null;
  const selectedCommonContents = selectedDateContents?.common ?? [];
  const selectedPersonalContents = selectedDateContents?.personal ?? [];
  const selectedContentStudentNames = useMemo(
    () => new Map(students.map((student: any) => [student.id, student.fullName])),
    [students],
  );
  const selectedAttendStudents = selectedAttendDay
    ? students
        .map((student: any) => ({
          student,
          registration: registrations.get(`${student.id}:${selectedAttendDay.value}`),
        }))
        .filter(({ registration }: any) => !!registration)
    : [];
  const selectedAttendedCount = selectedAttendStudents.filter(
    ({ registration }: any) => registration.status === "attended",
  ).length;

  useEffect(() => {
    const visibleStudentIds = new Set(selectedAttendStudents.map(({ student }: any) => student.id));
    const attendedStudentIds = selectedAttendStudents
      .filter(({ registration }: any) => registration.status === "attended")
      .map(({ student }: any) => student.id);
    setSelectedAttendStudentIds((current) => {
      const next = current.filter((id) => visibleStudentIds.has(id));
      for (const id of attendedStudentIds) {
        if (!next.includes(id)) next.push(id);
      }
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
  }, [selectedAttendDate, data?.registrations]);

  const classTeacherLabel = (classData?.teachers || [])
    .map((teacher: any) => teacher.fullName)
    .filter(Boolean)
    .join(", ") || "Chưa gán";
  const classLocationLabel = classData?.location?.name || classData?.locationName || "—";
  const evaluationCriteriaIds = criteriaOverride
    ?? data?.evaluationCriteriaIds
    ?? classData?.evaluationCriteriaIds
    ?? [];
  const reviewCriteria = (allEvaluationCriteria as any[]).filter((criterion) =>
    evaluationCriteriaIds.map(String).includes(String(criterion.id)),
  );
  const criteriaOptions = (allEvaluationCriteria as any[]).map((criterion) => ({
    value: String(criterion.id),
    label: criterion.name,
  }));
  const criteriaLabel = reviewCriteria.length > 0
    ? reviewCriteria.map((criterion) => criterion.name).join(", ")
    : "Chưa xác định";
  const reviewTeachers = (classData?.teachers || [])
    .map((teacher: any) => ({ id: teacher.id, fullName: teacher.fullName }))
    .filter((teacher: any) => teacher.id && teacher.fullName);
  if (reviewTeachers.length === 0) {
    reviewTeachers.push({ id: "free-class-teacher", fullName: classTeacherLabel });
  }

  const criteriaMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("PATCH", `/api/classes/${classId}`, {
        evaluationCriteriaIds: ids.length > 0 ? ids : null,
      });
      return ids;
    },
    onSuccess: (ids) => {
      setCriteriaOverride(ids);
      setCriteriaDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      toast({ title: "Đã cập nhật tiêu chí nhận xét" });
    },
    onError: (error: any) => {
      toast({
        title: "Không thể cập nhật tiêu chí",
        description: error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (payload: {
      studentClassIds: string[];
      date: string;
      action: CalendarMode;
      status?: "registered" | "attended" | "reserved";
    }) => {
      await Promise.all(
        payload.studentClassIds.map((studentClassId) =>
          apiRequest("PATCH", `/api/classes/${classId}/free-schedule`, {
            studentClassId,
            date: payload.date,
            action: payload.action,
            value: payload.action === "register"
              ? true
              : payload.status === "attended",
            status: payload.status,
          }),
        ),
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      setBulkAttendanceDialogOpen(false);
      toast({
        title: variables.action === "register"
          ? "Đã đăng ký lịch hàng loạt"
          : "Đã cập nhật điểm danh hàng loạt",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Không thể cập nhật hàng loạt",
        description: error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const toggle = (student: any, date: string, current: any) => {
    if (!classPerm?.canEdit || updateMutation.isPending) return;
    updateMutation.mutate({
      studentClassId: student.id,
      date,
      action: "register",
      value: !current,
    });
  };

  const selectedRegisteredStudentIds = selectedStudentIds.filter((studentId) =>
    selectedDayStudentIdSet.has(studentId),
  );
  const contentDialogStudents = contentDialogDate
    ? students
        .filter((student: any) => registrations.has(`${student.id}:${contentDialogDate}`))
        .map((student: any) => ({
          id: student.id,
          name: student.fullName,
          code: student.code ?? null,
        }))
    : [];
  const runBulkRegistration = () => {
    if (!selectedDate || selectedStudentIds.length === 0 || bulkMutation.isPending) return;
    bulkMutation.mutate({
      studentClassIds: selectedStudentIds,
      date: selectedDate,
      action: "register",
    });
  };
  const openBulkAttendance = () => {
    if (!selectedDate || selectedRegisteredStudentIds.length === 0 || bulkMutation.isPending) return;
    setBulkAttendanceDialogOpen(true);
  };
  const runBulkAttendance = () => {
    if (!selectedDate || selectedRegisteredStudentIds.length === 0 || bulkMutation.isPending) return;
    bulkMutation.mutate({
      studentClassIds: selectedRegisteredStudentIds,
      date: selectedDate,
      action: "attend",
      status: bulkAttendanceStatus,
    });
  };

  const calendarInfoDate = selectedDate ?? today;
  const calendarInfoDateLabel = format(
    new Date(`${calendarInfoDate}T00:00:00`),
    "EEEE, dd/MM/yyyy",
    { locale: vi },
  );

  return (
    <div className="flex h-full min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1.5">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Chi tiết lịch học
            </span>
            <Badge className="h-6 border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700" variant="outline">
              Lớp tự do
            </Badge>
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
              {classStart && classEnd && (
                <span>Thời hạn lớp: {classStart} → {classEnd}</span>
              )}
              <span>{calendarInfoDateLabel}</span>
            </div>
          </div>
          <div className="grid gap-x-8 gap-y-2 pt-2 text-xs md:grid-cols-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="font-medium text-slate-500">Lớp:</span>
              <span className="truncate font-semibold text-blue-600">
                {classData?.name || "—"}{classData?.classCode ? ` (${classData.classCode})` : ""}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="font-medium text-slate-500">Cơ sở:</span>
              <span className="truncate font-semibold text-blue-600">{classLocationLabel}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="font-medium text-slate-500">GV:</span>
              <span className="truncate font-semibold text-blue-600">{classTeacherLabel}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="font-medium text-slate-500">Sĩ số:</span>
              <span className="font-semibold text-blue-600">{students.length} học viên</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 md:col-span-2">
              <Star className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="font-medium text-slate-500">Tiêu chí:</span>
              <span className="truncate font-semibold text-blue-600">{criteriaLabel}</span>
              {classPerm?.canEdit && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-indigo-500"
                  title="Gán tiêu chí nhận xét"
                  onClick={() => {
                    setCriteriaDraft(evaluationCriteriaIds.map(String));
                    setCriteriaDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => subMonths(d, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-28 text-center text-sm font-semibold">{format(monthDate, "MM/yyyy")}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
        <Badge variant="outline">{students.length} học viên</Badge>
        <div className="ml-auto flex items-center gap-2">
          {selectedDate && (
            <span className="hidden text-[11px] text-slate-500 lg:inline">
              Đã chọn {selectedStudentIds.length} học viên
            </span>
          )}
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!classPerm?.canEdit || !selectedDate || selectedStudentIds.length === 0 || bulkMutation.isPending}
            onClick={runBulkRegistration}
          >
            Đăng ký
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-blue-200 px-2 text-xs text-blue-700 hover:bg-blue-50"
            disabled={!classPerm?.canEdit || !selectedDate || selectedRegisteredStudentIds.length === 0 || bulkMutation.isPending}
            onClick={openBulkAttendance}
          >
            Điểm danh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
            disabled={!classPerm?.canEdit || !selectedDate}
            onClick={() => selectedDate && setContentDialogDate(selectedDate)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Nội dung
          </Button>
        </div>
      </div>
      {selectedDate && (
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Nội dung buổi học
              </span>
              <Badge variant="outline" className="bg-white text-[10px] font-medium">
                {formatStudentDate(selectedDate)}
              </Badge>
            </div>
            {isLoadingSelectedDateContents ? (
              <p className="text-xs italic text-slate-500">Đang tải nội dung...</p>
            ) : selectedCommonContents.length === 0 && selectedPersonalContents.length === 0 ? (
              <p className="text-xs italic text-slate-500">Chưa có nội dung được giao trong ngày này.</p>
            ) : (
              <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                {selectedCommonContents.length > 0 && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Nội dung chung
                    </p>
                    <div className="space-y-1">
                      {selectedCommonContents.map((content) => (
                        <div key={content.id} className="flex min-w-0 items-start gap-1.5 text-xs text-slate-700">
                          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="min-w-0 truncate font-medium" title={content.title}>
                            {content.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            ({content.contentType})
                          </span>
                          {content.dueDate && (
                            <span className="shrink-0 text-[10px] text-amber-600">
                              · Hạn {formatStudentDate(content.dueDate)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedPersonalContents.length > 0 && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Nội dung cá nhân
                    </p>
                    <div className="space-y-1">
                      {selectedPersonalContents.map((content) => (
                        <div key={content.id} className="flex min-w-0 items-start gap-1.5 text-xs text-slate-700">
                          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span className="min-w-0 truncate font-medium" title={content.title}>
                            {content.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            · {selectedContentStudentNames.get(content.studentId || "") || "Học viên"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Đang tải lịch...</div>
        ) : students.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
            Chưa có học viên đã xếp lịch trong lớp này.
          </div>
        ) : mode === "attend" && visibleDays.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
            Chưa có ngày học nào được đăng ký trong tháng này.
          </div>
        ) : mode === "attend" ? (
          <div className="space-y-4 bg-[#ECEEF4] p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Ngày điểm danh
              </span>
              {visibleDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setSelectedAttendDate(day.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedAttendDate === day.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
                </button>
              ))}
            </div>

            {selectedAttendDay && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Chi tiết lịch học
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Lớp tự do
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {format(selectedAttendDay.date, "EEEE, dd/MM/yyyy", { locale: vi })}
                    </span>
                  </div>
                  <div className="grid gap-x-6 gap-y-3 px-4 py-4 md:grid-cols-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Lớp:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">
                        {classData?.name || "—"}{classData?.classCode ? ` (${classData.classCode})` : ""}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Cơ sở:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">{classLocationLabel}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">GV:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">{classTeacherLabel}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Sĩ số:</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {selectedAttendStudents.length} học viên
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 md:col-span-2">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Đã học:</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {selectedAttendedCount}/{selectedAttendStudents.length} học viên
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 md:col-span-2">
                      <Star className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Tiêu chí:</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-blue-600">{criteriaLabel}</span>
                      {classPerm?.canEdit && (
                        <button
                          type="button"
                          className="shrink-0 text-slate-300 transition-colors hover:text-indigo-500"
                          title="Gán tiêu chí nhận xét"
                          onClick={() => {
                            setCriteriaDraft(evaluationCriteriaIds.map(String));
                            setCriteriaDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                    <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Danh sách học viên
                    </span>
                    <span className="text-xs font-medium text-slate-800">({selectedAttendStudents.length})</span>
                  </div>
                  <div className="overflow-x-auto border-t border-slate-100">
                    <div className="min-w-[752px]">
                      <div className="grid grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)] items-center gap-4 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span>
                          <Checkbox
                            checked={
                              selectedAttendStudents.length > 0
                              && selectedAttendStudents.every(({ student }: any) =>
                                selectedAttendStudentIds.includes(student.id))
                            }
                            onCheckedChange={(checked) => setSelectedAttendStudentIds(
                              checked
                                ? selectedAttendStudents.map(({ student }: any) => student.id)
                                : [],
                            )}
                            aria-label="Chọn tất cả học viên"
                          />
                        </span>
                        <span>Học viên</span>
                        <span>Trạng thái điểm danh</span>
                        <span>Ghi chú</span>
                        <span>Nhận xét</span>
                      </div>
                      {selectedAttendStudents.map(({ student, registration }: any) => {
                        const status = registration.status === "attended" || registration.status === "reserved"
                          ? registration.status
                          : "registered";
                        const statusLabel = status === "attended"
                          ? "Có học"
                          : status === "reserved"
                          ? "Bảo lưu"
                          : "Chưa điểm danh";
                        return (
                          <div
                            key={registration.id}
                            className="grid grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)] items-center gap-4 border-t border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            <Checkbox
                              checked={selectedAttendStudentIds.includes(student.id)}
                              onCheckedChange={(checked) =>
                                setSelectedAttendStudentIds((current) =>
                                  checked
                                    ? current.includes(student.id) ? current : [...current, student.id]
                                    : current.filter((id) => id !== student.id),
                                )
                              }
                              aria-label={`Chọn học viên ${student.fullName}`}
                            />
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-800">{student.fullName}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {student.code} · còn {student.remainingSessions ?? 0} buổi
                                </div>
                              </div>
                            </div>
                            <Select
                              value={status}
                              disabled={updateMutation.isPending}
                              onValueChange={(nextStatus) => {
                                updateMutation.mutate(
                                  {
                                    studentClassId: student.id,
                                    date: selectedAttendDay.value,
                                    action: "attend",
                                    value: nextStatus === "attended",
                                    status: nextStatus as "registered" | "attended" | "reserved",
                                  },
                                  {
                                    onSuccess: () => {
                                      if (nextStatus === "attended") {
                                        setSelectedAttendStudentIds((current) =>
                                          current.includes(student.id) ? current : [...current, student.id],
                                        );
                                      }
                                    },
                                  },
                                );
                              }}
                            >
                              <SelectTrigger className={cn(
                                "h-8 w-[140px] text-[11px]",
                                status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                              )}>
                                <SelectValue>{statusLabel}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="registered">
                                  <span className="flex items-center gap-2">
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                                    Chưa điểm danh
                                  </span>
                                </SelectItem>
                                <SelectItem value="attended">
                                  <span className="flex items-center gap-2">
                                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                                    Có học
                                  </span>
                                </SelectItem>
                                <SelectItem value="reserved">
                                  <span className="flex items-center gap-2">
                                    <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                                    Bảo lưu
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              disabled={!classPerm?.canEdit}
                              className={cn(
                                "group flex min-w-0 items-center gap-1 text-left text-xs",
                                classPerm?.canEdit
                                  ? "cursor-pointer hover:text-primary"
                                  : "cursor-default",
                              )}
                              onClick={() => {
                                if (!classPerm?.canEdit) return;
                                setNoteDialog({
                                  studentClassId: student.id,
                                  registrationId: registration.id,
                                  value: registration.note || "",
                                  status,
                                });
                              }}
                              title={registration.note || "Chưa có ghi chú"}
                            >
                              <span className={cn(
                                "truncate",
                                registration.note
                                  ? "text-slate-700"
                                  : "italic text-muted-foreground",
                              )}>
                                {registration.note || "Ghi chú..."}
                              </span>
                              {classPerm?.canEdit && (
                                <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                              )}
                            </button>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant={(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={!classPerm?.canEdit}
                                onClick={() => {
                                  if (!classPerm?.canEdit) return;
                                  setReviewTarget({ student, registration });
                                }}
                              >
                                {(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? (
                                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                {(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? "Xem / sửa" : "Nhập nhận xét"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="sticky left-0 z-20 min-w-52 border-b border-r bg-slate-100 px-3 py-2 text-left font-semibold">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      className="h-3.5 w-3.5"
                      checked={allSelectedDayStudents}
                      disabled={!selectedDate || selectableStudentsForDate.length === 0}
                      onCheckedChange={(checked) =>
                        setSelectedStudentIds(checked === true ? selectableStudentsForDate.map((student: any) => student.id) : [])
                      }
                      aria-label="Chọn tất cả học viên trong ngày"
                    />
                    <span>Học viên</span>
                  </div>
                </th>
                {visibleDays.map((day) => {
                  const isSelectedDay = selectedDate === day.value;
                  const isTodayColumn = today === day.value;
                  return (
                    <th
                      key={day.value}
                      className={cn(
                        "min-w-24 border-b px-1 py-1 text-center font-medium transition-colors",
                        isSelectedDay && isTodayColumn
                          ? "bg-violet-100 text-violet-800"
                          : isSelectedDay
                          ? "bg-blue-100 text-blue-800"
                          : isTodayColumn
                          ? "bg-violet-50 text-violet-800"
                          : "bg-slate-100",
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full flex-col items-center rounded-md px-1 py-1 hover:bg-blue-100/70"
                        onClick={() => setSelectedDate(day.value)}
                        aria-label={`Chọn ngày ${day.label}/${monthLabel}`}
                      >
                        <span>{day.label}</span>
                        <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
                      </button>
                    </th>
                  );
                })}
                <th className="sticky right-20 z-20 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center font-semibold shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">
                  <div>T{monthLabel}</div>
                  <div className="text-[9px] font-normal text-muted-foreground">Đăng ký</div>
                </th>
                <th className="sticky right-0 z-20 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center font-semibold">
                  <div>Điểm danh</div>
                  <div className="text-[9px] font-normal text-muted-foreground">Có học</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student: any) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-2">
                    {(() => {
                      const studentStart = String(student.startDate || classStart || "").slice(0, 10);
                      const studentEnd = String(student.endDate || classEnd || "").slice(0, 10);
                      const totalSessions = Number(student.totalSessions ?? 0);
                      const attendedSessions = Number(student.attendedSessions ?? 0);
                      const remainingSessions = Number(
                        student.remainingSessions ?? Math.max(0, totalSessions - attendedSessions),
                      );
                      const isExpired = remainingSessions <= 0 || (!!studentEnd && studentEnd < today);
                      const isExpiringSoon = !isExpired && remainingSessions <= 5;
                      const studentStatus = isExpired
                        ? "Hết hạn"
                        : isExpiringSoon
                        ? "Sắp hết hạn"
                        : "Đang học";
                      return (
                        <div className="flex items-start gap-2">
                          <Checkbox
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            checked={selectedStudentIds.includes(student.id)}
                            disabled={
                              !selectedDate
                              || (!!student.startDate && selectedDate < String(student.startDate).slice(0, 10))
                              || (!!student.endDate && selectedDate > String(student.endDate).slice(0, 10))
                            }
                            onCheckedChange={(checked) =>
                              setSelectedStudentIds((current) =>
                                checked === true
                                  ? current.includes(student.id) ? current : [...current, student.id]
                                  : current.filter((id) => id !== student.id),
                              )
                            }
                            aria-label={`Chọn học viên ${student.fullName}`}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold leading-tight text-slate-800">
                              {student.fullName}{" "}
                              <span className="font-medium text-slate-500">({student.code || "—"})</span>
                            </div>
                            <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                              {formatStudentDate(studentStart)} - {formatStudentDate(studentEnd)}
                            </div>
                            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                              Tổng: {totalSessions} <span className="text-slate-300">|</span>{" "}
                              Đã học: {attendedSessions} <span className="text-slate-300">|</span>{" "}
                              Còn lại: {remainingSessions}
                            </div>
                            <div className={cn(
                              "mt-0.5 text-[10px] font-medium leading-tight",
                              isExpired
                                ? "text-red-600"
                                : isExpiringSoon
                                ? "text-amber-600"
                                : "text-emerald-600",
                            )}>
                              Trạng thái: {studentStatus}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  {visibleDays.map((day) => {
                    const current = registrations.get(`${student.id}:${day.value}`);
                    const outside = (classStart && day.value < classStart) || (classEnd && day.value > classEnd)
                      || (student.startDate && day.value < String(student.startDate).slice(0, 10))
                      || (student.endDate && day.value > String(student.endDate).slice(0, 10));
                    const note = current
                      ? noteOverrides[current.id] ?? current.note ?? ""
                      : "";
                    const hasReview = !!(
                      current
                      && (reviewOverrides[current.id]?.reviewData ?? current.reviewData)
                    );
                    const isSelectedDay = selectedDate === day.value;
                    const isTodayColumn = today === day.value;
                    const status = current?.status === "attended" || current?.status === "reserved"
                      ? current.status
                      : "registered";
                    const statusLabel = status === "attended"
                      ? "Có học"
                      : status === "reserved"
                      ? "Bảo lưu"
                      : "Chưa điểm danh";
                    return (
                      <td
                        key={day.value}
                        className={cn(
                          "border-b px-1 py-1.5 text-center align-top transition-colors",
                          isSelectedDay && isTodayColumn
                            ? "bg-violet-50"
                            : isSelectedDay
                            ? "bg-blue-50"
                            : isTodayColumn
                            ? "bg-violet-50/70"
                            : outside
                            ? "bg-slate-50"
                            : "bg-white",
                        )}
                      >
                        <div className="flex min-h-14 flex-col items-center gap-1">
                          {!outside && (
                            <Checkbox
                              className="h-3.5 w-3.5"
                              hideIndicator
                              checked={!!current}
                              disabled={!classPerm?.canEdit || updateMutation.isPending}
                              onCheckedChange={() => toggle(student, day.value, current)}
                              aria-label={`Đăng ký ${student.fullName} ngày ${day.label}`}
                            />
                          )}
                          {current && (
                            <>
                              <Select
                                value={status}
                                disabled={!classPerm?.canEdit || updateMutation.isPending}
                                onValueChange={(nextStatus) =>
                                  updateMutation.mutate({
                                    studentClassId: student.id,
                                    date: day.value,
                                    action: "attend",
                                    value: nextStatus === "attended",
                                    status: nextStatus as "registered" | "attended" | "reserved",
                                  })
                                }
                              >
                                <SelectTrigger className={cn(
                                  "h-5 w-[74px] justify-center px-1 text-[8px]",
                                  status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                  status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                  status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                                )}>
                                  <SelectValue>{statusLabel}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="registered">Chưa điểm danh</SelectItem>
                                  <SelectItem value="attended">Có học</SelectItem>
                                  <SelectItem value="reserved">Bảo lưu</SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!classPerm?.canEdit}
                                  className="text-slate-400 hover:text-primary disabled:cursor-default disabled:opacity-50"
                                  title={note || "Ghi chú"}
                                  onClick={() => {
                                    if (!classPerm?.canEdit) return;
                                    setNoteDialog({
                                      studentClassId: student.id,
                                      registrationId: current.id,
                                      date: day.value,
                                      value: note,
                                      status,
                                    });
                                  }}
                                >
                                  <Pencil className={cn(
                                    "h-3 w-3 stroke-[2.5]",
                                    note
                                      ? "fill-blue-800 text-blue-800"
                                      : "text-slate-400",
                                  )} />
                                </button>
                                <button
                                  type="button"
                                  disabled={!classPerm?.canEdit}
                                  className="text-slate-400 hover:text-yellow-500 disabled:cursor-default disabled:opacity-50"
                                  title={hasReview ? "Xem / sửa nhận xét" : "Nhập nhận xét"}
                                  onClick={() => {
                                    if (!classPerm?.canEdit) return;
                                    setReviewTarget({ student, registration: current });
                                  }}
                                >
                                  {hasReview
                                    ? <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />
                                    : <Plus className="h-3 w-3" />}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  {(() => {
                    const stats = monthlyStats.get(student.id) ?? { registered: 0, attended: 0 };
                    return (
                      <>
                        <td className="sticky right-20 z-10 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center text-xs font-semibold text-slate-700 shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">
                          {stats.registered}
                        </td>
                        <td className="sticky right-0 z-10 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center text-xs font-semibold text-slate-700">
                          {stats.attended}/{stats.registered}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog
        open={!!noteDialog}
        onOpenChange={(open) => {
          if (!open) setNoteDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Ghi chú</DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            className="min-h-[100px] resize-none text-sm"
            placeholder="Nhập ghi chú..."
            value={noteDialog?.value ?? ""}
            onChange={(event) =>
              setNoteDialog((current) => current
                ? { ...current, value: event.target.value }
                : current)
            }
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteDialog(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={updateMutation.isPending || !noteDialog}
              onClick={() => {
                const date = noteDialog?.date ?? selectedAttendDay?.value;
                if (!noteDialog || !date) return;
                updateMutation.mutate(
                  {
                    studentClassId: noteDialog.studentClassId,
                    date,
                    action: "attend",
                    value: noteDialog.status === "attended",
                    status: noteDialog.status,
                    note: noteDialog.value,
                  },
                  {
                    onSuccess: () => {
                      if (noteDialog.registrationId) {
                        setNoteOverrides((current) => ({
                          ...current,
                          [noteDialog.registrationId as string]: noteDialog.value,
                        }));
                      }
                      setNoteDialog(null);
                      toast({ title: "Đã cập nhật ghi chú" });
                    },
                  },
                );
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bulkAttendanceDialogOpen}
        onOpenChange={(open) => {
          if (!bulkMutation.isPending) setBulkAttendanceDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Điểm danh nhanh</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Cập nhật trạng thái cho {selectedRegisteredStudentIds.length} học viên đã chọn trong ngày{" "}
              <strong className="text-slate-700">{selectedDate ? formatStudentDate(selectedDate) : "—"}</strong>.
            </p>
            <Select
              value={bulkAttendanceStatus}
              disabled={bulkMutation.isPending}
              onValueChange={(value) =>
                setBulkAttendanceStatus(value as "registered" | "attended" | "reserved")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="registered">Chưa điểm danh</SelectItem>
                <SelectItem value="attended">Có học</SelectItem>
                <SelectItem value="reserved">Bảo lưu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkMutation.isPending}
              onClick={() => setBulkAttendanceDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={bulkMutation.isPending || selectedRegisteredStudentIds.length === 0}
              onClick={runBulkAttendance}
            >
              {bulkMutation.isPending ? "Đang lưu..." : "Lưu điểm danh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={criteriaDialogOpen}
        onOpenChange={(open) => {
          if (!open && !criteriaMutation.isPending) setCriteriaDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Gán tiêu chí nhận xét</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              Chọn các tiêu chí sẽ xuất hiện trong biểu mẫu nhận xét của học viên lớp tự do.
            </p>
            <SearchableMultiSelect
              options={criteriaOptions}
              value={criteriaDraft}
              onChange={setCriteriaDraft}
              placeholder="Chọn tiêu chí..."
              searchPlaceholder="Tìm tiêu chí..."
              disabled={criteriaMutation.isPending}
              data-testid="select-free-class-evaluation-criteria"
            />
            {criteriaOptions.length === 0 && (
              <p className="text-xs text-amber-600">
                Chưa có tiêu chí đánh giá. Vui lòng tạo tiêu chí trong cấu hình giáo dục trước.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={criteriaMutation.isPending}
              onClick={() => setCriteriaDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={criteriaMutation.isPending}
              onClick={() => criteriaMutation.mutate(criteriaDraft)}
            >
              {criteriaMutation.isPending ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SessionContentDialog
        isOpen={!!contentDialogDate}
        onOpenChange={(open) => {
          if (!open) setContentDialogDate(null);
        }}
        classSessionId={contentDialogDate ? `free-${classId}__${contentDialogDate}` : ""}
        freeClassId={classId}
        freeSessionDate={contentDialogDate ?? undefined}
        freeStudents={contentDialogStudents}
      />
      <ReviewDialog
        open={!!reviewTarget}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
        studentSessionIds={[]}
        studentNames={reviewTarget ? [reviewTarget.student.fullName] : []}
        criteria={reviewCriteria}
        teachers={reviewTeachers}
        existingReviewData={reviewTarget
          ? reviewOverrides[reviewTarget.registration.id]?.reviewData
            ?? reviewTarget.registration.reviewData
            ?? null
          : null}
        existingPublished={reviewTarget
          ? reviewOverrides[reviewTarget.registration.id]?.published
            ?? reviewTarget.registration.reviewPublished
            ?? false
          : false}
        classSessionId=""
        freeReview={reviewTarget ? {
          classId,
          registrationId: reviewTarget.registration.id,
        } : undefined}
        onSaved={(reviewData, published) => {
          if (!reviewTarget) return;
          setReviewOverrides((current) => ({
            ...current,
            [reviewTarget.registration.id]: { reviewData, published },
          }));
        }}
      />
    </div>
  );
}