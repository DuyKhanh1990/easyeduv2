import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Circle,
  CircleDot,
  Clock3,
  Copy,
  Eye,
  Filter,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import type {
  ScoreConversionTemplate,
  ScoreConversionTemplateInput,
  ScoreConversionTypeKey,
} from "@shared/score-conversion";
import type {
  ScoreSheetTemplate,
  ScoreSheetTemplateInput,
} from "@shared/score-sheet-template";
import {
  resolveScoreSheetAssessmentDeadlineStatus,
  resolveScoreSheetAssessmentStatus,
  type ScoreSheetAssessmentDeadlineStatus,
  type ScoreSheetAssessmentStatus,
} from "@shared/score-sheet-assessment-status";
import { ScoreConversionTemplateDialog } from "./score-conversion/ScoreConversionTemplateDialog";
import { ScoreSheetTemplateDialog } from "./score-conversion/ScoreSheetTemplateDialog";
import {
  StaffScoreSheetAssessmentStudentsDialog,
  type StaffAssignedScoreSheetAssessment,
} from "@/components/education/StaffScoreSheetAssessmentStudentsDialog";
import { StaffScoreSheetAssessmentScoreDialog } from "@/components/education/StaffScoreSheetAssessmentScoreDialog";
import { SCORE_CONVERSION_TYPES } from "./score-conversion/score-conversion-presets";

const TEMPLATE_ENDPOINT = "/api/score-conversion-templates";
const TEMPLATE_QUERY_KEY = [TEMPLATE_ENDPOINT];
const SCORE_SHEET_TEMPLATE_ENDPOINT = "/api/score-sheet-templates";
const SCORE_SHEET_TEMPLATE_QUERY_KEY = [SCORE_SHEET_TEMPLATE_ENDPOINT];
const TEMPLATE_USAGE_ENDPOINT = "/api/score-template-usage";
const TEMPLATE_USAGE_QUERY_KEY = [TEMPLATE_USAGE_ENDPOINT];
const ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT = "/api/score-sheet-assessments/assigned";
const ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY = [ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT];
const ASSIGNED_SCORE_SHEET_STUDENTS_ENDPOINT = "/api/score-sheet-assessments/assigned/students";

type ScoreTemplateUsage = {
  scoreSheetTemplateIdsInUse: string[];
  scoreConversionTemplateIdsInUse: string[];
};

type PendingTemplateDelete =
  | { kind: "conversion"; id: string; name: string }
  | { kind: "scoreSheet"; id: string; name: string };

type ScoreConversionViewMode = "assessments" | "students";
type StudentResultFilter = "all" | "passed" | "failed";
const SCORE_CONVERSION_VIEW_MODE_STORAGE_KEY = "score-conversion-view-mode";

function readSavedScoreConversionViewMode(): ScoreConversionViewMode {
  try {
    if (typeof window === "undefined") return "assessments";
    return window.localStorage.getItem(SCORE_CONVERSION_VIEW_MODE_STORAGE_KEY) === "students"
      ? "students"
      : "assessments";
  } catch {
    return "assessments";
  }
}

type ScoreConversionStudentResult = {
  sessionId: string;
  classId: string;
  classCode: string;
  className: string;
  locationName?: string | null;
  teacherNames?: string | null;
  sessionIndex: number | null;
  examDate: string;
  assessmentId: string;
  assessmentCode: string | null;
  assessmentName: string | null;
  templateName: string | null;
  scoreDeadlineAt: string | null;
  attemptCount: number;
  scoringPolicy: "highest" | "latest";
  hasConversion: boolean;
  published: boolean;
  studentId: string;
  studentCode: string;
  studentName: string;
  attemptsTaken: number;
  attemptNumber: number | null;
  rawScore: number | null;
  convertedScore: number | null;
  gradeBandLabel: string | null;
  gradeBandColor: string | null;
  passStatus: "passed" | "failed" | null;
  inputComplete: boolean;
  individuallyPublished: boolean;
  hasPublishableScore: boolean;
  status: "not_entered" | "in_progress" | "complete";
};

type AssessmentStatusPresentation = {
  key: ScoreSheetAssessmentStatus;
  label: string;
  indicator: string;
  className: string;
}

type AssessmentStatusFilter = "all" | ScoreSheetAssessmentStatus;

const ASSESSMENT_STATUS_PRESENTATION: Record<
  ScoreSheetAssessmentStatus,
  AssessmentStatusPresentation
> = {
  not_started: {
    key: "not_started",
    label: "Chưa thi",
    indicator: "🟣",
    className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300",
  },
  in_progress: {
    key: "in_progress",
    label: "Đang thi",
    indicator: "🟢",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  processing: {
    key: "processing",
    label: "Đang xử lý",
    indicator: "🟠",
    className: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
  },
  completed: {
    key: "completed",
    label: "Hoàn thành",
    indicator: "✅",
    className: "border-green-800 bg-green-800 text-white dark:border-green-700 dark:bg-green-700 dark:text-white",
  },
};

const ASSESSMENT_FILTER_COLORS: Record<
  ScoreSheetAssessmentStatus,
  { dot: string; idle: string; active: string }
> = {
  not_started: {
    dot: "bg-violet-500",
    idle: "border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40",
    active: "border-violet-600 bg-violet-600 text-white hover:bg-violet-700",
  },
  in_progress: {
    dot: "bg-emerald-500",
    idle: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40",
    active: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
  },
  processing: {
    dot: "bg-orange-500",
    idle: "border-orange-300 text-orange-800 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/40",
    active: "border-orange-600 bg-orange-600 text-white hover:bg-orange-700",
  },
  completed: {
    dot: "bg-green-800",
    idle: "border-green-700 text-green-800 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/40",
    active: "border-green-800 bg-green-800 text-white hover:bg-green-900",
  },
};

const ASSESSMENT_DEADLINE_STATUS_PRESENTATION: Record<
  ScoreSheetAssessmentDeadlineStatus,
  { label: string; className: string }
> = {
  within_deadline: {
    label: "Trong hạn",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  overdue: {
    label: "Quá hạn",
    className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  },
};

function formatAssessmentDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function formatAssessmentDeadline(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : "—";
}

function formatScoreValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function getBangkokWallClockMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value])) as Record<string, string>;
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  );
}

function getAssessmentStatus(
  assessment: StaffAssignedScoreSheetAssessment,
  nowWallClockMs: number,
): AssessmentStatusPresentation | null {
  const status = resolveScoreSheetAssessmentStatus(assessment, nowWallClockMs);
  return status ? ASSESSMENT_STATUS_PRESENTATION[status] : null;
}

function getCompletedStudentCount(
  assessment: Pick<StaffAssignedScoreSheetAssessment, "completedStudentCount" | "studentCount">,
): number {
  return Math.max(0, Math.min(assessment.completedStudentCount, assessment.studentCount));
}

