import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Calculator, CheckCircle2, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  calculateScoreSheetAssessmentAttemptResult,
  scoreSheetAssessmentAttemptValuesSchema,
  type ScoreSheetAssessmentAttemptResult,
  type ScoreSheetAssessmentAttemptValues,
} from "@shared/score-sheet-assessment-scoring";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import type { ScoreConversionTemplate } from "@shared/score-conversion";
import type { StaffAssignedScoreSheetAssessment } from "./StaffScoreSheetAssessmentStudentsDialog";

type AssessmentScoreEntryStudent = {
  studentId: string;
  code: string;
  fullName: string;
};

type AssessmentScoreEntry = {
  attemptNumber: number;
  partScores: ScoreSheetAssessmentAttemptValues["partScores"];
  skillScores: ScoreSheetAssessmentAttemptValues["skillScores"];
  notes: ScoreSheetAssessmentAttemptValues["notes"];
  result: ScoreSheetAssessmentAttemptResult;
  createdAt: string;
  updatedAt: string;
};

type AssessmentScoreEntryResponse = {
  assessment: {
    id: string;
    code: string;
    name: string;
    attemptCount: number;
    scoringPolicy: "highest" | "latest";
    scoreDeadlineAt: string;
    templateSnapshot: ScoreSheetTemplate;
    conversionTemplateSnapshot: ScoreConversionTemplate | null;
  };
  attempts: AssessmentScoreEntry[];
};

