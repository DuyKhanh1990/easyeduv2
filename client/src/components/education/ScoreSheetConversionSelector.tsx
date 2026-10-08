import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLanguage } from "@/hooks/use-language";
import { ScoreSheetConversionResults } from "./ScoreSheetConversionResults";

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

interface ScoreSheetConversionSelectorProps {
  enabled: boolean;
  layout: "create" | "edit";
}

function getClassRosterStudentId(row: any): string | null {
  const id = row.studentId || row.student?.id || row.id;
  return id ? String(id) : null;
}

export function ScoreSheetConversionSelector({
  enabled,
  layout,
}: ScoreSheetConversionSelectorProps) {
  const { t } = useLanguage();
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
  } = useQuery<ScoreSheetTemplate[]>({
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

  const conversionTemplates = allTemplates.filter(
    (template) => Boolean(template.scoreConversionTemplateId),
  );
  const studentOptions = eligibleStudents.map((student) => ({
    value: student.studentId,
    label: [student.fullName || t("mySpace.scoreSheet.studentLabel"), student.code]
      .filter(Boolean)
      .join(" — "),
  }));

  const classRosterStudentIds = classRoster
    .map(getClassRosterStudentId)
    .filter((studentId): studentId is string => Boolean(studentId));
  const selectedResultStudentIds = selectionMode === "class"
    ? Array.from(new Set(classRosterStudentIds))
    : selectedStudentIds;
  const selectedResultClassIds = selectionMode === "class"
    ? (selectedClassId ? [selectedClassId] : [])
    : Array.from(new Set(
        eligibleStudents
          .filter((student) => selectedStudentIds.includes(student.studentId))
          .flatMap((student) => student.classes.map((studentClass) => studentClass.classId)),
      ));
  const selectedStudentCount = selectionMode === "class"
    ? selectedResultStudentIds.length
    : selectedStudentIds.length;
  const selectedClass = staffClasses.find((staffClass) => staffClass.id === selectedClassId);

  const changeSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedClassId("");
    setSelectedStudentIds([]);
  };

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
            options={conversionTemplates.map((template) => ({
              value: template.id,
              label: `${template.code} — ${template.name}`,
            }))}
            value={selectedTemplateId}
            onChange={setSelectedTemplateId}
            placeholder={
              templatesLoading
                ? t("mySpace.scoreSheet.conversionLoadingTemplates")
                : t("mySpace.scoreSheet.conversionSelectTemplate")
            }
            searchPlaceholder={t("mySpace.scoreSheet.conversionSearchTemplates")}
            disabled={templatesLoading || templatesError || conversionTemplates.length === 0}
            data-testid="conversion-template-select"
          />
          {templatesError && (
            <p className="text-xs text-destructive">
              {t("mySpace.scoreSheet.conversionTemplatesLoadError")}
            </p>
          )}
          {!templatesLoading && !templatesError && conversionTemplates.length === 0 && (
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
            <h2 className="font-semibold">{t("mySpace.scoreSheet.conversionSelectedStudents")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectionMode === "class"
                ? selectedClass
                  ? `${selectedClass.classCode}${selectedClass.name && selectedClass.name !== selectedClass.classCode ? ` — ${selectedClass.name}` : ""}`
                  : t("mySpace.scoreSheet.conversionSelectClassHint")
                : t("mySpace.scoreSheet.conversionSelectStudentsHint")}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {selectedStudentCount} {t("mySpace.scoreSheet.studentCount")}
          </Badge>
        </div>

        <ScoreSheetConversionResults
          selectedStudentIds={selectedResultStudentIds}
          allowedClassIds={selectedResultClassIds}
          selectionLoading={selectionMode === "class" && Boolean(selectedClassId) && rosterLoading}
          selectionError={selectionMode === "class" && Boolean(selectedClassId) && rosterError}
          emptySelectionMessage={
            selectionMode === "class"
              ? selectedClassId
                ? t("mySpace.scoreSheet.noStudents")
                : t("mySpace.scoreSheet.conversionSelectClassHint")
              : t("mySpace.scoreSheet.conversionSelectStudentsHint")
          }
        />
      </section>
    </div>
  );
}
