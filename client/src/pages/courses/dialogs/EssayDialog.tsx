import { useState, useEffect } from "react";
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
import { AlignLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type EssayData = {
  id?: string;
  type: "essay";
  content: string;
  minWords: number;
  maxWords: number;
  score: number;
  rubric?: string;
};

function buildCorrectAnswer(minWords: number, maxWords: number): string {
  return JSON.stringify({ minWords, maxWords });
}

function parseCorrectAnswer(raw: string): { minWords: number; maxWords: number } {
  try {
    const parsed = JSON.parse(raw);
    return {
      minWords: Number(parsed.minWords) || 50,
      maxWords: Number(parsed.maxWords) || 200,
    };
  } catch {
    return { minWords: 50, maxWords: 200 };
  }
}

interface EssayDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EssayData) => void;
  initialData?: {
    id?: string;
    content: string;
    correctAnswer: string;
    score: number;
    explanation?: string;
  } | null;
}

export function EssayDialog({ open, onClose, onSave, initialData }: EssayDialogProps) {
  const { toast } = useToast();
  const isEditing = Boolean(initialData?.id);

  const [content, setContent] = useState("");
  const [minWords, setMinWords] = useState(50);
  const [maxWords, setMaxWords] = useState(200);
  const [score, setScore] = useState(5);
  const [rubric, setRubric] = useState("");
  const [showRubric, setShowRubric] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialData) {
        const parsed = parseCorrectAnswer(initialData.correctAnswer ?? "");
        setContent(initialData.content ?? "");
        setMinWords(parsed.minWords);
        setMaxWords(parsed.maxWords);
        setScore(initialData.score ?? 5);
        setRubric(initialData.explanation ?? "");
        setShowRubric(!!(initialData.explanation));
      } else {
        setContent("");
        setMinWords(50);
        setMaxWords(200);
        setScore(5);
        setRubric("");
        setShowRubric(false);
      }
    }
  }, [open, initialData]);

  function handleSave() {
    if (!content.trim()) {
      toast({ title: "Vui lòng nhập tiêu đề câu hỏi", variant: "destructive" });
      return;
    }
    if (minWords < 0) {
      toast({ title: "Số từ tối thiểu không hợp lệ", variant: "destructive" });
      return;
    }
    if (maxWords < minWords) {
      toast({ title: "Số từ tối đa phải lớn hơn hoặc bằng số từ tối thiểu", variant: "destructive" });
      return;
    }
    if (score <= 0) {
      toast({ title: "Điểm phải lớn hơn 0", variant: "destructive" });
      return;
    }

    onSave({
      id: initialData?.id,
      type: "essay",
      content: content.trim(),
      minWords,
      maxWords,
      score,
      rubric: rubric.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlignLeft className="w-4 h-4 text-muted-foreground" />
            {isEditing ? "Chỉnh sửa câu hỏi tự luận" : "Thêm câu hỏi - Dạng tự luận"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="essay-content">
              Tiêu đề câu hỏi <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="essay-content"
              placeholder="Nhập câu hỏi tự luận..."
              rows={4}
              value={content}
              onChange={e => setContent(e.target.value)}
              data-testid="input-essay-content"
            />
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="essay-min-words">Số từ tối thiểu</Label>
              <Input
                id="essay-min-words"
                type="number"
                min={0}
                value={minWords}
                onChange={e => setMinWords(Number(e.target.value))}
                data-testid="input-essay-min-words"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="essay-max-words">Số từ tối đa</Label>
              <Input
                id="essay-max-words"
                type="number"
                min={0}
                value={maxWords}
                onChange={e => setMaxWords(Number(e.target.value))}
                data-testid="input-essay-max-words"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="essay-score">Điểm</Label>
              <Input
                id="essay-score"
                type="number"
                min={1}
                step={0.5}
                value={score}
                onChange={e => setScore(Number(e.target.value))}
                className="w-32"
                data-testid="input-essay-score"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowRubric(v => !v)}
              data-testid="btn-toggle-rubric"
            >
              {showRubric ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Rubric / Đáp án gợi ý (cho AI chấm bài)
            </button>
            {showRubric && (
              <div className="mt-2 space-y-1.5">
                <Textarea
                  id="essay-rubric"
                  placeholder="Nhập hướng dẫn chấm điểm hoặc đáp án gợi ý... Ví dụ: Học sinh cần nêu được 3 ý: A, B, C..."
                  rows={4}
                  value={rubric}
                  onChange={e => setRubric(e.target.value)}
                  className="text-sm"
                  data-testid="input-essay-rubric"
                />
                <p className="text-xs text-muted-foreground">
                  Không bắt buộc. Rubric càng chi tiết, AI chấm càng chính xác.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 pb-5 border-t pt-4">
          <Button variant="outline" onClick={onClose} data-testid="btn-essay-cancel">
            Hủy
          </Button>
          <Button onClick={handleSave} data-testid="btn-essay-save">
            {isEditing ? "Cập nhật" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
