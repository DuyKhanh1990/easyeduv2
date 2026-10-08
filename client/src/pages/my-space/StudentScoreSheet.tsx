import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { BarChart3, BookOpen, Eye, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/hooks/use-language";
import type { ScoreConversionTemplate } from "@shared/score-conversion";
import type {
  ScoreSheetAssessmentAttemptResult,
  ScoreSheetAssessmentAttemptValues,
} from "@shared/score-sheet-assessment-scoring";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";

type EvaluationItem = {
  id: string;
  name: string;
  itemType: "heading" | "criterion";
  parentId: string | null;
};

type EvaluationGroup = {
  id: string;
  name: string;
  subCriteria: EvaluationItem[];
};

type EvaluationCommentEntry =
  | { kind: "selected"; title: string }
  | { kind: "text"; title: string; text: string };

type EvaluationCommentGroup = {
  title: string;
  sections: Array<{ title: string | null; entries: EvaluationCommentEntry[] }>;
};

type ScoreNoteGroup = {
  title: string;
  entries: Array<{ title: string | null; text: string }>;
};

type ConversionDetail = {
  templateSnapshot: ScoreSheetTemplate;
  conversionTemplateSnapshot: ScoreConversionTemplate | null;
  evaluationCriteria: EvaluationGroup[];
  attemptCount: number;
  scoringPolicy: "highest" | "latest";
  attempt: Pick<
    ScoreSheetAssessmentAttemptValues,
    "partScores" | "skillScores" | "notes" | "evaluationResponses"
  > & {
    attemptNumber: number;
    result: ScoreSheetAssessmentAttemptResult;
    createdAt: string;
    updatedAt: string;
  };
};

type ScoreEntry = {
  categoryId: string;
  categoryName: string;
  score: string | null;
  color?: string | null;
};

type GradeBookRow = {
  id: string;
  kind?: "regular" | "conversion";
  title: string;
  classCode: string;
  className: string;
  scoreSheetName: string;
  sessionIndex: number | null;
  sessionDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  scores: ScoreEntry[] | null;
  teacherComment: string | null;
  studentName: string | null;
  conversionDetail?: ConversionDetail;
};

function getEvaluationCommentGroups(
  groups: EvaluationGroup[],
  responses: ScoreSheetAssessmentAttemptValues["evaluationResponses"],
): EvaluationCommentGroup[] {
  return groups.flatMap((group) => {
    const headings = group.subCriteria.filter((item) => item.itemType === "heading");
    const headingIds = new Set(headings.map((item) => item.id));
    const criteria = group.subCriteria.filter((item) => item.itemType === "criterion");
    const entriesFor = (items: EvaluationItem[]): EvaluationCommentEntry[] =>
      items.flatMap((item): EvaluationCommentEntry[] => {
        const response = responses[item.id];
        if (response === true) return [{ kind: "selected", title: item.name }];
        if (typeof response === "string" && response.trim()) {
          return [{ kind: "text", title: item.name, text: response.trim() }];
        }
        return [];
      });
    const sections = [
      {
        title: null,
        entries: entriesFor(criteria.filter((item) => !item.parentId || !headingIds.has(item.parentId))),
      },
      ...headings.map((heading) => ({
        title: heading.name,
        entries: entriesFor(criteria.filter((item) => item.parentId === heading.id)),
      })),
    ].filter((section) => section.entries.length > 0);
    return sections.length > 0 ? [{ title: group.name, sections }] : [];
  });
}

function getScoreNoteGroups(detail: ConversionDetail): ScoreNoteGroup[] {
  return detail.templateSnapshot.skills.flatMap((skill, index) => {
    const skillId = skill.id ?? skill.sectionId ?? `skill-${index}`;
    const section = skill.sectionId
      ? detail.conversionTemplateSnapshot?.sections.find((item) => item.id === skill.sectionId)
      : undefined;
    const entries = Object.entries(detail.attempt.notes[skillId] ?? {})
      .filter(([, value]) => value.trim())
      .map(([partId, text]) => ({
        title: partId === "_skill"
          ? null
          : skill.parts.find((part) => part.id === partId)?.name ?? "Nhận xét",
        text,
      }));
    return entries.length > 0
      ? [{ title: skill.name || section?.name || `Kỹ năng ${index + 1}`, entries }]
      : [];
  });
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

const formatDateLabel = (d: string, lang: "vi" | "en") => {
  try {
    return format(new Date(d), "EEEE, dd/MM/yyyy", { locale: lang === "vi" ? vi : enUS });
  } catch { return d; }
};

const formatScore = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);

export function StudentScoreSheet() {
  const { t, lang } = useLanguage();
  const [selected, setSelected] = useState<GradeBookRow | null>(null);

  const { data, isLoading } = useQuery<GradeBookRow[]>({
    queryKey: ["/api/my-space/score-sheet"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/score-sheet", { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi khi tải bảng điểm");
      return res.json();
    },
  });

  const gradeBooks = data ?? [];

  // Group by timeline date: prefer sessionDate, fallback to createdAt date
  const grouped = gradeBooks.reduce<Record<string, GradeBookRow[]>>((acc, book) => {
    const dateKey = book.sessionDate
      ? book.sessionDate.substring(0, 10)
      : book.createdAt.substring(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(book);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const selectedScores = selected?.scores ?? [];
  const selectedConversionDetail = selected?.kind === "conversion"
    ? selected.conversionDetail ?? null
    : null;
  const conversionEvaluationGroups = selectedConversionDetail
    ? getEvaluationCommentGroups(
      selectedConversionDetail.evaluationCriteria,
      selectedConversionDetail.attempt.evaluationResponses,
    )
    : [];
  const conversionScoreNoteGroups = selectedConversionDetail
    ? getScoreNoteGroups(selectedConversionDetail)
    : [];

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="truncate text-lg font-semibold sm:text-xl">{t("mySpace.scoreSheet.title")}</h1>
          {gradeBooks.length > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {gradeBooks.length} {t("mySpace.scoreSheet.count")}
            </Badge>
          )}
        </div>
        <PageGuideButton pageTitle={t("mySpace.scoreSheet.title")} className="shrink-0" />
      </div>

      {gradeBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">{t("mySpace.scoreSheet.studentEmpty")}</p>
        </div>
      ) : (
        <div className="space-y-0">
          {sortedDates.map((dateKey, dateIdx) => {
            const books = grouped[dateKey];
            const isLast = dateIdx === sortedDates.length - 1;

            return (
              <div key={dateKey} className="flex min-w-0 gap-2 sm:gap-4">
                {/* Timeline spine */}
                <div className="flex w-8 shrink-0 flex-col items-center pt-1 sm:w-12 md:w-16 xl:w-[130px]">
                  <div className="w-3 h-3 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40 shrink-0 mt-1" />
                  {!isLast && (
                    <div className="flex-1 w-px bg-border mt-2 min-h-[24px]" />
                  )}
                </div>

                {/* Date + cards */}
                <div className="flex-1 pb-6 min-w-0">
                  {/* Date label */}
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-2 capitalize">
                    {formatDateLabel(dateKey, lang)}
                  </p>

                  <div className="space-y-2">
                    {books.map((book) => {
                      const scores = book.scores ?? [];
                      const lastScore = scores.length > 0 ? scores[scores.length - 1] : null;
                      const headlineScore = book.kind === "conversion"
                        ? scores.find((entry) => entry.categoryId.endsWith(":overall")) ?? lastScore
                        : lastScore;
                      const hasComment = !!book.teacherComment;

                      return (
                        <div
                          key={book.id}
                           className="grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-accent/40 sm:grid-cols-3 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(120px,1fr)_80px_minmax(180px,1.4fr)_48px] xl:grid-cols-[minmax(160px,1fr)_160px_80px_minmax(160px,1fr)_48px] xl:items-center xl:gap-x-4 xl:gap-y-0"
                          data-testid={`row-grade-book-${book.id}`}
                        >
                           {/* Col 1: Title + class */}
                           <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-1 xl:col-span-1">
                            <p className="text-sm font-semibold text-foreground truncate leading-tight">
                              {book.title}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                {book.classCode}
                              </span>
                              {book.className !== book.classCode && (
                                <span className="text-xs text-muted-foreground/70 truncate">
                                  — {book.className}
                                </span>
                              )}
                              {book.sessionIndex != null && (
                                <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                                  · {t("mySpace.scoreSheet.session")} {book.sessionIndex}
                                </span>
                              )}
                              {book.studentName && (
                                <span className="text-[11px] text-muted-foreground truncate">
                                  · {t("mySpace.scoreSheet.studentLabel")}: {book.studentName}
                                </span>
                              )}
                            </div>
                            {book.kind === "conversion" && (
                              <div className="mt-1">
                                <Badge className="h-5 border-orange-200 bg-orange-50 px-1.5 text-[10px] font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/40">
                                  {t("mySpace.scoreSheet.conversionSheet")}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {/* Col 2: Score sheet name */}
                          <div className="min-w-0">
                            {book.scoreSheetName ? (
                              <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                                {book.scoreSheetName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>

                          {/* Col 3: Score */}
                          <div className="flex min-w-0 items-center gap-1.5">
                            {headlineScore && headlineScore.score != null && headlineScore.score !== "" ? (
                              <span className="text-sm font-bold text-violet-600 dark:text-violet-400 whitespace-nowrap">
                                {headlineScore.score}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("mySpace.scoreSheet.noScore")}</span>
                            )}
                            {hasComment && (
                              <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label={t("mySpace.scoreSheet.hasComment")} />
                            )}
                          </div>

                          {/* Col 4: Creator + date */}
                           <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-1 xl:col-span-1">
                            <p className="text-[11px] text-muted-foreground whitespace-nowrap truncate">
                              {t("mySpace.scoreSheet.created")}: {book.createdByName ?? "—"} · {formatDate(book.createdAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap truncate">
                              {t("mySpace.scoreSheet.updated")}: {formatDate(book.updatedAt)}
                            </p>
                          </div>

                          {/* Col 5: View button */}
                           <div className="col-span-2 flex justify-end border-t border-border/60 pt-2 sm:col-span-1 sm:border-0 sm:pt-0 md:col-span-1 xl:col-span-1 xl:border-0 xl:pt-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setSelected(book)}
                              data-testid={`btn-view-grade-book-${book.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={`${selectedConversionDetail ? "max-w-6xl" : "max-w-4xl"} max-h-[90vh] flex flex-col p-0 gap-0`}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="text-base">{selected?.title}</DialogTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              {selected?.classCode && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {selected.classCode}{selected.className !== selected.classCode ? ` — ${selected.className}` : ""}
                </Badge>
              )}
              {selected?.scoreSheetName && (
                <Badge variant="outline" className="text-xs font-normal">
                  {selected.scoreSheetName}
                </Badge>
              )}
              {selected?.kind === "conversion" && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {t("mySpace.scoreSheet.conversionSheet")}
                </Badge>
              )}
              {selected?.studentName && (
                <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                  {t("mySpace.scoreSheet.studentLabel")}: {selected.studentName}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {selected?.kind === "conversion" && selectedConversionDetail ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
              <section className="min-h-0 flex-1 overflow-y-auto p-4 md:w-[58%] md:border-r">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {t("mySpace.scoreSheet.conversionOverallScore")}:{" "}
                    {formatScore(selectedConversionDetail.attempt.result.overallConvertedScore)}
                  </span>
                  {selectedConversionDetail.attempt.result.gradeBand && (
                    <Badge
                      variant="outline"
                      style={{ color: selectedConversionDetail.attempt.result.gradeBand.color }}
                    >
                      {selectedConversionDetail.attempt.result.gradeBand.label}
                    </Badge>
                  )}
                  {selectedConversionDetail.attempt.result.passStatus && (
                    <Badge className={selectedConversionDetail.attempt.result.passStatus === "passed"
                      ? "bg-emerald-600 hover:bg-emerald-600"
                      : "bg-red-600 hover:bg-red-600"}
                    >
                      {selectedConversionDetail.attempt.result.passStatus === "passed" ? "Đạt" : "Không đạt"}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("mySpace.scoreSheet.conversionAttempt")} {selectedConversionDetail.attempt.attemptNumber}/{selectedConversionDetail.attemptCount}
                    {" · "}
                    {selectedConversionDetail.scoringPolicy === "highest"
                      ? t("mySpace.scoreSheet.conversionHighestAttempt")
                      : t("mySpace.scoreSheet.conversionLatestAttempt")}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("mySpace.scoreSheet.conversionSkill")}</th>
                        <th className="px-3 py-2 font-semibold">{t("mySpace.scoreSheet.conversionCorrectAnswers")}</th>
                        <th className="px-3 py-2 font-semibold">{t("mySpace.scoreSheet.conversionInternationalScore")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedConversionDetail.templateSnapshot.skills.map((skill, index) => {
                        const skillId = skill.id ?? skill.sectionId ?? `skill-${index}`;
                        const section = skill.sectionId
                          ? selectedConversionDetail.conversionTemplateSnapshot?.sections.find(
                            (item) => item.id === skill.sectionId,
                          )
                          : undefined;
                        const skillResult = selectedConversionDetail.attempt.result.skills.find(
                          (item) => item.skillId === skillId,
                        );
                        const configuredMaximum = skill.rawMaxScore > 0
                          ? skill.rawMaxScore
                          : section?.rawMaxScore ?? null;
                        const rawMaximum = section && configuredMaximum !== null
                          ? Math.min(configuredMaximum, section.rawMaxScore)
                          : configuredMaximum;
                        const partScores = selectedConversionDetail.attempt.partScores[skillId] ?? {};
                        return (
                          <tr key={skillId} className="align-top">
                            <td className="px-3 py-2.5">
                              <p className="font-medium">
                                {skill.name || section?.name || `Kỹ năng ${index + 1}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("mySpace.scoreSheet.conversionMaximum")} {formatScore(rawMaximum)}
                              </p>
                              {skill.parts.length > 0 && (
                                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                  {skill.parts.map((part) => {
                                    const partScore = partScores[part.id];
                                    return (
                                      <li key={part.id}>
                                        {part.name}: {formatScore(partScore)} / {formatScore(part.rawMaxScore)}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-medium tabular-nums">
                              {formatScore(skillResult?.rawScore)} / {formatScore(rawMaximum)}
                            </td>
                            <td className="px-3 py-2.5 font-medium tabular-nums">
                              {formatScore(skillResult?.convertedScore)} / {formatScore(section?.convertedMaxScore)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="min-h-0 flex-1 overflow-y-auto p-4 md:w-[42%]">
                <div className="mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{t("mySpace.scoreSheet.conversionEvaluations")}</h3>
                </div>
                {conversionScoreNoteGroups.length === 0 && conversionEvaluationGroups.length === 0 ? (
                  <p className="rounded-lg border bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                    {t("mySpace.scoreSheet.conversionNoEvaluations")}
                  </p>
                ) : (
                  <div className="space-y-4 rounded-lg border bg-background px-3 py-3">
                    {conversionScoreNoteGroups.map((group) => (
                      <section key={group.title} className="space-y-1.5">
                        <h4 className="text-sm font-semibold">{group.title}</h4>
                        {group.entries.map((entry, index) => (
                          <div key={`${entry.title ?? "skill"}-${index}`} className="pl-2">
                            {entry.title && <p className="text-sm font-medium">{entry.title}</p>}
                            <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                          </div>
                        ))}
                      </section>
                    ))}
                    {conversionEvaluationGroups.map((group) => (
                      <section key={group.title} className="space-y-1.5">
                        <h4 className="text-sm font-semibold">{group.title}</h4>
                        {group.sections.map((section, sectionIndex) => (
                          <div key={`${section.title ?? "general"}-${sectionIndex}`} className="space-y-1 pl-2">
                            {section.title && <p className="text-sm font-semibold">{section.title}</p>}
                            {section.entries.map((entry, entryIndex) => (
                              <div key={`${entry.title}-${entryIndex}`} className="pl-2">
                                {entry.kind === "selected" ? (
                                  <p className="whitespace-pre-wrap text-sm">{entry.title}</p>
                                ) : (
                                  <>
                                    <p className="text-sm font-medium">{entry.title}</p>
                                    <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="w-64 shrink-0 overflow-y-auto border-r">
                {selectedScores.length > 0 ? (
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">{t("mySpace.scoreSheet.criteria")}</TableHead>
                        <TableHead className="text-right text-xs font-semibold">{t("mySpace.scoreSheet.score")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedScores.map((entry, idx) => (
                        <TableRow
                          key={entry.categoryId}
                          className={idx === selectedScores.length - 1 ? "bg-secondary/30 font-semibold" : ""}
                        >
                          <TableCell className="text-sm">{entry.categoryName}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {entry.score != null && entry.score !== "" ? (
                              <span
                                className={idx === selectedScores.length - 1 && !entry.color ? "text-violet-600 dark:text-violet-400" : ""}
                                style={{ color: entry.color ?? undefined }}
                              >
                                {entry.score}
                              </span>
                            ) : (
                              <span className="font-normal text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6">
                    <p className="text-sm italic text-muted-foreground">{t("mySpace.scoreSheet.noScores")}</p>
                  </div>
                )}
              </div>

              {selected?.teacherComment && (
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="flex shrink-0 items-center gap-1.5 border-b bg-secondary/30 px-4 py-3 text-muted-foreground">
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-semibold">{t("mySpace.scoreSheet.teacherComment")}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {selected.teacherComment.trimStart().startsWith("<") ? (
                      <div
                        className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: selected.teacherComment }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.teacherComment}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
