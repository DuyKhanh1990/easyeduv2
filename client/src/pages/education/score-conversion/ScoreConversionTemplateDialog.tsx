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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDefaultDraft, draftFromTemplate, SCORE_CONVERSION_TYPES } from "./score-conversion-presets";

type ScoreConversionTemplateDialogProps = {
  open: boolean;
  template: ScoreConversionTemplate | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ScoreConversionTemplateInput) => Promise<void>;
};

const newId = () => crypto.randomUUID();
const numericValue = (value: string) => (value === "" ? 0 : Number(value));

export function ScoreConversionTemplateDialog({
  open,
  template,
  saving,
  onOpenChange,
  onSave,
}: ScoreConversionTemplateDialogProps) {
  const [draft, setDraft] = useState<ScoreConversionTemplateInput>(() => createDefaultDraft());
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(template ? draftFromTemplate(template) : createDefaultDraft("ielts"));
    setFormError("");
  }, [open, template]);

  const changeType = (typeKey: ScoreConversionTypeKey) => {
    setDraft((current) => createDefaultDraft(typeKey, current.name));
    setFormError("");
  };

  const updateSection = (id: string, update: Partial<ScoreConversionTemplateInput["sections"][number]>) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === id ? { ...section, ...update } : section),
    }));
  };

  const updateRule = (update: Partial<ScoreConversionTemplateInput["overallRule"]>) => {
    setDraft((current) => ({
      ...current,
      overallRule: { ...current.overallRule, ...update },
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (!draft.name.trim()) {
      setFormError("Vui lòng nhập tên bài kiểm tra.");
      return;
    }
    if (draft.typeKey === "custom" && !draft.typeName.trim()) {
      setFormError("Vui lòng đặt tên loại bài kiểm tra tùy chỉnh.");
      return;
    }
    if (draft.sections.some((section) => !section.name.trim() || !section.unit.trim() || section.maxScore < section.minScore || section.step <= 0)) {
      setFormError("Vui lòng kiểm tra tên, đơn vị và thang điểm của từng phần thi.");
      return;
    }
    if (draft.overallRule.maxScore < draft.overallRule.minScore) {
      setFormError("Điểm tối đa của điểm tổng phải lớn hơn hoặc bằng điểm tối thiểu.");
      return;
    }

    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        typeName: draft.typeName.trim(),
        overallRule: {
          ...draft.overallRule,
          description: draft.overallRule.description.trim(),
        },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu cấu hình.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{template ? "Sửa cấu hình bài kiểm tra" : "Thêm bài kiểm tra"}</DialogTitle>
          <DialogDescription>
            Chọn một mẫu có sẵn để nạp cấu hình ban đầu, sau đó có thể chỉnh các phần thi và quy tắc điểm trước khi lưu.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="score-conversion-name">Tên bài kiểm tra</Label>
              <Input
                id="score-conversion-name"
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ví dụ: IELTS Mock Test 01"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label>Loại bài kiểm tra</Label>
              <Select value={draft.typeKey} onValueChange={(value) => changeType(value as ScoreConversionTypeKey)}>
                <SelectTrigger aria-label="Loại bài kiểm tra">
                  <SelectValue placeholder="Chọn loại bài kiểm tra" />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_CONVERSION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {draft.typeKey === "custom" && (
            <div className="max-w-md space-y-2">
              <Label htmlFor="score-conversion-type-name">Tên loại tùy chỉnh</Label>
              <Input
                id="score-conversion-type-name"
                value={draft.typeName}
                onChange={(event) => setDraft((current) => ({ ...current, typeName: event.target.value }))}
                placeholder="Ví dụ: Bài kiểm tra nội bộ"
                maxLength={100}
              />
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Các phần thi và thang điểm</h3>
                <p className="text-sm text-muted-foreground">Có thể đổi tên, thang điểm, đơn vị hoặc thêm/bớt phần thi.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft((current) => ({
                  ...current,
                  sections: [...current.sections, {
                    id: newId(),
                    name: `Phần thi ${current.sections.length + 1}`,
                    minScore: 0,
                    maxScore: 100,
                    step: 1,
                    unit: "điểm",
                  }],
                }))}
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm phần thi
              </Button>
            </div>

            <div className="space-y-3">
              {draft.sections.map((section, index) => (
                <div key={section.id} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium">Phần thi {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Xóa phần thi ${index + 1}`}
                      disabled={draft.sections.length <= 1}
                      onClick={() => setDraft((current) => ({
                        ...current,
                        sections: current.sections.filter((item) => item.id !== section.id),
                      }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1.5 lg:col-span-1">
                      <Label htmlFor={`section-name-${section.id}`}>Tên phần</Label>
                      <Input
                        id={`section-name-${section.id}`}
                        value={section.name}
                        onChange={(event) => updateSection(section.id, { name: event.target.value })}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`section-min-${section.id}`}>Điểm từ</Label>
                      <Input
                        id={`section-min-${section.id}`}
                        type="number"
                        step="any"
                        value={section.minScore}
                        onChange={(event) => updateSection(section.id, { minScore: numericValue(event.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`section-max-${section.id}`}>Đến</Label>
                      <Input
                        id={`section-max-${section.id}`}
                        type="number"
                        step="any"
                        value={section.maxScore}
                        onChange={(event) => updateSection(section.id, { maxScore: numericValue(event.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`section-step-${section.id}`}>Bước điểm</Label>
                      <Input
                        id={`section-step-${section.id}`}
                        type="number"
                        min="0.01"
                        step="any"
                        value={section.step}
                        onChange={(event) => updateSection(section.id, { step: numericValue(event.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`section-unit-${section.id}`}>Đơn vị</Label>
                      <Input
                        id={`section-unit-${section.id}`}
                        value={section.unit}
                        onChange={(event) => updateSection(section.id, { unit: event.target.value })}
                        maxLength={40}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h3 className="font-semibold">Quy tắc điểm tổng</h3>
              <p className="text-sm text-muted-foreground">Mẫu có sẵn đã điền quy tắc thường dùng; có thể sửa thủ công.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="overall-method">Cách tính</Label>
                <Select
                  value={draft.overallRule.method}
                  onValueChange={(value) => updateRule({ method: value as "sum" | "average" })}
                >
                  <SelectTrigger id="overall-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="average">Trung bình</SelectItem>
                    <SelectItem value="sum">Cộng tổng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overall-min">Điểm tổng từ</Label>
                <Input
                  id="overall-min"
                  type="number"
                  step="any"
                  value={draft.overallRule.minScore}
                  onChange={(event) => updateRule({ minScore: numericValue(event.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overall-max">Đến</Label>
                <Input
                  id="overall-max"
                  type="number"
                  step="any"
                  value={draft.overallRule.maxScore}
                  onChange={(event) => updateRule({ maxScore: numericValue(event.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overall-rounding">Làm tròn đến</Label>
                <Input
                  id="overall-rounding"
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="Không làm tròn"
                  value={draft.overallRule.roundingStep ?? ""}
                  onChange={(event) => updateRule({
                    roundingStep: event.target.value === "" ? null : numericValue(event.target.value),
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overall-unit">Đơn vị điểm tổng</Label>
                <Input
                  id="overall-unit"
                  value={draft.overallRule.unit}
                  onChange={(event) => updateRule({ unit: event.target.value })}
                  maxLength={40}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="overall-description">Mô tả quy tắc</Label>
              <Textarea
                id="overall-description"
                value={draft.overallRule.description}
                onChange={(event) => updateRule({ description: event.target.value })}
                placeholder="Mô tả cách tính hoặc quy đổi điểm"
                maxLength={1000}
              />
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Ngưỡng xếp loại (không bắt buộc)</Label>
                  <p className="text-xs text-muted-foreground">Ví dụ: A2 từ 120 đến 139 điểm.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateRule({
                    gradeBands: [...draft.overallRule.gradeBands, {
                      id: newId(),
                      label: "",
                      minScore: draft.overallRule.minScore,
                      maxScore: draft.overallRule.maxScore,
                    }],
                  })}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Thêm ngưỡng
                </Button>
              </div>
              {draft.overallRule.gradeBands.map((band, index) => (
                <div key={band.id} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`band-label-${band.id}`}>Xếp loại {index + 1}</Label>
                    <Input
                      id={`band-label-${band.id}`}
                      value={band.label}
                      onChange={(event) => updateRule({
                        gradeBands: draft.overallRule.gradeBands.map((item) =>
                          item.id === band.id ? { ...item, label: event.target.value } : item),
                      })}
                      placeholder="Ví dụ: A2"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`band-min-${band.id}`}>Điểm từ</Label>
                    <Input
                      id={`band-min-${band.id}`}
                      type="number"
                      step="any"
                      value={band.minScore}
                      onChange={(event) => updateRule({
                        gradeBands: draft.overallRule.gradeBands.map((item) =>
                          item.id === band.id ? { ...item, minScore: numericValue(event.target.value) } : item),
                      })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`band-max-${band.id}`}>Đến</Label>
                    <Input
                      id={`band-max-${band.id}`}
                      type="number"
                      step="any"
                      value={band.maxScore}
                      onChange={(event) => updateRule({
                        gradeBands: draft.overallRule.gradeBands.map((item) =>
                          item.id === band.id ? { ...item, maxScore: numericValue(event.target.value) } : item),
                      })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Xóa ngưỡng xếp loại ${index + 1}`}
                    onClick={() => updateRule({
                      gradeBands: draft.overallRule.gradeBands.filter((item) => item.id !== band.id),
                    })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu cấu hình"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}