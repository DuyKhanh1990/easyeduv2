import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ScoreConversionTemplate } from "@shared/score-conversion";
import type {
  ScoreSheetTemplate,
  ScoreSheetTemplateInput,
} from "@shared/score-sheet-template";
import { validateScoreConversionFormula } from "@shared/score-conversion-formula";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Part = ScoreSheetTemplateInput["skills"][number]["parts"][number];
type Skill = ScoreSheetTemplateInput["skills"][number];
type PartFormula = ScoreSheetTemplateInput["skills"][number]["partFormula"];
type OverallRule = NonNullable<ScoreSheetTemplateInput["overallRule"]>;

const DEFAULT_OVERALL_RULE: OverallRule = { method: "average", formula: "" };
const DEFAULT_PART_FORMULA: PartFormula = { method: "sum", formula: "" };

function skillIdentifier(skill: Skill): string {
  return skill.id ?? skill.sectionId ?? "";
}

function appendFormulaVariable(formula: string, name: string): string {
  const trimmed = formula.trim();
  const prefix = trimmed.startsWith("=") ? "=" : "";
  const expression = trimmed.replace(/^=/, "").trim();
  const separator = expression
    ? /[+\-*/(]$/.test(expression) ? " " : " + "
    : "";
  return `${prefix}${expression}${separator}[${name}]`;
}

type ScoreSheetTemplateDialogProps = {
  open: boolean;
  template: ScoreSheetTemplate | null;
  conversionTemplates: ScoreConversionTemplate[];
  conversionTemplatesLoading: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ScoreSheetTemplateInput) => Promise<void>;
};

function emptyDraft(): ScoreSheetTemplateInput {
  return {
    code: "",
    name: "",
    scoreConversionTemplateId: null,
    skills: [],
    overallRule: DEFAULT_OVERALL_RULE,
  };
}

