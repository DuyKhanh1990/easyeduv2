import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, LoaderCircle, Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  StaffScoreSheetAssessmentScoreDialog,
  type ScoreSheetAssessmentDialogContext,
} from "./StaffScoreSheetAssessmentScoreDialog";
import type { StaffAssignedScoreSheetAssessment } from "./StaffScoreSheetAssessmentStudentsDialog";

type RosterStudent = {
  studentId: string;
  code: string;
  fullName: string;
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

type RosterResponse = {
  students: RosterStudent[];
  removedStudents: RosterStudent[];
};

type ResultRow = RosterStudent & {
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
  published?: boolean;
  studentCode: string;
  studentName: string;
  individuallyPublished: boolean;
};

type ScoreResultFilter = "all" | "passed" | "failed";

interface ScoreSheetConversionResultsProps {
  selectedStudentIds: string[];
  allowedClassIds: string[];
  selectionLoading: boolean;
  selectionError: boolean;
  emptySelectionMessage: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "Không thể tải dữ liệu bảng điểm quy đổi.");
  }
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function formatDateLabel(value: string, locale: string) {
  const date = new Date(`${value.substring(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatScore(value: number | null | undefined, locale: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function ScoreSheetConversionResults({
  selectedStudentIds,
  allowedClassIds,
  selectionLoading,
  selectionError,
  emptySelectionMessage,
}: ScoreSheetConversionResultsProps) {
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const { data: myPermissions } = useMyPermissions();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<ScoreResultFilter>("all");
  const [dialogTarget, setDialogTarget] = useState<{
    mode: "view" | "edit";
    assessment: ScoreSheetAssessmentDialogContext;
    student: ResultRow;
  } | null>(null);

  const selectedIds = useMemo(() => new Set(selectedStudentIds), [selectedStudentIds]);
  const classIds = useMemo(() => new Set(allowedClassIds), [allowedClassIds]);
  const hasSelection = selectedStudentIds.length > 0;

  const assessmentsQuery = useQuery<StaffAssignedScoreSheetAssessment[]>({
    queryKey: ["/api/my-space/score-sheet/staff-assessments"],
    queryFn: () => getJson("/api/my-space/score-sheet/staff-assessments"),
    enabled: hasSelection,
    staleTime: 30_000,
  });

  const eligibleAssessments = (assessmentsQuery.data ?? []).filter(
    (assessment) => assessment.hasConversion && classIds.has(assessment.classId),
  );

  const rosterQueries = useQueries({
    queries: eligibleAssessments.map((assessment) => ({
      queryKey: [
        "/api/my-space/score-sheet/staff-assessments",
        assessment.sessionId,
        "students",
      ],
      queryFn: () => getJson<RosterResponse>(
        `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}/students`,
      ),
      enabled: hasSelection,
      staleTime: 15_000,
    })),
  });

  const allResults = eligibleAssessments.flatMap((assessment, index) => {
    const roster = rosterQueries[index]?.data?.students ?? [];
    return roster
      .filter((student) => selectedIds.has(student.studentId))
      .map((student): ResultRow => ({
        ...assessment,
        ...student,
        studentCode: student.code,
        studentName: student.fullName,
      }));
  });

  const searchTerm = search.trim().toLocaleLowerCase(lang === "en" ? "en" : "vi");
  const filteredResults = allResults.filter((result) => {
    if (resultFilter === "passed" && result.passStatus !== "passed") return false;
    if (resultFilter === "failed" && result.passStatus !== "failed") return false;
    if (!searchTerm) return true;
    return [
      result.studentCode,
      result.studentName,
      result.classCode,
      result.className,
      result.locationName,
      result.teacherNames,
      result.assessmentCode,
      result.assessmentName,
      result.templateName,
    ].some((value) => value?.toLocaleLowerCase(lang === "en" ? "en" : "vi").includes(searchTerm));
  });

  const resultsByDate = new Map<string, Map<string, {
    assessment: ResultRow;
    students: ResultRow[];
  }>>();
  for (const result of filteredResults) {
    const dateKey = result.examDate.substring(0, 10);
    const sessions = resultsByDate.get(dateKey) ?? new Map();
    const session = sessions.get(result.sessionId) ?? { assessment: result, students: [] };
    session.students.push(result);
    sessions.set(result.sessionId, session);
    resultsByDate.set(dateKey, sessions);
  }
  const sortedDateKeys = Array.from(resultsByDate.keys()).sort((a, b) => b.localeCompare(a));
  const isLoading = selectionLoading
    || (hasSelection && (assessmentsQuery.isLoading || rosterQueries.some((query) => query.isLoading)));
  const isError = selectionError
    || assessmentsQuery.isError
    || rosterQueries.some((query) => query.isError);
  const canEdit = Boolean(
    myPermissions?.isSuperAdmin
    || myPermissions?.permissions["/assessments#list"]?.canEdit
    || myPermissions?.permissions["/my-space/score-sheet"]?.canEdit,
  );
  const canManagePublication = canEdit;
  const locale = lang === "en" ? "en-US" : "vi-VN";

  const invalidateResults = () => {
    void queryClient.invalidateQueries({
      queryKey: ["/api/my-space/score-sheet/staff-assessments"],
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasSelection && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("mySpace.scoreSheet.conversionResultsSearch")}
              className="h-9 pl-8"
              data-testid="conversion-results-search"
            />
          </div>
          <div className="flex shrink-0 gap-1">
            {([
              ["all", t("mySpace.scoreSheet.conversionFilterAll")],
              ["passed", t("mySpace.scoreSheet.conversionFilterPassed")],
              ["failed", t("mySpace.scoreSheet.conversionFilterFailed")],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={resultFilter === value ? "default" : "outline"}
                onClick={() => setResultFilter(value)}
                data-testid={`conversion-results-filter-${value}`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto" data-testid="conversion-results-table">
        {isLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {t("mySpace.scoreSheet.conversionResultsLoading")}
          </div>
        ) : isError ? (
          <div className="flex min-h-52 items-center justify-center text-center text-sm text-destructive">
            {t("mySpace.scoreSheet.conversionResultsLoadError")}
          </div>
        ) : !hasSelection ? (
          <div className="flex min-h-52 items-center justify-center text-center text-sm text-muted-foreground">
            {emptySelectionMessage}
          </div>
        ) : sortedDateKeys.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center text-center text-sm text-muted-foreground">
            {allResults.length === 0
              ? t("mySpace.scoreSheet.conversionNoStudentResults")
              : t("mySpace.scoreSheet.filterNoResults")}
          </div>
        ) : (
          <div className="space-y-3 pb-1">
            {sortedDateKeys.map((dateKey) => {
              const sessions = Array.from(resultsByDate.get(dateKey)?.values() ?? []);
              const totalStudents = sessions.reduce((count, group) => count + group.students.length, 0);
              return (
                <section
                  key={dateKey}
                  className="overflow-hidden rounded-lg border border-border"
                  data-testid={`conversion-results-date-${dateKey}`}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b bg-violet-50/60 px-3 py-2 dark:bg-violet-950/30">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                      {formatDateLabel(dateKey, locale)}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {sessions.length} {t("mySpace.scoreSheet.conversionResultAssessments")} · {totalStudents} {t("mySpace.scoreSheet.studentCount")}
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {sessions.map(({ assessment, students: sessionStudents }) => (
                      <div key={assessment.sessionId} className="bg-background">
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/20 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {assessment.className || assessment.classCode}
                              {assessment.sessionIndex != null && (
                                <span className="ml-1 font-normal text-muted-foreground">
                                  ({t("mySpace.scoreSheet.session")} {assessment.sessionIndex})
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {[
                                assessment.classCode,
                                assessment.locationName,
                                assessment.teacherNames,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span className="max-w-full truncate text-xs font-medium text-foreground">
                            {assessment.templateName || t("mySpace.scoreSheet.unavailableSheet")}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[850px] text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="min-w-[185px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.studentLabel")}
                                </th>
                                <th className="min-w-[100px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.examDate")}
                                </th>
                                <th className="min-w-[80px] px-3 py-2 text-center font-semibold">
                                  {t("mySpace.scoreSheet.conversionAttempt")}
                                </th>
                                <th className="min-w-[105px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.convertedScore")}
                                </th>
                                <th className="min-w-[95px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.classification")}
                                </th>
                                <th className="min-w-[85px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.conversionResult")}
                                </th>
                                <th className="min-w-[95px] px-3 py-2 font-semibold">
                                  {t("mySpace.scoreSheet.conversionResultStatus")}
                                </th>
                                <th className="min-w-[84px] px-3 py-2 text-center font-semibold">
                                  {t("mySpace.scoreSheet.conversionManagement")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sessionStudents.map((student) => (
                                <tr
                                  key={student.studentId}
                                  className="border-t border-border"
                                  data-testid={`conversion-result-row-${assessment.sessionId}-${student.studentId}`}
                                >
                                  <td className="px-3 py-2.5 font-medium">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span>{student.studentCode} - {student.studentName}</span>
                                      {student.hasPublishableScore
                                        && (student.published || student.individuallyPublished) && (
                                          <Badge
                                            variant="outline"
                                            className="gap-1 border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            {t("mySpace.scoreSheet.published")}
                                          </Badge>
                                        )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">{formatDate(student.examDate)}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    {student.attemptNumber
                                      ? `${student.attemptNumber}/${student.attemptCount}`
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 font-medium tabular-nums">
                                    {formatScore(student.convertedScore, locale)}
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
                                      ? t("mySpace.scoreSheet.conversionFilterPassed")
                                      : student.passStatus === "failed"
                                        ? t("mySpace.scoreSheet.conversionFilterFailed")
                                        : "—"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <Badge
                                      variant="secondary"
                                      className={student.status === "complete"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : ""}
                                    >
                                      {student.status === "complete"
                                        ? t("mySpace.scoreSheet.conversionResultEntered")
                                        : student.status === "in_progress"
                                          ? t("mySpace.scoreSheet.conversionResultInProgress")
                                          : t("mySpace.scoreSheet.conversionResultNotEntered")}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <div className="inline-flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-primary"
                                        onClick={() => setDialogTarget({
                                          mode: "view",
                                          assessment,
                                          student,
                                        })}
                                        title={`${t("mySpace.scoreSheet.view")} ${student.studentName}`}
                                        aria-label={`${t("mySpace.scoreSheet.view")} ${student.studentName}`}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      {canEdit && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => setDialogTarget({
                                            mode: "edit",
                                            assessment,
                                            student,
                                          })}
                                          title={`${t("mySpace.scoreSheet.edit")} ${student.studentName}`}
                                          aria-label={`${t("mySpace.scoreSheet.edit")} ${student.studentName}`}
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
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <StaffScoreSheetAssessmentScoreDialog
        assessment={dialogTarget?.assessment ?? null}
        student={dialogTarget ? {
          studentId: dialogTarget.student.studentId,
          code: dialogTarget.student.studentCode,
          fullName: dialogTarget.student.studentName,
          individuallyPublished: dialogTarget.student.individuallyPublished,
          hasPublishableScore: dialogTarget.student.hasPublishableScore,
        } : null}
        mode={dialogTarget?.mode ?? "edit"}
        canManagePublication={canManagePublication}
        open={!!dialogTarget}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null);
        }}
        onSaved={invalidateResults}
      />
    </div>
  );
}
