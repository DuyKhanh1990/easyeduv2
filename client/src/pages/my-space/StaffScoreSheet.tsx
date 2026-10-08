import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { BarChart3, BookOpen, CalendarDays, Clock3, Eye, Pencil, Plus, Users, CheckCircle2, Clock, Circle, CircleDot, Download, Loader2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { downloadClassGradeBookExcel } from "@/lib/gradeBookExcelExport";
import { GradeBookEditDialog } from "@/components/education/GradeBookEditDialog";
import { GradeBookCreateDialog } from "@/components/education/GradeBookCreateDialog";
import { ScoreSheetConversionSelector } from "@/components/education/ScoreSheetConversionSelector";
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

type ManualScoreSheetRow = {
  id: string;
  title: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  selectionMode: "class" | "students";
  classId: string | null;
  studentIds: string[];
  studentCount: number;
  enteredStudentCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

type StatusPresentation = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const ASSESSMENT_STATUS_PRESENTATION: Record<ScoreSheetAssessmentStatus, StatusPresentation> = {
  not_started: {
    label: "Chưa thi",
    Icon: Circle,
    className: "text-violet-700 dark:text-violet-300",
  },
  in_progress: {
    label: "Đang thi",
    Icon: CircleDot,
    className: "text-emerald-700 dark:text-emerald-300",
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
  const [editingManualSheetId, setEditingManualSheetId] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<StaffAssignedScoreSheetAssessment | null>(null);
  const [exportingBookId, setExportingBookId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StaffScoreSheetTab>("all");
  const [classFilters, setClassFilters] = useState<string[]>([]);
  const [scoreSheetFilters, setScoreSheetFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const { toast } = useToast();
  const scoreSheetPermissions = myPermissions?.permissions["/my-space/score-sheet"];
  const canCreateGradeBook = myPermissions?.isSuperAdmin === true
    || scoreSheetPermissions?.canCreate === true;
  const canEditGradeBook = myPermissions?.isSuperAdmin === true
    || scoreSheetPermissions?.canEdit === true;
  const canEditManualScoreSheets = canEditGradeBook;

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

  const {
    data: manualScoreSheetsData,
    isLoading: isLoadingManualScoreSheets,
    isError: isManualScoreSheetsError,
  } = useQuery<ManualScoreSheetRow[]>({
    queryKey: ["/api/my-space/score-sheet/manual-conversions"],
    queryFn: async () => {
      const response = await fetch(
        "/api/my-space/score-sheet/manual-conversions",
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(t("mySpace.scoreSheet.conversionManualSheetLoadError"));
      return response.json();
    },
  });

  const gradeBooks = data ?? [];
  const assignedAssessments = assignedAssessmentsData ?? [];
  const manualScoreSheets = manualScoreSheetsData ?? [];
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

  const scoreSheetOptionsById = new Map<string, string>();
  gradeBooks.forEach((book) => {
    scoreSheetOptionsById.set(
      `regular:${book.scoreSheetId}`,
      book.scoreSheetName || t("mySpace.scoreSheet.unavailableSheet"),
    );
  });
  assignedAssessments.forEach((assessment) => {
    scoreSheetOptionsById.set(
      `conversion:${assessment.assessmentId}`,
      assessment.templateName || assessment.assessmentName || t("mySpace.scoreSheet.unavailableSheet"),
    );
  });
  const scoreSheetFilterOptions = Array.from(scoreSheetOptionsById, ([value, label]) => ({ value, label }))
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

  const filteredTimelineEntries = timelineEntries.filter((entry) => {
    if (activeTab === "regular" && entry.kind !== "grade-book") return false;
    if (activeTab === "conversion" && entry.kind !== "conversion") return false;

    const classId = entry.kind === "grade-book" ? entry.gradeBook.classId : entry.assessment.classId;
    if (classFilters.length > 0 && !classFilters.includes(classId)) return false;

    const scoreSheetId = entry.kind === "grade-book"
      ? `regular:${entry.gradeBook.scoreSheetId}`
      : `conversion:${entry.assessment.assessmentId}`;
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
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/60 p-1 sm:w-fit sm:min-w-[430px]">
              <TabsTrigger value="all" className="min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.tabAll")}
              </TabsTrigger>
              <TabsTrigger value="regular" className="min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.regularSheet")}
              </TabsTrigger>
              <TabsTrigger value="conversion" className="min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                {t("mySpace.scoreSheet.conversionSheet")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
        </div>
      )}

      {timelineEntries.length === 0 ? (
        !isLoadingAssignedAssessments
        && !isAssignedAssessmentsError
        && !isLoadingManualScoreSheets
        && manualScoreSheets.length === 0 ? (
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
                        const scoreProgressLabel = assessment.studentCount > 0
                          && assessment.completedStudentCount >= assessment.studentCount
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
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{t("mySpace.scoreSheet.view")}</span>
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 pt-2 dark:border-border">
                              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                <Badge className="rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/40">
                                  {t("mySpace.scoreSheet.conversionSheet")}
                                </Badge>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="max-w-full truncate text-[11px]"
                                    title={assessment.templateName ?? assessment.assessmentName ?? undefined}
                                  >
                                    {assessment.templateName ?? assessment.assessmentName ?? t("mySpace.scoreSheet.unavailableSheet")}
                                  </Badge>
                                  {assessment.assessmentCode && (
                                    <span className="max-w-full truncate text-[10px] text-gray-500 dark:text-muted-foreground" title={assessment.assessmentCode}>
                                      {assessment.assessmentCode}
                                    </span>
                                  )}
                                </div>

                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-muted-foreground">
                                  <Users className="h-3.5 w-3.5 shrink-0" />
                                  {assessment.studentCount ?? 0} {t("mySpace.scoreSheet.studentCount")}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-muted-foreground">
                                  <CircleDot className="h-3.5 w-3.5 shrink-0" />
                                  {scoreProgressLabel}
                                </span>

                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium">
                                  {status && AssessmentStatusIcon ? (
                                    <>
                                      <AssessmentStatusIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span className={status.className}>{status.label}</span>
                                    </>
                                  ) : (
                                    <span className="text-gray-400" aria-label="Chưa có trạng thái">—</span>
                                  )}
                                </span>
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium">
                                  {deadlineStatus && DeadlineStatusIcon ? (
                                    <>
                                      <DeadlineStatusIcon className={`h-3.5 w-3.5 shrink-0 ${deadlineStatus.className}`} />
                                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                                    </>
                                  ) : (
                                    <span className="text-gray-400" aria-label="Chưa có hạn trả">—</span>
                                  )}
                                </span>
                                {(assessment.published || assessment.allStudentsIndividuallyPublished) && (
                                  <span
                                    className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                                    data-testid={`badge-my-space-score-sheet-published-${assessment.sessionId}`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    Đã công bố
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-500 dark:text-muted-foreground">
                                <p className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3 shrink-0" />
                                  {t("mySpace.scoreSheet.examDate")}: {formatAssessmentDate(assessment.examDate)}
                                </p>
                                <p className="inline-flex items-center gap-1">
                                  <Clock3 className="h-3 w-3 shrink-0" />
                                  {t("mySpace.scoreSheet.scoreDeadline")}: {formatAssessmentDeadline(assessment.scoreDeadlineAt)}
                                </p>
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
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                              <Badge className="rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/40">
                                {t("mySpace.scoreSheet.regularSheet")}
                              </Badge>
                              <div className="flex min-w-0 items-center">
                                {book.scoreSheetName ? (
                                  <Badge
                                    variant="outline"
                                    className="max-w-full truncate text-[11px]"
                                    title={book.scoreSheetName}
                                  >
                                    {book.scoreSheetName}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </div>

                              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-muted-foreground">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                {book.studentCount ?? 0} {t("mySpace.scoreSheet.studentCount")}
                              </span>

                              {book.published ? (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  {t("mySpace.scoreSheet.published")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gray-500 dark:text-muted-foreground">
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

      {(manualScoreSheets.length > 0 || isManualScoreSheetsError) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              {t("mySpace.scoreSheet.conversionManualSheets")}
            </h2>
            <Badge variant="secondary">{manualScoreSheets.length}</Badge>
          </div>
          {isManualScoreSheetsError ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {t("mySpace.scoreSheet.conversionManualSheetLoadError")}
            </div>
          ) : (
            <div className="space-y-2">
              {manualScoreSheets.map((manualSheet) => (
                <div
                  key={manualSheet.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                  data-testid={`manual-score-sheet-${manualSheet.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{manualSheet.title}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {manualSheet.templateCode} · {manualSheet.templateName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {manualSheet.studentCount} {t("mySpace.scoreSheet.studentCount")}
                      {" · "}
                      {manualSheet.enteredStudentCount}/{manualSheet.studentCount}{" "}
                      {t("mySpace.scoreSheet.conversionManualEntered")}
                      {" · "}
                      {t("mySpace.scoreSheet.updated")}: {formatDate(manualSheet.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{t("mySpace.scoreSheet.conversionSheet")}</Badge>
                    {canEditManualScoreSheets && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setEditingManualSheetId(manualSheet.id)}
                        data-testid={`edit-manual-score-sheet-${manualSheet.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("mySpace.scoreSheet.edit")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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

      <Dialog
        open={Boolean(editingManualSheetId)}
        onOpenChange={(open) => {
          if (!open) setEditingManualSheetId(null);
        }}
      >
        <DialogContent className="m-0 flex h-screen w-screen max-w-none flex-col gap-0 rounded-none p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-3">
            <DialogTitle>{t("mySpace.scoreSheet.conversionEditManualSheet")}</DialogTitle>
          </DialogHeader>
          {editingManualSheetId && (
            <ScoreSheetConversionSelector
              enabled
              layout="edit"
              manualSheetId={editingManualSheetId}
              onSaved={() => setEditingManualSheetId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <GradeBookCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); refetch(); }}
      />
    </div>
  );
}
