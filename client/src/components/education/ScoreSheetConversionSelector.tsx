import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import type { ScoreConversionTemplate } from "@shared/score-conversion";
import {
  calculateScoreSheetAssessmentAttemptResult,
  scoreSheetAssessmentAttemptValuesSchema,
  type ScoreSheetAssessmentAttemptValues,
} from "@shared/score-sheet-assessment-scoring";
import type { ManualScoreSheetPayload } from "@shared/manual-score-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SelectionMode = "class" | "students";

type StaffClass = {
  id: string;
  classCode: string;
  name: string;
};

type EligibleStudent = {
  studentId: string;
  fullName: string;
  code: string | null;
  classes: Array<{
    classId: string;
    classCode: string;
    className: string;
  }>;
};

type ConversionTemplateOption = ScoreSheetTemplate & {
  conversionTemplate: ScoreConversionTemplate | null;
};

type ManualScoreSheetDetail = {
  id: string;
  templateId: string;
  templateSnapshot: ScoreSheetTemplate;
  conversionTemplateSnapshot: ScoreConversionTemplate | null;
  selectionMode: SelectionMode;
  classId: string | null;
  studentIds: string[];
  students: Array<{ id: string; fullName: string; code: string | null }>;
  scoresByStudent: Record<string, ScoreSheetAssessmentAttemptValues>;
};

interface ScoreSheetConversionSelectorProps {
  enabled: boolean;
  layout: "create" | "edit";
  manualSheetId?: string;
  onSaved?: () => void;
}

function getClassRosterStudentId(row: any): string | null {
  const id = row.studentId || row.student?.id || row.id;
  return id ? String(id) : null;
}

function getScoreCellKey(skillId: string, partId: string | null): string {
  return `${skillId}:${partId ?? "__skill__"}`;
}

