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
type PartFormula = ScoreSheetTemplateInput["skills"][number]["partFormula"];

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
    if (!open) return;
    setDraft(template
      ? {
          code: template.code,
          name: template.name,
          scoreConversionTemplateId: template.scoreConversionTemplateId,
          skills: template.skills.map((skill) => ({
            sectionId: skill.sectionId,
            parts: skill.parts.map((part) => ({ ...part })),
             partFormula: skill.partFormula ?? { method: "sum", formula: "" },
          })),
        }
      : emptyDraft());
    setFormError("");
    setPendingConversionTemplateId(undefined);
  }, [open, template]);

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
            sectionId: section.id,
            parts: current.skills.find((skill) => skill.sectionId === section.id)?.parts ?? [],
              partFormula: current.skills.find((skill) => skill.sectionId === section.id)?.partFormula
                ?? { method: "sum", formula: "" },
          }))
        : [],
    }));
    setFormError("");
  };

  const handleConversionChange = (value: string) => {
    const conversionTemplateId = value === "none" ? null : value;
    if (conversionTemplateId === draft.scoreConversionTemplateId) return;
    const hasParts = draft.skills.some((skill) => skill.parts.length > 0);
    if (hasParts) {
      setPendingConversionTemplateId(conversionTemplateId);
      return;
    }
    applyConversionTemplate(conversionTemplateId);
  };

  const addPart = (sectionId: string) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => {
        if (skill.sectionId !== sectionId) return skill;
        const part: Part = {
          id: crypto.randomUUID(),
          name: `Part ${skill.parts.length + 1}`,
          rawMaxScore: 0,
        };
        return { ...skill, parts: [...skill.parts, part] };
      }),
    }));
  };

  const updatePart = (sectionId: string, partId: string, update: Partial<Part>) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skill.sectionId === sectionId
        ? {
            ...skill,
            parts: skill.parts.map((part) => part.id === partId ? { ...part, ...update } : part),
          }
        : skill),
    }));
  };

  const removePart = (sectionId: string, partId: string) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skill.sectionId === sectionId
        ? { ...skill, parts: skill.parts.filter((part) => part.id !== partId) }
        : skill),
    }));
  };

  const updatePartFormula = (sectionId: string, update: Partial<PartFormula>) => {
    setDraft((current) => ({
      ...current,
      skills: current.skills.map((skill) => skill.sectionId === sectionId
        ? { ...skill, partFormula: { ...skill.partFormula, ...update } }
        : skill),
    }));
  };

  const appendPartVariable = (sectionId: string, partName: string) => {
    const skill = draft.skills.find((item) => item.sectionId === sectionId);
    if (!skill) return;
    const currentFormula = skill.partFormula.formula.trim();
    const variable = `[${partName}]`;
    updatePartFormula(sectionId, {
      formula: currentFormula ? `${currentFormula} + ${variable}` : `=${variable}`,
    });
  };

  const overallRuleDescription = selectedConversion
    ? selectedConversion.overallRule.method === "custom"
      ? `Công thức tổng: ${selectedConversion.overallRule.formula}`
      : selectedConversion.overallRule.method === "sum"
        ? "Công thức tổng: cộng điểm các kỹ năng"
        : "Công thức tổng: trung bình các kỹ năng"
    : "";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    try {
      const skills = selectedConversion
        ? selectedConversion.sections.map((section) => ({
            sectionId: section.id,
            parts: draft.skills.find((skill) => skill.sectionId === section.id)?.parts ?? [],
              partFormula: draft.skills.find((skill) => skill.sectionId === section.id)?.partFormula
                ?? { method: "sum", formula: "" },
          }))
        : [];
      await onSave({
        ...draft,
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        skills,
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
            </section>

            {selectedConversion ? (
              <section className="space-y-3 rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Kỹ năng được tạo từ {selectedConversion.typeName}</h3>
                    <p className="text-sm text-muted-foreground">{overallRuleDescription}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {selectedConversion.sections.map((section, skillIndex) => {
                    const skillDraft = draft.skills.find((skill) => skill.sectionId === section.id);
                    const parts = skillDraft?.parts ?? [];
                    return (
                      <div key={section.id} className="rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-medium">
                              {skillIndex + 1}. {section.name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Thang quy đổi: {section.rawMinScore}–{section.rawMaxScore} {section.rawUnit}
                              {" → "}
                              {section.convertedMinScore}–{section.convertedMaxScore} {section.convertedUnit}
                              {" · "}{section.mappings.length} khoảng
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => addPart(section.id)}>
                            <Plus className="mr-1 h-4 w-4" />
                            Thêm part
                          </Button>
                        </div>

                        {parts.length > 0 && skillDraft && (
                          <div className="mt-3 grid gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] sm:items-center">
                            <Label htmlFor={`score-part-formula-method-${section.id}`}>
                              Công thức điểm kỹ năng
                            </Label>
                            <Select
                              value={skillDraft.partFormula.method}
                              onValueChange={(value) => updatePartFormula(section.id, {
                                method: value as PartFormula["method"],
                              })}
                            >
                              <SelectTrigger id={`score-part-formula-method-${section.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sum">Tổng các part con</SelectItem>
                                <SelectItem value="average">Trung bình các part con</SelectItem>
                                <SelectItem value="custom">Tùy chỉnh</SelectItem>
                              </SelectContent>
                            </Select>
                            {skillDraft.partFormula.method === "custom" && (
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor={`score-part-formula-${section.id}`}>Công thức tùy chỉnh</Label>
                                <Input
                                  id={`score-part-formula-${section.id}`}
                                  value={skillDraft.partFormula.formula}
                                  onChange={(event) => updatePartFormula(section.id, {
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
                                      onClick={() => appendPartVariable(section.id, part.name)}
                                    >
                                      [{part.name}]
                                    </Button>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Dùng tên part trong dấu ngoặc vuông; hỗ trợ +, -, *, /, ngoặc và %.
                                </p>
                                {validateScoreConversionFormula(
                                  skillDraft.partFormula.formula,
                                  parts.map((part) => part.name),
                                ) && (
                                  <p className="text-xs text-destructive" role="alert">
                                    {validateScoreConversionFormula(
                                      skillDraft.partFormula.formula,
                                      parts.map((part) => part.name),
                                    )}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {parts.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Kết quả là điểm thô của kỹ năng; sau đó sẽ được đối chiếu với thang quy đổi phía trên.
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
                                  {skillIndex + 1}.{partIndex + 1}
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`score-part-name-${part.id}`}>Tên part</Label>
                                  <Input
                                    id={`score-part-name-${part.id}`}
                                    value={part.name}
                                    onChange={(event) => updatePart(section.id, part.id, { name: event.target.value })}
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
                                    onChange={(event) => updatePart(section.id, part.id, {
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
                                  onClick={() => removePart(section.id, part.id)}
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
              </section>
            ) : (
              <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">
                Chọn bảng quy đổi để tự tạo các kỹ năng. Có thể lưu bảng điểm mẫu mà không áp dụng bảng quy đổi.
              </div>
            )}

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
              Danh sách kỹ năng sẽ được tạo lại. Các part đã nhập ở kỹ năng không còn trong bảng mới sẽ bị bỏ.
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