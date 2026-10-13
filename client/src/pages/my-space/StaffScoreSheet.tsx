import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { BarChart3, BookOpen, CalendarDays, Clock3, Eye, Pencil, Plus, Users, CheckCircle2, Clock, Circle, CircleDot, Download, Filter, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { downloadClassGradeBookExcel } from "@/lib/gradeBookExcelExport";
import { getConversionScoreSheetFilterId } from "@/lib/scoreSheetFilter";
import { GradeBookEditDialog } from "@/components/education/GradeBookEditDialog";
import { GradeBookCreateDialog } from "@/components/education/GradeBookCreateDialog";
import {
  StaffScoreSheetAssessmentStudentsDialog,
  type StaffAssignedScoreSheetAssessment,
} from "@/components/education/StaffScoreSheetAssessmentStudentsDialog";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { useLanguage } from "@/hooks/use-language";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  resolveScoreSheetAssessmentDeadlineStatus,
  resolveScoreSheetAssessmentStatus,
  type ScoreSheetAssessmentDeadlineStatus,
  type ScoreSheetAssessmentStatus,
} from "@shared/score-sheet-assessment-status";

type StaffGradeBookRow = {
  id: string;
  title: string;
  classId: string;
  classCode: string;
  className: string;
  locationName?: string | null;
  scoreSheetId: string;
  scoreSheetName: string;
  sessionId: string | null;
  sessionIndex: number | null;
  sessionDate: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  scoreCount: number;
  studentCount: number;
  createdByName: string | null;
  updatedByName: string | null;
};

type ScoreSheetTimelineEntry =
  | {
      kind: "grade-book";
      id: string;
      dateKey: string;
      gradeBook: StaffGradeBookRow;
    }
  | {
      kind: "conversion";
      id: string;
      dateKey: string;
      assessment: StaffAssignedScoreSheetAssessment;
    };

type StaffScoreSheetTab = "all" | "regular" | "conversion";

type StatusPresentation = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const SCORE_SHEET_DETAILS_GRID_CLASS = "grid grid-cols-2 items-start gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6";

