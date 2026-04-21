import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  BarChart2,
  Lightbulb,
  PenLine,
  AlertCircle,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Dễ" },
  { value: "medium", label: "Trung bình" },
  { value: "hard", label: "Khó" },
];

export type FillBlankItem = {
  id: string;
  answers: string[];
  score: number;
};

export type FillBlankData = {
  id?: string;
  type: "fill_blank";
  title: string;
  content: string;
  media: { image_url: string; audio_url: string };
  options: FillBlankItem[];
  correct_answer: string;
  score: number;
  difficulty: string | null;
  explanation: string;
};

interface FillBlankDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: FillBlankData) => void;
  initialData?: FillBlankData | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractBlankKeys(content: string): string[] {
  const matches = [...content.matchAll(/\{(\d+)\}/g)];
  const unique = [...new Set(matches.map(m => m[1]))];
  return unique.sort((a, b) => Number(a) - Number(b));
}

function validateBlankKeys(keys: string[]): string | null {
  if (keys.length === 0) return null;
  const nums = keys.map(Number).sort((a, b) => a - b);
  if (nums[0] !== 1) return `Ô trống phải bắt đầu từ {1}, hiện tại bắt đầu từ {${nums[0]}}`;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      return `Thiếu ô {${nums[i - 1] + 1}} — không được bỏ số giữa chừng`;
    }
  }
  return null;
}