export function ScoreSheetConversionSelector({
  enabled,
  layout,
  manualSheetId,
  onSaved,
}: ScoreSheetConversionSelectorProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("class");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [scoresByStudent, setScoresByStudent] = useState<
    Record<string, ScoreSheetAssessmentAttemptValues>
  >({});
  const [scoreInputs, setScoreInputs] = useState<Record<string, Record<string, string>>>({});

  const {
    data: staffClasses = [],
    isLoading: classesLoading,
    isError: classesError,
  } = useQuery<StaffClass[]>({
    queryKey: ["/api/my-space/score-sheet/staff-classes"],
    enabled,
  });

  const {
    data: eligibleStudents = [],
    isLoading: studentsLoading,
    isError: studentsError,
  } = useQuery<EligibleStudent[]>({
    queryKey: ["/api/my-space/score-sheet/staff-students"],
    enabled: enabled && selectionMode === "students",
  });

  const {
    data: classRoster = [],
    isLoading: rosterLoading,
    isError: rosterError,
  } = useQuery<any[]>({
    queryKey: [`/api/classes/${selectedClassId}/active-students`],
    enabled: enabled && selectionMode === "class" && !!selectedClassId,
  });

  const {
    data: allTemplates = [],
    isLoading: templatesLoading,
    isError: templatesError,
  } = useQuery<ConversionTemplateOption[]>({
    queryKey: ["/api/my-space/score-sheet/conversion-templates"],
    enabled,
    queryFn: async () => {
      const response = await fetch(
        "/api/my-space/score-sheet/conversion-templates",
        { credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? t("mySpace.scoreSheet.conversionTemplatesLoadError"));
      }
      return payload;
    },
  });

  const { data: manualSheet, isLoading: manualSheetLoading, isError: manualSheetError } =
    useQuery<ManualScoreSheetDetail>({
      queryKey: [`/api/my-space/score-sheet/manual-conversions/${manualSheetId}`],
      enabled: enabled && Boolean(manualSheetId),
      queryFn: async () => {
        const response = await fetch(
          `/api/my-space/score-sheet/manual-conversions/${manualSheetId}`,
          { credentials: "include" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message ?? "Không thể tải bảng điểm.");
        }
        return payload;
      },
    });

  const saveMutation = useMutation({
    mutationFn: async (payload: ManualScoreSheetPayload) =>
      apiRequest(
        manualSheetId ? "PUT" : "POST",
        manualSheetId
          ? `/api/my-space/score-sheet/manual-conversions/${manualSheetId}`
          : "/api/my-space/score-sheet/manual-conversions",
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/manual-conversions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
      toast({
        title: manualSheetId
          ? t("mySpace.scoreSheet.conversionUpdateSuccess")
          : t("mySpace.scoreSheet.conversionCreateSuccess"),
      });
      onSaved?.();
    },
    onError: (error: Error) => {
      toast({
        title: t("mySpace.scoreSheet.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const studentOptions = [
    ...eligibleStudents.map((student) => ({
    value: student.studentId,
    label: [student.fullName || t("mySpace.scoreSheet.studentLabel"), student.code]
      .filter(Boolean)
      .join(" — "),
    })),
    ...(manualSheet?.students ?? [])
      .filter((student) => !eligibleStudents.some((eligible) => eligible.studentId === student.id))
      .map((student) => ({
        value: student.id,
        label: [student.fullName || t("mySpace.scoreSheet.studentLabel"), student.code]
          .filter(Boolean)
          .join(" — "),
      })),
  ];

  const classRosterStudentIds = classRoster
    .map(getClassRosterStudentId)
    .filter((studentId): studentId is string => Boolean(studentId));
  const classStudentIds = manualSheet
    && selectionMode === "class"
    && selectedClassId === manualSheet.classId
    ? manualSheet.studentIds
    : classRosterStudentIds;
  const visibleStudentIds = selectionMode === "class"
    ? Array.from(new Set(classStudentIds))
    : selectedStudentIds;
  const currentStudentMap = new Map<string, EligibleStudent | any>();
  classRoster.forEach((student: any) => {
    const id = getClassRosterStudentId(student);
    if (id) currentStudentMap.set(id, {
      studentId: id,
      fullName: student.fullName || student.full_name || student.student?.fullName || t("mySpace.scoreSheet.studentLabel"),
      code: student.code || student.student?.code || null,
    });
  });
  eligibleStudents.forEach((student) => currentStudentMap.set(student.studentId, student));
  manualSheet?.students.forEach((student) => {
    if (!currentStudentMap.has(student.id)) {
      currentStudentMap.set(student.id, {
        studentId: student.id,
        fullName: student.fullName,
        code: student.code,
      });
    }
  });
  const selectedStudents = visibleStudentIds
    .map((id) => currentStudentMap.get(id))
    .filter(Boolean) as EligibleStudent[];
  const selectedStudentCount = selectedStudents.length;
  const selectedClass = staffClasses.find((staffClass) => staffClass.id === selectedClassId);
  const usableTemplates = allTemplates.filter(
    (template) => !template.scoreConversionTemplateId || Boolean(template.conversionTemplate),
  );
  const templateOptions = manualSheet && !usableTemplates.some((item) => item.id === manualSheet.templateId)
    ? [{
        ...manualSheet.templateSnapshot,
        conversionTemplate: manualSheet.conversionTemplateSnapshot,
      }, ...usableTemplates]
    : usableTemplates;
  const selectedTemplate = templateOptions.find((template) => template.id === selectedTemplateId);

  useEffect(() => {
    if (!manualSheet || !manualSheetId) return;
    setSelectionMode(manualSheet.selectionMode);
    setSelectedClassId(manualSheet.classId ?? "");
    setSelectedStudentIds(manualSheet.selectionMode === "students" ? manualSheet.studentIds : []);
    setSelectedTemplateId(manualSheet.templateId);
    setScoresByStudent(manualSheet.scoresByStudent ?? {});
    const inputs: Record<string, Record<string, string>> = {};
    for (const studentId of manualSheet.studentIds) {
      const values = scoreSheetAssessmentAttemptValuesSchema.parse(
        manualSheet.scoresByStudent?.[studentId] ?? {},
      );
      const studentInputs: Record<string, string> = {};
      for (const [skillId, score] of Object.entries(values.skillScores)) {
        if (score != null) studentInputs[getScoreCellKey(skillId, null)] = String(score);
      }
      for (const [skillId, partValues] of Object.entries(values.partScores)) {
        for (const [partId, score] of Object.entries(partValues)) {
          if (score != null) studentInputs[getScoreCellKey(skillId, partId)] = String(score);
        }
      }
      inputs[studentId] = studentInputs;
    }
    setScoreInputs(inputs);
  }, [manualSheet, manualSheetId]);

  const changeSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedClassId("");
    setSelectedStudentIds([]);
  };

  const scoreColumns: Array<{
    skillId: string;
    skillName: string;
    partId: string | null;
    partName: string;
    maxScore: number | null;
  }> = [];
  selectedTemplate?.skills.forEach((skill, skillIndex) => {
    const skillId = skill.id ?? skill.sectionId;
    if (!skillId) return;
    const conversionSection = skill.sectionId
      ? selectedTemplate.conversionTemplate?.sections.find(
          (section) => section.id === skill.sectionId,
        )
      : undefined;
    const configuredSkillMax = skill.rawMaxScore > 0
      ? skill.rawMaxScore
      : conversionSection?.rawMaxScore ?? null;
    const skillMaxScore = conversionSection && configuredSkillMax != null
      ? Math.min(configuredSkillMax, conversionSection.rawMaxScore)
      : configuredSkillMax;
    if (skill.parts.length === 0) {
      scoreColumns.push({
        skillId,
        skillName: skill.name || `Kỹ năng ${skillIndex + 1}`,
        partId: null,
        partName: skill.name || `Kỹ năng ${skillIndex + 1}`,
        maxScore: skillMaxScore,
      });
      return;
    }
    skill.parts.forEach((part) => {
      scoreColumns.push({
        skillId,
        skillName: skill.name || `Kỹ năng ${skillIndex + 1}`,
        partId: part.id,
        partName: part.name,
        maxScore: part.rawMaxScore,
      });
    });
  });

  const calculatedResults = useMemo(() => {
    if (!selectedTemplate) {
      return new Map<string, ReturnType<typeof calculateScoreSheetAssessmentAttemptResult> | null>();
    }
    return new Map(selectedStudents.map((student) => {
      try {
        const values = scoreSheetAssessmentAttemptValuesSchema.parse(
          scoresByStudent[student.studentId] ?? {},
        );
        return [student.studentId, calculateScoreSheetAssessmentAttemptResult({
          template: selectedTemplate,
          conversionTemplate: selectedTemplate.conversionTemplate,
          values,
        })] as const;
      } catch {
        return [student.studentId, null] as const;
      }
    }));
  }, [scoresByStudent, selectedStudents, selectedTemplate]);

  const updateScore = (
    studentId: string,
    skillId: string,
    partId: string | null,
    rawValue: string,
    maxScore: number | null,
  ) => {
    const trimmedValue = rawValue.trim();
    const parsedScore = trimmedValue === "" ? null : Number(trimmedValue);
    const score = parsedScore != null
      && Number.isFinite(parsedScore)
      && parsedScore >= 0
      && (maxScore == null || parsedScore <= maxScore)
      ? parsedScore
      : null;
    const cellKey = getScoreCellKey(skillId, partId);
    setScoreInputs((previous) => ({
      ...previous,
      [studentId]: { ...previous[studentId], [cellKey]: rawValue },
    }));
    setScoresByStudent((previous) => {
      const current = scoreSheetAssessmentAttemptValuesSchema.parse(
        previous[studentId] ?? {},
      );
      const updated: ScoreSheetAssessmentAttemptValues = partId
        ? {
            ...current,
            partScores: {
              ...current.partScores,
              [skillId]: {
                ...(current.partScores[skillId] ?? {}),
                [partId]: score,
              },
            },
          }
        : {
            ...current,
            skillScores: {
              ...current.skillScores,
              [skillId]: score,
            },
          };
      return { ...previous, [studentId]: updated };
    });
  };

  const handleSave = () => {
    if (manualSheetLoading) return;
    if (!selectedTemplate) {
      toast({
        title: t("mySpace.scoreSheet.conversionSelectTemplate"),
        variant: "destructive",
      });
      return;
    }
    if (selectedStudents.length === 0) {
      toast({
        title: t("mySpace.scoreSheet.conversionChooseStudents"),
        variant: "destructive",
      });
      return;
    }
    const hasInvalidScoreInput = selectedStudents.some((student) =>
      scoreColumns.some((column) => {
        const rawValue = scoreInputs[student.studentId]?.[
          getScoreCellKey(column.skillId, column.partId)
        ] ?? "";
        if (rawValue.trim() === "") return false;
        const score = Number(rawValue.trim());
        return !Number.isFinite(score)
          || score < 0
          || (column.maxScore != null && score > column.maxScore);
      }),
    );
    if (hasInvalidScoreInput) {
      toast({
        title: t("mySpace.scoreSheet.conversionInvalidScore"),
        variant: "destructive",
      });
      return;
    }
    const payload: ManualScoreSheetPayload = {
      templateId: selectedTemplate.id,
      selectionMode,
      classId: selectionMode === "class" ? selectedClassId : null,
      studentIds: selectedStudents.map((student) => student.studentId),
      scoresByStudent: Object.fromEntries(
        selectedStudents.map((student) => [
          student.studentId,
          scoreSheetAssessmentAttemptValuesSchema.parse(
            scoresByStudent[student.studentId] ?? {},
          ),
        ]),
      ),
    };
    saveMutation.mutate(payload);
  };

  const formatScore = (score: number | null | undefined) =>
    score == null ? "—" : String(Number(score.toFixed(2)));

  const panelContent = manualSheetLoading
    ? t("mySpace.scoreSheet.conversionLoadingManualSheet")
    : manualSheetError
      ? t("mySpace.scoreSheet.conversionManualSheetLoadError")
      : !selectedTemplate
        ? t("mySpace.scoreSheet.conversionSelectTemplateHint")
        : selectionMode === "class" && selectedClassId && rosterLoading
          ? t("mySpace.scoreSheet.conversionLoadingStudents")
          : selectionMode === "class" && selectedClassId && rosterError
            ? t("mySpace.scoreSheet.conversionStudentsLoadError")
        : selectedStudents.length === 0
          ? selectionMode === "class"
            ? selectedClassId
              ? t("mySpace.scoreSheet.noStudents")
              : t("mySpace.scoreSheet.conversionSelectClassHint")
            : t("mySpace.scoreSheet.conversionSelectStudentsHint")
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        className={[
          "flex shrink-0 flex-col gap-4 overflow-y-auto border-b p-4 md:max-h-none md:border-b-0 md:border-r md:p-5",
          layout === "create"
            ? "max-h-[48vh] w-full md:max-h-none md:w-[24%] md:min-w-[220px] md:max-w-[360px]"
            : "max-h-[48vh] w-full md:max-h-none md:w-64",
        ].join(" ")}
      >
        <div className="space-y-2">
          <Label>{t("mySpace.scoreSheet.conversionSelectionMethod")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={selectionMode === "class" ? "default" : "outline"}
              onClick={() => changeSelectionMode("class")}
              data-testid="conversion-select-by-class"
            >
              {t("mySpace.scoreSheet.conversionByClass")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectionMode === "students" ? "default" : "outline"}
              onClick={() => changeSelectionMode("students")}
              data-testid="conversion-select-by-students"
            >
              {t("mySpace.scoreSheet.conversionByStudents")}
            </Button>
          </div>
        </div>

        {selectionMode === "class" ? (
          <div className="space-y-2">
            <Label>{t("mySpace.scoreSheet.class")}</Label>
            <SearchableSelect
              options={staffClasses.map((staffClass) => ({
                value: staffClass.id,
                label: staffClass.classCode,
                sublabel:
                  staffClass.name && staffClass.name !== staffClass.classCode
                    ? staffClass.name
                    : undefined,
              }))}
              value={selectedClassId}
              onChange={(classId) => setSelectedClassId(classId)}
              placeholder={
                classesLoading
                  ? t("mySpace.scoreSheet.conversionLoadingClasses")
                  : t("mySpace.scoreSheet.selectClass")
              }
              searchPlaceholder={t("mySpace.scoreSheet.conversionSearchClasses")}
              disabled={classesLoading || classesError || staffClasses.length === 0}
              data-testid="conversion-class-select"
            />
            {classesError && (
              <p className="text-xs text-destructive">
                {t("mySpace.scoreSheet.conversionClassesLoadError")}
              </p>
            )}
            {!classesLoading && !classesError && staffClasses.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("mySpace.scoreSheet.conversionNoEligibleClasses")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("mySpace.scoreSheet.conversionChooseStudents")}</Label>
            <SearchableMultiSelect
              options={studentOptions}
              value={selectedStudentIds}
              onChange={setSelectedStudentIds}
              placeholder={
                studentsLoading
                  ? t("mySpace.scoreSheet.conversionLoadingStudents")
                  : t("mySpace.scoreSheet.conversionChooseStudents")
              }
              searchPlaceholder={t("mySpace.scoreSheet.conversionSearchStudents")}
              disabled={studentsLoading || studentsError || eligibleStudents.length === 0}
              data-testid="conversion-student-select"
            />
            {studentsError && (
              <p className="text-xs text-destructive">
                {t("mySpace.scoreSheet.conversionStudentsLoadError")}
              </p>
            )}
            {!studentsLoading && !studentsError && eligibleStudents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("mySpace.scoreSheet.conversionNoEligibleStudents")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>{t("mySpace.scoreSheet.conversionTemplateLabel")}</Label>
          <SearchableSelect
            options={templateOptions.map((template) => ({
              value: template.id,
              label: `${template.code} — ${template.name}`,
            }))}
            value={selectedTemplateId}
            onChange={(templateId) => {
              setSelectedTemplateId(templateId);
              setScoresByStudent({});
              setScoreInputs({});
            }}
            placeholder={
              templatesLoading
                ? t("mySpace.scoreSheet.conversionLoadingTemplates")
                : t("mySpace.scoreSheet.conversionSelectTemplate")
            }
            searchPlaceholder={t("mySpace.scoreSheet.conversionSearchTemplates")}
            disabled={templatesLoading || templatesError || templateOptions.length === 0}
            data-testid="conversion-template-select"
          />
          {templatesError && (
            <p className="text-xs text-destructive">
              {t("mySpace.scoreSheet.conversionTemplatesLoadError")}
            </p>
          )}
          {!templatesLoading && !templatesError && templateOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("mySpace.scoreSheet.conversionNoTemplates")}
            </p>
          )}
        </div>

        {selectionMode === "students" && (
          <p className="text-xs text-muted-foreground">
            {t("mySpace.scoreSheet.selectedCount")}: {selectedStudentIds.length}
          </p>
        )}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-5">
        <div className="mb-3 flex items-start justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">
              {selectedTemplate?.name || t("mySpace.scoreSheet.conversionSelectedStudents")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedClass
                ? `${selectedClass.classCode}${selectedClass.name && selectedClass.name !== selectedClass.classCode ? ` — ${selectedClass.name}` : ""}`
                : selectionMode === "students"
                  ? t("mySpace.scoreSheet.conversionSelectStudentsHint")
                  : t("mySpace.scoreSheet.conversionSelectClassHint")}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {selectedStudentCount} {t("mySpace.scoreSheet.studentCount")}
          </Badge>
        </div>

        {panelContent ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {panelContent}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table className="min-w-max">
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow>
                  <TableHead className="sticky left-0 z-30 min-w-[190px] bg-background">
                    {t("mySpace.scoreSheet.studentLabel")}
                  </TableHead>
                  {scoreColumns.map((column, index) => (
                    <TableHead
                      key={`${column.skillId}-${column.partId ?? "whole"}-${index}`}
                      className="min-w-[150px] text-center"
                    >
                      <div>{column.partName}</div>
                      {column.maxScore != null && (
                        <div className="text-[11px] font-normal text-muted-foreground">
                          {t("mySpace.scoreSheet.conversionMaximumScore")}: {column.maxScore}
                        </div>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[115px] text-right">
                    {t("mySpace.scoreSheet.conversionRawTotal")}
                  </TableHead>
                  <TableHead className="min-w-[115px] text-right">
                    {t("mySpace.scoreSheet.conversionConvertedTotal")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedStudents.map((student) => {
                  const values = scoreSheetAssessmentAttemptValuesSchema.parse(
                    scoresByStudent[student.studentId] ?? {},
                  );
                  const result = calculatedResults.get(student.studentId);
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell className="sticky left-0 z-10 min-w-[190px] bg-background font-medium">
                        <div>{student.fullName}</div>
                        {student.code && (
                          <div className="text-xs font-normal text-muted-foreground">{student.code}</div>
                        )}
                      </TableCell>
                      {scoreColumns.map((column, index) => {
                        const score = column.partId
                          ? values.partScores[column.skillId]?.[column.partId]
                          : values.skillScores[column.skillId];
                        return (
                          <TableCell
                            key={`${student.studentId}-${column.skillId}-${column.partId ?? "whole"}-${index}`}
                            className="min-w-[150px]"
                          >
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={scoreInputs[student.studentId]?.[getScoreCellKey(column.skillId, column.partId)] ?? (score == null ? "" : String(score))}
                              placeholder={column.maxScore == null ? undefined : `0–${column.maxScore}`}
                              aria-label={`${student.fullName}: ${column.partName}`}
                              data-testid={`manual-score-${student.studentId}-${column.skillId}-${column.partId ?? "whole"}`}
                              onChange={(event) => updateScore(
                                student.studentId,
                                column.skillId,
                                column.partId,
                                event.target.value,
                                column.maxScore,
                              )}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums">
                        {formatScore(result?.overallRawScore)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatScore(result?.overallConvertedScore)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {selectedTemplate
              ? t("mySpace.scoreSheet.conversionBlankGridHint")
              : t("mySpace.scoreSheet.conversionSelectTemplateHint")}
          </p>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              saveMutation.isPending
              || manualSheetLoading
              || Boolean(panelContent)
              || templatesLoading
              || templatesError
            }
            data-testid="manual-score-sheet-save"
          >
            {saveMutation.isPending
              ? t("mySpace.scoreSheet.saving")
              : manualSheetId
                ? t("mySpace.scoreSheet.conversionUpdate")
                : t("mySpace.scoreSheet.conversionSave")}
          </Button>
        </div>
      </section>
    </div>
  );
}
