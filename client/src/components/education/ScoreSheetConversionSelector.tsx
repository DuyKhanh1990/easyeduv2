import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import type { ScoreConversionTemplate } from "@shared/score-conversion";
import type { ScoreSheetAssessmentInput } from "@shared/score-sheet-assessment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StaffAssignedScoreSheetAssessment } from "./StaffScoreSheetAssessmentStudentsDialog";

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

interface ScoreSheetConversionSelectorProps {
  enabled: boolean;
  layout: "create";
  onSaved?: (assessment: StaffAssignedScoreSheetAssessment) => void;
}

type CreatedManualAssessment = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  attemptCount: number;
  scoringPolicy: "highest" | "latest";
  manualStudentIds: string[];
  templateSnapshot: ScoreSheetTemplate;
};

function getClassRosterStudentId(row: any): string | null {
  const id = row.studentId || row.student?.id || row.id;
  return id ? String(id) : null;
}

export function ScoreSheetConversionSelector({
  enabled,
  layout,
  onSaved,
}: ScoreSheetConversionSelectorProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("class");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

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

  const saveMutation = useMutation({
    mutationFn: async (payload: ScoreSheetAssessmentInput) => {
      const response = await apiRequest("POST", "/api/score-sheet-assessments", payload);
      return response.json() as Promise<CreatedManualAssessment>;
    },
    onSuccess: (createdAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
      toast({
        title: t("mySpace.scoreSheet.conversionCreateSuccess"),
      });
      onSaved?.({
        sessionId: createdAssessment.id,
        classId: "manual",
        classCode: "Thủ công",
        className: "Thủ công",
        isManual: true,
        locationName: null,
        teacherNames: null,
        sessionIndex: null,
        examDate: createdAssessment.createdAt,
        assessmentId: createdAssessment.id,
        assessmentCode: createdAssessment.code,
        assessmentName: createdAssessment.name,
        templateName: createdAssessment.templateSnapshot.name,
        scoreDeadlineAt: null,
        published: false,
        studentCount: createdAssessment.manualStudentIds.length,
        enteredStudentCount: 0,
        completedStudentCount: 0,
        individuallyPublishedStudentCount: 0,
        allStudentsIndividuallyPublished: false,
        attemptCount: createdAssessment.attemptCount,
        scoringPolicy: createdAssessment.scoringPolicy,
        hasConversion: true,
      });
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
  ];

  const classRosterStudentIds = classRoster
    .map(getClassRosterStudentId)
    .filter((studentId): studentId is string => Boolean(studentId));
  const visibleStudentIds = selectionMode === "class"
    ? Array.from(new Set(classRosterStudentIds))
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
  const selectedStudents = visibleStudentIds
    .map((id) => currentStudentMap.get(id))
    .filter(Boolean) as EligibleStudent[];
  const selectedStudentCount = selectedStudents.length;
  const selectedClass = staffClasses.find((staffClass) => staffClass.id === selectedClassId);
  const usableTemplates = allTemplates.filter(
    (template) => !template.scoreConversionTemplateId || Boolean(template.conversionTemplate),
  );
  const selectedTemplate = usableTemplates.find((template) => template.id === selectedTemplateId);

  const changeSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedClassId("");
    setSelectedStudentIds([]);
  };

  const handleSave = () => {
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
    const dateCode = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const uniqueCode = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const payload: ScoreSheetAssessmentInput = {
      code: `MAN-${dateCode}-${uniqueCode}`,
      name: `${selectedTemplate.name.slice(0, 108)} - thủ công`,
      scoreSheetTemplateId: selectedTemplate.id,
      creationMode: "manual",
      manualSelectionMode: selectionMode,
      manualClassId: selectionMode === "class" ? selectedClassId : null,
      manualStudentIds: selectedStudents.map((student) => student.studentId),
    };
    saveMutation.mutate(payload);
  };

  const panelContent = !selectedTemplate
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
            options={usableTemplates.map((template) => ({
              value: template.id,
              label: `${template.code} — ${template.name}`,
            }))}
            value={selectedTemplateId}
            onChange={(templateId) => {
              setSelectedTemplateId(templateId);
            }}
            placeholder={
              templatesLoading
                ? t("mySpace.scoreSheet.conversionLoadingTemplates")
                : t("mySpace.scoreSheet.conversionSelectTemplate")
            }
            searchPlaceholder={t("mySpace.scoreSheet.conversionSearchTemplates")}
            disabled={templatesLoading || templatesError || usableTemplates.length === 0}
            data-testid="conversion-template-select"
          />
          {templatesError && (
            <p className="text-xs text-destructive">
              {t("mySpace.scoreSheet.conversionTemplatesLoadError")}
            </p>
          )}
          {!templatesLoading && !templatesError && usableTemplates.length === 0 && (
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
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("mySpace.scoreSheet.conversionSharedResultsHint")}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-3 border-t pt-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              saveMutation.isPending
              || Boolean(panelContent)
              || templatesLoading
              || templatesError
            }
            data-testid="manual-score-sheet-save"
          >
            {saveMutation.isPending
              ? t("mySpace.scoreSheet.saving")
              : t("mySpace.scoreSheet.conversionSave")}
          </Button>
        </div>
      </section>
    </div>
  );
}