const ASSESSMENT_STATUS_PRESENTATION: Record<ScoreSheetAssessmentStatus, StatusPresentation> = {
  not_started: {
    label: "Chưa thi",
    Icon: Circle,
    className: "text-violet-700 dark:text-violet-300",
  },
  in_progress: {
    label: "Đang thi",
    Icon: CircleDot,
    className: "text-primary dark:text-blue-300",
  },
  processing: {
    label: "Đang xử lý",
    Icon: Clock3,
    className: "text-orange-700 dark:text-orange-300",
  },
  completed: {
    label: "Hoàn thành",
    Icon: CheckCircle2,
    className: "text-green-700 dark:text-green-400",
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

const ASSESSMENT_DEADLINE_FILTER_PRESENTATION: Record<
  ScoreSheetAssessmentDeadlineStatus,
  { label: string }
> = {
  within_deadline: { label: "Trong hạn" },
  overdue: { label: "Quá hạn" },
};

const ASSESSMENT_DEADLINE_STATUS_PRESENTATION: Record<
  ScoreSheetAssessmentDeadlineStatus,
  Pick<StatusPresentation, "label" | "Icon" | "className">
> = {
  within_deadline: {
    label: "Trong hạn",
    Icon: Clock3,
    className: "text-emerald-700 dark:text-emerald-300",
  },
  overdue: {
    label: "Quá hạn",
    Icon: Clock3,
    className: "text-red-700 dark:text-red-300",
  },
};

const formatDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

const formatAssessmentDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(d);
};

const formatAssessmentDeadline = (d: string | null | undefined) => {
  if (!d) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(d);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : "—";
};

const getBangkokWallClockMs = (date: Date) => {
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
};

const formatDateLabel = (d: string, lang: "vi" | "en") => {
  try {
    return format(new Date(d), "EEEE, dd/MM/yyyy", { locale: lang === "vi" ? vi : enUS });
  } catch { return d; }
};

export function StaffScoreSheet() {
  const { t, lang } = useLanguage();
  const { data: myPermissions } = useMyPermissions();
  const [editingBook, setEditingBook] = useState<StaffGradeBookRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<StaffAssignedScoreSheetAssessment | null>(null);
  const [exportingBookId, setExportingBookId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StaffScoreSheetTab>("all");
  const [classFilters, setClassFilters] = useState<string[]>([]);
  const [scoreSheetFilters, setScoreSheetFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [conversionSearchInput, setConversionSearchInput] = useState("");
  const [conversionSearchTerm, setConversionSearchTerm] = useState("");
  const [conversionClassFilters, setConversionClassFilters] = useState<string[]>([]);
  const [conversionTeacherFilters, setConversionTeacherFilters] = useState<string[]>([]);
  const [conversionAssessmentFilters, setConversionAssessmentFilters] = useState<string[]>([]);
  const [conversionStatusFilters, setConversionStatusFilters] = useState<ScoreSheetAssessmentStatus[]>([]);
  const [conversionDeadlineStatusFilters, setConversionDeadlineStatusFilters] = useState<ScoreSheetAssessmentDeadlineStatus[]>([]);
  const [conversionExamDateFrom, setConversionExamDateFrom] = useState("");
  const [conversionExamDateTo, setConversionExamDateTo] = useState("");
  const [conversionDeadlineDateFrom, setConversionDeadlineDateFrom] = useState("");
  const [conversionDeadlineDateTo, setConversionDeadlineDateTo] = useState("");
  const [conversionFilterDialogOpen, setConversionFilterDialogOpen] = useState(false);
  const [regularSearchInput, setRegularSearchInput] = useState("");
  const [regularClassFilters, setRegularClassFilters] = useState<string[]>([]);
  const [regularScoreSheetFilters, setRegularScoreSheetFilters] = useState<string[]>([]);
  const [regularPublicationFilter, setRegularPublicationFilter] = useState<"unpublished" | "published">("unpublished");
  const { toast } = useToast();
  const scoreSheetPermissions = myPermissions?.permissions["/my-space/score-sheet"];
  const canCreateGradeBook = myPermissions?.isSuperAdmin === true
    || scoreSheetPermissions?.canCreate === true;
  const canEditGradeBook = myPermissions?.isSuperAdmin === true
    || scoreSheetPermissions?.canEdit === true;

  const { data, isLoading, refetch } = useQuery<StaffGradeBookRow[]>({
    queryKey: ["/api/my-space/score-sheet/staff"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/score-sheet/staff", { credentials: "include" });
      if (!res.ok) throw new Error(t("mySpace.scoreSheet.loadError"));
      return res.json();
    },
  });

  const {
    data: assignedAssessmentsData,
    isLoading: isLoadingAssignedAssessments,
    isError: isAssignedAssessmentsError,
  } = useQuery<StaffAssignedScoreSheetAssessment[]>({
    queryKey: ["/api/my-space/score-sheet/staff-assessments"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/score-sheet/staff-assessments", { credentials: "include" });
      if (!res.ok) throw new Error(t("mySpace.scoreSheet.assignedLoadError"));
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const gradeBooks = data ?? [];
  const assignedAssessments = assignedAssessmentsData ?? [];
  const nowWallClockMs = getBangkokWallClockMs(new Date());

  const classOptionsById = new Map<string, string>();
  gradeBooks.forEach((book) => {
    classOptionsById.set(
      book.classId,
      book.className !== book.classCode ? `${book.classCode} — ${book.className}` : book.classCode,
    );
  });
  assignedAssessments.forEach((assessment) => {
    classOptionsById.set(
      assessment.classId,
      assessment.className !== assessment.classCode
        ? `${assessment.classCode} — ${assessment.className}`
        : assessment.classCode,
    );
  });
  const classFilterOptions = Array.from(classOptionsById, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const regularClassOptionsById = new Map<string, string>();
  gradeBooks.forEach((book) => {
    regularClassOptionsById.set(
      book.classId,
      book.className !== book.classCode ? `${book.classCode} — ${book.className}` : book.classCode,
    );
  });
  const regularClassFilterOptions = Array.from(regularClassOptionsById, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const scoreSheetOptionsById = new Map<string, string>();
  gradeBooks.forEach((book) => {
    scoreSheetOptionsById.set(
      `regular:${book.scoreSheetId}`,
      book.scoreSheetName || t("mySpace.scoreSheet.unavailableSheet"),
    );
  });
  assignedAssessments.forEach((assessment) => {
    scoreSheetOptionsById.set(
      getConversionScoreSheetFilterId(assessment),
      assessment.templateName || assessment.assessmentName || t("mySpace.scoreSheet.unavailableSheet"),
    );
  });
  const scoreSheetFilterOptions = Array.from(scoreSheetOptionsById, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const regularScoreSheetOptionsById = new Map<string, string>();
  gradeBooks.forEach((book) => {
    regularScoreSheetOptionsById.set(
      `regular:${book.scoreSheetId}`,
      book.scoreSheetName || t("mySpace.scoreSheet.unavailableSheet"),
    );
  });
  const regularScoreSheetFilterOptions = Array.from(regularScoreSheetOptionsById, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const statusFilterOptions = [
    { value: "publication:unpublished", label: t("mySpace.scoreSheet.unpublished") },
    { value: "publication:published", label: t("mySpace.scoreSheet.published") },
    ...Object.entries(ASSESSMENT_STATUS_PRESENTATION).map(([key, status]) => ({
      value: `assessment:${key}`,
      label: status.label,
    })),
    ...Object.entries(ASSESSMENT_DEADLINE_STATUS_PRESENTATION).map(([key, status]) => ({
      value: `deadline:${key}`,
      label: status.label,
    })),
    { value: "deadline:none", label: t("mySpace.scoreSheet.notDue") },
  ];

  const conversionClassFilterOptions = useMemo(() => {
    const options = new Map<string, string>();
    assignedAssessments.forEach((assessment) => {
      options.set(
        assessment.classId,
        assessment.className !== assessment.classCode
          ? `${assessment.classCode} — ${assessment.className}`
          : assessment.classCode,
      );
    });
    return Array.from(options, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  }, [assignedAssessments, lang]);

  const conversionTeacherFilterOptions = useMemo(() => {
    const names = new Set<string>();
    assignedAssessments.forEach((assessment) => {
      assessment.teacherNames?.split(",").map((name) => name.trim()).filter(Boolean)
        .forEach((name) => names.add(name));
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, lang))
      .map((name) => ({ value: name, label: name }));
  }, [assignedAssessments, lang]);

  const conversionAssessmentFilterOptions = useMemo(() => {
    const names = new Set<string>();
    assignedAssessments.forEach((assessment) => {
      const label = assessment.templateName || assessment.assessmentName || t("mySpace.scoreSheet.unavailableSheet");
      names.add(label);
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, lang))
      .map((name) => ({ value: name, label: name }));
  }, [assignedAssessments, lang, t]);

  const handleExportGradeBook = async (book: StaffGradeBookRow) => {
    setExportingBookId(book.id);
    try {
      await downloadClassGradeBookExcel({
        classId: book.classId,
        gradeBookId: book.id,
        scoreSheetId: book.scoreSheetId,
        locationName: book.locationName,
        className: book.className || book.classCode,
        title: book.title,
        scoreSheetName: book.scoreSheetName,
      });
      toast({ title: "Đã tải bảng điểm Excel", description: book.title });
    } catch (error) {
      toast({
        title: "Không thể tải bảng điểm Excel",
        description: error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setExportingBookId(null);
    }
  };

  const timelineEntries: ScoreSheetTimelineEntry[] = [
    ...gradeBooks.map((gradeBook) => ({
      kind: "grade-book" as const,
      id: gradeBook.id,
      dateKey: gradeBook.sessionDate
        ? gradeBook.sessionDate.substring(0, 10)
        : gradeBook.createdAt.substring(0, 10),
      gradeBook,
    })),
    ...assignedAssessments.map((assessment) => ({
      kind: "conversion" as const,
      id: assessment.sessionId,
      dateKey: assessment.examDate.substring(0, 10),
      assessment,
    })),
  ];

  const activeConversionFilterCount = [
    conversionClassFilters.length > 0,
    conversionTeacherFilters.length > 0,
    conversionAssessmentFilters.length > 0,
    conversionStatusFilters.length > 0,
    conversionDeadlineStatusFilters.length > 0,
    Boolean(conversionExamDateFrom || conversionExamDateTo),
    Boolean(conversionDeadlineDateFrom || conversionDeadlineDateTo),
  ].filter(Boolean).length;

  const clearConversionFilters = () => {
    setConversionSearchInput("");
    setConversionSearchTerm("");
    setConversionClassFilters([]);
    setConversionTeacherFilters([]);
    setConversionAssessmentFilters([]);
    setConversionStatusFilters([]);
    setConversionDeadlineStatusFilters([]);
    setConversionExamDateFrom("");
    setConversionExamDateTo("");
    setConversionDeadlineDateFrom("");
    setConversionDeadlineDateTo("");
  };

  const matchesConversionFilters = (assessment: StaffAssignedScoreSheetAssessment) => {
    const statusKey = resolveScoreSheetAssessmentStatus(assessment, nowWallClockMs);
    const deadlineStatusKey = resolveScoreSheetAssessmentDeadlineStatus(
      assessment.scoreDeadlineAt,
      nowWallClockMs,
    );
    const assessmentDate = assessment.examDate.substring(0, 10);
    const deadlineDate = assessment.scoreDeadlineAt?.substring(0, 10) ?? "";
    const assessmentLabel = assessment.templateName || assessment.assessmentName || t("mySpace.scoreSheet.unavailableSheet");
    const teacherNames = assessment.teacherNames?.split(",").map((name) => name.trim()).filter(Boolean) ?? [];

    if (conversionClassFilters.length > 0 && !conversionClassFilters.includes(assessment.classId)) return false;
    if (
      conversionTeacherFilters.length > 0
      && !conversionTeacherFilters.some((teacher) => teacherNames.includes(teacher))
    ) return false;
    if (conversionAssessmentFilters.length > 0 && !conversionAssessmentFilters.includes(assessmentLabel)) return false;
    if (conversionStatusFilters.length > 0 && (!statusKey || !conversionStatusFilters.includes(statusKey))) return false;
    if (
      conversionDeadlineStatusFilters.length > 0
      && (!deadlineStatusKey || !conversionDeadlineStatusFilters.includes(deadlineStatusKey))
    ) return false;
    if (conversionExamDateFrom && assessmentDate < conversionExamDateFrom) return false;
    if (conversionExamDateTo && assessmentDate > conversionExamDateTo) return false;
    if (conversionDeadlineDateFrom && (!deadlineDate || deadlineDate < conversionDeadlineDateFrom)) return false;
    if (conversionDeadlineDateTo && (!deadlineDate || deadlineDate > conversionDeadlineDateTo)) return false;

    const searchTerm = conversionSearchTerm.trim().toLocaleLowerCase("vi");
    if (
      searchTerm
      && ![
        assessment.classCode,
        assessment.className,
        assessment.locationName,
        assessment.teacherNames,
        assessment.assessmentCode,
        assessment.assessmentName,
        assessment.templateName,
      ].some((value) => value?.toLocaleLowerCase("vi").includes(searchTerm))
    ) return false;

    return true;
  };

  const filteredTimelineEntries = timelineEntries.filter((entry) => {
    if (activeTab === "conversion") {
      return entry.kind === "conversion" && matchesConversionFilters(entry.assessment);
    }
    if (activeTab === "regular") {
      if (entry.kind !== "grade-book") return false;
      const book = entry.gradeBook;
      if (book.published !== (regularPublicationFilter === "published")) return false;
      if (regularClassFilters.length > 0 && !regularClassFilters.includes(book.classId)) return false;
      if (
        regularScoreSheetFilters.length > 0
        && !regularScoreSheetFilters.includes(`regular:${book.scoreSheetId}`)
      ) return false;
      const searchTerm = regularSearchInput.trim().toLocaleLowerCase("vi");
      if (
        searchTerm
        && ![
          book.title,
          book.classCode,
          book.className,
          book.locationName,
          book.scoreSheetName,
        ].some((value) => value?.toLocaleLowerCase("vi").includes(searchTerm))
      ) return false;
      return true;
    }

    const classId = entry.kind === "grade-book" ? entry.gradeBook.classId : entry.assessment.classId;
    if (classFilters.length > 0 && !classFilters.includes(classId)) return false;

    const scoreSheetId = entry.kind === "grade-book"
      ? `regular:${entry.gradeBook.scoreSheetId}`
      : getConversionScoreSheetFilterId(entry.assessment);
    if (scoreSheetFilters.length > 0 && !scoreSheetFilters.includes(scoreSheetId)) return false;

    if (statusFilters.length === 0) return true;

    const availableStatuses = new Set<string>();
    if (entry.kind === "grade-book") {
      availableStatuses.add(`publication:${entry.gradeBook.published ? "published" : "unpublished"}`);
    } else {
      const assessment = entry.assessment;
      availableStatuses.add(
        `publication:${assessment.published || assessment.allStudentsIndividuallyPublished ? "published" : "unpublished"}`,
      );
      const statusKey = resolveScoreSheetAssessmentStatus(assessment, nowWallClockMs);
      if (statusKey) availableStatuses.add(`assessment:${statusKey}`);
      const deadlineStatusKey = resolveScoreSheetAssessmentDeadlineStatus(
        assessment.scoreDeadlineAt,
        nowWallClockMs,
      );
      if (deadlineStatusKey) {
        availableStatuses.add(`deadline:${deadlineStatusKey}`);
      } else if (!assessment.scoreDeadlineAt) {
        availableStatuses.add("deadline:none");
      }
    }
    return statusFilters.some((status) => availableStatuses.has(status));
  });

  // One timeline for legacy grade books and conversion assessments, grouped by exam/session date.
  const grouped = filteredTimelineEntries.reduce<Record<string, ScoreSheetTimelineEntry[]>>((acc, entry) => {
    const dateKey = entry.dateKey;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (isLoading) {
    return (
      <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="text-lg font-semibold sm:text-xl">{t("mySpace.scoreSheet.title")}</h1>
          </div>
          <PageGuideButton pageTitle={t("mySpace.scoreSheet.title")} className="shrink-0" />
        </div>
        <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="truncate text-lg font-semibold sm:text-xl">{t("mySpace.scoreSheet.title")}</h1>
          {timelineEntries.length > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {filteredTimelineEntries.length} {t("mySpace.scoreSheet.count")}
            </Badge>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canCreateGradeBook && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="button-add-grade-book-staff"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("mySpace.scoreSheet.add")}
            </Button>
          )}
          <PageGuideButton pageTitle={t("mySpace.scoreSheet.title")} className="shrink-0" />
        </div>
      </div>

      {isAssignedAssessmentsError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {t("mySpace.scoreSheet.assignedLoadError")}
        </div>
      )}

      {timelineEntries.length > 0 && (
        <div className="space-y-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as StaffScoreSheetTab)}
          >
            <TabsList className="flex h-auto w-full flex-wrap items-center gap-2 bg-transparent p-0 sm:w-fit">
              <TabsTrigger value="all" className="min-h-9 whitespace-normal rounded-md border border-input bg-background px-3 py-2 text-xs leading-tight text-foreground shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.tabAll")}
              </TabsTrigger>
              <TabsTrigger value="regular" className="min-h-9 whitespace-normal rounded-md border border-input bg-background px-3 py-2 text-xs leading-tight text-foreground shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.regularSheet")}
              </TabsTrigger>
              <TabsTrigger value="conversion" className="min-h-9 whitespace-normal rounded-md border border-input bg-background px-3 py-2 text-xs leading-tight text-foreground shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.conversionSheet")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "conversion" ? (
            <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <form
                  className="relative w-full xl:max-w-md"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setConversionSearchTerm(conversionSearchInput.trim());
                  }}
                >
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={conversionSearchInput}
                    onChange={(event) => setConversionSearchInput(event.target.value)}
                    placeholder="Tìm lớp, giáo viên, bảng điểm..."
                    aria-label="Tìm bảng điểm quy đổi"
                    data-testid="search-my-space-score-conversion"
                    className="h-9 w-full rounded-full border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {conversionSearchInput && (
                    <button
                      type="button"
                      aria-label="Xóa nội dung tìm kiếm"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setConversionSearchInput("");
                        setConversionSearchTerm("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </form>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={conversionStatusFilters.length === 0 ? "default" : "outline"}
                    className="h-8 rounded-full px-3"
                    onClick={() => setConversionStatusFilters([])}
                    data-testid="quick-filter-my-space-score-conversion-all"
                  >
                    Tất cả
                  </Button>
                  {([
                    { value: "in_progress", label: "Đang thi" },
                    { value: "completed", label: "Hoàn thành" },
                    { value: "not_started", label: "Chưa thi" },
                  ] as const).map(({ value, label }) => {
                    const colors = ASSESSMENT_FILTER_COLORS[value];
                    const active = conversionStatusFilters.length === 1
                      && conversionStatusFilters[0] === value;
                    return (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`h-8 rounded-full px-3 ${active ? colors.active : colors.idle}`}
                        onClick={() => setConversionStatusFilters([value])}
                        data-testid={`quick-filter-my-space-score-conversion-${value}`}
                      >
                        <span className={`mr-1.5 h-2 w-2 rounded-full ${colors.dot}`} />
                        {label}
                      </Button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 xl:ml-auto">
                  {(activeConversionFilterCount > 0 || conversionSearchTerm) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground"
                      onClick={clearConversionFilters}
                      data-testid="clear-my-space-score-conversion-filters"
                    >
                      Xóa lọc
                    </Button>
                  )}
                  <Dialog open={conversionFilterDialogOpen} onOpenChange={setConversionFilterDialogOpen}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2"
                      data-testid="open-my-space-score-conversion-filters"
                      onClick={() => setConversionFilterDialogOpen(true)}
                    >
                      <Filter className="h-4 w-4" />
                      Bộ lọc
                      {activeConversionFilterCount > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {activeConversionFilterCount}
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
                            options={conversionClassFilterOptions}
                            value={conversionClassFilters}
                            onChange={setConversionClassFilters}
                            placeholder="Chọn lớp"
                            searchPlaceholder="Tìm lớp..."
                            data-testid="filter-my-space-score-conversion-class"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Giáo viên</label>
                          <SearchableMultiSelect
                            options={conversionTeacherFilterOptions}
                            value={conversionTeacherFilters}
                            onChange={setConversionTeacherFilters}
                            placeholder="Chọn giáo viên"
                            searchPlaceholder="Tìm giáo viên..."
                            data-testid="filter-my-space-score-conversion-teacher"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Bảng điểm</label>
                          <SearchableMultiSelect
                            options={conversionAssessmentFilterOptions}
                            value={conversionAssessmentFilters}
                            onChange={setConversionAssessmentFilters}
                            placeholder="Chọn bảng điểm"
                            searchPlaceholder="Tìm bảng điểm..."
                            data-testid="filter-my-space-score-conversion-assessment"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Trạng thái</label>
                          <SearchableMultiSelect
                            options={Object.entries(ASSESSMENT_STATUS_PRESENTATION).map(([key, status]) => ({
                              value: key,
                              label: status.label,
                            }))}
                            value={conversionStatusFilters}
                            onChange={(values) => setConversionStatusFilters(values as ScoreSheetAssessmentStatus[])}
                            placeholder="Chọn trạng thái"
                            searchPlaceholder="Tìm trạng thái..."
                            data-testid="filter-my-space-score-conversion-status"
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
                                value={conversionExamDateFrom}
                                onChange={(event) => setConversionExamDateFrom(event.target.value)}
                                className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                              />
                            </label>
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span>Đến</span>
                              <input
                                type="date"
                                aria-label="Lọc ngày thi đến"
                                value={conversionExamDateTo}
                                onChange={(event) => setConversionExamDateTo(event.target.value)}
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
                                value={conversionDeadlineDateFrom}
                                onChange={(event) => setConversionDeadlineDateFrom(event.target.value)}
                                className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                              />
                            </label>
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span>Đến</span>
                              <input
                                type="date"
                                aria-label="Lọc hạn trả đến"
                                value={conversionDeadlineDateTo}
                                onChange={(event) => setConversionDeadlineDateTo(event.target.value)}
                                className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                              />
                            </label>
                          </div>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-sm font-medium">Tình trạng hạn trả</label>
                          <SearchableMultiSelect
                            options={Object.entries(ASSESSMENT_DEADLINE_FILTER_PRESENTATION).map(([key, status]) => ({
                              value: key,
                              label: status.label,
                            }))}
                            value={conversionDeadlineStatusFilters}
                            onChange={(values) => setConversionDeadlineStatusFilters(values as ScoreSheetAssessmentDeadlineStatus[])}
                            placeholder="Chọn tình trạng"
                            searchPlaceholder="Tìm tình trạng..."
                            data-testid="filter-my-space-score-conversion-deadline-status"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={clearConversionFilters}>
                          Xóa tất cả
                        </Button>
                        <Button type="button" onClick={() => setConversionFilterDialogOpen(false)}>
                          Áp dụng
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          ) : activeTab === "regular" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 sm:p-4 lg:flex-nowrap">
              <form
                className="relative min-w-[190px] flex-1 basis-[220px] xl:max-w-sm"
                onSubmit={(event) => event.preventDefault()}
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={regularSearchInput}
                  onChange={(event) => setRegularSearchInput(event.target.value)}
                  placeholder="Tìm lớp, bảng điểm..."
                  aria-label="Tìm bảng điểm thường"
                  data-testid="search-my-space-regular-score-sheet"
                  className="h-9 w-full rounded-full border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                {regularSearchInput && (
                  <button
                    type="button"
                    aria-label="Xóa nội dung tìm kiếm bảng điểm thường"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setRegularSearchInput("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>

              <div
                role="tablist"
                aria-label="Trạng thái công bố bảng điểm thường"
                className="flex shrink-0 items-center gap-1.5"
              >
                <Button
                  type="button"
                  role="tab"
                  aria-selected={regularPublicationFilter === "unpublished"}
                  size="sm"
                  variant={regularPublicationFilter === "unpublished" ? "default" : "outline"}
                  className="h-9 whitespace-nowrap rounded-full px-3"
                  onClick={() => setRegularPublicationFilter("unpublished")}
                  data-testid="quick-filter-my-space-regular-unpublished"
                >
                  {t("mySpace.scoreSheet.unpublished")}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={regularPublicationFilter === "published"}
                  size="sm"
                  variant={regularPublicationFilter === "published" ? "default" : "outline"}
                  className="h-9 whitespace-nowrap rounded-full px-3"
                  onClick={() => setRegularPublicationFilter("published")}
                  data-testid="quick-filter-my-space-regular-published"
                >
                  {t("mySpace.scoreSheet.published")}
                </Button>
              </div>

              <div className="flex min-w-[290px] flex-[2] items-center gap-2">
                <div className="min-w-0 flex-1 xl:w-40 xl:flex-none">
                  <span className="sr-only">{t("mySpace.scoreSheet.filterClass")}</span>
                  <SearchableMultiSelect
                    options={regularClassFilterOptions}
                    value={regularClassFilters}
                    onChange={setRegularClassFilters}
                    placeholder={t("mySpace.scoreSheet.filterAllClasses")}
                    searchPlaceholder={t("mySpace.scoreSheet.filterSearchClasses")}
                    compactSelectionLabel="lớp"
                    className="h-9 bg-background"
                    data-testid="filter-my-space-score-sheet-class"
                  />
                </div>
                <div className="min-w-0 flex-1 xl:w-40 xl:flex-none">
                  <span className="sr-only">{t("mySpace.scoreSheet.filterScoreSheet")}</span>
                  <SearchableMultiSelect
                    options={regularScoreSheetFilterOptions}
                    value={regularScoreSheetFilters}
                    onChange={setRegularScoreSheetFilters}
                    placeholder={t("mySpace.scoreSheet.filterAllScoreSheets")}
                    searchPlaceholder={t("mySpace.scoreSheet.filterSearchScoreSheets")}
                    compactSelectionLabel="bảng điểm"
                    className="h-9 bg-background"
                    data-testid="filter-my-space-score-sheet-template"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("mySpace.scoreSheet.filterClass")}
                  </label>
                  <SearchableMultiSelect
                    options={classFilterOptions}
                    value={classFilters}
                    onChange={setClassFilters}
                    placeholder={t("mySpace.scoreSheet.filterAllClasses")}
                    searchPlaceholder={t("mySpace.scoreSheet.filterSearchClasses")}
                    className="w-full bg-background"
                    data-testid="filter-my-space-score-sheet-class"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("mySpace.scoreSheet.filterScoreSheet")}
                  </label>
                  <SearchableMultiSelect
                    options={scoreSheetFilterOptions}
                    value={scoreSheetFilters}
                    onChange={setScoreSheetFilters}
                    placeholder={t("mySpace.scoreSheet.filterAllScoreSheets")}
                    searchPlaceholder={t("mySpace.scoreSheet.filterSearchScoreSheets")}
                    className="w-full bg-background"
                    data-testid="filter-my-space-score-sheet-template"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("mySpace.scoreSheet.filterStatus")}
                  </label>
                  <SearchableMultiSelect
                    options={statusFilterOptions}
                    value={statusFilters}
                    onChange={setStatusFilters}
                    placeholder={t("mySpace.scoreSheet.filterAllStatuses")}
                    searchPlaceholder={t("mySpace.scoreSheet.filterSearchStatuses")}
                    className="w-full bg-background"
                    data-testid="filter-my-space-score-sheet-status"
                  />
                </div>
              </div>

              {(activeTab !== "all" || classFilters.length > 0 || scoreSheetFilters.length > 0 || statusFilters.length > 0) && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => {
                      setActiveTab("all");
                      setClassFilters([]);
                      setScoreSheetFilters([]);
                      setStatusFilters([]);
                    }}
                  >
                    {t("mySpace.scoreSheet.filterClear")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {timelineEntries.length === 0 ? (
        !isLoadingAssignedAssessments
        && !isAssignedAssessmentsError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <BookOpen className="h-10 w-10 opacity-25" />
            <p className="text-sm">{t("mySpace.scoreSheet.staffEmpty")}</p>
          </div>
        ) : null
      ) : filteredTimelineEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">{t("mySpace.scoreSheet.filterNoResults")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "conversion") {
                clearConversionFilters();
                return;
              }
              setActiveTab("all");
              setClassFilters([]);
              setScoreSheetFilters([]);
              setStatusFilters([]);
            }}
          >
            {t("mySpace.scoreSheet.filterClear")}
          </Button>
        </div>
      ) : (
        <div className="-mx-3 space-y-0 bg-gray-100 px-3 py-4 sm:-mx-4 sm:px-4 dark:bg-muted/20">
            {sortedDates.map((dateKey, dateIdx) => {
            const entries = grouped[dateKey];
            const isLast = dateIdx === sortedDates.length - 1;

            return (
              <div key={dateKey} className="flex min-w-0 gap-3">
                {/* Timeline spine */}
                <div className="flex w-5 shrink-0 flex-col items-center pt-1 sm:w-8">
                  <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40" />
                  {!isLast && (
                    <div className="mt-2 min-h-6 w-px flex-1 bg-violet-200 dark:bg-violet-900" />
                  )}
                </div>

                {/* Date + cards */}
                <div className="flex-1 pb-6 min-w-0">
                  {/* Date label */}
                  <p className="mb-2 text-xs font-semibold capitalize tracking-wide text-violet-700 dark:text-violet-400">
                    {formatDateLabel(dateKey, lang)}
                  </p>

                  <div className="space-y-2">
                    {entries.map((entry) => {
                      if (entry.kind === "conversion") {
                        const assessment = entry.assessment;
                        const statusKey = resolveScoreSheetAssessmentStatus(assessment, nowWallClockMs);
                        const status = statusKey ? ASSESSMENT_STATUS_PRESENTATION[statusKey] : null;
                        const deadlineStatusKey = resolveScoreSheetAssessmentDeadlineStatus(
                          assessment.scoreDeadlineAt,
                          nowWallClockMs,
                        );
                        const deadlineStatus = deadlineStatusKey
                          ? ASSESSMENT_DEADLINE_STATUS_PRESENTATION[deadlineStatusKey]
                          : null;
                        const AssessmentStatusIcon = status?.Icon;
                        const DeadlineStatusIcon = deadlineStatus?.Icon;
                        const allStudentsComplete = assessment.studentCount > 0
                          && assessment.completedStudentCount >= assessment.studentCount;
                        const scoreProgressLabel = allStudentsComplete
                          ? t("mySpace.scoreSheet.enteredAll")
                          : assessment.enteredStudentCount > 0
                            ? `${assessment.enteredStudentCount}/${assessment.studentCount} ${t("mySpace.scoreSheet.enteredProgress")}`
                            : t("mySpace.scoreSheet.notEntered");
                        return (
                          <div
                            key={`conversion:${entry.id}`}
                            role="button"
                            tabIndex={0}
                            aria-haspopup="dialog"
                            aria-label={`${t("mySpace.scoreSheet.viewStudents")}: ${assessment.assessmentName ?? t("mySpace.scoreSheet.conversionSheet")} - ${assessment.classCode}`}
                            onClick={() => setSelectedAssessment(assessment)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedAssessment(assessment);
                              }
                            }}
                            className="min-w-0 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm transition-colors hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-border dark:bg-card sm:px-4"
                            data-testid={`row-staff-conversion-assessment-${assessment.sessionId}`}
                          >
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold leading-tight text-gray-800 dark:text-foreground">
                                  {assessment.assessmentName ?? t("mySpace.scoreSheet.unavailableSheet")}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-muted-foreground">
                                  {assessment.classCode}
                                  {assessment.className !== assessment.classCode && ` — ${assessment.className}`}
                                  {assessment.sessionIndex != null && (
                                    <> · {t("mySpace.scoreSheet.session")} {assessment.sessionIndex}</>
                                  )}
                                </p>
                                <Badge className="mt-1 w-fit rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/40">
                                  {t("mySpace.scoreSheet.conversionSheet")}
                                </Badge>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{t("mySpace.scoreSheet.view")}</span>
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 pt-2 dark:border-border">
                              <div className={SCORE_SHEET_DETAILS_GRID_CLASS}>
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="max-w-full truncate text-[11px]"
                                    title={assessment.templateName ?? assessment.assessmentName ?? undefined}
                                  >
                                    {assessment.templateName ?? assessment.assessmentName ?? t("mySpace.scoreSheet.unavailableSheet")}
                                  </Badge>
                                </div>

                                <span className="inline-flex min-h-5 items-center gap-1 text-xs text-gray-600 dark:text-muted-foreground">
                                  <Users className="h-3.5 w-3.5 shrink-0" />
                                  {assessment.studentCount ?? 0} {t("mySpace.scoreSheet.studentCount")}
                                </span>
                                <div className="min-w-0 text-[11px] font-bold">
                                  <span
                                    className={`inline-flex min-h-5 items-center gap-1 ${
                                      allStudentsComplete
                                        ? "text-green-700 dark:text-green-400"
                                        : "text-gray-600 dark:text-muted-foreground"
                                    }`}
                                  >
                                    <CircleDot className="h-3.5 w-3.5 shrink-0" />
                                    {scoreProgressLabel}
                                  </span>
                                  {statusKey === "processing" && status && AssessmentStatusIcon && (
                                    <div className="mt-1 flex min-h-5 items-center gap-1">
                                      <AssessmentStatusIcon className={`h-3.5 w-3.5 shrink-0 ${status.className}`} />
                                      <span className={status.className}>{status.label}</span>
                                    </div>
                                  )}
                                </div>
                                <span className="inline-flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-bold">
                                  {statusKey !== "processing" && status && AssessmentStatusIcon ? (
                                    <>
                                      <AssessmentStatusIcon className={`h-3.5 w-3.5 shrink-0 ${status.className}`} />
                                      <span className={status.className}>{status.label}</span>
                                    </>
                                  ) : null}
                                </span>
                                <span className="inline-flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-bold">
                                  {deadlineStatus && DeadlineStatusIcon ? (
                                    <>
                                      <DeadlineStatusIcon className={`h-3.5 w-3.5 shrink-0 ${deadlineStatus.className}`} />
                                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                                    </>
                                  ) : null}
                                </span>
                                <span className="inline-flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-bold">
                                  {(assessment.published || assessment.allStudentsIndividuallyPublished) && (
                                    <span
                                      className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"
                                      data-testid={`badge-my-space-score-sheet-published-${assessment.sessionId}`}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      Đã công bố
                                    </span>
                                  )}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-muted-foreground">
                                <p className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3 shrink-0" />
                                  {t("mySpace.scoreSheet.examDate")}: {formatAssessmentDate(assessment.examDate)}
                                </p>
                                <div className="min-h-4">
                                  {assessment.scoreDeadlineAt ? (
                                    <p className="inline-flex items-center gap-1">
                                      <Clock3 className="h-3 w-3 shrink-0" />
                                      {t("mySpace.scoreSheet.scoreDeadline")}: {formatAssessmentDeadline(assessment.scoreDeadlineAt)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const book = entry.gradeBook;
                      return (
                        <div
                          key={`grade-book:${book.id}`}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm transition-colors hover:bg-indigo-50/40 dark:border-border dark:bg-card sm:px-4"
                          data-testid={`row-staff-grade-book-${book.id}`}
                        >
                          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold leading-tight text-gray-800 dark:text-foreground" title={book.title}>
                                {book.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-muted-foreground">
                                <span>{book.classCode}</span>
                                {book.className !== book.classCode && <span> — {book.className}</span>}
                                {book.sessionIndex != null && (
                                  <span> · {t("mySpace.scoreSheet.session")} {book.sessionIndex}</span>
                                )}
                              </p>
                              <Badge className="mt-1 w-fit rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/40">
                                {t("mySpace.scoreSheet.regularSheet")}
                              </Badge>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-gray-500 hover:bg-indigo-100 hover:text-indigo-700 dark:text-muted-foreground"
                                onClick={() => void handleExportGradeBook(book)}
                                disabled={exportingBookId !== null}
                                data-testid={`btn-export-grade-book-${book.id}`}
                                title="Tải bảng điểm Excel"
                                aria-label={`Tải bảng điểm ${book.title} xuống Excel`}
                              >
                                {exportingBookId === book.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />}
                              </Button>
                              {canEditGradeBook && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 whitespace-nowrap px-2 text-xs text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 dark:text-muted-foreground"
                                  onClick={() => setEditingBook(book)}
                                  data-testid={`btn-edit-grade-book-${book.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {t("mySpace.scoreSheet.edit")}
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 pt-2 dark:border-border">
                            <div className={SCORE_SHEET_DETAILS_GRID_CLASS}>
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                {book.scoreSheetName && (
                                  <Badge
                                    variant="outline"
                                    className="max-w-full truncate text-[11px]"
                                    title={book.scoreSheetName}
                                  >
                                    {book.scoreSheetName}
                                  </Badge>
                                )}
                              </div>

                              <span className="inline-flex min-h-5 items-center gap-1 text-xs text-gray-600 dark:text-muted-foreground">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                {book.studentCount ?? 0} {t("mySpace.scoreSheet.studentCount")}
                              </span>

                              <span aria-hidden="true" className="min-h-5" />
                              <span aria-hidden="true" className="min-h-5" />
                              <span aria-hidden="true" className="min-h-5" />

                              {book.published ? (
                                <span className="inline-flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-bold text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  {t("mySpace.scoreSheet.published")}
                                </span>
                              ) : (
                                <span className="inline-flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-bold text-gray-500 dark:text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                  {t("mySpace.scoreSheet.unpublished")}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
                              <p className="min-w-0 truncate text-gray-500 dark:text-muted-foreground">
                                {t("mySpace.scoreSheet.created")}: {book.createdByName ?? "—"} · {formatDate(book.createdAt)}
                              </p>
                              <p className="min-w-0 truncate text-gray-500 dark:text-muted-foreground/70">
                                {t("mySpace.scoreSheet.updated")}: {book.updatedByName ?? "—"} · {formatDate(book.updatedAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StaffScoreSheetAssessmentStudentsDialog
        assessment={selectedAssessment}
        open={!!selectedAssessment}
        canManagePublication
        onOpenChange={(open) => {
          if (!open) setSelectedAssessment(null);
        }}
      />

      {editingBook && (
        <GradeBookEditDialog
          open={!!editingBook}
          onClose={() => setEditingBook(null)}
          classId={editingBook.classId}
          book={{
            id: editingBook.id,
            title: editingBook.title,
            scoreSheetId: editingBook.scoreSheetId,
            sessionId: editingBook.sessionId,
            published: editingBook.published,
          }}
          onSaved={() => refetch()}
        />
      )}

      <GradeBookCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(assessment) => {
          setCreateOpen(false);
          refetch();
          if (assessment) setSelectedAssessment(assessment);
        }}
      />
    </div>
  );
}
