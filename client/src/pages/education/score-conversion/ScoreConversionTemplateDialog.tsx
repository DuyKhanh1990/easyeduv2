import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  ScoreConversionTemplate,
  ScoreConversionTemplateInput,
  ScoreConversionTypeKey,
} from "@shared/score-conversion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createDefaultDraft,
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

  useEffect(() => {
    if (!open) return;
    const nextDraft = template ? draftFromTemplate(template) : createDefaultDraft(initialTypeKey);
    setDraft(nextDraft);
    setActiveSectionId(nextDraft.sections[0]?.id ?? "");
    setFormError("");
  }, [open, template, initialTypeKey]);

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

  const addSection = () => {
    const section = createDefaultDraft("custom").sections[0];
    section.name = `Phần thi ${draft.sections.length + 1}`;
    setDraft((current) => ({ ...current, sections: [...current.sections, section] }));
    setActiveSectionId(section.id);
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
      if (section.rawMaxScore < section.rawMinScore || section.rawStep <= 0) {
        return `Vui lòng kiểm tra thang điểm thô của phần ${section.name}.`;
      }
      if (section.convertedMaxScore < section.convertedMinScore || section.convertedStep <= 0) {
        return `Vui lòng kiểm tra thang điểm quy đổi của phần ${section.name}.`;
      }
      if (section.weight < 0 || (section.weightType === "percentage" && section.weight > 100)) {
        return `Vui lòng kiểm tra trọng số của phần ${section.name}.`;
      }
      const ordered = [...section.mappings].sort((a, b) => a.rawFrom - b.rawFrom);
      for (let index = 0; index < ordered.length; index += 1) {
        const mapping = ordered[index];
        if (
          mapping.rawTo < mapping.rawFrom ||
          mapping.rawFrom < section.rawMinScore ||
          mapping.rawTo > section.rawMaxScore ||
          mapping.convertedScore < section.convertedMinScore ||
          mapping.convertedScore > section.convertedMaxScore
        ) {
          return `Có khoảng điểm nằm ngoài thang điểm của phần ${section.name}.`;
        }
        if (index > 0 && mapping.rawFrom <= ordered[index - 1].rawTo) {
          return `Các khoảng điểm thô của phần ${section.name} không được chồng lấn.`;
        }
      }
    }
    if (draft.overallRule.method === "weightedAverage") {
      const totalWeight = draft.sections.reduce(
        (total, section) => total + (section.weightType === "percentage" ? section.weight / 100 : section.weight),
        0,
      );
      if (totalWeight <= 0) return "Cần có ít nhất một phần thi có trọng số lớn hơn 0.";
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
          convertedUnit: section.convertedUnit.trim(),
        })),
        overallRule: { ...draft.overallRule },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu bảng quy đổi.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
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
                  <TabsTrigger key={section.id} value={section.id} className="shrink-0 whitespace-nowrap">
                    {section.name || "Phần thi"}
                  </TabsTrigger>
                ))}
              </TabsList>

              {draft.sections.map((section) => (
                <TabsContent key={section.id} value={section.id} className="space-y-4">
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Tùy chỉnh tên phần thi và thang điểm
                    </summary>
                    <div className="mt-3 rounded-lg border p-4">
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
                          min="0.01"
                          step="any"
                          value={section.rawStep}
                          onChange={(event) => updateSection(section.id, { rawStep: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`raw-unit-${section.id}`}>Đơn vị điểm thô</Label>
                        <Input
                          id={`raw-unit-${section.id}`}
                          value={section.rawUnit}
                          onChange={(event) => updateSection(section.id, { rawUnit: event.target.value })}
                          maxLength={40}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`converted-min-${section.id}`}>Điểm quy đổi từ</Label>
                        <Input
                          id={`converted-min-${section.id}`}
                          type="number"
                          step="any"
                          value={section.convertedMinScore}
                          onChange={(event) => updateSection(section.id, { convertedMinScore: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`converted-max-${section.id}`}>Điểm quy đổi đến</Label>
                        <Input
                          id={`converted-max-${section.id}`}
                          type="number"
                          step="any"
                          value={section.convertedMaxScore}
                          onChange={(event) => updateSection(section.id, { convertedMaxScore: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`converted-step-${section.id}`}>Bước điểm quy đổi</Label>
                        <Input
                          id={`converted-step-${section.id}`}
                          type="number"
                          min="0.01"
                          step="any"
                          value={section.convertedStep}
                          onChange={(event) => updateSection(section.id, { convertedStep: numericValue(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`converted-unit-${section.id}`}>Đơn vị điểm quy đổi</Label>
                        <Input
                          id={`converted-unit-${section.id}`}
                          value={section.convertedUnit}
                          onChange={(event) => updateSection(section.id, { convertedUnit: event.target.value })}
                          maxLength={40}
                        />
                      </div>
                    </div>
                  </div>
                  </details>

                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-medium">Bảng quy đổi {section.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Điểm thô {section.rawUnit} được đổi sang {section.convertedUnit}.
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
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Điểm thô từ</th>
                            <th className="px-3 py-2 font-medium">Điểm thô đến</th>
                            <th className="px-3 py-2 font-medium">Quy đổi ({section.convertedUnit})</th>
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
                                  aria-label={`Điểm quy đổi ${section.name}`}
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
                              <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
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
                onValueChange={(value) => updateRule({
                  method: value as "sum" | "average" | "weightedAverage",
                })}
              >
                <SelectTrigger id="overall-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="average">Trung bình các phần thi</SelectItem>
                  <SelectItem value="weightedAverage">Trung bình có trọng số</SelectItem>
                  <SelectItem value="sum">Cộng điểm các phần thi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.overallRule.method === "weightedAverage" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <h4 className="text-sm font-medium">Trọng số từng phần thi</h4>
                  <p className="text-xs text-muted-foreground">
                    Nhập tỷ lệ từ 0–100% hoặc hệ số nhân. Hệ thống chuẩn hóa theo tổng trọng số; có thể kết hợp cả hai dạng.
                  </p>
                </div>
                <div className="space-y-2">
                  {draft.sections.map((section) => (
                    <div
                      key={section.id}
                      className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]"
                    >
                      <Label htmlFor={`weight-value-${section.id}`}>{section.name}</Label>
                      <Input
                        id={`weight-value-${section.id}`}
                        aria-label={`Trọng số ${section.name}`}
                        type="number"
                        min="0"
                        max={section.weightType === "percentage" ? 100 : undefined}
                        step="any"
                        value={section.weight}
                        onChange={(event) => updateSection(section.id, {
                          weight: numericValue(event.target.value),
                        })}
                      />
                      <Select
                        value={section.weightType}
                        onValueChange={(value) => updateSection(section.id, {
                          weightType: value as "percentage" | "multiplier",
                        })}
                      >
                        <SelectTrigger
                          id={`weight-type-${section.id}`}
                          aria-label={`Dạng trọng số ${section.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Tỷ lệ (%)</SelectItem>
                          <SelectItem value="multiplier">Hệ số (×)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

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
  );
}