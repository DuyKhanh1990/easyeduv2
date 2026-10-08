import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LoaderCircle } from "lucide-react";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLanguage } from "@/hooks/use-language";

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

type DisplayStudent = {
  id: string;
  name: string;
  code?: string | null;
  classLabel?: string;
};

interface ScoreSheetConversionSelectorProps {
  enabled: boolean;
  layout: "create" | "edit";
}

function getClassRosterStudent(row: any): DisplayStudent | null {
  const id = row.studentId || row.student?.id || row.id;
  if (!id) return null;

  return {
    id,
    name: row.fullName || row.full_name || row.student?.fullName || "",
    code: row.code || row.student?.code || null,
  };
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

  const templateSourceClassId =
    (selectionMode === "class" && selectedClassId) || staffClasses[0]?.id || "";
  const {
    data: allTemplates = [],
    isLoading: templatesLoading,
    isError: templatesError,
  } = useQuery<ScoreSheetTemplate[]>({
    queryKey: [`/api/classes/${templateSourceClassId}/score-sheet-templates`],
    enabled: enabled && !!templateSourceClassId,
  });

  const conversionTemplates = allTemplates.filter(
    (template) => Boolean(template.scoreConversionTemplateId),
  );
  const studentOptions = eligibleStudents.map((student) => ({
    value: student.studentId,
    label: student.fullName || student.code || t("mySpace.scoreSheet.studentLabel"),
    sublabel: [
      student.code,
      student.classes.map((studentClass) => studentClass.classCode).join(", "),
    ].filter(Boolean).join(" · "),
  }));

  const classRosterStudents = classRoster
    .map(getClassRosterStudent)
    .filter((student): student is DisplayStudent => Boolean(student?.id))
    .reduce<DisplayStudent[]>((unique, student) => {
      if (!unique.some((existing) => existing.id === student.id)) unique.push(student);
      return unique;
    }, []);

  const manuallySelectedStudents = eligibleStudents
    .filter((student) => selectedStudentIds.includes(student.studentId))
    .map((student) => ({
      id: student.studentId,
      name: student.fullName || "",
      code: student.code,
      classLabel: student.classes.map((studentClass) => studentClass.classCode).join(", "),
    }));

  const selectedStudents =
    selectionMode === "class" ? classRosterStudents : manuallySelectedStudents;
  const selectedClass = staffClasses.find((staffClass) => staffClass.id === selectedClassId);

  const changeSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedClassId("");
    setSelectedStudentIds([]);
  };

  const showRightLoading =
    selectionMode === "class"
      ? Boolean(selectedClassId && rosterLoading)
      : Boolean(studentsLoading && selectedStudentIds.length > 0);
  const showRightError =
    selectionMode === "class"
      ? Boolean(selectedClassId && rosterError)
      : Boolean(studentsError && selectedStudentIds.length > 0);

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
            {selectedStudents.length} {t("mySpace.scoreSheet.studentCount")}
          </Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="conversion-selected-students">
          {showRightLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {t("mySpace.scoreSheet.conversionLoadingStudents")}
            </div>
          ) : showRightError ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-destructive">
              {t("mySpace.scoreSheet.conversionStudentsLoadError")}
            </div>
          ) : selectedStudents.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ClipboardList className="h-9 w-9 opacity-30" />
              <p>
                {selectionMode === "class"
                  ? selectedClassId
                    ? t("mySpace.scoreSheet.noStudents")
                    : t("mySpace.scoreSheet.conversionSelectClassHint")
                  : t("mySpace.scoreSheet.conversionSelectStudentsHint")}
              </p>
            </div>
          ) : (
            <ol className="divide-y">
              {selectedStudents.map((student, index) => (
                <li key={student.id} className="flex items-center gap-3 py-3">
                  <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {student.name || t("mySpace.scoreSheet.studentLabel")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        student.code,
                        student.classLabel ||
                          (selectionMode === "class" ? selectedClass?.classCode : undefined),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "\u00a0"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