function formatDateLabel(value: string): string {
  try {
    return format(new Date(value), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch {
    return value;
  }
}

function getClassLabel(assessment: StaffAssignedScoreSheetAssessment): string {
  return assessment.className || assessment.classCode;
}

function getScoreSheetTemplateLabel(assessment: StaffAssignedScoreSheetAssessment): string {
  return assessment.templateName || "Bảng điểm chưa đặt tên";
}

function createScoreSheetTemplateCopy(
  template: ScoreSheetTemplate,
  existingTemplates: ScoreSheetTemplate[],
): ScoreSheetTemplate {
  const usedCodes = new Set(existingTemplates.map((item) => item.code.trim().toLocaleUpperCase()));
  const usedNames = new Set(existingTemplates.map((item) => item.name.trim().toLocaleLowerCase("vi")));

  let copyNumber = 1;
  let code = "";
  let name = "";
  while (true) {
    const codeSuffix = copyNumber === 1 ? "-COPY" : `-COPY-${copyNumber}`;
    const nameSuffix = copyNumber === 1 ? " (Bản sao)" : ` (Bản sao ${copyNumber})`;
    code = `${template.code.trim().slice(0, 40 - codeSuffix.length)}${codeSuffix}`;
    name = `${template.name.trim().slice(0, 120 - nameSuffix.length)}${nameSuffix}`;
    if (!usedCodes.has(code.toLocaleUpperCase()) && !usedNames.has(name.toLocaleLowerCase("vi"))) break;
    copyNumber += 1;
  }

  const now = new Date().toISOString();
  return {
    ...template,
    id: crypto.randomUUID(),
    code,
    name,
    skills: template.skills.map((skill) => ({
      ...skill,
      id: crypto.randomUUID(),
      parts: skill.parts.map((part) => ({ ...part, id: crypto.randomUUID() })),
      partFormula: skill.partFormula ? { ...skill.partFormula } : skill.partFormula,
    })),
    overallRule: template.overallRule ? { ...template.overallRule } : undefined,
    gradeBands: template.gradeBands?.map((band) => ({ ...band, id: crypto.randomUUID() })),
    passThreshold: template.passThreshold ? { ...template.passThreshold } : undefined,
    evaluationCriteriaIds: [...(template.evaluationCriteriaIds ?? [])],
    createdAt: now,
    updatedAt: now,
  };
}

function getTeacherNameList(assessment: StaffAssignedScoreSheetAssessment): string[] {
  return (assessment.teacherNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export default function ScoreConversion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPermissions } = useMyPermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScoreConversionTemplate | null>(null);
  const [scoreSheetDialogOpen, setScoreSheetDialogOpen] = useState(false);
  const [editingScoreSheetTemplate, setEditingScoreSheetTemplate] = useState<ScoreSheetTemplate | null>(null);
  const [initialScoreSheetTemplate, setInitialScoreSheetTemplate] = useState<ScoreSheetTemplate | null>(null);
  const [pendingTemplateDelete, setPendingTemplateDelete] = useState<PendingTemplateDelete | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<StaffAssignedScoreSheetAssessment | null>(null);
  const [studentDialogTarget, setStudentDialogTarget] = useState<{
    mode: "view" | "edit";
    assessment: StaffAssignedScoreSheetAssessment;
    student: ScoreConversionStudentResult;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ScoreConversionViewMode>(readSavedScoreConversionViewMode);
  const handleViewModeChange = (nextMode: ScoreConversionViewMode) => {
    setViewMode(nextMode);
    try {
      window.localStorage.setItem(SCORE_CONVERSION_VIEW_MODE_STORAGE_KEY, nextMode);
    } catch {
      toast({
        title: "Không thể lưu loại xem",
        description: "Chế độ xem đã đổi nhưng trình duyệt không cho phép lưu lựa chọn này.",
      });
    }
  };
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<AssessmentStatusFilter>("all");
  const [assessmentSearchInput, setAssessmentSearchInput] = useState("");
  const [assessmentSearchTerm, setAssessmentSearchTerm] = useState("");
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [classFilters, setClassFilters] = useState<string[]>([]);
  const [teacherFilters, setTeacherFilters] = useState<string[]>([]);
  const [assessmentFilters, setAssessmentFilters] = useState<string[]>([]);
  const [classificationFilters, setClassificationFilters] = useState<string[]>([]);
  const [studentResultFilter, setStudentResultFilter] = useState<StudentResultFilter>("all");
  const [statusFilters, setStatusFilters] = useState<ScoreSheetAssessmentStatus[]>([]);
  const [deadlineStatusFilters, setDeadlineStatusFilters] = useState<ScoreSheetAssessmentDeadlineStatus[]>([]);
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");
  const [deadlineDateFrom, setDeadlineDateFrom] = useState("");
  const [deadlineDateTo, setDeadlineDateTo] = useState("");
  const assessmentPermissions = myPermissions?.permissions["/assessments#list"];
  const canCreate = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canCreate);
  const canEdit = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canEdit);
  const canDelete = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canDelete);

  const templatesQuery = useQuery<ScoreConversionTemplate[]>({
    queryKey: TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const templateUsageQuery = useQuery<ScoreTemplateUsage>({
    queryKey: TEMPLATE_USAGE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", TEMPLATE_USAGE_ENDPOINT);
      return response.json();
    },
    enabled: canDelete,
    refetchInterval: 30_000,
  });
  const scoreSheetTemplatesQuery = useQuery<ScoreSheetTemplate[]>({
    queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", SCORE_SHEET_TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const assignedScoreSheetAssessmentsQuery = useQuery<StaffAssignedScoreSheetAssessment[]>({
    queryKey: ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT);
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const assignedScoreSheetStudentsQuery = useQuery<ScoreConversionStudentResult[]>({
    queryKey: [ASSIGNED_SCORE_SHEET_STUDENTS_ENDPOINT],
    enabled: viewMode === "students",
    queryFn: async () => {
      const response = await apiRequest("GET", ASSIGNED_SCORE_SHEET_STUDENTS_ENDPOINT);
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const nowWallClockMs = getBangkokWallClockMs(new Date());
  const conversionAssessments = (assignedScoreSheetAssessmentsQuery.data ?? [])
    .filter((assessment) => assessment.hasConversion);
  const classFilterOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string; sublabel?: string }>();
    for (const assessment of conversionAssessments) {
      if (!options.has(assessment.classId)) {
        options.set(assessment.classId, {
          value: assessment.classId,
          label: getClassLabel(assessment),
          sublabel: assessment.classCode,
        });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [conversionAssessments]);
  const teacherFilterOptions = useMemo(() => {
    const names = new Set<string>();
    conversionAssessments.forEach((assessment) => getTeacherNameList(assessment).forEach((name) => names.add(name)));
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((name) => ({ value: name, label: name }));
  }, [conversionAssessments]);
  const assessmentFilterOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    for (const assessment of conversionAssessments) {
      const templateLabel = getScoreSheetTemplateLabel(assessment);
      if (!options.has(templateLabel)) {
        options.set(templateLabel, {
          value: templateLabel,
          label: templateLabel,
        });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [conversionAssessments]);
  const classificationFilterOptions = useMemo(() => {
    const labels = new Set(
      (assignedScoreSheetStudentsQuery.data ?? [])
        .map((student) => student.gradeBandLabel)
        .filter((label): label is string => Boolean(label)),
    );
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((label) => ({ value: label, label }));
  }, [assignedScoreSheetStudentsQuery.data]);
  const filteredConversionAssessments = conversionAssessments.filter((assessment) => {
    const dateKey = assessment.examDate.substring(0, 10);
    const status = getAssessmentStatus(assessment, nowWallClockMs);
    const deadlineStatusKey = resolveScoreSheetAssessmentDeadlineStatus(
      assessment.scoreDeadlineAt,
      nowWallClockMs,
    );
    const deadlineDateKey = assessment.scoreDeadlineAt?.substring(0, 10) ?? "";
    if (assessmentStatusFilter !== "all" && status?.key !== assessmentStatusFilter) return false;
    if (classFilters.length > 0 && !classFilters.includes(assessment.classId)) return false;
    if (
      teacherFilters.length > 0
      && !teacherFilters.some((teacher) => getTeacherNameList(assessment).includes(teacher))
    ) return false;
    if (
      assessmentFilters.length > 0
      && !assessmentFilters.includes(getScoreSheetTemplateLabel(assessment))
    ) return false;
    if (statusFilters.length > 0 && (!status || !statusFilters.includes(status.key))) return false;
    if (
      deadlineStatusFilters.length > 0
      && (!deadlineStatusKey || !deadlineStatusFilters.includes(deadlineStatusKey))
    ) return false;
    const searchTerm = viewMode === "assessments"
      ? assessmentSearchTerm.trim().toLocaleLowerCase("vi")
      : "";
    const searchableFields = [
      assessment.classCode,
      assessment.className,
      assessment.locationName,
      assessment.teacherNames,
      assessment.assessmentCode,
      assessment.assessmentName,
      assessment.templateName,
    ];
    if (
      searchTerm
      && !searchableFields.some((value) => value?.toLocaleLowerCase("vi").includes(searchTerm))
    ) return false;
    if (examDateFrom && dateKey < examDateFrom) return false;
    if (examDateTo && dateKey > examDateTo) return false;
    if (deadlineDateFrom && (!deadlineDateKey || deadlineDateKey < deadlineDateFrom)) return false;
    if (deadlineDateTo && (!deadlineDateKey || deadlineDateKey > deadlineDateTo)) return false;
    return true;
  });
  const eligibleAssessmentSessionIds = new Set(filteredConversionAssessments.map((assessment) => assessment.sessionId));
  const studentSearchTerm = assessmentSearchTerm.trim().toLocaleLowerCase("vi");
  const filteredStudentResults = (assignedScoreSheetStudentsQuery.data ?? []).filter((student) => {
    if (!eligibleAssessmentSessionIds.has(student.sessionId)) return false;
    if (studentResultFilter === "passed" && student.passStatus !== "passed") return false;
    if (studentResultFilter === "failed" && student.passStatus !== "failed") return false;
    if (
      classificationFilters.length > 0
      && (!student.gradeBandLabel || !classificationFilters.includes(student.gradeBandLabel))
    ) return false;
    if (
      studentSearchTerm
      && ![
        student.studentCode,
        student.studentName,
        student.classCode,
        student.className,
        student.locationName,
        student.teacherNames,
        student.assessmentCode,
        student.assessmentName,
        student.templateName,
      ].some((value) => value?.toLocaleLowerCase("vi").includes(studentSearchTerm))
    ) return false;
    return true;
  });
  const studentResultsByDate = filteredStudentResults.reduce<
    Record<string, Record<string, { assessment: ScoreConversionStudentResult; students: ScoreConversionStudentResult[] }>>
  >((grouped, student) => {
    const dateKey = student.examDate.substring(0, 10);
    const dateGroup = grouped[dateKey] ??= {};
    const sessionGroup = dateGroup[student.sessionId] ??= { assessment: student, students: [] };
    sessionGroup.students.push(student);
    return grouped;
  }, {});
  const sortedStudentDates = Object.keys(studentResultsByDate).sort((a, b) => b.localeCompare(a));
  const assessmentsByDate = filteredConversionAssessments.reduce<Record<string, StaffAssignedScoreSheetAssessment[]>>(
    (grouped, assessment) => {
      const dateKey = assessment.examDate.substring(0, 10);
      (grouped[dateKey] ??= []).push(assessment);
      return grouped;
    },
    {},
  );
  const sortedAssessmentDates = Object.keys(assessmentsByDate).sort((a, b) => b.localeCompare(a));
  const activeFilterCount = [
    classFilters.length > 0,
    teacherFilters.length > 0,
    assessmentFilters.length > 0,
    classificationFilters.length > 0,
    statusFilters.length > 0,
    deadlineStatusFilters.length > 0,
    Boolean(examDateFrom || examDateTo),
    Boolean(deadlineDateFrom || deadlineDateTo),
  ].filter(Boolean).length;
  const clearAssessmentFilters = () => {
    setClassFilters([]);
    setTeacherFilters([]);
    setAssessmentFilters([]);
    setClassificationFilters([]);
    setStudentResultFilter("all");
    setStatusFilters([]);
    setAssessmentStatusFilter("all");
    setDeadlineStatusFilters([]);
    setExamDateFrom("");
    setExamDateTo("");
    setDeadlineDateFrom("");
    setDeadlineDateTo("");
  };
  const savedTemplates = templatesQuery.data ?? [];
  const initialTypeKey: ScoreConversionTypeKey =
    SCORE_CONVERSION_TYPES.find((type) =>
      type.value !== "custom" && !savedTemplates.some((template) => template.typeKey === type.value),
    )?.value ?? "custom";

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: ScoreConversionTemplateInput }) => {
      const response = await apiRequest(
        id ? "PUT" : "POST",
        id ? `${TEMPLATE_ENDPOINT}/${id}` : TEMPLATE_ENDPOINT,
        draft,
      );
      return response.json() as Promise<ScoreConversionTemplate>;
    },
    onSuccess: async (_saved, variables) => {
      await queryClient.invalidateQueries({ queryKey: TEMPLATE_QUERY_KEY });
      setDialogOpen(false);
      toast({
        title: variables.id ? "Đã cập nhật cấu hình" : "Đã lưu cấu hình",
        description: "Bảng quy đổi đã sẵn sàng để áp dụng cho các bài kiểm tra.",
      });
    },
  });

  const saveScoreSheetTemplateMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: ScoreSheetTemplateInput }) => {
      const response = await apiRequest(
        id ? "PUT" : "POST",
        id ? `${SCORE_SHEET_TEMPLATE_ENDPOINT}/${id}` : SCORE_SHEET_TEMPLATE_ENDPOINT,
        draft,
      );
      return response.json() as Promise<ScoreSheetTemplate>;
    },
    onSuccess: async (_saved, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] }),
      ]);
      setScoreSheetDialogOpen(false);
      setInitialScoreSheetTemplate(null);
      toast({
        title: variables.id ? "Đã cập nhật bảng điểm mẫu" : "Đã lưu bảng điểm mẫu",
      });
    },
  });

  const deleteConversionTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${TEMPLATE_ENDPOINT}/${id}`);
    },
    onSuccess: async () => {
      setPendingTemplateDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: TEMPLATE_USAGE_QUERY_KEY }),
      ]);
      toast({ title: "Đã xóa cấu hình điểm quy đổi" });
    },
    onError: (error) => {
      toast({
        title: "Không thể xóa cấu hình điểm quy đổi",
        description: error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const deleteScoreSheetTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${SCORE_SHEET_TEMPLATE_ENDPOINT}/${id}`);
    },
    onSuccess: async () => {
      setPendingTemplateDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: TEMPLATE_USAGE_QUERY_KEY }),
      ]);
      toast({ title: "Đã xóa bảng điểm mẫu" });
    },
    onError: (error) => {
      toast({
        title: "Không thể xóa bảng điểm mẫu",
        description: error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const conversionTemplateIdsInUse = new Set(
    templateUsageQuery.data?.scoreConversionTemplateIdsInUse ?? [],
  );
  const scoreSheetTemplateIdsInUse = new Set(
    templateUsageQuery.data?.scoreSheetTemplateIdsInUse ?? [],
  );
  const templateUsageUnavailable =
    !templateUsageQuery.isSuccess || !templateUsageQuery.data;

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: ScoreConversionTemplate) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleSave = async (draft: ScoreConversionTemplateInput) => {
    await saveMutation.mutateAsync({ id: editingTemplate?.id ?? null, draft });
  };

  const openCreateScoreSheetTemplateDialog = () => {
    setEditingScoreSheetTemplate(null);
    setInitialScoreSheetTemplate(null);
    setScoreSheetDialogOpen(true);
  };

  const openEditScoreSheetTemplateDialog = (template: ScoreSheetTemplate) => {
    setEditingScoreSheetTemplate(template);
    setInitialScoreSheetTemplate(null);
    setScoreSheetDialogOpen(true);
  };

  const openCopyScoreSheetTemplateDialog = (template: ScoreSheetTemplate) => {
    setEditingScoreSheetTemplate(null);
    setInitialScoreSheetTemplate(createScoreSheetTemplateCopy(
      template,
      scoreSheetTemplatesQuery.data ?? [],
    ));
    setScoreSheetDialogOpen(true);
  };

  const handleSaveScoreSheetTemplate = async (draft: ScoreSheetTemplateInput) => {
    await saveScoreSheetTemplateMutation.mutateAsync({
      id: editingScoreSheetTemplate?.id ?? null,
      draft,
    });
  };

  const confirmTemplateDelete = () => {
    if (!pendingTemplateDelete) return;
    if (pendingTemplateDelete.kind === "conversion") {
      deleteConversionTemplateMutation.mutate(pendingTemplateDelete.id);
    } else {
      deleteScoreSheetTemplateMutation.mutate(pendingTemplateDelete.id);
    }
  };

  const deletingTemplate =
    deleteConversionTemplateMutation.isPending || deleteScoreSheetTemplateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
              <BarChart3 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Bảng điểm quy đổi</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Lưu mẫu thang điểm quốc tế và cấu hình riêng của trung tâm.
              </p>
            </div>
          </div>
        </div>
        <Tabs defaultValue="international" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="international"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Cấu hình điểm Quy đổi
            </TabsTrigger>
            <TabsTrigger
              value="sample"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Bảng điểm mẫu
            </TabsTrigger>
            <TabsTrigger
              value="scores"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Danh sách Bảng điểm Quy đổi
            </TabsTrigger>
          </TabsList>
          <TabsContent value="international" className="space-y-4">
            {canCreate && (
              <div className="flex justify-end">
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm mới
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                {templatesQuery.isLoading ? (
                  <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                    Đang tải cấu hình...
                  </div>
                ) : templatesQuery.isError ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-destructive">
                      {templatesQuery.error instanceof Error
                        ? templatesQuery.error.message
                        : "Không thể tải cấu hình bài kiểm tra."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => templatesQuery.refetch()}>
                      Thử lại
                    </Button>
                  </div>
                ) : templatesQuery.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Loại bài kiểm tra</th>
                          <th className="px-4 py-3 font-medium">Phần thi</th>
                          <th className="px-4 py-3 font-medium">Khoảng quy đổi</th>
                          <th className="px-4 py-3 font-medium">Cách tính điểm tổng</th>
                          {(canCreate || canEdit || canDelete) && <th className="w-32 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {templatesQuery.data.map((template) => (
                          <tr key={template.id} className="border-b last:border-0">
                            <td className="px-4 py-3 font-medium">{template.typeName}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {template.sections.map((section) => (
                                  <span key={section.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                                    {section.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {template.sections.reduce((total, section) => total + section.mappings.length, 0)}
                            </td>
                            <td className="max-w-sm px-4 py-3">
                              <span className="font-medium">
                                {template.overallRule.method === "sum"
                                  ? "Cộng điểm các phần thi"
                                  : template.overallRule.method === "custom"
                                    ? "Tùy chỉnh công thức"
                                    : "Trung bình các phần thi"}
                              </span>
                            </td>
                            {(canEdit || canDelete) && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Sửa bảng ${template.typeName}`}
                                      onClick={() => openEditDialog(template)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive"
                                      aria-label={`Xóa bảng ${template.typeName}`}
                                      title={
                                        templateUsageQuery.isError
                                          ? "Không thể kiểm tra bảng này có đang được gán hay không."
                                          : templateUsageUnavailable
                                            ? "Đang kiểm tra trạng thái sử dụng."
                                            : conversionTemplateIdsInUse.has(template.id)
                                              ? "Đang được gán vào lịch học nên không thể xóa."
                                              : "Xóa cấu hình điểm quy đổi"
                                      }
                                      disabled={
                                        templateUsageUnavailable ||
                                        conversionTemplateIdsInUse.has(template.id) ||
                                        deleteConversionTemplateMutation.isPending
                                      }
                                      onClick={() => setPendingTemplateDelete({
                                        kind: "conversion",
                                        id: template.id,
                                        name: template.typeName,
                                      })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Chưa có bảng điểm quy đổi</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Tạo bảng quy đổi dùng chung theo loại bài kiểm tra.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sample" className="space-y-4">
            {canCreate && (
              <div className="flex justify-end">
                <Button onClick={openCreateScoreSheetTemplateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm mới
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                {scoreSheetTemplatesQuery.isLoading ? (
                  <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                    Đang tải bảng điểm mẫu...
                  </div>
                ) : scoreSheetTemplatesQuery.isError ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-destructive">
                      {scoreSheetTemplatesQuery.error instanceof Error
                        ? scoreSheetTemplatesQuery.error.message
                        : "Không thể tải bảng điểm mẫu."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => scoreSheetTemplatesQuery.refetch()}>
                      Thử lại
                    </Button>
                  </div>
                ) : scoreSheetTemplatesQuery.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Mã</th>
                          <th className="px-4 py-3 font-medium">Tên bảng điểm</th>
                          <th className="px-4 py-3 font-medium">Bảng quy đổi</th>
                          <th className="px-4 py-3 font-medium">Kỹ năng</th>
                          {(canEdit || canDelete) && <th className="w-24 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {scoreSheetTemplatesQuery.data.map((template) => {
                          const conversion = savedTemplates.find(
                            (item) => item.id === template.scoreConversionTemplateId,
                          );
                          return (
                            <tr key={template.id} className="border-b last:border-0">
                              <td className="px-4 py-3 font-medium">{template.code}</td>
                              <td className="px-4 py-3">{template.name}</td>
                              <td className="px-4 py-3">
                                {conversion?.typeName ?? (template.scoreConversionTemplateId ? "Không tìm thấy bảng quy đổi" : "Không áp dụng")}
                              </td>
                              <td className="px-4 py-3">{conversion?.sections.length ?? template.skills.length}</td>
                              {(canCreate || canEdit || canDelete) && (
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    {canCreate && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Sao chép bảng điểm mẫu ${template.name}`}
                                        title="Sao chép bảng điểm mẫu"
                                        onClick={() => openCopyScoreSheetTemplateDialog(template)}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Sửa bảng điểm mẫu ${template.name}`}
                                        onClick={() => openEditScoreSheetTemplateDialog(template)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {canDelete && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        aria-label={`Xóa bảng điểm mẫu ${template.name}`}
                                        title={
                                          templateUsageQuery.isError
                                            ? "Không thể kiểm tra bảng này có đang được gán hay không."
                                            : templateUsageUnavailable
                                              ? "Đang kiểm tra trạng thái sử dụng."
                                              : scoreSheetTemplateIdsInUse.has(template.id)
                                                ? "Đang được gán vào lịch học nên không thể xóa."
                                                : "Xóa bảng điểm mẫu"
                                        }
                                        disabled={
                                          templateUsageUnavailable ||
                                          scoreSheetTemplateIdsInUse.has(template.id) ||
                                          deleteScoreSheetTemplateMutation.isPending
                                        }
                                        onClick={() => setPendingTemplateDelete({
                                          kind: "scoreSheet",
                                          id: template.id,
                                          name: template.name,
                                        })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Chưa có bảng điểm mẫu</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Tạo bảng điểm mẫu và tùy chọn liên kết với bảng quy đổi quốc tế.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="scores" className="space-y-4">
            {assignedScoreSheetAssessmentsQuery.isLoading ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                Đang tải danh sách bảng điểm Quy đổi...
              </div>
            ) : assignedScoreSheetAssessmentsQuery.isError ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center">
                <p className="text-sm text-destructive">
                  {assignedScoreSheetAssessmentsQuery.error instanceof Error
                    ? assignedScoreSheetAssessmentsQuery.error.message
                    : "Không thể tải danh sách bảng điểm Quy đổi."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => assignedScoreSheetAssessmentsQuery.refetch()}
                >
                  Thử lại
                </Button>
              </div>
            ) : conversionAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <BookOpen className="h-10 w-10 opacity-25" />
                <p className="text-sm">Chưa có bảng điểm Quy đổi nào được gán vào buổi học</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div
                  className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 sm:px-4"
                  data-testid="score-conversion-filter-bar"
                >
                  <div className="flex shrink-0 items-center rounded-md border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      className={`h-8 rounded border px-3 text-xs font-semibold transition-colors ${
                        viewMode === "assessments"
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-background hover:text-foreground"
                      }`}
                      aria-pressed={viewMode === "assessments"}
                      onClick={() => handleViewModeChange("assessments")}
                    >
                      Theo bảng điểm
                    </button>
                    <button
                      type="button"
                      className={`h-8 rounded border px-3 text-xs font-semibold transition-colors ${
                        viewMode === "students"
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-background hover:text-foreground"
                      }`}
                      aria-pressed={viewMode === "students"}
                      onClick={() => handleViewModeChange("students")}
                    >
                      Theo học viên
                    </button>
                  </div>
                  <form
                    className="relative min-w-0 flex-1 sm:max-w-[280px]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setAssessmentSearchTerm(assessmentSearchInput);
                    }}
                  >
                    <input
                      type="search"
                      aria-label={viewMode === "students" ? "Tìm kiếm học viên" : "Tìm kiếm bảng điểm"}
                      data-testid="search-score-conversion"
                      placeholder={viewMode === "students" ? "Tìm học viên hoặc bảng điểm" : "Nhấn enter để tìm kiếm"}
                      value={assessmentSearchInput}
                      onChange={(event) => setAssessmentSearchInput(event.target.value)}
                      className="h-9 w-full rounded-full border border-slate-300 bg-background pl-4 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700"
                    />
                    <button
                      type="submit"
                      aria-label="Tìm kiếm"
                      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </form>

                  {viewMode === "assessments" ? (
                    <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5 sm:flex-wrap">
                      {([
                        { value: "all", label: "Tất cả" },
                        { value: "not_started", label: "Chưa thi" },
                        { value: "in_progress", label: "Đang thi" },
                        { value: "processing", label: "Đang xử lý" },
                        { value: "completed", label: "Hoàn thành" },
                      ] as const).map((filter) => {
                        const isSelected = filter.value === "all"
                          ? statusFilters.length === 0
                          : assessmentStatusFilter === filter.value && statusFilters.length === 1;
                        return (
                          <button
                            key={filter.value}
                            type="button"
                            aria-pressed={isSelected}
                            data-testid={`filter-score-conversion-${filter.value}`}
                            onClick={() => {
                              if (filter.value === "all") {
                                setAssessmentStatusFilter("all");
                                setStatusFilters([]);
                              } else {
                                setAssessmentStatusFilter(filter.value);
                                setStatusFilters([filter.value]);
                              }
                            }}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                              filter.value === "all"
                                ? isSelected
                                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                  : "border-blue-300 bg-background text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
                                : isSelected
                                  ? ASSESSMENT_FILTER_COLORS[filter.value].active
                                  : `bg-background ${ASSESSMENT_FILTER_COLORS[filter.value].idle}`
                            }`}
                          >
                            {filter.value !== "all" && (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isSelected
                                    ? "bg-white"
                                    : ASSESSMENT_FILTER_COLORS[filter.value].dot
                                }`}
                              />
                            )}
                            {filter.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5 sm:flex-wrap">
                      {([
                        { value: "all", label: "Tất cả" },
                        { value: "passed", label: "Đạt" },
                        { value: "failed", label: "Không đạt" },
                      ] as const).map((filter) => {
                        const isSelected = studentResultFilter === filter.value;
                        return (
                          <button
                            key={filter.value}
                            type="button"
                            aria-pressed={isSelected}
                            data-testid={`filter-score-conversion-student-${filter.value}`}
                            onClick={() => setStudentResultFilter(filter.value)}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                              isSelected
                                ? filter.value === "failed"
                                  ? "border-red-600 bg-red-600 text-white"
                                  : filter.value === "passed"
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-blue-600 bg-blue-600 text-white"
                                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                          >
                            {filter.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {activeFilterCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-1.5 text-muted-foreground"
                        onClick={clearAssessmentFilters}
                      >
                        <X className="h-3.5 w-3.5" />
                        Xóa lọc
                      </Button>
                    )}
                    <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2"
                        data-testid="open-score-conversion-filters"
                        onClick={() => setFilterDialogOpen(true)}
                      >
                        <Filter className="h-4 w-4" />
                        Bộ lọc
                        {activeFilterCount > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                            {activeFilterCount}
                          </span>
                        )}
                      </Button>
                      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Bộ lọc bảng điểm quy đổi</DialogTitle>
                          <DialogDescription>
                            Chọn một hoặc nhiều điều kiện để lọc danh sách đang hiển thị.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-2 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Lớp</label>
                            <SearchableMultiSelect
                              options={classFilterOptions}
                              value={classFilters}
                              onChange={setClassFilters}
                              placeholder="Chọn lớp"
                              searchPlaceholder="Tìm lớp..."
                              data-testid="filter-score-conversion-class"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Giáo viên</label>
                            <SearchableMultiSelect
                              options={teacherFilterOptions}
                              value={teacherFilters}
                              onChange={setTeacherFilters}
                              placeholder="Chọn giáo viên"
                              searchPlaceholder="Tìm giáo viên..."
                              data-testid="filter-score-conversion-teacher"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Bảng điểm</label>
                            <SearchableMultiSelect
                              options={assessmentFilterOptions}
                              value={assessmentFilters}
                              onChange={setAssessmentFilters}
                              placeholder="Chọn bảng điểm"
                              searchPlaceholder="Tìm bảng điểm..."
                              data-testid="filter-score-conversion-assessment"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Trạng thái</label>
                            <SearchableMultiSelect
                              options={Object.values(ASSESSMENT_STATUS_PRESENTATION).map((status) => ({
                                value: status.key,
                                label: status.label,
                              }))}
                              value={statusFilters}
                              onChange={(values) => {
                                const nextStatuses = values as ScoreSheetAssessmentStatus[];
                                setStatusFilters(nextStatuses);
                                setAssessmentStatusFilter(nextStatuses.length === 1 ? nextStatuses[0] : "all");
                              }}
                              placeholder="Chọn trạng thái"
                              searchPlaceholder="Tìm trạng thái..."
                              data-testid="filter-score-conversion-status"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Ngày thi</label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1 text-xs text-muted-foreground">
                                <span>Từ</span>
                                <input
                                  type="date"
                                  aria-label="Lọc ngày thi từ"
                                  value={examDateFrom}
                                  onChange={(event) => setExamDateFrom(event.target.value)}
                                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                />
                              </label>
                              <label className="space-y-1 text-xs text-muted-foreground">
                                <span>Đến</span>
                                <input
                                  type="date"
                                  aria-label="Lọc ngày thi đến"
                                  value={examDateTo}
                                  onChange={(event) => setExamDateTo(event.target.value)}
                                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Hạn trả</label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1 text-xs text-muted-foreground">
                                <span>Từ</span>
                                <input
                                  type="date"
                                  aria-label="Lọc hạn trả từ"
                                  value={deadlineDateFrom}
                                  onChange={(event) => setDeadlineDateFrom(event.target.value)}
                                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                />
                              </label>
                              <label className="space-y-1 text-xs text-muted-foreground">
                                <span>Đến</span>
                                <input
                                  type="date"
                                  aria-label="Lọc hạn trả đến"
                                  value={deadlineDateTo}
                                  onChange={(event) => setDeadlineDateTo(event.target.value)}
                                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-sm font-medium">Tình trạng</label>
                            <SearchableMultiSelect
                              options={[
                                { value: "within_deadline", label: "Trong hạn" },
                                { value: "overdue", label: "Quá hạn" },
                              ]}
                              value={deadlineStatusFilters}
                              onChange={(values) => setDeadlineStatusFilters(values as ScoreSheetAssessmentDeadlineStatus[])}
                              placeholder="Chọn tình trạng"
                              searchPlaceholder="Tìm tình trạng..."
                              data-testid="filter-score-conversion-deadline-status"
                            />
                          </div>
                          {viewMode === "students" && (
                            <div className="space-y-1.5 sm:col-span-2">
                              <label className="text-sm font-medium">Phân loại</label>
                              <SearchableMultiSelect
                                options={classificationFilterOptions}
                                value={classificationFilters}
                                onChange={setClassificationFilters}
                                placeholder="Chọn phân loại"
                                searchPlaceholder="Tìm phân loại..."
                                data-testid="filter-score-conversion-classification"
                              />
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={clearAssessmentFilters}>
                            Xóa tất cả
                          </Button>
                          <Button type="button" onClick={() => setFilterDialogOpen(false)}>
                            Áp dụng
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {viewMode === "students" ? (
                  assignedScoreSheetStudentsQuery.isLoading ? (
                    <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
                      Đang tải danh sách học viên...
                    </div>
                  ) : assignedScoreSheetStudentsQuery.isError ? (
                    <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
                      <p className="text-sm text-destructive">
                        {assignedScoreSheetStudentsQuery.error instanceof Error
                          ? assignedScoreSheetStudentsQuery.error.message
                          : "Không thể tải danh sách học viên."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => assignedScoreSheetStudentsQuery.refetch()}
                      >
                        Thử lại
                      </Button>
                    </div>
                  ) : sortedStudentDates.length === 0 ? (
                    <div className="flex min-h-52 items-center justify-center p-6 text-sm text-muted-foreground">
                      Không có học viên phù hợp với bộ lọc.
                    </div>
                  ) : (
                    <div className="space-y-4 p-3 sm:p-4">
                      {sortedStudentDates.map((dateKey) => {
                        const sessionGroups = Object.values(studentResultsByDate[dateKey] ?? {});
                        const totalStudents = sessionGroups.reduce(
                          (total, group) => total + group.students.length,
                          0,
                        );
                        return (
                          <section key={dateKey} className="overflow-hidden rounded-xl border border-border">
                            <div className="flex flex-wrap items-center gap-3 border-b bg-violet-50/60 px-4 py-2.5 dark:bg-violet-950/30">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40" />
                              <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                                {formatDateLabel(dateKey)}
                              </span>
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                {sessionGroups.length} bảng điểm · {totalStudents} học viên
                              </span>
                            </div>
                            <div className="divide-y">
                              {sessionGroups.map((group) => {
                                const assessment = group.assessment;
                                const assessmentForDialog = assignedScoreSheetAssessmentsQuery.data?.find(
                                  (item) => item.sessionId === assessment.sessionId,
                                );
                                return (
                                  <div key={assessment.sessionId} className="bg-background">
                                    <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-foreground">
                                          {assessment.className || assessment.classCode}
                                          {assessment.sessionIndex != null && (
                                            <span className="ml-1 font-normal text-muted-foreground">
                                              (Buổi {assessment.sessionIndex})
                                            </span>
                                          )}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {assessment.classCode}
                                          {assessment.locationName ? ` · ${assessment.locationName}` : ""}
                                          {assessment.teacherNames ? ` · ${assessment.teacherNames}` : ""}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">
                                          {assessment.templateName || "Bảng điểm chưa đặt tên"}
                                        </span>
                                        <span>Hạn trả {formatAssessmentDeadline(assessment.scoreDeadlineAt)}</span>
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full min-w-[1100px] text-left text-xs">
                                        <thead className="bg-muted/40 text-muted-foreground">
                                          <tr>
                                            <th className="min-w-[210px] px-3 py-2 font-semibold">Học viên</th>
                                            <th className="min-w-[90px] px-3 py-2 text-center font-semibold">Lịch học</th>
                                            <th className="min-w-[120px] px-3 py-2 font-semibold">Ngày thi</th>
                                            <th className="min-w-[125px] px-3 py-2 font-semibold">Ngày phải trả</th>
                                            <th className="min-w-[90px] px-3 py-2 text-center font-semibold">Lần thi</th>
                                            <th className="min-w-[110px] px-3 py-2 font-semibold">Điểm quy đổi</th>
                                            <th className="min-w-[100px] px-3 py-2 font-semibold">Phân loại</th>
                                            <th className="min-w-[100px] px-3 py-2 font-semibold">Kết quả</th>
                                            <th className="min-w-[110px] px-3 py-2 font-semibold">Tình trạng</th>
                                            <th className="min-w-[100px] px-3 py-2 text-center font-semibold">Quản lý</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.students.map((student) => (
                                            <tr key={student.studentId} className="border-t border-border">
                                              <td className="px-3 py-2.5 font-medium">
                                                {student.studentCode} - {student.studentName}
                                              </td>
                                              <td className="px-3 py-2.5 text-center">
                                                {student.sessionIndex != null ? `Buổi ${student.sessionIndex}` : "—"}
                                              </td>
                                              <td className="px-3 py-2.5">{formatAssessmentDate(student.examDate)}</td>
                                              <td className="px-3 py-2.5">{formatAssessmentDeadline(student.scoreDeadlineAt)}</td>
                                              <td className="px-3 py-2.5 text-center">
                                                {student.attemptNumber
                                                  ? `${student.attemptNumber}/${student.attemptCount}`
                                                  : "—"}
                                              </td>
                                              <td className="px-3 py-2.5 font-medium tabular-nums">
                                                {formatScoreValue(student.convertedScore)}
                                              </td>
                                              <td
                                                className="px-3 py-2.5"
                                                style={{ color: student.gradeBandColor ?? undefined }}
                                              >
                                                {student.gradeBandLabel ?? "—"}
                                              </td>
                                              <td className={`px-3 py-2.5 font-bold ${
                                                student.passStatus === "passed"
                                                  ? "text-green-600 dark:text-green-400"
                                                  : student.passStatus === "failed"
                                                    ? "text-red-600 dark:text-red-400"
                                                    : "text-muted-foreground"
                                              }`}>
                                                {student.passStatus === "passed"
                                                  ? "Đạt"
                                                  : student.passStatus === "failed"
                                                    ? "Không đạt"
                                                    : "—"}
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <span className={`inline-flex rounded px-2 py-1 font-normal ${
                                                  student.status === "complete"
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                    : "bg-muted text-muted-foreground"
                                                }`}>
                                                  {student.status === "complete"
                                                    ? "Đã nhập"
                                                    : student.status === "in_progress"
                                                      ? "Đang nhập"
                                                      : "Chưa nhập"}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2.5 text-center">
                                                <div className="inline-flex items-center gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-primary"
                                                    disabled={!assessmentForDialog}
                                                    onClick={() => {
                                                      if (!assessmentForDialog) return;
                                                      setStudentDialogTarget({
                                                        mode: "view",
                                                        assessment: assessmentForDialog,
                                                        student,
                                                      });
                                                    }}
                                                    title={`Xem bảng điểm của ${student.studentName}`}
                                                    aria-label={`Xem bảng điểm của ${student.studentName}`}
                                                    data-testid={`button-view-student-score-${student.studentId}`}
                                                  >
                                                    <Eye className="h-4 w-4" />
                                                  </Button>
                                                  {canEdit && (
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-8 w-8"
                                                      disabled={!assessmentForDialog}
                                                      onClick={() => {
                                                        if (!assessmentForDialog) return;
                                                        setStudentDialogTarget({
                                                          mode: "edit",
                                                          assessment: assessmentForDialog,
                                                          student,
                                                        });
                                                      }}
                                                      title={`Nhập điểm cho ${student.studentName}`}
                                                      aria-label={`Nhập điểm cho ${student.studentName}`}
                                                      data-testid={`button-edit-student-score-${student.studentId}`}
                                                    >
                                                      <Pencil className="h-4 w-4" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )
                ) : (
                <div className="max-h-[min(70vh,680px)] overflow-auto">
                  <table
                    className="w-full min-w-[1435px] border-separate border-spacing-0 text-left text-xs"
                    data-testid="table-score-conversion-assessments"
                  >
                    <thead>
                      <tr className="bg-muted/70 text-muted-foreground">
                        <th className="sticky left-0 top-0 z-30 w-[260px] min-w-[260px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                          Lớp
                        </th>
                        <th className="sticky top-0 z-20 w-[180px] min-w-[180px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Giáo viên
                        </th>
                        <th className="sticky top-0 z-20 w-[190px] min-w-[190px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Bảng điểm
                        </th>
                        <th className="sticky top-0 z-20 w-[200px] min-w-[200px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Số học viên / Đã nhập / Chưa nhập
                        </th>
                        <th className="sticky top-0 z-20 w-[120px] min-w-[120px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Ngày thi
                        </th>
                        <th className="sticky top-0 z-20 w-[145px] min-w-[145px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Hạn trả
                        </th>
                        <th className="sticky top-0 z-20 w-[140px] min-w-[140px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Trạng thái
                        </th>
                        <th className="sticky top-0 z-20 w-[125px] min-w-[125px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Tình trạng
                        </th>
                        <th className="sticky right-0 top-0 z-30 w-[80px] min-w-[80px] border-b border-border bg-muted/95 px-3 py-2.5 text-center font-semibold shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                          Xem
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssessmentDates.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                            Không có bảng điểm phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        sortedAssessmentDates.flatMap((dateKey) => {
                          const assessments = assessmentsByDate[dateKey] ?? [];
                          return [
                            <tr
                              key={`date-${dateKey}`}
                              className="border-b border-t border-violet-200/60 bg-violet-50/60 dark:border-violet-800/30 dark:bg-violet-900/10"
                              data-testid={`row-score-conversion-date-${dateKey}`}
                            >
                              <td colSpan={9} className="sticky left-0 z-20 bg-violet-50/60 py-2.5 dark:bg-violet-950/30">
                                <div className="flex items-center gap-3 px-4">
                                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40" />
                                  <span className="whitespace-nowrap text-xs font-semibold text-violet-700 dark:text-violet-400">
                                    {formatDateLabel(dateKey)}
                                  </span>
                                  <span className="inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                    {assessments.length} bảng điểm
                                  </span>
                                </div>
                              </td>
                            </tr>,
                            ...assessments.map((assessment) => {
                              const status = getAssessmentStatus(assessment, nowWallClockMs);
                              const deadlineStatusKey = resolveScoreSheetAssessmentDeadlineStatus(
                                assessment.scoreDeadlineAt,
                                nowWallClockMs,
                              );
                              const deadlineStatus = deadlineStatusKey
                                ? ASSESSMENT_DEADLINE_STATUS_PRESENTATION[deadlineStatusKey]
                                : null;
                              const completedStudentCount = getCompletedStudentCount(assessment);
                              const notCompletedStudentCount = Math.max(
                                0,
                                assessment.studentCount - completedStudentCount,
                              );
                              const classLabel =
                                assessment.className !== assessment.classCode
                                  ? assessment.className
                                  : assessment.assessmentName ?? assessment.className;
                              return (
                                <tr
                                  key={assessment.sessionId}
                                  className="group"
                                  data-testid={`row-score-conversion-assessment-${assessment.sessionId}`}
                                >
                                  <td className="sticky left-0 z-10 min-w-[260px] border-b border-r border-border bg-card px-3 py-2.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] group-hover:bg-accent/50">
                                    <p className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                                      <span
                                        className="min-w-0 truncate"
                                        title={`${classLabel}${assessment.sessionIndex != null ? ` (Buổi ${assessment.sessionIndex})` : ""}`}
                                      >
                                        {classLabel}
                                        {assessment.sessionIndex != null && (
                                          <span className="ml-1 font-normal text-muted-foreground">
                                            (Buổi {assessment.sessionIndex})
                                          </span>
                                        )}
                                      </span>
                                      {assessment.allStudentsIndividuallyPublished && (
                                        <span
                                          className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                          data-testid={`badge-assessment-published-${assessment.sessionId}`}
                                        >
                                          <CheckCircle2 className="h-3 w-3" />
                                          Đã công bố
                                        </span>
                                      )}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={assessment.classCode}>
                                      {assessment.classCode}
                                    </p>
                                    <p
                                      className="mt-1 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground"
                                      title={assessment.locationName ?? "Chưa xác định cơ sở"}
                                    >
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {assessment.locationName ?? "Chưa xác định cơ sở"}
                                      </span>
                                    </p>
                                  </td>
                                  <td className="max-w-[180px] border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    <span className="flex items-center gap-1.5">
                                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate" title={assessment.teacherNames ?? undefined}>
                                        {assessment.teacherNames ?? "Chưa phân công"}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="max-w-[190px] border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                      <p className="truncate font-medium" title={getScoreSheetTemplateLabel(assessment)}>
                                        {getScoreSheetTemplateLabel(assessment)}
                                    </p>
                                  </td>
                                  <td className="border-b border-r border-border px-3 py-2 group-hover:bg-accent/50">
                                    <div className="space-y-1 whitespace-nowrap">
                                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                        {assessment.studentCount} học viên
                                      </span>
                                      <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Đã nhập: {completedStudentCount}
                                      </span>
                                      <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Circle className="h-3.5 w-3.5" />
                                        Chưa nhập: {notCompletedStudentCount}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    <span className="inline-flex items-center gap-1.5">
                                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                      {formatAssessmentDate(assessment.examDate)}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap border-b border-r border-border px-3 py-2.5 text-muted-foreground group-hover:bg-accent/50">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {formatAssessmentDeadline(assessment.scoreDeadlineAt)}
                                    </span>
                                  </td>
                                  <td className="border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    {status ? (
                                      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${status.className}`}>
                                        {status.indicator} {status.label}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground" aria-label="Chưa có trạng thái">—</span>
                                    )}
                                  </td>
                                  <td className="border-b border-r border-border px-3 py-2 group-hover:bg-accent/50">
                                    {deadlineStatus ? (
                                      <span className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${deadlineStatus.className}`}>
                                        {deadlineStatus.label}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground" aria-label="Chưa có hạn trả">—</span>
                                    )}
                                  </td>
                                  <td className="sticky right-0 z-10 border-b border-border bg-card px-2 py-2 text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)] group-hover:bg-accent/50">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-primary"
                                      aria-label={`Xem danh sách học viên: ${getScoreSheetTemplateLabel(assessment)} - ${assessment.classCode}`}
                                      onClick={() => setSelectedAssessment(assessment)}
                                    >
                                      <Eye className="mr-1 h-3.5 w-3.5" />
                                      Xem
                                    </Button>
                                  </td>
                                </tr>
                              );
                            }),
                          ];
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <ScoreConversionTemplateDialog
        open={dialogOpen}
        template={editingTemplate}
        templates={savedTemplates}
        initialTypeKey={initialTypeKey}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
      <ScoreSheetTemplateDialog
        open={scoreSheetDialogOpen}
        template={editingScoreSheetTemplate}
        initialTemplate={initialScoreSheetTemplate}
        conversionTemplates={savedTemplates}
        conversionTemplatesLoading={templatesQuery.isLoading}
        saving={saveScoreSheetTemplateMutation.isPending}
        onOpenChange={(open) => {
          setScoreSheetDialogOpen(open);
          if (!open) setInitialScoreSheetTemplate(null);
        }}
        onSave={handleSaveScoreSheetTemplate}
      />
      <AlertDialog
        open={Boolean(pendingTemplateDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingTemplate) setPendingTemplateDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTemplateDelete?.kind === "conversion"
                ? "Xóa cấu hình điểm quy đổi?"
                : "Xóa bảng điểm mẫu?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTemplateDelete && (
                <>
                  Bạn có chắc muốn xóa <strong>{pendingTemplateDelete.name}</strong>? Thao tác này không thể hoàn tác.
                  Bảng đã được gán vào buổi học sẽ không thể xóa.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTemplate}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmTemplateDelete}
              disabled={!pendingTemplateDelete || deletingTemplate}
            >
              {deletingTemplate ? "Đang xóa..." : "Xóa"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <StaffScoreSheetAssessmentStudentsDialog
        assessment={selectedAssessment}
        open={!!selectedAssessment}
        canManageScores={canEdit}
        canManagePublication
        onOpenChange={(open) => {
          if (!open) setSelectedAssessment(null);
        }}
      />
      <StaffScoreSheetAssessmentScoreDialog
        assessment={studentDialogTarget?.assessment ?? null}
        student={studentDialogTarget ? {
          studentId: studentDialogTarget.student.studentId,
          code: studentDialogTarget.student.studentCode,
          fullName: studentDialogTarget.student.studentName,
          individuallyPublished: studentDialogTarget.student.individuallyPublished,
          hasPublishableScore: studentDialogTarget.student.hasPublishableScore,
        } : null}
        mode={studentDialogTarget?.mode ?? "edit"}
        canManagePublication={canEdit}
        open={!!studentDialogTarget}
        onOpenChange={(open) => {
          if (!open) setStudentDialogTarget(null);
        }}
        onSaved={() => {
          void assignedScoreSheetStudentsQuery.refetch();
          void assignedScoreSheetAssessmentsQuery.refetch();
        }}
      />
    </DashboardLayout>
  );
}