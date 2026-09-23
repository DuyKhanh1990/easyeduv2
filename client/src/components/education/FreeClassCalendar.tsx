import { useEffect, useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, startOfMonth, subMonths } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CalendarDays,
  BookOpen,
  UserRound,
  Star,
  HelpCircle,
  PauseCircle,
  Pencil,
  Plus,
  Search,
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
  initialDate?: string | null;
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

const getRemainingDays = (today: string, end: string) => {
  if (!today || !end) return null;
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(todayTime) || !Number.isFinite(endTime)) return null;
  if (endTime < todayTime) return 0;
  return Math.floor((endTime - todayTime) / (24 * 60 * 60 * 1000)) + 1;
};

const normalizeSearchText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi");

const formatAssignmentTime = (startTime?: string | null, endTime?: string | null) => {
  const formatTime = (value?: string | null) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = match[2];
    const period = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 || 12;
    return `${String(displayHour).padStart(2, "0")}:${minute} ${period}`;
  };
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  const startPeriod = start.slice(-2);
  const endPeriod = end.slice(-2);
  return startPeriod === endPeriod
    ? `${start.slice(0, -3)} - ${end}`
    : `${start} - ${end}`;
};

function parseCalendarDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function FreeClassCalendar({ classId, classData, classPerm, initialDate }: FreeClassCalendarProps) {
  const requestedDate = parseCalendarDate(initialDate);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(requestedDate ?? new Date()));
  const [mode, setMode] = useState<CalendarMode>(() =>
    classData?.freeClassMode === "self_practice" ? "attend" : "register",
  );
  const [selectedAttendDate, setSelectedAttendDate] = useState<string | null>(null);
  const [selectedAttendTab, setSelectedAttendTab] = useState<string>("all");
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
  const [assignmentEditor, setAssignmentEditor] = useState<{
    scope: "day" | "student";
    studentClassId: string;
    date: string;
    studentName: string;
    teacherId: string;
    shiftTemplateId: string;
  } | null>(null);
  const [bulkAttendanceDialogOpen, setBulkAttendanceDialogOpen] = useState(false);
  const [bulkAttendanceStatus, setBulkAttendanceStatus] = useState<
    "registered" | "attended" | "reserved"
  >("attended");
  const [historyStudent, setHistoryStudent] = useState<any | null>(null);
  const [allStudentsSearch, setAllStudentsSearch] = useState("");
  const [allStudentsPage, setAllStudentsPage] = useState(1);
  const [registrationTab, setRegistrationTab] = useState("all");
  const [bulkRegisterStudentIds, setBulkRegisterStudentIds] = useState<string[]>([]);
  const [bulkRegisterDates, setBulkRegisterDates] = useState<string[]>([]);
  const [registrationPlannerOpen, setRegistrationPlannerOpen] = useState(false);
  const isSelfPractice = classData?.freeClassMode === "self_practice";
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
  const {
    data: studentHistory,
    isLoading: isLoadingStudentHistory,
  } = useQuery<{
    student?: {
      fullName?: string;
      code?: string | null;
    };
    sessions?: Array<{
      id: string;
      sessionIndex: number;
      sessionDate: string;
      status: "attended" | "reserved";
      note?: string | null;
      shiftName?: string | null;
      shiftStart?: string | null;
      shiftEnd?: string | null;
    }>;
  }>({
    queryKey: [
      `/api/classes/${classId}/free-schedule/student-history`,
      historyStudent?.id,
    ],
    queryFn: async () => {
      const path = `/api/classes/${classId}/free-schedule/student-history?studentClassId=${encodeURIComponent(historyStudent!.id)}`;
      const response = await fetch(path, { credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải lịch học của học viên");
      return response.json();
    },
    enabled: isSelfPractice && !!historyStudent?.id,
  });
  const { data: allEvaluationCriteria = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
  });
  const locationId = classData?.locationId || classData?.location?.id;
  const { data: availableTeachers = [] } = useQuery<any[]>({
    queryKey: [locationId ? `/api/staff?locationId=${locationId}&minimal=true` : "/api/staff?minimal=true"],
    enabled: !!locationId,
  });
  const { data: availableShifts = [] } = useQuery<any[]>({
    queryKey: [locationId ? `/api/shift-templates?locationId=${locationId}&type=class` : "/api/shift-templates?type=class"],
    enabled: !!locationId,
  });
  const teachersById = useMemo(
    () => new Map(availableTeachers.map((teacher: any) => [String(teacher.id), teacher])),
    [availableTeachers],
  );
  const shiftsById = useMemo(
    () => new Map(availableShifts.map((shift: any) => [String(shift.id), shift])),
    [availableShifts],
  );
  const getAssignmentSummary = (teacherId?: string | null, shiftTemplateId?: string | null) => {
    const teacher = teacherId ? teachersById.get(String(teacherId)) : null;
    const shift = shiftTemplateId ? shiftsById.get(String(shiftTemplateId)) : null;
    return {
      teacherLabel: teacher
        ? `${teacher.fullName || teacher.name || teacher.code || "Giáo viên"}${teacher.code ? ` (${teacher.code})` : ""}`
        : "",
      timeLabel: formatAssignmentTime(shift?.startTime, shift?.endTime),
    };
  };

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

  const assignmentMutation = useMutation({
    mutationFn: async (payload: {
      scope: "day" | "student";
      date: string;
      studentClassId?: string;
      teacherId: string | null;
      shiftTemplateId: string | null;
    }) => {
      await apiRequest("PATCH", `/api/classes/${classId}/free-schedule/assignment`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      setAssignmentEditor(null);
      toast({ title: "Đã cập nhật phân công giáo viên" });
    },
    onError: (error: any) => toast({
      title: "Không thể cập nhật phân công",
      description: error?.message || "Vui lòng thử lại.",
      variant: "destructive",
    }),
  });

  const days = useMemo(() => {
    const count = getDaysInMonth(monthDate);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
      return {
        date,
        value: format(date, "yyyy-MM-dd"),
        label: index + 1,
        weekday: format(date, "EEE", { locale: vi }),
      };
    });
  }, [monthDate]);

  const registrations = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of data?.registrations || []) map.set(`${row.studentClassId}:${row.registrationDate}`, row);
    return map;
  }, [data?.registrations]);
  const dayAssignments = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of data?.dayAssignments || []) {
      map.set(String(row.assignmentDate).slice(0, 10), row);
    }
    return map;
  }, [data?.dayAssignments]);

  const students = (data?.students || []).filter((student: any) => student.status === "active");
  const classStart = String(classData?.startDate || "").slice(0, 10);
  const classEnd = String(classData?.endDate || "").slice(0, 10);
  const today = format(new Date(), "yyyy-MM-dd");
  const monthLabel = format(monthDate, "M");
  const canRegisterStudentForDate = (student: any, date: string) => {
    const studentStart = String(student.startDate || classStart || "").slice(0, 10);
    const studentEnd = String(student.endDate || classEnd || "").slice(0, 10);
    if (
      date < today
      || (classStart && date < classStart)
      || (classEnd && date > classEnd)
    ) return false;
    if ((studentStart && date < studentStart) || (studentEnd && date > studentEnd)) return false;
    const totalSessions = Number(student.totalSessions ?? 0);
    if (totalSessions <= 0) return true;
    const attendedSessions = Number(student.attendedSessions ?? 0);
    const remainingSessions = Number(
      student.remainingSessions ?? Math.max(0, totalSessions - attendedSessions),
    );
    return remainingSessions > 0;
  };
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
    const stats = new Map<string, { registered: number; attended: number; totalSchedule: number }>();
    for (const student of students) {
      const registrationsInMonth = days
        .map((day) => registrations.get(`${student.id}:${day.value}`))
        .filter(Boolean);
      stats.set(student.id, {
        registered: registrationsInMonth.length,
        attended: registrationsInMonth.filter((registration: any) => registration.status === "attended").length,
        totalSchedule: Number(student.totalSessions ?? 0),
      });
    }
    return stats;
  }, [days, registrations, students]);
  const allStudentsFiltered = useMemo(() => {
    const keyword = normalizeSearchText(allStudentsSearch.trim());
    if (!keyword) return students;
    return students.filter((student: any) =>
      [student.fullName, student.code]
        .some((value) => normalizeSearchText(value).includes(keyword)),
    );
  }, [allStudentsSearch, students]);
  const allStudentsPageCount = Math.max(1, Math.ceil(allStudentsFiltered.length / 20));
  const allStudentsPageRows = allStudentsFiltered.slice(
    (allStudentsPage - 1) * 20,
    allStudentsPage * 20,
  );
  useEffect(() => {
    setAllStudentsPage(1);
  }, [allStudentsSearch]);
  useEffect(() => {
    setAllStudentsPage((current) => Math.min(current, allStudentsPageCount));
  }, [allStudentsPageCount]);
  useEffect(() => {
    if (isSelfPractice) return;
    setRegistrationTab("all");
    setBulkRegisterDates([]);
  }, [isSelfPractice, month]);
  useEffect(() => {
    if (bulkRegisterStudentIds.length === 0) {
      setRegistrationPlannerOpen(false);
      setBulkRegisterDates([]);
    }
  }, [bulkRegisterStudentIds.length]);
  const visibleDays = mode === "attend"
    ? days.filter((day) => isSelfPractice
      ? (
          (day.value === today && students.some((student: any) =>
            (!student.startDate || day.value >= String(student.startDate).slice(0, 10))
            && (!student.endDate || day.value <= String(student.endDate).slice(0, 10)),
          ))
          || students.some((student: any) => {
            const registration = registrations.get(`${student.id}:${day.value}`);
            return registration && registration.status !== "registered";
          })
        )
      : students.some((student: any) => registrations.has(`${student.id}:${day.value}`)))
    : days.filter((day) =>
        (!scheduleWindow.start || day.value >= scheduleWindow.start)
        && (!scheduleWindow.end || day.value <= scheduleWindow.end),
      );
  const registrationDays = useMemo(
    () => days.filter((day) =>
      students.some((student: any) => registrations.has(`${student.id}:${day.value}`)),
    ),
    [days, registrations, students],
  );
  const selectedRegistrationDay = registrationTab === "all"
    ? null
    : registrationDays.find((day) => day.value === registrationTab) ?? null;
  const selectedRegistrationStudents = selectedRegistrationDay
    ? students
        .map((student: any) => ({
          student,
          registration: registrations.get(`${student.id}:${selectedRegistrationDay.value}`),
        }))
        .filter(({ registration }: any) => !!registration)
    : [];
  const isSummaryTab =
    (isSelfPractice && selectedAttendTab === "all")
    || (!isSelfPractice && registrationTab === "all");
  const registerableStudentsOnPage = allStudentsPageRows.filter((student: any) =>
    days.some((day) => canRegisterStudentForDate(student, day.value)),
  );
  const allRegisterableStudentsOnPageSelected = registerableStudentsOnPage.length > 0
    && registerableStudentsOnPage.every((student: any) => bulkRegisterStudentIds.includes(student.id));
  const selectedRegistrationPairs = bulkRegisterStudentIds.flatMap((studentClassId) => {
    const student = students.find((candidate: any) => candidate.id === studentClassId);
    if (!student) return [];
    return bulkRegisterDates
      .filter((date) => canRegisterStudentForDate(student, date))
      .map((date) => ({ studentClassId, date }));
  });
  const canSelectRegistrationDate = (date: string) =>
    (!classStart || date >= classStart)
    && (!classEnd || date <= classEnd)
    && (bulkRegisterStudentIds.length === 0
      || bulkRegisterStudentIds.some((studentClassId) => {
        const student = students.find((candidate: any) => candidate.id === studentClassId);
        return student && canRegisterStudentForDate(student, date);
      }));

  useEffect(() => {
    if (isSelfPractice) setMode("attend");
  }, [isSelfPractice]);

  useEffect(() => {
    if (!requestedDate) return;
    const requestedDateValue = format(requestedDate, "yyyy-MM-dd");
    setMonthDate(startOfMonth(requestedDate));
    setSelectedDate(requestedDateValue);
    setSelectedAttendDate(requestedDateValue);
    if (isSelfPractice) setSelectedAttendTab(requestedDateValue);
  }, [initialDate, isSelfPractice]);

  useEffect(() => {
    const currentMonth = today.slice(0, 7);
    setSelectedDate((current) => {
      if (current && visibleDays.some((day) => day.value === current)) return current;
      const requestedDateValue = requestedDate ? format(requestedDate, "yyyy-MM-dd") : null;
      if (requestedDateValue && month === requestedDateValue.slice(0, 7)
        && visibleDays.some((day) => day.value === requestedDateValue)) {
        return requestedDateValue;
      }
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
    setSelectedAttendTab((current) => {
      if (!isSelfPractice) return visibleDays[0]?.value ?? "all";
      if (current === "all" || visibleDays.some((day) => day.value === current)) return current;
      return visibleDays[0]?.value ?? "all";
    });
  }, [isSelfPractice, mode, month, visibleDays]);

  const selectedAttendDay = isSelfPractice && selectedAttendTab === "all"
    ? null
    : visibleDays.find((day) => day.value === selectedAttendDate) ?? null;
  const selectedCommonContents = selectedDateContents?.common ?? [];
  const selectedPersonalContents = selectedDateContents?.personal ?? [];
  const selectedContentStudentNames = useMemo(
    () => new Map(students.map((student: any) => [student.id, student.fullName])),
    [students],
  );
  const selectedAttendStudents = selectedAttendDay
    ? students
        .filter((student: any) =>
          (!student.startDate || selectedAttendDay.value >= String(student.startDate).slice(0, 10))
          && (!student.endDate || selectedAttendDay.value <= String(student.endDate).slice(0, 10)),
        )
        .map((student: any) => ({
          student,
          registration: registrations.get(`${student.id}:${selectedAttendDay.value}`),
        }))
        .filter(({ registration }: any) =>
          isSelfPractice
            ? selectedAttendDay.value === today || (registration && registration.status !== "registered")
            : !!registration,
        )
    : [];
  useEffect(() => {
    const visibleStudentIds = new Set(selectedAttendStudents.map(({ student }: any) => student.id));
    const attendedStudentIds = selectedAttendStudents
      .filter(({ registration }: any) => registration?.status === "attended")
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

  const bulkRegisterMutation = useMutation({
    mutationFn: async (payload: { studentClassIds: string[]; dates: string[] }) => {
      const response = await apiRequest(
        "POST",
        `/api/classes/${classId}/free-schedule/bulk-register`,
        payload,
      );
      return response.json();
    },
    onSuccess: (result: {
      createdCount?: number;
      alreadyRegisteredCount?: number;
      skippedCount?: number;
    }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      setBulkRegisterDates([]);
      setBulkRegisterStudentIds([]);
      setRegistrationPlannerOpen(false);
      toast({
        title: `Đã đăng ký ${Number(result?.createdCount || 0)} lượt`,
        description: [
          Number(result?.alreadyRegisteredCount || 0) > 0
            ? `${result.alreadyRegisteredCount} lượt đã có sẵn`
            : "",
          Number(result?.skippedCount || 0) > 0
            ? `${result.skippedCount} lượt không hợp lệ hoặc hết buổi`
            : "",
        ].filter(Boolean).join(" · ") || undefined,
      });
    },
    onError: (error: any) => toast({
      title: "Không thể đăng ký lịch hàng loạt",
      description: error?.message || "Vui lòng thử lại.",
      variant: "destructive",
    }),
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
        .filter((student: any) =>
          isSelfPractice
            ? (!student.startDate || contentDialogDate >= String(student.startDate).slice(0, 10))
              && (!student.endDate || contentDialogDate <= String(student.endDate).slice(0, 10))
            : registrations.has(`${student.id}:${contentDialogDate}`),
        )
        .map((student: any) => ({
          id: student.id,
          name: student.fullName,
          code: student.code ?? null,
        }))
    : [];
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

  return (
    <div className="flex h-full min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="font-semibold text-blue-600">
            {classData?.name || "—"}{classData?.classCode ? ` (${classData.classCode})` : ""}
          </span>
          <Badge className="h-6 border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700" variant="outline">
            Lớp tự do
          </Badge>
          <span className="text-slate-300">|</span>
          <span className="font-medium text-slate-500">Cơ sở:</span>
          <span className="font-semibold text-blue-600">{classData?.location?.name || classData?.locationName || "—"}</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium text-slate-500">GV:</span>
          <span className="font-semibold text-blue-600">{classTeacherLabel}</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium text-slate-500">Tiêu chí:</span>
          <span className="font-semibold text-blue-600">{criteriaLabel}</span>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => subMonths(d, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-28 text-center text-sm font-semibold">{format(monthDate, "MM/yyyy")}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
        <Badge variant="outline">{students.length} học viên</Badge>
        <div className="ml-auto flex items-center gap-2">
          {selectedDate && !isSummaryTab && (
            <span className="hidden text-[11px] text-slate-500 lg:inline">
              Đã chọn {selectedStudentIds.length} học viên
            </span>
          )}
          {!isSelfPractice && !isSummaryTab && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-blue-200 px-2 text-xs text-blue-700 hover:bg-blue-50"
                disabled={!classPerm?.canEdit || !selectedDate || selectedRegisteredStudentIds.length === 0 || bulkMutation.isPending}
                onClick={openBulkAttendance}
              >
                Điểm danh
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
            disabled={!classPerm?.canEdit || !selectedDate || isSummaryTab}
            onClick={() => selectedDate && setContentDialogDate(selectedDate)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Nội dung
          </Button>
        </div>
      </div>
      {selectedDate
        && !(isSelfPractice && selectedAttendTab === "all")
        && (isLoadingSelectedDateContents || selectedCommonContents.length > 0 || selectedPersonalContents.length > 0)
        && (
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
                            · {String(selectedContentStudentNames.get(content.studentId || "") || "Học viên")}
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
        ) : mode === "attend" && visibleDays.length === 0 && !isSelfPractice ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
            Chưa có ngày học nào được đăng ký trong tháng này.
          </div>
        ) : (mode === "attend" || !isSelfPractice) ? (
          <div className="space-y-4 bg-[#ECEEF4] p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {isSelfPractice ? "Ngày điểm danh" : "Ngày đã đăng ký"}
              </span>
              {!isSelfPractice && (
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationTab("all");
                    setSelectedDate(null);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    registrationTab === "all"
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">Tất cả</span>
                  <span className="text-[10px] text-muted-foreground">{students.length} học viên</span>
                </button>
              )}
              {isSelfPractice && (
                <button
                  type="button"
                  onClick={() => setSelectedAttendTab("all")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    selectedAttendTab === "all"
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">Tất cả</span>
                  <span className="text-[10px] text-muted-foreground">{students.length} học viên</span>
                </button>
              )}
              {(isSelfPractice ? visibleDays : registrationDays).map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => {
                    if (isSelfPractice) {
                      setSelectedAttendTab(day.value);
                      setSelectedAttendDate(day.value);
                    } else {
                      setRegistrationTab(day.value);
                      setSelectedDate(day.value);
                    }
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    (isSelfPractice ? selectedAttendTab : registrationTab) === day.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
                </button>
              ))}
            </div>

            {(isSelfPractice && selectedAttendTab === "all")
              || (!isSelfPractice && registrationTab === "all") ? (
              <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Tổng hợp học viên
                    </span>
                    <span className="text-xs font-medium text-slate-800">
                      ({allStudentsFiltered.length})
                    </span>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    {!isSelfPractice && (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-8 gap-1.5 text-xs"
                        disabled={!classPerm?.canEdit || bulkRegisterStudentIds.length === 0}
                        onClick={() => setRegistrationPlannerOpen(true)}
                      >
                        Đăng ký
                      </Button>
                    )}
                    <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={allStudentsSearch}
                      onChange={(event) => setAllStudentsSearch(event.target.value)}
                      placeholder="Tìm tên hoặc mã học viên..."
                      aria-label="Tìm học viên"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className={cn(
                    "w-full border-collapse text-xs",
                    isSelfPractice ? "min-w-[900px]" : "min-w-[1020px]",
                  )}>
                    <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        {!isSelfPractice && (
                          <th className="w-12 px-2 py-2.5 text-center">
                            <Checkbox
                              checked={allRegisterableStudentsOnPageSelected}
                              disabled={registerableStudentsOnPage.length === 0}
                              onCheckedChange={(checked) => {
                                const pageIds = registerableStudentsOnPage.map((student: any) => student.id);
                                setBulkRegisterStudentIds((current) =>
                                  checked === true
                                    ? Array.from(new Set([...current, ...pageIds]))
                                    : current.filter((id) => !pageIds.includes(id)),
                                );
                              }}
                              aria-label="Chọn học viên có thể đăng ký trong trang này"
                            />
                          </th>
                        )}
                        <th className="px-4 py-2.5 text-left">Học viên</th>
                        <th className="px-3 py-2.5 text-center">Tổng</th>
                        <th className="px-3 py-2.5 text-center">Đã học</th>
                        <th className="px-3 py-2.5 text-center">Còn lại</th>
                        <th className="px-3 py-2.5 text-left">Hạn sử dụng</th>
                        <th className="px-3 py-2.5 text-left">Trạng thái</th>
                        <th className="px-4 py-2.5 text-center">{isSelfPractice ? "Lịch" : "Đã đăng ký"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStudentsPageRows.length === 0 ? (
                        <tr>
                          <td colSpan={isSelfPractice ? 7 : 8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                            Không tìm thấy học viên phù hợp.
                          </td>
                        </tr>
                      ) : (
                        allStudentsPageRows.map((student: any) => {
                          const studentStart = String(student.startDate || classStart || "").slice(0, 10);
                          const studentEnd = String(student.endDate || classEnd || "").slice(0, 10);
                          const totalSessions = Number(student.totalSessions ?? 0);
                          const attendedSessions = Number(student.attendedSessions ?? 0);
                          const remainingSessions = Number(
                            student.remainingSessions ?? Math.max(0, totalSessions - attendedSessions),
                          );
                          const isExpired = !!studentEnd && studentEnd < today;
                          const statusLabel = totalSessions <= 0
                            ? "Chưa cấp buổi"
                            : isExpired
                            ? "Hết hạn"
                            : remainingSessions <= 0
                            ? "Hết buổi"
                            : remainingSessions <= 5
                            ? "Sắp hết buổi"
                            : "Còn hạn";
                          const statusClass = statusLabel === "Còn hạn"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : statusLabel === "Sắp hết buổi"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-red-200 bg-red-50 text-red-700";
                          const canSelectStudent = days.some((day) =>
                            canRegisterStudentForDate(student, day.value),
                          );
                          const registeredDayCount = days.filter((day) =>
                            registrations.has(`${student.id}:${day.value}`),
                          ).length;
                          return (
                            <tr key={student.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                              {!isSelfPractice && (
                                <td className="px-2 py-3 text-center">
                                  <Checkbox
                                    checked={bulkRegisterStudentIds.includes(student.id)}
                                    disabled={!canSelectStudent}
                                    onCheckedChange={(checked) =>
                                      setBulkRegisterStudentIds((current) =>
                                        checked === true
                                          ? current.includes(student.id) ? current : [...current, student.id]
                                          : current.filter((id) => id !== student.id),
                                      )
                                    }
                                    aria-label={`Chọn học viên ${student.fullName} để đăng ký`}
                                  />
                                </td>
                              )}
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-800">{student.fullName}</div>
                                <div className="mt-0.5 text-[11px] text-slate-500">{student.code || "—"}</div>
                              </td>
                              <td className="px-3 py-3 text-center font-medium text-slate-700">{totalSessions}</td>
                              <td className="px-3 py-3 text-center font-medium text-emerald-700">{attendedSessions}</td>
                              <td className="px-3 py-3 text-center font-semibold text-blue-700">{remainingSessions}</td>
                              <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                {formatStudentDate(studentStart)} – {formatStudentDate(studentEnd)}
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", statusClass)}>
                                  {statusLabel}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isSelfPractice ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    onClick={() => setHistoryStudent(student)}
                                  >
                                    <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                                    Lịch
                                  </Button>
                                ) : (
                                  <span className="text-xs font-medium text-slate-600">
                                    {registeredDayCount} ngày
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  <span>
                    {allStudentsFiltered.length === 0
                      ? "0 học viên"
                      : `Hiển thị ${(allStudentsPage - 1) * 20 + 1}–${Math.min(allStudentsPage * 20, allStudentsFiltered.length)} / ${allStudentsFiltered.length} học viên`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={allStudentsPage <= 1}
                      onClick={() => setAllStudentsPage((page) => Math.max(1, page - 1))}
                    >
                      Trước
                    </Button>
                    <span className="min-w-20 text-center">
                      Trang {allStudentsPage}/{allStudentsPageCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={allStudentsPage >= allStudentsPageCount}
                      onClick={() => setAllStudentsPage((page) => Math.min(allStudentsPageCount, page + 1))}
                    >
                      Sau
                    </Button>
                  </div>
                </div>
                {!isSelfPractice && (
                  <Dialog open={registrationPlannerOpen} onOpenChange={setRegistrationPlannerOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
                          <DialogTitle>Đăng ký lịch học</DialogTitle>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setMonthDate((date) => subMonths(date, 1))}
                              aria-label="Tháng trước"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-28 text-center text-sm font-semibold capitalize text-slate-800">
                              {format(monthDate, "'Tháng' M/yyyy", { locale: vi })}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setMonthDate((date) => addMonths(date, 1))}
                              aria-label="Tháng sau"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </DialogHeader>
                      <div className="border-t border-slate-100 bg-slate-50/70 px-1 py-2 sm:px-2">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                          Chọn ngày đăng ký
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Có thể chọn nhiều ngày cho nhiều học viên cùng lúc.
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-blue-700">
                        Đã chọn {bulkRegisterStudentIds.length} học viên · {bulkRegisterDates.length} ngày
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 md:grid-cols-14">
                      {days.map((day) => {
                        const selected = bulkRegisterDates.includes(day.value);
                        const canSelect = canSelectRegistrationDate(day.value);
                        const registeredCount = students.filter((student: any) =>
                          registrations.has(`${student.id}:${day.value}`),
                        ).length;
                        return (
                          <button
                            key={day.value}
                            type="button"
                            disabled={!canSelect || bulkRegisterMutation.isPending}
                            onClick={() => setBulkRegisterDates((current) =>
                              selected
                                ? current.filter((value) => value !== day.value)
                                : [...current, day.value].sort(),
                            )}
                            className={cn(
                              "relative rounded-md border px-1 py-1.5 text-center text-xs transition-colors",
                              selected
                                ? "border-blue-500 bg-blue-100 text-blue-800 shadow-sm"
                                : canSelect
                                ? "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                                : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300",
                            )}
                            title={registeredCount > 0 ? `${registeredCount} học viên đã đăng ký` : undefined}
                          >
                            <span className="block font-semibold">{day.label}</span>
                            <span className="block text-[9px]">{day.weekday}</span>
                            {registeredCount > 0 && (
                              <span className="mt-0.5 block text-[9px] text-emerald-600">
                                {registeredCount} đã đăng ký
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        Số lượt hợp lệ: <strong className="text-slate-700">{selectedRegistrationPairs.length}</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={
                          !classPerm?.canEdit
                          || selectedRegistrationPairs.length === 0
                          || bulkRegisterMutation.isPending
                        }
                        onClick={() => bulkRegisterMutation.mutate({
                          studentClassIds: bulkRegisterStudentIds,
                          dates: bulkRegisterDates,
                        })}
                      >
                        {bulkRegisterMutation.isPending ? "Đang đăng ký..." : "Đăng ký các ngày đã chọn"}
                      </Button>
                    </div>
                  </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : selectedAttendDay ? (
              <>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                    <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Danh sách học viên
                    </span>
                    <span className="text-xs font-medium text-slate-800">({selectedAttendStudents.length})</span>
                  </div>
                  <div className="overflow-x-auto border-t border-slate-100">
                     <div className={isSelfPractice ? "min-w-[880px]" : "min-w-[752px]"}>
                       <div className={cn(
                         "grid items-center gap-4 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500",
                         isSelfPractice
                           ? "grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)_minmax(110px,.35fr)]"
                           : "grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)]",
                       )}>
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
                          {isSelfPractice && <span>Lịch</span>}
                      </div>
                      {selectedAttendStudents.map(({ student, registration }: any) => {
                        const status = registration?.status === "attended" || registration?.status === "reserved"
                          ? registration.status
                          : "registered";
                        const statusLabel = status === "attended"
                          ? "Có học"
                          : status === "reserved"
                          ? "Bảo lưu"
                          : "Chưa điểm danh";
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
                          ? "Sắp Hết hạn"
                          : "Còn Hạn";
                        const remainingDays = getRemainingDays(today, studentEnd);
                        return (
                          <div
                            key={`${student.id}:${selectedAttendDay.value}`}
                            className={cn(
                              "grid items-center gap-4 border-t border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50",
                              isSelfPractice
                                ? "grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)_minmax(110px,.35fr)]"
                                : "grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)]",
                            )}
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
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="min-w-0">
                                <div className="text-base font-semibold leading-tight text-slate-800">
                                  {student.fullName}{" "}
                                  <span className="text-sm font-medium text-slate-500">({student.code || "—"})</span>
                                </div>
                                <div className="mt-1.5 !text-[12px] leading-4 text-slate-500">
                                  · Còn{" "}
                                  <span className="font-semibold text-red-600">
                                    {remainingSessions}/{totalSessions}
                                  </span>{" "}
                                  Buổi
                                </div>
                                <div className="mt-0.5 !text-[12px] leading-4 text-slate-500">
                                  · {formatStudentDate(studentStart)} – {formatStudentDate(studentEnd)}
                                  {remainingDays != null && (
                                    <span className="font-medium text-blue-600"> ({remainingDays} ngày)</span>
                                  )}
                                </div>
                                <div className={cn(
                                  "mt-0.5 !text-[12px] font-medium leading-4",
                                  isExpired
                                    ? "text-red-600"
                                    : isExpiringSoon
                                      ? "text-orange-600"
                                    : "text-blue-600",
                                )}>
                                  · Trạng thái: {studentStatus}
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
                                "h-8 w-[140px] !text-[11px] leading-[13px]",
                                status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                              )}>
                                <SelectValue className="!text-[11px] leading-[13px]">{statusLabel}</SelectValue>
                              </SelectTrigger>
                              <SelectContent className="text-[11px]">
                                <SelectItem value="registered">
                                  <span className="flex items-center gap-2 text-[11px]">
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                                    Chưa điểm danh
                                  </span>
                                </SelectItem>
                                <SelectItem value="attended">
                                  <span className="flex items-center gap-2 text-[11px]">
                                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                                    Có học
                                  </span>
                                </SelectItem>
                                <SelectItem value="reserved">
                                  <span className="flex items-center gap-2 text-[11px]">
                                    <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                                    Bảo lưu
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              disabled={!classPerm?.canEdit || !registration?.id}
                              className={cn(
                                "group flex min-w-0 items-center gap-1 text-left text-xs",
                                classPerm?.canEdit && registration?.id
                                  ? "cursor-pointer hover:text-primary"
                                  : "cursor-default",
                              )}
                              onClick={() => {
                                if (!classPerm?.canEdit || !registration?.id) return;
                                setNoteDialog({
                                  studentClassId: student.id,
                                  registrationId: registration.id,
                                  value: registration.note || "",
                                  status,
                                });
                              }}
                               title={registration?.note || "Chưa có ghi chú"}
                            >
                              <span className={cn(
                                "truncate",
                                 registration?.note
                                  ? "text-slate-700"
                                  : "italic text-muted-foreground",
                              )}>
                                 {registration?.note || "Ghi chú..."}
                              </span>
                              {classPerm?.canEdit && (
                                <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                              )}
                            </button>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant={(
                                  (registration?.id ? reviewOverrides[registration.id]?.reviewData : undefined)
                                  ?? registration?.reviewData
                                ) ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={!classPerm?.canEdit || !registration?.id}
                                onClick={() => {
                                  if (!classPerm?.canEdit || !registration?.id) return;
                                  setReviewTarget({ student, registration });
                                }}
                              >
                                {(
                                  (registration?.id ? reviewOverrides[registration.id]?.reviewData : undefined)
                                  ?? registration?.reviewData
                                ) ? (
                                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                {(
                                  registration?.id
                                    ? reviewOverrides[registration.id]?.reviewData ?? registration.reviewData
                                    : undefined
                                ) ? "Xem / sửa" : registration?.id ? "Nhập nhận xét" : "Nhận xét sau khi học"}
                              </Button>
                            </div>
                             {isSelfPractice && (
                               <Button
                                 type="button"
                                 variant="outline"
                                 size="sm"
                                 className="h-8 w-fit gap-1.5 text-xs"
                                 onClick={() => setHistoryStudent(student)}
                               >
                                 <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                                 Lịch
                               </Button>
                             )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : !isSelfPractice && selectedRegistrationDay ? (
              <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                  <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Danh sách học viên
                  </span>
                  <Badge variant="outline" className="bg-white text-[10px]">
                    {selectedRegistrationDay.label}/{monthLabel}
                  </Badge>
                  <span className="text-xs font-medium text-slate-800">
                    ({selectedRegistrationStudents.length})
                  </span>
                </div>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full min-w-[760px] border-collapse text-xs">
                    <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Học viên</th>
                        <th className="px-3 py-2.5 text-left">Trạng thái điểm danh</th>
                        <th className="px-3 py-2.5 text-left">Ghi chú</th>
                        <th className="px-4 py-2.5 text-left">Nhận xét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRegistrationStudents.map(({ student, registration }: any) => {
                        const status = registration.status === "attended" || registration.status === "reserved"
                          ? registration.status
                          : "registered";
                        const statusLabel = status === "attended"
                          ? "Có học"
                          : status === "reserved"
                          ? "Bảo lưu"
                          : "Chưa điểm danh";
                        const note = noteOverrides[registration.id] ?? registration.note ?? "";
                        const hasReview = !!(
                          reviewOverrides[registration.id]?.reviewData ?? registration.reviewData
                        );
                        return (
                          <tr key={student.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">
                                {student.fullName}{" "}
                                <span className="font-medium text-slate-500">({student.code || "—"})</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Select
                                value={status}
                                disabled={updateMutation.isPending}
                                onValueChange={(nextStatus) => updateMutation.mutate({
                                  studentClassId: student.id,
                                  date: selectedRegistrationDay.value,
                                  action: "attend",
                                  value: nextStatus === "attended",
                                  status: nextStatus as "registered" | "attended" | "reserved",
                                })}
                              >
                                <SelectTrigger className={cn(
                                  "h-8 w-[150px] !text-[11px] leading-[13px]",
                                  status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                  status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                  status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                                )}>
                                  <SelectValue className="!text-[11px] leading-[13px]">{statusLabel}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="text-[11px]">
                                  <SelectItem value="registered">Chưa điểm danh</SelectItem>
                                  <SelectItem value="attended">Có học</SelectItem>
                                  <SelectItem value="reserved">Bảo lưu</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                disabled={!classPerm?.canEdit || !registration.id}
                                className={cn(
                                  "group flex max-w-[260px] items-center gap-1 text-left text-xs",
                                  classPerm?.canEdit && registration.id
                                    ? "cursor-pointer hover:text-primary"
                                    : "cursor-default",
                                )}
                                onClick={() => {
                                  if (!classPerm?.canEdit || !registration.id) return;
                                  setNoteDialog({
                                    studentClassId: student.id,
                                    registrationId: registration.id,
                                    date: selectedRegistrationDay.value,
                                    value: note,
                                    status,
                                  });
                                }}
                              >
                                <span className={cn(
                                  "truncate",
                                  note ? "text-slate-700" : "italic text-muted-foreground",
                                )}>
                                  {note || "Ghi chú..."}
                                </span>
                                {classPerm?.canEdit && <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50" />}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                type="button"
                                variant={hasReview ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={!classPerm?.canEdit || !registration.id}
                                onClick={() => setReviewTarget({ student, registration })}
                              >
                                {hasReview
                                  ? <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                                  : <Plus className="h-3.5 w-3.5" />}
                                {hasReview ? "Xem / sửa" : "Nhập nhận xét"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse text-xs">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="sticky top-0 z-30">
                <th className="sticky left-0 top-0 z-40 min-w-52 border-b border-r bg-slate-100 px-3 py-2 text-left font-semibold">
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
                    const dayAssignment = dayAssignments.get(day.value);
                  return (
                    <th
                      key={day.value}
                      className={cn(
                        "sticky top-0 min-w-24 border-b px-1 py-1 text-center font-medium transition-colors",
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
                      <div className="mt-1 flex items-center justify-center px-0.5">
                        <button
                          type="button"
                          disabled={!classPerm?.canEdit}
                          className={cn(
                            "inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-default disabled:opacity-50",
                            (dayAssignment?.teacherId || dayAssignment?.shiftTemplateId) && "text-indigo-600",
                          )}
                          title="Phân công GV/ca cho cả ngày"
                          aria-label={`Phân công GV/ca cho ngày ${day.label}/${monthLabel}`}
                          onClick={() => {
                            if (!classPerm?.canEdit) return;
                            setAssignmentEditor({
                              scope: "day",
                              studentClassId: "",
                              date: day.value,
                              studentName: "Phân công chung ngày",
                              teacherId: dayAssignment?.teacherId || "",
                              shiftTemplateId: dayAssignment?.shiftTemplateId || "",
                            });
                          }}
                        >
                          <UserRound className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {(dayAssignment?.teacherId || dayAssignment?.shiftTemplateId) && (() => {
                        const assignment = getAssignmentSummary(
                          dayAssignment.teacherId,
                          dayAssignment.shiftTemplateId,
                        );
                        return (
                          <div className="mt-0.5 max-w-[108px] text-[8px] font-medium leading-[10px] text-purple-600">
                            {assignment.teacherLabel && (
                              <div className="truncate" title={assignment.teacherLabel}>
                                {assignment.teacherLabel}
                              </div>
                            )}
                            {assignment.timeLabel && <div>{assignment.timeLabel}</div>}
                          </div>
                        );
                      })()}
                    </th>
                  );
                })}
                <th className="sticky right-20 top-0 z-40 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center font-semibold shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">
                  <div>T{monthLabel}</div>
                  <div className="text-[9px] font-normal text-muted-foreground">Đăng ký</div>
                </th>
                <th className="sticky right-0 top-0 z-40 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center font-semibold">
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
                              || !canRegisterStudentForDate(student, selectedDate)
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
                    const dayAssignment = dayAssignments.get(day.value);
                    const effectiveTeacherId = current?.teacherId || dayAssignment?.teacherId || null;
                    const effectiveShiftTemplateId = current?.shiftTemplateId || dayAssignment?.shiftTemplateId || null;
                    const hasStudentAssignment = !!current && (!!current.teacherId || !!current.shiftTemplateId);
                    const outside = (classStart && day.value < classStart) || (classEnd && day.value > classEnd)
                      || (student.startDate && day.value < String(student.startDate).slice(0, 10))
                      || (student.endDate && day.value > String(student.endDate).slice(0, 10));
                    const registrationBlocked = !current && !canRegisterStudentForDate(student, day.value);
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
                            : registrationBlocked
                            ? "bg-slate-50/70"
                            : "bg-white",
                        )}
                      >
                        <div className="flex min-h-14 flex-col items-center gap-1">
                          {!outside && (
                            <Checkbox
                              className="h-3.5 w-3.5"
                              hideIndicator
                              checked={!!current}
                                disabled={
                                  !classPerm?.canEdit
                                  || updateMutation.isPending
                                  || registrationBlocked
                                }
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
                                  "h-5 w-[74px] justify-center px-1 !text-[11px] leading-[12px]",
                                  status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                  status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                  status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                                )}>
                                  <SelectValue className="!text-[11px] leading-[12px]">{statusLabel}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="text-[11px]">
                                  <SelectItem className="text-[11px]" value="registered">Chưa điểm danh</SelectItem>
                                  <SelectItem className="text-[11px]" value="attended">Có học</SelectItem>
                                  <SelectItem className="text-[11px]" value="reserved">Bảo lưu</SelectItem>
                                </SelectContent>
                              </Select>
                              {hasStudentAssignment && (() => {
                                const assignment = getAssignmentSummary(
                                  current?.teacherId,
                                  current?.shiftTemplateId,
                                );
                                return (
                                  <div className="max-w-[104px] text-[8px] font-medium leading-[10px] text-purple-600">
                                    {assignment.teacherLabel && (
                                      <div className="truncate" title={assignment.teacherLabel}>
                                        {assignment.teacherLabel}
                                      </div>
                                    )}
                                    {assignment.timeLabel && <div>{assignment.timeLabel}</div>}
                                  </div>
                                );
                              })()}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!classPerm?.canEdit}
                                  className={cn(
                                    "text-slate-400 hover:text-indigo-500 disabled:cursor-default disabled:opacity-50",
                                    hasStudentAssignment && "text-indigo-600",
                                  )}
                                  title={
                                    hasStudentAssignment
                                      ? "Đang dùng GV/ca riêng cho học viên"
                                      : "Chọn GV/ca riêng cho học viên"
                                  }
                                  onClick={() => {
                                    if (!classPerm?.canEdit) return;
                                    setAssignmentEditor({
                                      scope: "student",
                                      studentClassId: student.id,
                                      date: day.value,
                                      studentName: student.fullName,
                                      teacherId: current?.teacherId || "",
                                      shiftTemplateId: current?.shiftTemplateId || "",
                                    });
                                  }}
                                >
                                  <UserRound className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                    disabled={!classPerm?.canEdit || !current?.id}
                                  className="text-slate-400 hover:text-primary disabled:cursor-default disabled:opacity-50"
                                  title={note || "Ghi chú"}
                                  onClick={() => {
                                      if (!classPerm?.canEdit || !current?.id) return;
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
                                    disabled={!classPerm?.canEdit || !current?.id}
                                  className="text-slate-400 hover:text-yellow-500 disabled:cursor-default disabled:opacity-50"
                                  title={hasReview ? "Xem / sửa nhận xét" : "Nhập nhận xét"}
                                  onClick={() => {
                                      if (!classPerm?.canEdit || !current?.id) return;
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
                    const stats = monthlyStats.get(student.id) ?? { registered: 0, attended: 0, totalSchedule: 0 };
                    return (
                      <>
                        <td className="sticky right-20 z-10 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center text-xs font-semibold text-slate-700 shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">
                          {stats.registered}
                        </td>
                        <td className="sticky right-0 z-10 w-20 min-w-20 border-b border-l bg-slate-100 px-1 py-2 text-center text-xs font-semibold text-slate-700">
                          {stats.attended}/{stats.totalSchedule}
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
        open={!!assignmentEditor}
        onOpenChange={(open) => {
          if (!open && !assignmentMutation.isPending) setAssignmentEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {assignmentEditor?.scope === "day"
                ? "Phân công chung cho ngày"
                : "Phân công riêng cho học viên"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {assignmentEditor?.studentName || "Học viên"} · {assignmentEditor?.date ? formatStudentDate(assignmentEditor.date) : "—"}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                {assignmentEditor?.scope === "day" ? "Giáo viên áp dụng cho cả ngày" : "Giáo viên riêng"}
              </label>
              <Select
                value={assignmentEditor?.teacherId || "__none__"}
                disabled={assignmentMutation.isPending}
                onValueChange={(value) =>
                  setAssignmentEditor((current) => current
                    ? { ...current, teacherId: value === "__none__" ? "" : value }
                    : current)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={assignmentEditor?.scope === "day" ? "Theo GV chung của lớp" : "Theo giáo viên của ngày"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {assignmentEditor?.scope === "day" ? "Theo GV chung của lớp" : "Theo giáo viên của ngày"}
                  </SelectItem>
                  {availableTeachers.map((teacher: any) => (
                    <SelectItem key={teacher.id} value={String(teacher.id)}>
                      {teacher.fullName || teacher.name || teacher.code || "Giáo viên"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                {assignmentEditor?.scope === "day" ? "Ca dạy áp dụng cho cả ngày" : "Ca dạy riêng"}
              </label>
              <Select
                value={assignmentEditor?.shiftTemplateId || "__none__"}
                disabled={assignmentMutation.isPending}
                onValueChange={(value) =>
                  setAssignmentEditor((current) => current
                    ? { ...current, shiftTemplateId: value === "__none__" ? "" : value }
                    : current)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={assignmentEditor?.scope === "day" ? "Theo ca của lớp" : "Theo ca của ngày"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {assignmentEditor?.scope === "day" ? "Theo ca của lớp" : "Theo ca của ngày"}
                  </SelectItem>
                  {availableShifts.map((shift: any) => (
                    <SelectItem key={shift.id} value={String(shift.id)}>
                      {shift.name} ({String(shift.startTime || "").slice(0, 5)}–{String(shift.endTime || "").slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={assignmentMutation.isPending}
              onClick={() => setAssignmentEditor(null)}
            >
              Hủy
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={assignmentMutation.isPending || !assignmentEditor}
              onClick={() => {
                if (!assignmentEditor) return;
                assignmentMutation.mutate({
                  scope: assignmentEditor.scope,
                  ...(assignmentEditor.scope === "student"
                    ? { studentClassId: assignmentEditor.studentClassId }
                    : {}),
                  date: assignmentEditor.date,
                  teacherId: assignmentEditor.teacherId || null,
                  shiftTemplateId: assignmentEditor.shiftTemplateId || null,
                });
              }}
            >
              {assignmentMutation.isPending ? "Đang lưu..." : "Lưu phân công"}
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
      <Dialog
        open={!!historyStudent}
        onOpenChange={(open) => {
          if (!open) setHistoryStudent(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-[1120px] max-h-[88vh] overflow-hidden p-0">
          <DialogHeader className="border-b bg-white px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Lịch học: {historyStudent?.fullName || studentHistory?.student?.fullName || "Học viên"}
              {(historyStudent?.code || studentHistory?.student?.code) && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({historyStudent?.code || studentHistory?.student?.code})
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Chỉ hiển thị các buổi đã được điểm danh: Có học hoặc Bảo lưu.
            </p>
          </DialogHeader>
          <div className="max-h-[calc(88vh-96px)] overflow-y-auto bg-[#ECEEF4] p-5">
            {isLoadingStudentHistory ? (
              <div className="flex min-h-[180px] items-center justify-center text-sm text-muted-foreground">
                Đang tải lịch học...
              </div>
            ) : (studentHistory?.sessions?.length ?? 0) === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-sm text-muted-foreground">
                <CalendarDays className="h-8 w-8 text-slate-300" />
                Chưa có buổi nào được điểm danh.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {studentHistory?.sessions?.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Buổi {session.sessionIndex}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        session.status === "attended"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}>
                        {session.status === "attended" ? "Có học" : "Bảo lưu"}
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-800">
                      {formatStudentDate(session.sessionDate)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(() => {
                        const date = parseCalendarDate(String(session.sessionDate).slice(0, 10));
                        return date ? format(date, "EEEE", { locale: vi }) : "—";
                      })()}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {session.shiftStart || session.shiftEnd
                        ? `${String(session.shiftStart || "").slice(0, 5)} - ${String(session.shiftEnd || "").slice(0, 5)}`
                        : session.shiftName || "Chưa có ca học"}
                    </div>
                    {session.note && (
                      <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        {session.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}