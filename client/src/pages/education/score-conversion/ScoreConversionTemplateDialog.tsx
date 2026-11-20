import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  ScoreConversionTemplate,
  ScoreConversionTemplateInput,
  ScoreConversionTypeKey,
} from "@shared/score-conversion";
import { validateScoreConversionFormula } from "@shared/score-conversion-formula";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createDefaultDraft,
  createEmptyMapping,
  draftFromTemplate,
  SCORE_CONVERSION_TYPES,
} from "./score-conversion-presets";
import { generateRawScoreRanges } from "./score-conversion-range-generator";
import { ScoreConversionSectionEditor } from "./ScoreConversionSectionEditor";

type ScoreConversionTemplateDialogProps = {
  open: boolean;
  template: ScoreConversionTemplate | null;
  templates: ScoreConversionTemplate[];
  initialTypeKey: ScoreConversionTypeKey;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ScoreConversionTemplateInput) => Promise<void>;
};

const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreConversionTemplateDialog({
  open,
  template,
  templates,
  initialTypeKey,
  saving,
  onOpenChange,
  onSave,
}: ScoreConversionTemplateDialogProps) {
  const [draft, setDraft] = useState<ScoreConversionTemplateInput>(() => createDefaultDraft(initialTypeKey));
  const [activeSectionId, setActiveSectionId] = useState("");
  const [formError, setFormError] = useState("");
  const [copyMappingsOpen, setCopyMappingsOpen] = useState(false);
  const [copySourceSectionId, setCopySourceSectionId] = useState("");
  const [copyTargetSectionIds, setCopyTargetSectionIds] = useState<string[]>([]);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const formulaSelectionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextDraft = template ? draftFromTemplate(template) : createDefaultDraft(initialTypeKey);
    setDraft(nextDraft);
    setActiveSectionId(nextDraft.sections[0]?.id ?? "");
    setFormError("");
  }, [open, template, initialTypeKey]);

  useEffect(() => {
    const position = formulaSelectionRef.current;
    if (position === null) return;
    const input = formulaInputRef.current;
    input?.focus();
    input?.setSelectionRange(position, position);
    formulaSelectionRef.current = null;
  }, [draft.overallRule.formula]);

  const changeType = (typeKey: ScoreConversionTypeKey) => {
    const nextDraft = createDefaultDraft(typeKey);
    setDraft(nextDraft);
    setActiveSectionId(nextDraft.sections[0]?.id ?? "");
    setFormError("");
  };

  const updateSection = (
    sectionId: string,
    update: Partial<ScoreConversionTemplateInput["sections"][number]>,
  ) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...update } : section),
    }));
  };

  const updateMapping = (
    sectionId: string,
    mappingId: string,
    update: Partial<ScoreConversionTemplateInput["sections"][number]["mappings"][number]>,
  ) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? {
            ...section,
            mappings: section.mappings.map((mapping) =>
              mapping.id === mappingId ? { ...mapping, ...update } : mapping),
          }
        : section),
    }));
  };

  const updateRule = (update: Partial<ScoreConversionTemplateInput["overallRule"]>) => {
    setDraft((current) => ({
      ...current,
      overallRule: { ...current.overallRule, ...update },
    }));
  };

  const insertFormulaVariable = (sectionName: string) => {
    const formula = draft.overallRule.formula;
    const input = formulaInputRef.current;
    const start = input?.selectionStart ?? formula.length;
    const end = input?.selectionEnd ?? formula.length;
    const variable = `[${sectionName}]`;
    const nextFormula = `${formula.slice(0, start)}${variable}${formula.slice(end)}`;
    formulaSelectionRef.current = start + variable.length;
    updateRule({ formula: nextFormula });
  };

  const addSection = () => {
    const section = createDefaultDraft("custom").sections[0];
    section.name = `Phần thi ${draft.sections.length + 1}`;
    setDraft((current) => ({ ...current, sections: [...current.sections, section] }));
    setActiveSectionId(section.id);
  };

  const generateMappingTable = (section: ScoreConversionTemplateInput["sections"][number]) => {
    const { rawMinScore, rawMaxScore, rawStep } = section;
    const generatedRanges = generateRawScoreRanges(rawMinScore, rawMaxScore, rawStep);
    if (!generatedRanges.ok) {
      const errorMessage = generatedRanges.reason === "invalid-range"
        ? `Vui lòng kiểm tra khoảng điểm và bước điểm thô của phần ${section.name}.`
        : generatedRanges.reason === "fractional-zero-step"
          ? "Khi bước điểm thô bằng 0, điểm từ và điểm đến phải là số nguyên."
          : generatedRanges.reason === "too-many"
            ? "Không thể tạo quá 500 khoảng điểm. Hãy tăng bước điểm hoặc thu hẹp thang điểm."
            : "Không thể tạo bảng với bước điểm này. Hãy tăng bước điểm hoặc thu hẹp thang điểm.";
      setFormError(errorMessage);
      return;
    }

    const existingScores = new Map(section.mappings.map((mapping) => [
      `${mapping.rawFrom}:${mapping.rawTo}`,
      { internalScore: mapping.internalScore, convertedScore: mapping.convertedScore },
    ]));
    const existingScoresByStart = new Map(section.mappings.map((mapping) => [
      mapping.rawFrom,
      { internalScore: mapping.internalScore, convertedScore: mapping.convertedScore },
    ]));
    const generatedMappings: ScoreConversionTemplateInput["sections"][number]["mappings"] =
      generatedRanges.ranges.map(({ rawFrom, rawTo }) => {
        const existingScore = existingScores.get(`${rawFrom}:${rawTo}`)
          ?? existingScoresByStart.get(rawFrom);
        return {
          id: createEmptyMapping().id,
          rawFrom,
          rawTo,
          internalScore: existingScore?.internalScore ?? 0,
          convertedScore: existingScore?.convertedScore ?? 0,
        };
      });

    if (
      section.mappings.length > 0 &&
      !window.confirm("Tạo lại sẽ thay thế các khoảng hiện tại. Bạn có muốn tiếp tục không?")
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      sections: current.sections.map((currentSection) => currentSection.id === section.id
        ? { ...currentSection, mappings: generatedMappings }
        : currentSection),
    }));
    setFormError("");
  };

  const openCopyMappings = (section: ScoreConversionTemplateInput["sections"][number]) => {
    const compatibleTargets = draft.sections.filter((target) =>
      target.id !== section.id &&
      target.rawMinScore === section.rawMinScore &&
      target.rawMaxScore === section.rawMaxScore);
    setCopySourceSectionId(section.id);
    setCopyTargetSectionIds(compatibleTargets.map((target) => target.id));
    setCopyMappingsOpen(true);
  };

  const copyMappingsToSelectedSections = () => {
    const source = draft.sections.find((section) => section.id === copySourceSectionId);
    const targets = draft.sections.filter((section) => copyTargetSectionIds.includes(section.id));
    if (!source?.mappings.length || !targets.length) return;
    if (targets.some((target) =>
      target.rawMinScore !== source.rawMinScore ||
      target.rawMaxScore !== source.rawMaxScore)) {
      return;
    }

    const existingTargets = targets.filter((section) => section.mappings.length > 0);
    if (
      existingTargets.length > 0 &&
      !window.confirm(
        `Bảng quy đổi của ${existingTargets.map((section) => section.name).join(", ")} sẽ bị thay thế. Bạn có muốn tiếp tục không?`,
      )
    ) {
      return;
    }

    const targetIds = new Set(targets.map((section) => section.id));
    const mappingsByTargetId = new Map(targets.map((target) => [
      target.id,
      source.mappings.map((mapping) => ({
        ...mapping,
        id: createEmptyMapping().id,
      })),
    ] as const));
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => targetIds.has(section.id)
        ? {
            ...section,
            mappings: mappingsByTargetId.get(section.id) ?? section.mappings,
          }
        : section),
    }));
    setFormError("");
    setCopyMappingsOpen(false);
  };

  const removeSection = (sectionId: string) => {
    const remaining = draft.sections.filter((section) => section.id !== sectionId);
    if (!remaining.length) return;
    setDraft((current) => ({ ...current, sections: remaining }));
    if (activeSectionId === sectionId) setActiveSectionId(remaining[0].id);
  };

  const validateDraft = () => {
    if (draft.typeKey === "custom" && !draft.typeName.trim()) {
      return "Vui lòng đặt tên loại bài kiểm tra tùy chỉnh.";
    }
    if (!draft.sections.length) return "Cần có ít nhất một phần thi.";

    for (const section of draft.sections) {
      if (!section.name.trim() || !section.rawUnit.trim() || !section.convertedUnit.trim()) {
        return "Vui lòng nhập tên phần thi và đơn vị điểm.";
      }
      if (section.rawMaxScore < section.rawMinScore || section.rawStep < 0) {
        return `Vui lòng kiểm tra thang điểm thô của phần ${section.name}.`;
      }
      if (section.convertedMaxScore < section.convertedMinScore || section.convertedStep <= 0) {
        return `Vui lòng kiểm tra thang điểm quy đổi của phần ${section.name}.`;
      }
      const ordered = [...section.mappings].sort((a, b) => a.rawFrom - b.rawFrom);
      for (let index = 0; index < ordered.length; index += 1) {
        const mapping = ordered[index];
        if (
          mapping.rawTo < mapping.rawFrom ||
          mapping.rawFrom < section.rawMinScore ||
          mapping.rawTo > section.rawMaxScore ||
          !Number.isFinite(mapping.internalScore) ||
          !Number.isFinite(mapping.convertedScore)
        ) {
          return `Vui lòng kiểm tra khoảng điểm và điểm quy đổi của phần ${section.name}.`;
        }
        if (index > 0 && mapping.rawFrom < ordered[index - 1].rawTo) {
          return `Các khoảng điểm thô của phần ${section.name} không được chồng lấn.`;
        }
      }
    }
    if (draft.overallRule.method === "custom") {
      const formulaError = validateScoreConversionFormula(
        draft.overallRule.formula,
        draft.sections.map((section) => section.name),
      );
      if (formulaError) return formulaError;
    }
    return "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateDraft();
    setFormError(validationError);
    if (validationError) return;

    try {
      await onSave({
        ...draft,
        typeName: draft.typeName.trim(),
        sections: draft.sections.map((section) => ({
          ...section,
          name: section.name.trim(),
          rawUnit: section.rawUnit.trim(),
          convertedMinScore: section.mappings.reduce(
            (minimum, mapping) => Math.min(minimum, mapping.convertedScore),
            section.convertedMinScore,
          ),
          convertedMaxScore: section.mappings.reduce(
            (maximum, mapping) => Math.max(maximum, mapping.convertedScore),
            section.convertedMaxScore,
          ),
          convertedUnit: section.convertedUnit.trim(),
        })),
        overallRule: { ...draft.overallRule },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu bảng quy đổi.");
    }
  };

  const copySourceSection = draft.sections.find((section) => section.id === copySourceSectionId);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[98vw] max-h-[92vh] overflow-y-auto bg-slate-100">
        <DialogHeader>
          <DialogTitle>{template ? "Sửa bảng điểm quy đổi" : "Thêm bảng điểm quy đổi"}</DialogTitle>
          <DialogDescription>
            Tạo bảng quy đổi dùng chung cho loại bài kiểm tra; bảng này chưa gắn với một bài kiểm tra cụ thể.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="score-conversion-type">Loại bài kiểm tra</Label>
              <Select value={draft.typeKey} onValueChange={(value) => changeType(value as ScoreConversionTypeKey)}>
                <SelectTrigger id="score-conversion-type" aria-label="Loại bài kiểm tra">
                  <SelectValue placeholder="Chọn loại bài kiểm tra" />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_CONVERSION_TYPES.map((type) => {
                    const alreadyConfigured = type.value !== "custom" && templates.some(
                      (item) => item.typeKey === type.value && item.id !== template?.id,
                    );
                    return (
                      <SelectItem key={type.value} value={type.value} disabled={alreadyConfigured}>
                        {type.label}{alreadyConfigured ? " · Đã có bảng" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {draft.typeKey === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="score-conversion-custom-type">Tên loại tùy chỉnh</Label>
                <Input
                  id="score-conversion-custom-type"
                  value={draft.typeName}
                  onChange={(event) => setDraft((current) => ({ ...current, typeName: event.target.value }))}
                  placeholder="Ví dụ: Bài kiểm tra nội bộ"
                  maxLength={100}
                />
              </div>
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <ScoreConversionSectionEditor
                sections={draft.sections}
                activeSectionId={activeSectionId}
                onActiveSectionChange={setActiveSectionId}
                onAddSection={addSection}
                onUpdateSection={updateSection}
                onRemoveSection={removeSection}
                onOpenCopyMappings={openCopyMappings}
                onGenerateMappingTable={generateMappingTable}
                onAddMapping={(section) => updateSection(section.id, {
                  mappings: [...section.mappings, createEmptyMapping()],
                })}
                onUpdateMapping={updateMapping}
                onRemoveMapping={(sectionId, mappingId) => {
                  const section = draft.sections.find((item) => item.id === sectionId);
                  if (!section) return;
                  updateSection(sectionId, {
                    mappings: section.mappings.filter((item) => item.id !== mappingId),
                  });
                }}
              />
            </div>

            <aside className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-lg border bg-white p-4">
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="overall-method">Công thức tính điểm Tổng</Label>
              <Select
                value={draft.overallRule.method}
                onValueChange={(value) => {
                  const method = value as "sum" | "average" | "custom";
                  if (method === "custom" && !draft.overallRule.formula.trim()) {
                    formulaSelectionRef.current = 1;
                    updateRule({ method, formula: "=" });
                    return;
                  }
                  updateRule({ method });
                }}
              >
                <SelectTrigger id="overall-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="average">Trung bình các phần thi</SelectItem>
                  <SelectItem value="sum">Cộng điểm các phần thi</SelectItem>
                  <SelectItem value="custom">Tùy chỉnh công thức</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.overallRule.method === "custom" && (
              <div className="space-y-3 rounded-lg border bg-white p-3">
                <div>
                  <h4 className="text-sm font-medium">Công thức tính điểm</h4>
                  <p className="text-xs text-muted-foreground">
                    Dùng +, -, *, /, ngoặc và %. Số thập phân dùng dấu chấm. Bấm tên phần thi để chèn biến; công thức trả về điểm tổng trực tiếp.
                  </p>
                </div>
                <Label htmlFor="overall-formula">Công thức</Label>
                <Input
                  id="overall-formula"
                  ref={formulaInputRef}
                  value={draft.overallRule.formula}
                  onChange={(event) => updateRule({ formula: event.target.value })}
                  placeholder="=[Listening] * 2 + [Reading] * 20%"
                  maxLength={1000}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Biến có sẵn:</span>
                  {draft.sections.map((section) => (
                    <Button
                      key={section.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      title={`Chèn biến [${section.name}]`}
                      onClick={() => insertFormulaVariable(section.name)}
                    >
                      {section.name}
                    </Button>
                  ))}
                </div>
                {draft.overallRule.formula.trim() && (
                  <p
                    className={`text-xs ${
                      validateScoreConversionFormula(
                        draft.overallRule.formula,
                        draft.sections.map((section) => section.name),
                      )
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                    role="status"
                  >
                    {validateScoreConversionFormula(
                      draft.overallRule.formula,
                      draft.sections.map((section) => section.name),
                    ) ?? "Công thức hợp lệ."}
                  </p>
                )}
              </div>
            )}
          </section>

            </aside>
          </div>

          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu bảng quy đổi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog
      open={copyMappingsOpen}
      onOpenChange={(isOpen) => {
        setCopyMappingsOpen(isOpen);
        if (!isOpen) setCopyTargetSectionIds([]);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sao chép bảng quy đổi</DialogTitle>
          <DialogDescription>
            {copySourceSection
              ? `Chọn phần thi nhận bảng từ ${copySourceSection.name}. Các khoảng điểm và điểm quy đổi sẽ được sao chép; tên phần thi và thang điểm của phần nhận được giữ nguyên.`
              : "Chọn phần thi nhận bảng quy đổi."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {copySourceSection && draft.sections.filter((section) => section.id !== copySourceSection.id).map((section) => {
            const compatible = section.rawMinScore === copySourceSection.rawMinScore &&
              section.rawMaxScore === copySourceSection.rawMaxScore;
            const checkboxId = `copy-mappings-${section.id}`;
            return (
              <div key={section.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id={checkboxId}
                  className="mt-1"
                  checked={copyTargetSectionIds.includes(section.id)}
                  disabled={!compatible}
                  onCheckedChange={(checked) => {
                    setCopyTargetSectionIds((current) => checked === true
                      ? [...current, section.id]
                      : current.filter((id) => id !== section.id));
                  }}
                />
                <Label htmlFor={checkboxId} className={`flex-1 ${compatible ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                  <span className="block font-medium">{section.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Điểm thô {section.rawMinScore}–{section.rawMaxScore}
                    {!compatible && " · Không cùng thang điểm thô"}
                  </span>
                </Label>
              </div>
            );
          })}
          {copySourceSection && draft.sections.length < 2 && (
            <p className="text-sm text-muted-foreground">Chưa có phần thi khác để sao chép.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setCopyMappingsOpen(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            onClick={copyMappingsToSelectedSections}
            disabled={!copyTargetSectionIds.length || !copySourceSection?.mappings.length}
          >
            Sao chép bảng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}