type StaffScoreSheetAssessmentScoreDialogProps = {
  assessment: StaffAssignedScoreSheetAssessment | null;
  student: AssessmentScoreEntryStudent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function formatScore(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function createEmptyValues(): ScoreSheetAssessmentAttemptValues {
  return { partScores: {}, skillScores: {}, notes: {} };
}

function skillIdFor(
  skill: ScoreSheetTemplate["skills"][number],
  index: number,
) {
  return skill.id ?? skill.sectionId ?? `skill-${index}`;
}

function normalizeValues(values: ScoreSheetAssessmentAttemptValues) {
  return scoreSheetAssessmentAttemptValuesSchema.parse(values);
}

function hasEnteredValue(values: ScoreSheetAssessmentAttemptValues) {
  return Object.values(values.skillScores).some((score) => score !== null)
    || Object.values(values.partScores).some((parts) =>
      Object.values(parts).some((score) => score !== null),
    )
    || Object.values(values.notes).some((notes) =>
      Object.values(notes).some((note) => note.trim().length > 0),
    );
}

function displayMethod(method: "sum" | "average" | "custom") {
  if (method === "sum") return "Cộng gộp";
  if (method === "average") return "Trung bình";
  return "Theo công thức";
}

export function StaffScoreSheetAssessmentScoreDialog({
  assessment,
  student,
  open,
  onOpenChange,
  onSaved,
}: StaffScoreSheetAssessmentScoreDialogProps) {
  const [selectedAttemptNumber, setSelectedAttemptNumber] = useState<number | null>(null);
  const [draftsByAttempt, setDraftsByAttempt] = useState<Record<number, ScoreSheetAssessmentAttemptValues>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const queryKey = [
    "/api/my-space/score-sheet/staff-assessments",
    assessment?.sessionId,
    student?.studentId,
    "score-entry",
  ];

  const entryQuery = useQuery<AssessmentScoreEntryResponse>({
    queryKey,
    enabled: open && !!assessment?.sessionId && !!student?.studentId,
    queryFn: async () => {
      if (!assessment || !student) throw new Error("Chưa chọn học viên");
      const response = await fetch(
        `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}/students/${encodeURIComponent(student.studentId)}/score-entry`,
        { credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Không thể tải biểu mẫu nhập điểm.");
      }
      return payload;
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    setSelectedAttemptNumber(null);
    setDraftsByAttempt({});
    setSaveError(null);
    setSaveMessage(null);
  }, [open, assessment?.sessionId, student?.studentId]);

  useEffect(() => {
    if (!open || !entryQuery.data || selectedAttemptNumber !== null) return;
    const highestAttempt = entryQuery.data.attempts.reduce(
      (highest, attempt) => Math.max(highest, attempt.attemptNumber),
      0,
    );
    setSelectedAttemptNumber(Math.min(highestAttempt + 1, entryQuery.data.assessment.attemptCount));
  }, [open, entryQuery.data, selectedAttemptNumber]);

  const details = entryQuery.data;
  const template = details?.assessment.templateSnapshot;
  const conversionTemplate = details?.assessment.conversionTemplateSnapshot ?? null;
  const attempts = details?.attempts ?? [];
  const selectedAttempt = selectedAttemptNumber == null
    ? undefined
    : attempts.find((attempt) => attempt.attemptNumber === selectedAttemptNumber);
  const savedValues = useMemo<ScoreSheetAssessmentAttemptValues>(() => selectedAttempt
    ? normalizeValues({
      partScores: selectedAttempt.partScores,
      skillScores: selectedAttempt.skillScores,
      notes: selectedAttempt.notes,
    })
    : createEmptyValues(), [selectedAttempt]);
  const currentValues = selectedAttemptNumber == null
    ? createEmptyValues()
    : draftsByAttempt[selectedAttemptNumber] ?? savedValues;
  const draftIsDirty = JSON.stringify(currentValues) !== JSON.stringify(savedValues);
  const preview = useMemo(() => {
    if (!template) return null;
    try {
      return calculateScoreSheetAssessmentAttemptResult({
        template,
        conversionTemplate,
        values: currentValues,
      });
    } catch {
      return null;
    }
  }, [template, conversionTemplate, currentValues]);

  const maxSavedAttempt = attempts.reduce(
    (highest, attempt) => Math.max(highest, attempt.attemptNumber),
    0,
  );
  const lastAttemptOption = Math.min(
    details?.assessment.attemptCount ?? 1,
    maxSavedAttempt + 1,
  );
  const attemptOptions = Array.from({ length: Math.max(1, lastAttemptOption) }, (_, index) => index + 1);

  const updateDraft = (update: (current: ScoreSheetAssessmentAttemptValues) => ScoreSheetAssessmentAttemptValues) => {
    if (selectedAttemptNumber == null) return;
    setSaveError(null);
    setSaveMessage(null);
    setDraftsByAttempt((current) => ({
      ...current,
      [selectedAttemptNumber]: update(current[selectedAttemptNumber] ?? savedValues),
    }));
  };

  const saveAttempt = async () => {
    if (!assessment || !student || selectedAttemptNumber == null || !draftIsDirty) return;
    if (!selectedAttempt && !hasEnteredValue(currentValues)) {
      setSaveError("Nhập ít nhất một điểm hoặc ghi chú trước khi lưu.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}/students/${encodeURIComponent(student.studentId)}/score-entry/${selectedAttemptNumber}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentValues),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Không thể lưu điểm.");

      setDraftsByAttempt((current) => {
        const next = { ...current };
        delete next[selectedAttemptNumber];
        return next;
      });
      setSaveMessage(`Đã lưu lần thi ${selectedAttemptNumber}.`);
      await entryQuery.refetch();
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không thể lưu điểm.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[94vw] sm:max-w-[94vw] xl:max-w-[1180px]">
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 via-background to-sky-50 px-5 py-4 text-left dark:from-violet-950/30 dark:to-sky-950/20 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base sm:text-lg">Nhập điểm kỹ năng</DialogTitle>
            <Badge variant="outline">{details?.assessment.code ?? assessment?.assessmentCode ?? "Bảng điểm Quy đổi"}</Badge>
            {preview?.inputComplete && <Badge className="bg-emerald-600 hover:bg-emerald-600">Đã đủ điểm</Badge>}
          </div>
          <DialogDescription>
            {student && <span className="font-medium text-foreground">{student.code} · {student.fullName}</span>}
            {assessment && (
              <>
                {" · "}
                {assessment.classCode}
                {assessment.sessionIndex != null ? ` · Buổi ${assessment.sessionIndex}` : ""}
                {` · Ngày thi ${formatDate(assessment.examDate)}`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {entryQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải cấu hình và điểm đã nhập…
          </div>
        ) : entryQuery.isError ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {entryQuery.error instanceof Error ? entryQuery.error.message : "Không thể tải biểu mẫu nhập điểm."}
            </p>
            <Button variant="outline" size="sm" onClick={() => entryQuery.refetch()}>Tải lại</Button>
          </div>
        ) : details && template ? (
          <>
            <div className="shrink-0 space-y-3 border-b bg-muted/20 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="assessment-attempt-number" className="text-sm font-medium">
                    Lần thi
                  </label>
                  {attemptOptions.length > 1 ? (
                    <select
                      id="assessment-attempt-number"
                      value={selectedAttemptNumber ?? 1}
                      onChange={(event) => {
                        setSelectedAttemptNumber(Number(event.target.value));
                        setSaveError(null);
                        setSaveMessage(null);
                      }}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {attemptOptions.map((number) => {
                        const attempt = attempts.find((item) => item.attemptNumber === number);
                        return (
                          <option key={number} value={number}>
                            Lần {number}{attempt ? " · Đã lưu" : " · Chưa nhập"}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <Badge variant="secondary">Lần 1 / {details.assessment.attemptCount}</Badge>
                  )}
                  <Badge variant="outline">
                    Tính kết quả theo {details.assessment.scoringPolicy === "highest" ? "điểm cao nhất" : "lần mới nhất"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hạn trả điểm: {formatDate(details.assessment.scoreDeadlineAt)}
                </p>
              </div>

              <div className={`grid gap-2 ${conversionTemplate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tổng điểm thô</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {formatScore(preview?.overallRawScore)}
                  </p>
                </div>
                {conversionTemplate && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      Tổng điểm quy đổi
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-violet-800 dark:text-violet-200">
                      {formatScore(preview?.overallConvertedScore)}
                      {preview?.gradeBand && (
                        <span className="ml-2 text-sm font-medium">{preview.gradeBand.label}</span>
                      )}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                  {preview?.inputComplete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tiến độ</p>
                    <p className="text-sm font-medium">
                      {preview?.inputComplete ? "Đã nhập đủ kỹ năng" : "Còn kỹ năng chưa hoàn tất"}
                    </p>
                  </div>
                </div>
              </div>
              {conversionTemplate && preview?.inputComplete && !preview.conversionComplete && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Một số điểm thô chưa có khoảng quy đổi tương ứng trong cấu hình.
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
              {template.skills.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  Bảng điểm mẫu chưa có kỹ năng để nhập.
                </div>
              ) : template.skills.map((skill, index) => {
                const skillId = skillIdFor(skill, index);
                const section = skill.sectionId
                  ? conversionTemplate?.sections.find((item) => item.id === skill.sectionId)
                  : undefined;
                const skillResult = preview?.skills.find((item) => item.skillId === skillId);
                const skillName = skill.name || section?.name || `Kỹ năng ${index + 1}`;
                const notesForSkill = currentValues.notes[skillId] ?? {};
                const rawUnit = section?.rawUnit || "điểm";

                return (
                  <section key={skillId} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{skillName}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {skill.parts.length > 0
                              ? displayMethod(skill.partFormula.method)
                              : "Nhập trực tiếp điểm thô"}
                            {section && ` · Thang điểm ${section.rawMinScore}–${section.rawMaxScore} ${section.rawUnit}`}
                          </p>
                        </div>
                      </div>
                      <div className={`grid gap-2 text-right ${conversionTemplate ? "grid-cols-3" : "grid-cols-1"}`}>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Điểm thô</p>
                          <p className="text-sm font-semibold tabular-nums">{formatScore(skillResult?.rawScore)}</p>
                        </div>
                        {conversionTemplate && (
                          <>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nội bộ</p>
                              <p className="text-sm font-medium tabular-nums">{formatScore(skillResult?.internalScore)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-violet-700 dark:text-violet-300">Quy đổi</p>
                              <p className="text-sm font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                                {formatScore(skillResult?.convertedScore)}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="divide-y">
                      {skill.parts.length > 0 ? skill.parts.map((part) => {
                        const partScore = currentValues.partScores[skillId]?.[part.id] ?? null;
                        return (
                          <div
                            key={part.id}
                            className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(160px,0.8fr)_minmax(190px,1fr)_minmax(180px,1fr)] md:items-center"
                          >
                            <div>
                              <p className="text-sm font-medium">{part.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {rawUnit} · 0–{part.rawMaxScore}
                              </p>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={part.rawMaxScore}
                              step="any"
                              value={partScore ?? ""}
                              onChange={(event) => {
                                const raw = event.target.value;
                                const score = raw === "" ? null : Number(raw);
                                if (score !== null && !Number.isFinite(score)) return;
                                updateDraft((current) => ({
                                  ...current,
                                  partScores: {
                                    ...current.partScores,
                                    [skillId]: {
                                      ...(current.partScores[skillId] ?? {}),
                                      [part.id]: score,
                                    },
                                  },
                                }));
                              }}
                              aria-label={`${skillName}: ${part.name}, tối đa ${part.rawMaxScore}`}
                              placeholder={`Điểm từ 0 đến ${part.rawMaxScore}`}
                              className="tabular-nums"
                            />
                            <Input
                              value={notesForSkill[part.id] ?? ""}
                              onChange={(event) => updateDraft((current) => ({
                                ...current,
                                notes: {
                                  ...current.notes,
                                  [skillId]: {
                                    ...(current.notes[skillId] ?? {}),
                                    [part.id]: event.target.value,
                                  },
                                },
                              }))}
                              maxLength={1000}
                              placeholder="Ghi chú cho phần này"
                              aria-label={`Ghi chú ${part.name}`}
                            />
                          </div>
                        );
                      }) : (
                        <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(160px,0.8fr)_minmax(190px,1fr)_minmax(180px,1fr)] md:items-center">
                          <div>
                            <p className="text-sm font-medium">Điểm kỹ năng</p>
                            <p className="text-xs text-muted-foreground">
                              {rawUnit}{section ? ` · 0–${section.rawMaxScore}` : ""}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={section?.rawMaxScore}
                            step="any"
                            value={currentValues.skillScores[skillId] ?? ""}
                            onChange={(event) => {
                              const raw = event.target.value;
                              const score = raw === "" ? null : Number(raw);
                              if (score !== null && !Number.isFinite(score)) return;
                              updateDraft((current) => ({
                                ...current,
                                skillScores: { ...current.skillScores, [skillId]: score },
                              }));
                            }}
                            aria-label={`${skillName}: điểm kỹ năng`}
                            placeholder={section ? `Điểm từ 0 đến ${section.rawMaxScore}` : "Nhập điểm thô"}
                            className="tabular-nums"
                          />
                          <Input
                            value={notesForSkill._skill ?? ""}
                            onChange={(event) => updateDraft((current) => ({
                              ...current,
                              notes: {
                                ...current.notes,
                                [skillId]: {
                                  ...(current.notes[skillId] ?? {}),
                                  _skill: event.target.value,
                                },
                              },
                            }))}
                            maxLength={1000}
                            placeholder="Ghi chú cho kỹ năng"
                            aria-label={`Ghi chú ${skillName}`}
                          />
                        </div>
                      )}
                    </div>

                    {skillResult?.mappingStatus === "no_mapping" && skillResult.rawScore !== null && (
                      <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        Điểm thô chưa có mức quy đổi tương ứng.
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-h-5 text-sm" aria-live="polite">
                {saveError ? (
                  <span className="text-destructive">{saveError}</span>
                ) : saveMessage ? (
                  <span className="text-emerald-700 dark:text-emerald-300">{saveMessage}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Điểm quy đổi được tính tự động theo cấu hình bảng điểm.
                  </span>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
                  Đóng
                </Button>
                <Button
                  onClick={saveAttempt}
                  disabled={!draftIsDirty || isSaving || selectedAttemptNumber == null}
                  className="flex-1 sm:flex-none"
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Lưu điểm
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}