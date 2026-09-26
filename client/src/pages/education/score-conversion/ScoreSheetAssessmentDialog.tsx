import { useEffect, useState } from "react";
import type { ScoreSheetTemplate } from "@shared/score-sheet-template";
import type { ScoreSheetAssessmentInput } from "@shared/score-sheet-assessment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ScoreSheetAssessmentDialogProps = {
  open: boolean;
  templates: ScoreSheetTemplate[];
  templatesLoading: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ScoreSheetAssessmentInput) => Promise<void>;
};

function emptyDraft(): ScoreSheetAssessmentInput {
  return {
    code: "",
    name: "",
    scoreSheetTemplateId: "",
    examAt: "",
    scoreDeadlineAt: "",
    attemptCount: 1,
    scoringPolicy: "highest",
  };
}

function formulaMethodLabel(method: string): string {
  if (method === "sum") return "Tổng";
  if (method === "average") return "Trung bình";
  return "Tùy chỉnh";
}

export function ScoreSheetAssessmentDialog({
  open,
  templates,
  templatesLoading,
  saving,
  onOpenChange,
  onSave,
}: ScoreSheetAssessmentDialogProps) {
  const [draft, setDraft] = useState<ScoreSheetAssessmentInput>(emptyDraft);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setFormError("");
  }, [open]);

  const selectedTemplate = templates.find((template) => template.id === draft.scoreSheetTemplateId);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!draft.scoreSheetTemplateId) {
      setFormError("Chọn bảng điểm mẫu áp dụng.");
      return;
    }
    if (draft.scoreDeadlineAt <= draft.examAt) {
      setFormError("Hạn trả điểm phải sau ngày thi.");
      return;
    }

    try {
      await onSave({
        ...draft,
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể tạo bảng điểm.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm bảng điểm</DialogTitle>
          <DialogDescription>
            Khai báo lịch thi và cách tính điểm. Cấu trúc kỹ năng được lấy từ bảng điểm mẫu đã chọn.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="score-assessment-code">Mã</Label>
              <Input
                id="score-assessment-code"
                value={draft.code}
                onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
                maxLength={40}
                placeholder="Ví dụ: IELTS-2026-01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="score-assessment-name">Tên bảng điểm</Label>
              <Input
                id="score-assessment-name"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                maxLength={120}
                placeholder="Nhập tên bảng điểm"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="score-assessment-template">Chọn bảng điểm mẫu áp dụng</Label>
              <Select
                value={draft.scoreSheetTemplateId || "none"}
                onValueChange={(value) => setDraft((current) => ({
                  ...current,
                  scoreSheetTemplateId: value === "none" ? "" : value,
                }))}
                disabled={templatesLoading || templates.length === 0}
              >
                <SelectTrigger id="score-assessment-template">
                  <SelectValue placeholder="Chọn bảng điểm mẫu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {templates.length ? "Chọn bảng điểm mẫu" : "Chưa có bảng điểm mẫu"}
                  </SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.code} — {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templatesLoading && (
                <p className="text-xs text-muted-foreground">Đang tải bảng điểm mẫu...</p>
              )}
              {!templatesLoading && templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Hãy tạo bảng điểm mẫu trước ở tab “Bảng điểm mẫu”.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="score-assessment-exam-at">Ngày thi</Label>
              <Input
                id="score-assessment-exam-at"
                type="datetime-local"
                value={draft.examAt}
                onChange={(event) => setDraft((current) => ({ ...current, examAt: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="score-assessment-deadline">Hạn trả điểm</Label>
              <Input
                id="score-assessment-deadline"
                type="datetime-local"
                value={draft.scoreDeadlineAt}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  scoreDeadlineAt: event.target.value,
                }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="score-assessment-attempt-count">Số lần chấm bài</Label>
              <Input
                id="score-assessment-attempt-count"
                type="number"
                min="1"
                step="1"
                value={draft.attemptCount}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  attemptCount: event.target.value === "" ? 0 : Number(event.target.value),
                }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="score-assessment-policy">Chính sách tính điểm</Label>
              <Select
                value={draft.scoringPolicy}
                onValueChange={(value) => setDraft((current) => ({
                  ...current,
                  scoringPolicy: value as ScoreSheetAssessmentInput["scoringPolicy"],
                }))}
              >
                <SelectTrigger id="score-assessment-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="highest">Lấy điểm cao nhất</SelectItem>
                  <SelectItem value="latest">Lấy điểm gần nhất</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {selectedTemplate && (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <div>
                <h3 className="font-semibold">Cấu trúc kỹ năng của bảng điểm mẫu</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedTemplate.code} — {selectedTemplate.name}. Chỉ xem, không chỉnh sửa ở đây.
                </p>
              </div>
              {selectedTemplate.skills.length === 0 ? (
                <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  Bảng điểm mẫu chưa có kỹ năng.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {selectedTemplate.skills.map((skill, skillIndex) => (
                    <div
                      key={skill.id ?? skill.sectionId ?? `${skill.name}-${skillIndex}`}
                      className="rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-medium">
                          {skillIndex + 1}. {skill.name || `Kỹ năng ${skillIndex + 1}`}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          Điểm kỹ năng: {formulaMethodLabel(skill.partFormula.method)}
                          {skill.partFormula.method === "custom" && skill.partFormula.formula
                            ? ` · ${skill.partFormula.formula}`
                            : ""}
                        </span>
                      </div>
                      {skill.parts.length > 0 ? (
                        <ul className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                          {skill.parts.map((part, partIndex) => (
                            <li key={part.id}>
                              {skillIndex + 1}.{partIndex + 1} {part.name} · tối đa {part.rawMaxScore} điểm
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Chưa cấu hình part con.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving || templatesLoading || templates.length === 0}>
              {saving ? "Đang lưu..." : "Tạo bảng điểm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}