function syncBlanks(
  existingBlanks: FillBlankItem[],
  newKeys: string[]
): FillBlankItem[] {
  return newKeys.map(key => {
    const existing = existingBlanks.find(b => b.id === key);
    return existing ?? { id: key, answers: [""], score: 1 };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface BlankCardProps {
  blank: FillBlankItem;
  onChange: (updated: FillBlankItem) => void;
}

function BlankCard({ blank, onChange }: BlankCardProps) {
  function updateAnswer(idx: number, value: string) {
    const answers = [...blank.answers];
    answers[idx] = value;
    onChange({ ...blank, answers });
  }

  function addAnswer() {
    onChange({ ...blank, answers: [...blank.answers, ""] });
  }

  function removeAnswer(idx: number) {
    if (blank.answers.length <= 1) return;
    const answers = blank.answers.filter((_, i) => i !== idx);
    onChange({ ...blank, answers });
  }

  function updateScore(val: string) {
    const n = parseFloat(val);
    onChange({ ...blank, score: isNaN(n) || n <= 0 ? 1 : n });
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {blank.id}
        </span>
        <p className="text-xs font-semibold text-foreground">Ô trống {blank.id}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          Đáp án đúng <span className="text-destructive">*</span>
          <span className="ml-1 font-normal">(có thể nhiều đáp án chấp nhận)</span>
        </Label>
        <div className="space-y-1.5">
          {blank.answers.map((ans, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <Input
                data-testid={`input-blank-${blank.id}-answer-${idx}`}
                placeholder={`Đáp án ${idx + 1}...`}
                value={ans}
                onChange={e => updateAnswer(idx, e.target.value)}
                className="h-7 text-sm flex-1"
              />
              {blank.answers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAnswer(idx)}
                  data-testid={`btn-remove-answer-${blank.id}-${idx}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-primary hover:text-primary gap-1 px-0 h-6"
          onClick={addAnswer}
          data-testid={`btn-add-answer-${blank.id}`}
        >
          <Plus className="w-3 h-3" />
          Thêm đáp án chấp nhận
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground shrink-0">Điểm:</Label>
        <Input
          data-testid={`input-blank-${blank.id}-score`}
          type="number"
          min="0.25"
          step="0.25"
          value={blank.score}
          onChange={e => updateScore(e.target.value)}
          className="h-7 text-sm w-20"
        />
      </div>
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  content: string;
  blanks: FillBlankItem[];
  difficulty: string;
  explanation: string;
};

const defaultForm = (): FormState => ({
  title: "",
  content: "",
  blanks: [],
  difficulty: "",
  explanation: "",
});

export function FillBlankDialog({ open, onClose, onSave, initialData }: FillBlankDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm());
  const [contentWarning, setContentWarning] = useState<string | null>(null);

  const isEditing = !!initialData;

  useEffect(() => {
    if (open) {
      if (initialData) {
        const storedBlanks = Array.isArray(initialData.options) ? initialData.options as FillBlankItem[] : [];
        const keys = extractBlankKeys(initialData.content);
        const blanks = syncBlanks(storedBlanks, keys);
        setForm({
          title: initialData.title ?? "",
          content: initialData.content ?? "",
          blanks,
          difficulty: initialData.difficulty ?? "",
          explanation: initialData.explanation ?? "",
        });
        setContentWarning(validateBlankKeys(keys));
      } else {
        setForm(defaultForm());
        setContentWarning(null);
      }
    }
  }, [open, initialData]);

  const handleContentChange = useCallback((newContent: string) => {
    const keys = extractBlankKeys(newContent);
    const warning = validateBlankKeys(keys);
    setContentWarning(warning);
    setForm(prev => ({
      ...prev,
      content: newContent,
      blanks: warning ? prev.blanks : syncBlanks(prev.blanks, keys),
    }));
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function updateBlank(updated: FillBlankItem) {
    setForm(prev => ({
      ...prev,
      blanks: prev.blanks.map(b => b.id === updated.id ? updated : b),
    }));
  }

  function handleSave() {
    if (!form.content.trim()) {
      toast({ title: "Vui lòng nhập nội dung câu hỏi", variant: "destructive" });
      return;
    }

    const keys = extractBlankKeys(form.content);
    if (keys.length === 0) {
      toast({ title: "Nội dung câu hỏi phải có ít nhất một ô trống {1}", variant: "destructive" });
      return;
    }

    const warning = validateBlankKeys(keys);
    if (warning) {
      toast({ title: warning, variant: "destructive" });
      return;
    }

    for (const blank of form.blanks) {
      const filledAnswers = blank.answers.filter(a => a.trim());
      if (filledAnswers.length === 0) {
        toast({ title: `Ô trống {${blank.id}} chưa có đáp án đúng`, variant: "destructive" });
        return;
      }
    }

    const totalScore = form.blanks.reduce((sum, b) => sum + b.score, 0);

    const cleanedBlanks: FillBlankItem[] = form.blanks.map(b => ({
      id: b.id,
      answers: b.answers.map(a => a.trim()).filter(Boolean),
      score: b.score,
    }));

    const payload: FillBlankData = {
      ...(initialData?.id ? { id: initialData.id } : {}),
      type: "fill_blank",
      title: form.title.trim(),
      content: form.content.trim(),
      media: { image_url: "", audio_url: "" },
      options: cleanedBlanks,
      correct_answer: cleanedBlanks.map(b => `{${b.id}}: ${b.answers[0]}`).join("; "),
      score: totalScore,
      difficulty: form.difficulty || null,
      explanation: form.explanation.trim(),
    };

    onSave(payload);
    toast({ title: isEditing ? "Đã cập nhật câu hỏi thành công" : "Đã lưu câu hỏi thành công" });
    onClose();
  }

  const detectedKeys = extractBlankKeys(form.content);
  const totalScore = form.blanks.reduce((sum, b) => sum + b.score, 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PenLine className="w-4 h-4 text-primary" />
            {isEditing ? "Sửa câu hỏi – Điền vào chỗ trống" : "Thêm câu hỏi – Điền vào chỗ trống"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Tiêu đề */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tiêu đề</Label>
            <Input
              data-testid="input-question-title"
              placeholder="Nhập tiêu đề câu hỏi (tùy chọn)..."
              value={form.title}
              onChange={e => setField("title", e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Nội dung câu hỏi */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Câu hỏi <span className="text-destructive">*</span>
            </Label>
            <Textarea
              data-testid="input-question-content"
              placeholder="Nhập nội dung câu hỏi..."
              className="min-h-[90px] resize-none"
              value={form.content}
              onChange={e => handleContentChange(e.target.value)}
            />

            {/* Gợi ý */}
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                Gợi ý: dùng <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">{"{1}"}</code>,{" "}
                <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">{"{2}"}</code> để tạo ô trống
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                Ví dụ: Hà Nội là thủ đô của {"{1}"} và có dân số {"{2}"}
              </p>
            </div>

            {/* Lỗi cấu trúc ô trống */}
            {contentWarning && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{contentWarning}</p>
              </div>
            )}

            {/* Preview số ô trống tìm được */}
            {detectedKeys.length > 0 && !contentWarning && (
              <p className="text-xs text-muted-foreground">
                Phát hiện <strong>{detectedKeys.length}</strong> ô trống:{" "}
                {detectedKeys.map(k => (
                  <code key={k} className="font-mono bg-muted px-1 rounded mr-1">{`{${k}}`}</code>
                ))}
              </p>
            )}
          </div>

          {/* Danh sách ô trống */}
          {form.blanks.length > 0 && !contentWarning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  📦 Danh sách ô trống
                  <span className="text-xs font-normal text-muted-foreground">(tự động từ nội dung)</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  Tổng điểm: <strong className="text-foreground">{totalScore}</strong>
                </span>
              </div>
              <div className="space-y-2">
                {form.blanks.map(blank => (
                  <BlankCard
                    key={blank.id}
                    blank={blank}
                    onChange={updateBlank}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Placeholder khi chưa có ô trống */}
          {form.content.trim() && detectedKeys.length === 0 && !contentWarning && (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-5 text-center">
              <p className="text-xs text-muted-foreground">
                Chưa có ô trống nào. Hãy thêm <code className="font-mono bg-muted px-1 rounded">{"{1}"}</code> vào nội dung câu hỏi.
              </p>
            </div>
          )}

          {/* Độ khó */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" />
              Độ khó (tùy chọn)
            </Label>
            <div className="flex gap-1">
              {DIFFICULTY_OPTIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setField("difficulty", form.difficulty === d.value ? "" : d.value)}
                  data-testid={`btn-difficulty-${d.value}`}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded border font-medium transition-all",
                    form.difficulty === d.value
                      ? d.value === "easy"
                        ? "bg-green-100 border-green-400 text-green-700 dark:bg-green-900/40 dark:border-green-600 dark:text-green-300"
                        : d.value === "medium"
                        ? "bg-yellow-100 border-yellow-400 text-yellow-700 dark:bg-yellow-900/40 dark:border-yellow-600 dark:text-yellow-300"
                        : "bg-red-100 border-red-400 text-red-700 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Giải thích */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Giải thích (tùy chọn)
            </Label>
            <Textarea
              data-testid="input-explanation"
              placeholder="Nhập giải thích đáp án (nếu có)..."
              className="min-h-[60px] resize-none text-sm"
              value={form.explanation}
              onChange={e => setField("explanation", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-question">
            Hủy
          </Button>
          <Button onClick={handleSave} data-testid="btn-save-question">
            {isEditing ? "Cập nhật" : "Lưu câu hỏi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
