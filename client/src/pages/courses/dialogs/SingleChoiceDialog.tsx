import { useState, useRef, useEffect } from "react";
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
  ImageIcon,
  Music,
  Circle,
  CheckCircle2,
  BarChart2,
  Lightbulb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Dễ" },
  { value: "medium", label: "Trung bình" },
  { value: "hard", label: "Khó" },
];

type Option = { id: string; text: string };

type FormState = {
  title: string;
  content: string;
  imageUrl: string;
  audioUrl: string;
  options: Option[];
  correctAnswer: string;
  score: string;
  difficulty: string;
  explanation: string;
};

const defaultForm = (): FormState => ({
  title: "",
  content: "",
  imageUrl: "",
  audioUrl: "",
  options: [
    { id: "A", text: "" },
    { id: "B", text: "" },
    { id: "C", text: "" },
  ],
  correctAnswer: "",
  score: "1",
  difficulty: "",
  explanation: "",
});

export type SingleChoiceData = {
  id?: string;
  title: string;
  content: string;
  media: { image_url: string; audio_url: string };
  options: { id: string; text: string }[];
  correct_answer: string;
  score: number;
  difficulty: string | null;
  explanation: string;
  type: string;
};

interface SingleChoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: SingleChoiceData) => void;
  initialData?: SingleChoiceData | null;
}

export function SingleChoiceDialog({ open, onClose, onSave, initialData }: SingleChoiceDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!initialData;

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          title: initialData.title ?? "",
          content: initialData.content ?? "",
          imageUrl: initialData.media?.image_url ?? "",
          audioUrl: initialData.media?.audio_url ?? "",
          options: initialData.options?.length
            ? initialData.options.map(o => ({ id: o.id, text: o.text }))
            : [{ id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" }],
          correctAnswer: initialData.correct_answer ?? "",
          score: String(initialData.score ?? 1),
          difficulty: initialData.difficulty ?? "",
          explanation: initialData.explanation ?? "",
        });
      } else {
        setForm(defaultForm());
      }
    }
  }, [open, initialData]);

  function handleClose() {
    onClose();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function updateOption(index: number, text: string) {
    setForm(prev => {
      const options = [...prev.options];
      options[index] = { ...options[index], text };
      return { ...prev, options };
    });
  }

  function addOption() {
    setForm(prev => {
      if (prev.options.length >= OPTION_LABELS.length) return prev;
      const nextLabel = OPTION_LABELS[prev.options.length];
      return { ...prev, options: [...prev.options, { id: nextLabel, text: "" }] };
    });
  }

  function removeOption(index: number) {
    setForm(prev => {
      if (prev.options.length <= 2) return prev;
      const options = prev.options.filter((_, i) => i !== index);
      const correctAnswer =
        prev.correctAnswer === prev.options[index].id ? "" : prev.correctAnswer;
      return { ...prev, options, correctAnswer };
    });
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setField("imageUrl", url);
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setField("audioUrl", url);
  }

  function handleSave() {
    if (!form.content.trim()) {
      toast({ title: "Vui lòng nhập nội dung câu hỏi", variant: "destructive" });
      return;
    }
    if (form.options.some(o => !o.text.trim())) {
      toast({ title: "Vui lòng điền đầy đủ nội dung các đáp án", variant: "destructive" });
      return;
    }
    if (!form.correctAnswer) {
      toast({ title: "Vui lòng chọn đáp án đúng", variant: "destructive" });
      return;
    }
    const scoreNum = parseFloat(form.score);
    if (!form.score || isNaN(scoreNum) || scoreNum <= 0) {
      toast({ title: "Điểm câu hỏi phải lớn hơn 0", variant: "destructive" });
      return;
    }

    const payload: SingleChoiceData = {
      ...(initialData?.id ? { id: initialData.id } : {}),
      type: "single_choice",
      title: form.title.trim(),
      content: form.content.trim(),
      media: {
        image_url: form.imageUrl,
        audio_url: form.audioUrl,
      },
      options: form.options.map(o => ({ id: o.id, text: o.text.trim() })),
      correct_answer: form.correctAnswer,
      score: scoreNum,
      difficulty: form.difficulty || null,
      explanation: form.explanation.trim(),
    };

    onSave(payload);
    toast({ title: isEditing ? "Đã cập nhật câu hỏi thành công" : "Đã lưu câu hỏi thành công" });
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            {isEditing ? "Sửa câu hỏi – Trắc nghiệm 1 đáp án" : "Thêm câu hỏi – Trắc nghiệm 1 đáp án"}
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
              className="min-h-[80px] resize-none"
              value={form.content}
              onChange={e => setField("content", e.target.value)}
            />
          </div>

          {/* Media */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              Media (tùy chọn)
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 text-xs"
                onClick={() => imageInputRef.current?.click()}
                data-testid="btn-upload-image"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Tải ảnh lên
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 text-xs"
                onClick={() => audioInputRef.current?.click()}
                data-testid="btn-upload-audio"
              >
                <Music className="w-3.5 h-3.5" />
                Tải audio lên
              </Button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
            </div>
            {form.imageUrl && (
              <img src={form.imageUrl} alt="preview" className="mt-2 max-h-40 rounded-md border object-contain" />
            )}
            {form.audioUrl && (
              <audio src={form.audioUrl} controls className="mt-2 w-full h-8" />
            )}
          </div>

          {/* Đáp án */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Đáp án <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-2">
              {form.options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setField("correctAnswer", opt.id)}
                    data-testid={`radio-answer-${opt.id}`}
                    className="shrink-0"
                  >
                    {form.correctAnswer === opt.id
                      ? <CheckCircle2 className="w-4 h-4 text-primary" />
                      : <Circle className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                  <span className="w-5 text-xs font-semibold text-muted-foreground shrink-0">{opt.id}</span>
                  <Input
                    data-testid={`input-option-${opt.id}`}
                    placeholder={`Đáp án ${opt.id}...`}
                    value={opt.text}
                    onChange={e => updateOption(idx, e.target.value)}
                    className="h-8 text-sm"
                  />
                  {form.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      data-testid={`btn-remove-option-${opt.id}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.options.length < OPTION_LABELS.length && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-primary hover:text-primary gap-1 px-0"
                onClick={addOption}
                data-testid="btn-add-option"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm đáp án
              </Button>
            )}
          </div>

          {/* Đáp án đúng (hiển thị xác nhận) */}
          {form.correctAnswer && (
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>Đáp án đúng: <strong>{form.correctAnswer}</strong> — {form.options.find(o => o.id === form.correctAnswer)?.text}</span>
            </div>
          )}

          {/* Điểm + Độ khó */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Điểm câu hỏi <span className="text-destructive">*</span>
              </Label>
              <Input
                data-testid="input-score"
                type="number"
                min="0.01"
                step="0.25"
                placeholder="vd: 1, 2, 0.5"
                value={form.score}
                onChange={e => setField("score", e.target.value)}
                className="h-8 text-sm"
              />
            </div>

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
          <Button variant="outline" onClick={handleClose} data-testid="btn-cancel-question">
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