const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreSheetTemplateDialog({
  open,
  template,
  conversionTemplates,
  conversionTemplatesLoading,
  saving,
  onOpenChange,
  onSave,
}: ScoreSheetTemplateDialogProps) {
  const [draft, setDraft] = useState<ScoreSheetTemplateInput>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [pendingConversionTemplateId, setPendingConversionTemplateId] = useState<string | null | undefined>();

  useEffect(() => {
    if (!open || conversionTemplatesLoading) return;
    const linkedConversion = conversionTemplates.find(
      (item) => item.id === template?.scoreConversionTemplateId,
    );
    setDraft(template
      ? {
          code: template.code,
          name: template.name,
          scoreConversionTemplateId: template.scoreConversionTemplateId,
          overallRule: template.overallRule
            ? { ...template.overallRule }
            : linkedConversion
              ? { method: linkedConversion.overallRule.method, formula: linkedConversion.overallRule.formula }
              : DEFAULT_OVERALL_RULE,
          skills: template.skills.map((skill) => ({
            id: skill.id ?? skill.sectionId ?? crypto.randomUUID(),
            name: linkedConversion?.sections.find((section) => section.id === skill.sectionId)?.name ?? skill.name,
            sectionId: skill.sectionId,
            parts: skill.parts.map((part) => ({ ...part })),
            partFormula: skill.partFormula ?? DEFAULT_PART_FORMULA,
          })),
        }
      : emptyDraft());
    setFormError("");
    setPendingConversionTemplateId(undefined);
  }, [open, template, conversionTemplatesLoading]);

  const selectedConversion = conversionTemplates.find(
    (item) => item.id === draft.scoreConversionTemplateId,
  );

  const applyConversionTemplate = (conversionTemplateId: string | null) => {
    const nextConversion = conversionTemplates.find((item) => item.id === conversionTemplateId);
    setDraft((current) => ({
      ...current,
      scoreConversionTemplateId: conversionTemplateId,
      skills: nextConversion
        ? nextConversion.sections.map((section) => ({
            id: section.id,
            name: section.name,
            sectionId: section.id,
            parts: current.skills.find((skill) =>
              skill.sectionId === section.id
              || (!skill.sectionId && skill.name.trim().toLocaleLowerCase() === section.name.trim().toLocaleLowerCase()),
            )?.parts ?? [],
            partFormula: current.skills.find((skill) =>
              skill.sectionId === section.id
              || (!skill.sectionId && skill.name.trim().toLocaleLowerCase() === section.name.trim().toLocaleLowerCase()),
            )?.partFormula ?? DEFAULT_PART_FORMULA,
          }))
        : current.skills.map((skill) => ({
            ...skill,
            id: skill.id ?? skill.sectionId ?? crypto.randomUUID(),
            sectionId: null,
          })),
      overallRule: nextConversion
        ? { method: nextConversion.overallRule.method, formula: nextConversion.overallRule.formula }
        : current.overallRule ?? DEFAULT_OVERALL_RULE,
    }));
    setFormError("");
  };

  const handleConversionChange = (value: string) => {
    const conversionTemplateId = value === "none" ? null : value;
    if (conversionTemplateId === draft.scoreConversionTemplateId) return;
    if (draft.skills.length > 0) {
      setPendingConversionTemplateId(conversionTemplateId);
      return;
    }
    applyConversionTemplate(conversionTemplateId);
  };

  const addManualSkill = () => {
    setDraft((current) => ({
      ...current,
      skills: [
        ...current.skills,
        {
          id: crypto.randomUUID(),
          name: `Kỹ năng ${current.skills.length + 1}`,
          sectionId: null,
          parts: [],
          partFormula: DEFAULT_PART_FORMULA,
        },
      ],
    }));
  };

  const removeSkill = (skillId: string) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.filter((skill) => skillIdentifier(skill) !== skillId),
    }));
  };

  const updateSkill = (skillId: string, update: Partial<Skill>) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skillIdentifier(skill) === skillId
        ? { ...skill, ...update }
        : skill),
    }));
  };

  const addPart = (skillId: string) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => {
        if (skillIdentifier(skill) !== skillId) return skill;
        const part: Part = {
          id: crypto.randomUUID(),
          name: `Part ${skill.parts.length + 1}`,
          rawMaxScore: 0,
        };
        return { ...skill, parts: [...skill.parts, part] };
      }),
    }));
  };

  const updatePart = (skillId: string, partId: string, update: Partial<Part>) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skillIdentifier(skill) === skillId
        ? {
            ...skill,
            parts: skill.parts.map((part) => part.id === partId ? { ...part, ...update } : part),
          }
        : skill),
    }));
  };

  const removePart = (skillId: string, partId: string) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skillIdentifier(skill) === skillId
        ? { ...skill, parts: skill.parts.filter((part) => part.id !== partId) }
        : skill),
    }));
  };

  const updatePartFormula = (skillId: string, update: Partial<PartFormula>) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skillIdentifier(skill) === skillId
        ? { ...skill, partFormula: { ...skill.partFormula, ...update } }
        : skill),
    }));
  };

  const appendPartVariable = (skillId: string, partName: string) => {
    const skill = draft.skills.find((item) => skillIdentifier(item) === skillId);
    if (!skill) return;
    updatePartFormula(skillId, {
      formula: appendFormulaVariable(skill.partFormula.formula, partName),
    });
  };

  const overallRule = draft.overallRule ?? DEFAULT_OVERALL_RULE;
  const updateOverallRule = (update: Partial<OverallRule>) => {
    setDraft((current) => ({
      ...current,
      overallRule: { ...(current.overallRule ?? DEFAULT_OVERALL_RULE), ...update },
    }));
  };

  const setOverallRuleMethod = (value: string) => {
    const method = value as OverallRule["method"];
    if (method === "custom" && !overallRule.formula.trim()) {
      updateOverallRule({ method, formula: "=" });
      return;
    }
    updateOverallRule({ method });
  };

  const appendSkillVariable = (skillName: string) => {
    updateOverallRule({
      formula: appendFormulaVariable(overallRule.formula, skillName),
    });
  };

  const visibleSkills = selectedConversion
    ? selectedConversion.sections.map((section, index) => {
        const savedSkill = draft.skills.find((skill) => skill.sectionId === section.id);
        return {
          id: section.id,
          name: section.name,
          sectionId: section.id,
          parts: savedSkill?.parts ?? [],
          partFormula: savedSkill?.partFormula ?? DEFAULT_PART_FORMULA,
          conversionSection: section,
          skillIndex: index,
        };
      })
    : draft.skills.map((skill, index) => ({
        ...skill,
        id: skillIdentifier(skill),
        conversionSection: null,
        skillIndex: index,
      }));

  const overallFormulaError = overallRule.method === "custom" && visibleSkills.length > 0
    ? validateScoreConversionFormula(overallRule.formula, visibleSkills.map((skill) => skill.name))
    : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    try {
      const skills = selectedConversion
        ? selectedConversion.sections.map((section) => {
            const savedSkill = draft.skills.find((skill) => skill.sectionId === section.id);
            return {
              id: section.id,
              name: section.name,
              sectionId: section.id,
              parts: savedSkill?.parts ?? [],
              partFormula: savedSkill?.partFormula ?? DEFAULT_PART_FORMULA,
            };
          })
        : draft.skills.map((skill) => ({
            ...skill,
            id: skill.id ?? crypto.randomUUID(),
            name: skill.name.trim(),
            sectionId: null,
          }));
      await onSave({
        ...draft,
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        skills,
        overallRule,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu bảng điểm mẫu.");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-5xl overflow-y-auto bg-slate-100">
          <DialogHeader>
            <DialogTitle>{template ? "Sửa bảng điểm mẫu" : "Thêm bảng điểm mẫu"}</DialogTitle>
            <DialogDescription>
              Tạo cấu trúc bảng điểm và tùy chọn liên kết với một bảng quy đổi quốc tế.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <section className="grid gap-4 rounded-lg border bg-white p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="score-sheet-template-code">Mã bảng điểm</Label>
                <Input
                  id="score-sheet-template-code"
                  value={draft.code}
                  onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
                  placeholder="Ví dụ: IELTS-01"
                  maxLength={40}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="score-sheet-template-name">Tên bảng điểm</Label>
                <Input
                  id="score-sheet-template-name"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nhập tên bảng điểm"
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="score-sheet-template-conversion">Bảng quy đổi quốc tế (không bắt buộc)</Label>
                <Select
                  value={draft.scoreConversionTemplateId ?? "none"}
                  onValueChange={handleConversionChange}
                  disabled={conversionTemplatesLoading}
                >
                  <SelectTrigger id="score-sheet-template-conversion">
                    <SelectValue placeholder="Chọn bảng quy đổi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Không áp dụng</SelectItem>
                    {conversionTemplates.map((conversion) => (
                      <SelectItem key={conversion.id} value={conversion.id}>
                        {conversion.typeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conversionTemplatesLoading && (
                  <p className="text-xs text-muted-foreground">Đang tải bảng quy đổi...</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="score-sheet-template-overall-method">Công thức tính điểm Tổng</Label>
                <Select value={overallRule.method} onValueChange={setOverallRuleMethod}>
                  <SelectTrigger id="score-sheet-template-overall-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="average">Trung bình các phần thi</SelectItem>
                    <SelectItem value="sum">Cộng điểm các phần thi</SelectItem>
                    <SelectItem value="custom">Tùy chỉnh công thức</SelectItem>
                  </SelectContent>
                </Select>
                {overallRule.method === "custom" && (
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <Label htmlFor="score-sheet-template-overall-formula">Công thức tùy chỉnh</Label>
                    <Input
                      id="score-sheet-template-overall-formula"
                      value={overallRule.formula}
                      onChange={(event) => updateOverallRule({ formula: event.target.value })}
                      placeholder={`=[${visibleSkills[0]?.name ?? "Kỹ năng 1"}] + [${visibleSkills[1]?.name ?? visibleSkills[0]?.name ?? "Kỹ năng 2"}]`}
                      maxLength={1000}
                    />
                    {visibleSkills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Biến có sẵn:</span>
                        {visibleSkills.filter((skill) => skill.name.trim()).map((skill) => (
                          <Button
                            key={skill.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendSkillVariable(skill.name)}
                          >
                            {skill.name}
                          </Button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Dùng tên kỹ năng trong dấu ngoặc vuông; hỗ trợ +, -, *, /, ngoặc và %.
                    </p>
                    {overallRule.formula.trim() && visibleSkills.length > 0 && (
                      <p
                        className={`text-xs ${overallFormulaError ? "text-destructive" : "text-muted-foreground"}`}
                        role="status"
                      >
                        {overallFormulaError ?? "Công thức hợp lệ."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">
                    {selectedConversion ? `Kỹ năng được tạo từ ${selectedConversion.typeName}` : "Kỹ năng tự tạo"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedConversion
                      ? "Các kỹ năng lấy từ bảng quy đổi đã chọn."
                      : "Tạo kỹ năng riêng và thêm các part con nếu cần."}
                  </p>
                </div>
                {!selectedConversion && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addManualSkill}
                    disabled={draft.skills.length >= 20}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm kỹ năng
                  </Button>
                )}
              </div>

              {visibleSkills.length === 0 ? (
                <div className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">
                  {selectedConversion
                    ? "Bảng quy đổi này chưa có kỹ năng."
                    : "Chưa có kỹ năng. Nhấn “Thêm kỹ năng” để bắt đầu tạo bảng điểm thủ công."}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleSkills.map((skill) => {
                    const parts = skill.parts;
                    const partFormulaError = skill.partFormula.method === "custom" && parts.length > 0
                      ? validateScoreConversionFormula(skill.partFormula.formula, parts.map((part) => part.name))
                      : null;
                    return (
                      <div key={skill.id} className="rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          {skill.conversionSection ? (
                            <div className="min-w-0">
                              <h4 className="font-medium">
                                {skill.skillIndex + 1}. {skill.name}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Thang quy đổi: {skill.conversionSection.rawMinScore}–{skill.conversionSection.rawMaxScore} {skill.conversionSection.rawUnit}
                                {" → "}
                                {skill.conversionSection.convertedMinScore}–{skill.conversionSection.convertedMaxScore} {skill.conversionSection.convertedUnit}
                                {" · "}{skill.conversionSection.mappings.length} khoảng
                              </p>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1 space-y-1">
                              <Label htmlFor={`score-manual-skill-name-${skill.id}`}>Tên kỹ năng</Label>
                              <Input
                                id={`score-manual-skill-name-${skill.id}`}
                                value={skill.name}
                                onChange={(event) => updateSkill(skill.id, { name: event.target.value })}
                                placeholder="Nhập tên kỹ năng"
                                maxLength={120}
                                required
                              />
                            </div>
                          )}
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addPart(skill.id)}
                              disabled={parts.length >= 100}
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              Thêm part
                            </Button>
                            {!skill.conversionSection && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Xóa kỹ năng ${skill.name}`}
                                onClick={() => removeSkill(skill.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {parts.length > 0 && (
                          <div className="mt-3 grid gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] sm:items-center">
                            <Label htmlFor={`score-part-formula-method-${skill.id}`}>
                              Công thức điểm kỹ năng
                            </Label>
                            <Select
                              value={skill.partFormula.method}
                              onValueChange={(value) => updatePartFormula(skill.id, {
                                method: value as PartFormula["method"],
                              })}
                            >
                              <SelectTrigger id={`score-part-formula-method-${skill.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sum">Tổng các part con</SelectItem>
                                <SelectItem value="average">Trung bình các part con</SelectItem>
                                <SelectItem value="custom">Tùy chỉnh</SelectItem>
                              </SelectContent>
                            </Select>
                            {skill.partFormula.method === "custom" && (
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor={`score-part-formula-${skill.id}`}>Công thức tùy chỉnh</Label>
                                <Input
                                  id={`score-part-formula-${skill.id}`}
                                  value={skill.partFormula.formula}
                                  onChange={(event) => updatePartFormula(skill.id, {
                                    formula: event.target.value,
                                  })}
                                  placeholder={`=[${parts[0].name}] + [${parts[1]?.name ?? parts[0].name}]`}
                                  maxLength={1000}
                                />
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs text-muted-foreground">Chèn part:</span>
                                  {parts.map((part) => (
                                    <Button
                                      key={part.id}
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => appendPartVariable(skill.id, part.name)}
                                    >
                                      [{part.name}]
                                    </Button>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Dùng tên part trong dấu ngoặc vuông; hỗ trợ +, -, *, /, ngoặc và %.
                                </p>
                                {partFormulaError && (
                                  <p className="text-xs text-destructive" role="alert">{partFormulaError}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {parts.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Kết quả là điểm thô của kỹ năng{skill.conversionSection ? "; sau đó được đối chiếu với thang quy đổi phía trên." : "."}
                          </p>
                        )}

                        {parts.length > 0 && (
                          <div className="mt-3 space-y-2 border-l-2 border-primary/20 pl-3">
                            {parts.map((part, partIndex) => (
                              <div
                                key={part.id}
                                className="grid items-end gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[52px_minmax(0,1fr)_150px_36px]"
                              >
                                <div className="pb-2 text-xs font-semibold text-muted-foreground">
                                  {skill.skillIndex + 1}.{partIndex + 1}
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`score-part-name-${part.id}`}>Tên part</Label>
                                  <Input
                                    id={`score-part-name-${part.id}`}
                                    value={part.name}
                                    onChange={(event) => updatePart(skill.id, part.id, { name: event.target.value })}
                                    maxLength={120}
                                    required
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`score-part-max-${part.id}`}>Điểm thô tối đa</Label>
                                  <Input
                                    id={`score-part-max-${part.id}`}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={part.rawMaxScore}
                                    onChange={(event) => updatePart(skill.id, part.id, {
                                      rawMaxScore: numericValue(event.target.value),
                                    })}
                                    required
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Xóa part ${part.name}`}
                                  onClick={() => removePart(skill.id, part.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu bảng điểm mẫu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingConversionTemplateId !== undefined}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingConversionTemplateId(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đổi bảng quy đổi?</AlertDialogTitle>
            <AlertDialogDescription>
              Nếu bỏ liên kết, kỹ năng và part hiện tại sẽ được giữ lại để chỉnh thủ công. Nếu chuyển sang bảng khác,
              kỹ năng được tạo theo bảng mới; part chỉ được giữ cho kỹ năng trùng section hoặc trùng tên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingConversionTemplateId !== undefined) {
                  applyConversionTemplate(pendingConversionTemplateId);
                }
                setPendingConversionTemplateId(undefined);
              }}
            >
              Đổi bảng quy đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}