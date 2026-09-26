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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createDefaultDraft,
  createEmptyGradeBand,
  createEmptyMapping,
  draftFromTemplate,
  SCORE_CONVERSION_TYPES,
} from "./score-conversion-presets";

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
const MAX_GENERATED_MAPPINGS = 500;

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

  const updateGradeBand = (
    bandId: string,
    update: Partial<ScoreConversionTemplateInput["overallRule"]["gradeBands"][number]>,
  ) => {
    updateRule({
      gradeBands: draft.overallRule.gradeBands.map((band) =>
        band.id === bandId ? { ...band, ...update } : band),
    });
  };

  const removeGradeBand = (bandId: string) => {
    updateRule({
      gradeBands: draft.overallRule.gradeBands.filter((band) => band.id !== bandId),
    });
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
    if (
      !Number.isFinite(rawMinScore) ||
      !Number.isFinite(rawMaxScore) ||
      !Number.isFinite(rawStep) ||
      rawMaxScore < rawMinScore ||
      rawStep < 0
    ) {
      setFormError(`Vui lòng kiểm tra khoảng điểm và bước điểm thô của phần ${section.name}.`);
      return;
    }
    if (rawStep === 0 && (!Number.isInteger(rawMinScore) || !Number.isInteger(rawMaxScore))) {
      setFormError("Khi bước điểm thô bằng 0, điểm từ và điểm đến phải là số nguyên.");
      return;
    }

    const existingScores = new Map(section.mappings.map((mapping) => [
      `${mapping.rawFrom}:${mapping.rawTo}`,
      { internalScore: mapping.internalScore, convertedScore: mapping.convertedScore },
    ]));
    const generatedMappings: ScoreConversionTemplateInput["sections"][number]["mappings"] = [];
    let upper = rawMaxScore;
    let lower = rawStep === 0 ? upper : Math.max(rawMinScore, upper - rawStep);

    while (true) {
      if (generatedMappings.length >= MAX_GENERATED_MAPPINGS) {
        setFormError(`Không thể tạo quá ${MAX_GENERATED_MAPPINGS} khoảng điểm. Hãy tăng bước điểm hoặc thu hẹp thang điểm.`);
        return;
      }

      const key = `${lower}:${upper}`;
      const existingScore = existingScores.get(key);
      generatedMappings.push({
        id: createEmptyMapping().id,
        rawFrom: lower,
        rawTo: upper,
        internalScore: existingScore?.internalScore ?? 0,
        convertedScore: existingScore?.convertedScore ?? 0,
      });

      if (lower <= rawMinScore) break;
      const nextUpper = rawStep === 0 ? lower - 1 : lower;
      const nextLower = rawStep === 0
        ? Math.max(rawMinScore, nextUpper)
        : Math.max(rawMinScore, nextUpper - rawStep - 1);
      if (nextLower >= lower) {
        setFormError("Không thể tạo bảng với bước điểm này. Hãy tăng bước điểm hoặc thu hẹp thang điểm.");
        return;
      }
      upper = nextUpper;
      lower = nextLower;
    }

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
    for (const band of draft.overallRule.gradeBands) {
      if (!band.label.trim()) return "Vui lòng nhập tên cho từng ngưỡng xếp loại.";
      if (band.maxScore < band.minScore) {
        return `Điểm đến của ngưỡng ${band.label} phải lớn hơn hoặc bằng điểm từ.`;
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
      <DialogContent className="w-[98vw] max-w-[98vw] max-h-[92vh] overflow-y-auto">
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

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
          <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Các phần thi và thang điểm</h3>
                <p className="text-sm text-muted-foreground">
                  Mẫu nạp sẵn tên phần và thang gợi ý; chọn từng tab để nhập khoảng điểm thô và điểm quy đổi của trung tâm.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSection}>
                <Plus className="mr-1 h-4 w-4" />
                Thêm phần thi
              </Button>
            </div>

            <Tabs
              value={activeSectionId || draft.sections[0]?.id}
              onValueChange={setActiveSectionId}
              className="space-y-4"
            >
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
                {draft.sections.map((section) => (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className="shrink-0 whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {section.name || "Phần thi"}
                  </TabsTrigger>
                ))}
              </TabsList>

              {draft.sections.map((section) => (
                <TabsContent key={section.id} value={section.id} className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor={`section-name-${section.id}`}>Tên phần thi</Label>
                        <Input
                          id={`section-name-${section.id}`}
                          value={section.name}
                          onChange={(event) => updateSection(section.id, { name: event.target.value })}
                          maxLength={120}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`raw-min-${section.id}`}>Điểm thô từ</Label>
                        <Input
                          id={`raw-min-${section.id}`}
                          type="number"
                          step="any"
                          value={section.rawMinScore}
                          onChange={(event) => updateSection(section.id, { rawMinScore: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`raw-max-${section.id}`}>Điểm thô đến</Label>
                        <Input
                          id={`raw-max-${section.id}`}
                          type="number"
                          step="any"
                          value={section.rawMaxScore}
                          onChange={(event) => updateSection(section.id, { rawMaxScore: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`raw-step-${section.id}`}>Bước điểm thô</Label>
                        <Input
                          id={`raw-step-${section.id}`}
                          type="number"
                          min="0"
                          step="any"
                          value={section.rawStep}
                          onChange={(event) => updateSection(section.id, { rawStep: numericValue(event.target.value) })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-medium">Bảng quy đổi {section.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Nhập điểm quy đổi tương ứng với từng khoảng điểm thô.
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Xóa phần thi ${section.name}`}
                          disabled={draft.sections.length <= 1}
                          onClick={() => removeSection(section.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={section.mappings.length === 0 || draft.sections.length < 2}
                          onClick={() => openCopyMappings(section)}
                        >
                          Sao chép sang...
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateMappingTable(section)}
                        >
                          Tạo bảng quy đổi
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateSection(section.id, {
                            mappings: [...section.mappings, createEmptyMapping()],
                          })}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Thêm khoảng điểm
                        </Button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Điểm thô từ</th>
                            <th className="px-3 py-2 font-medium">Điểm thô đến</th>
                            <th className="px-3 py-2 font-medium">Quy đổi nội bộ</th>
                            <th className="px-3 py-2 font-medium">Quy đổi Quốc tế</th>
                            <th className="w-12 px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {section.mappings.length ? section.mappings.map((mapping) => (
                            <tr key={mapping.id} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Điểm thô từ ${section.name}`}
                                  type="number"
                                  step="any"
                                  value={mapping.rawFrom}
                                  onChange={(event) => updateMapping(section.id, mapping.id, {
                                    rawFrom: numericValue(event.target.value),
                                  })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Điểm thô đến ${section.name}`}
                                  type="number"
                                  step="any"
                                  value={mapping.rawTo}
                                  onChange={(event) => updateMapping(section.id, mapping.id, {
                                    rawTo: numericValue(event.target.value),
                                  })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Điểm quy đổi nội bộ ${section.name}`}
                                  type="number"
                                  step="any"
                                  value={mapping.internalScore}
                                  onChange={(event) => updateMapping(section.id, mapping.id, {
                                    internalScore: numericValue(event.target.value),
                                  })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Điểm quy đổi quốc tế ${section.name}`}
                                  type="number"
                                  step="any"
                                  value={mapping.convertedScore}
                                  onChange={(event) => updateMapping(section.id, mapping.id, {
                                    convertedScore: numericValue(event.target.value),
                                  })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Xóa khoảng điểm ${mapping.rawFrom}–${mapping.rawTo}`}
                                  onClick={() => updateSection(section.id, {
                                    mappings: section.mappings.filter((item) => item.id !== mapping.id),
                                  })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                Chưa có khoảng quy đổi. Thêm các khoảng điểm thô và điểm tương ứng.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h3 className="font-semibold">Cách tính điểm tổng</h3>
              <p className="text-sm text-muted-foreground">
                Sau khi quy đổi từng phần thi, hệ thống sẽ áp dụng công thức này.
              </p>
            </div>
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="overall-method">Công thức chung</Label>
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
              <div className="space-y-3 rounded-lg border p-3">
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
          </div>

          <aside className="min-w-0">
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Ngưỡng xếp loại (không bắt buộc)</h3>
                <p className="text-sm text-muted-foreground">
                  Ví dụ: A2 từ 120 đến 139 điểm.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={draft.overallRule.gradeBands.length >= 20}
                onClick={() => updateRule({
                  gradeBands: [...draft.overallRule.gradeBands, createEmptyGradeBand()],
                })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm ngưỡng
              </Button>
            </div>
            {draft.overallRule.gradeBands.length > 0 ? (
              <div className="space-y-3">
                {draft.overallRule.gradeBands.map((band, index) => (
                  <div
                    key={band.id}
                    className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-md border p-2"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`grade-band-label-${band.id}`}>Tên xếp loại</Label>
                      <Input
                        id={`grade-band-label-${band.id}`}
                        value={band.label}
                        onChange={(event) => updateGradeBand(band.id, { label: event.target.value })}
                        placeholder="Ví dụ: A2"
                        maxLength={80}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`grade-band-min-${band.id}`}>Điểm từ</Label>
                      <Input
                        id={`grade-band-min-${band.id}`}
                        type="number"
                        step="any"
                        value={band.minScore}
                        onChange={(event) => updateGradeBand(band.id, { minScore: numericValue(event.target.value) })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`grade-band-max-${band.id}`}>Đến</Label>
                      <Input
                        id={`grade-band-max-${band.id}`}
                        type="number"
                        step="any"
                        value={band.maxScore}
                        onChange={(event) => updateGradeBand(band.id, { maxScore: numericValue(event.target.value) })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Xóa ngưỡng xếp loại ${band.label || index + 1}`}
                      onClick={() => removeGradeBand(band.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có ngưỡng xếp loại.</p>
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