import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type GeneratedQuestion = {
  type: string;
  title: string | null;
  content: string;
  options: any;
  correctAnswer: string | null;
  score: number;
  difficulty: string | null;
  explanation: string | null;
};

interface AIGenerateQuestionsDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (questions: GeneratedQuestion[]) => Promise<void>;
  isSaving?: boolean;
  mode?: "bank" | "section";
}

const QUESTION_TYPES = [
  { value: "single_choice", label: "Trắc nghiệm một đáp án" },
  { value: "multiple_choice", label: "Trắc nghiệm nhiều đáp án" },
  { value: "fill_blank", label: "Điền vào chỗ trống" },
  { value: "essay", label: "Tự luận" },
  { value: "matching", label: "Câu hỏi nối" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Dễ" },
  { value: "medium", label: "Trung bình" },
  { value: "hard", label: "Khó" },
];

const COUNT_OPTIONS = [3, 5, 10, 15, 20];

const PROVIDER_OPTIONS = [
  { value: "openai", label: "ChatGPT (OpenAI)", icon: "🤖" },
  { value: "gemini", label: "Gemini (Google)", icon: "✨" },
];

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Trắc nghiệm",
  multiple_choice: "Nhiều đáp án",
  fill_blank: "Điền chỗ trống",
  essay: "Tự luận",
  matching: "Câu nối",
};

const DIFF_LABEL: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

const DIFF_COLOR: Record<string, string> = {
  easy: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  hard: "bg-red-100 text-red-700 border-red-200",
};

function QuestionPreviewCard({
  q,
  index,
  selected,
  onToggle,
  onRemove,
}: {
  q: GeneratedQuestion;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function renderOptions() {
    if (!q.options || q.type === "essay") return null;
    if (q.type === "matching") {
      const pairs = Array.isArray(q.options) ? q.options : [];
      return (
        <div className="mt-2 space-y-1">
          {pairs.map((p: any, i: number) => (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="font-medium min-w-[80px]">{p.left?.text}</span>
              <span>→</span>
              <span>{p.right?.text}</span>
            </div>
          ))}
        </div>
      );
    }
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      <div className="mt-2 space-y-1">
        {opts.map((o: any) => {
          const isCorrect = q.type === "multiple_choice"
            ? (q.correctAnswer || "").split(",").includes(o.id)
            : q.correctAnswer === o.id;
          return (
            <div key={o.id || o.index} className={cn("flex items-start gap-2 text-xs", isCorrect && "text-green-700 font-medium")}>
              {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500" /> : <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/40" />}
              <span>{o.id && !o.text?.startsWith("{") ? `${o.id}. ` : ""}{o.text || (o.answers && o.answers[0])}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn(
      "border rounded-lg p-3 transition-colors",
      selected ? "border-primary/30 bg-primary/5" : "border-border bg-card opacity-60"
    )}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-0.5 shrink-0"
          data-testid={`ai-q-checkbox-${index}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{TYPE_LABEL[q.type] || q.type}</Badge>
            {q.difficulty && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", DIFF_COLOR[q.difficulty])}>{DIFF_LABEL[q.difficulty] || q.difficulty}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">{q.score || 1} điểm</span>
          </div>
          <p className="text-sm leading-snug">{q.content}</p>
          {renderOptions()}
          {q.explanation && expanded && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <span className="font-medium">Giải thích: </span>{q.explanation}
            </div>
          )}
          {(q.explanation || (q.options && q.type !== "essay")) && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Thu gọn" : "Xem giải thích"}
            </button>
          )}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          data-testid={`ai-q-remove-${index}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function AIGenerateQuestionsDialog({
  open,
  onClose,
  onSave,
  isSaving = false,
  mode = "bank",
}: AIGenerateQuestionsDialogProps) {
  const { toast } = useToast();

  const { data: configuredProviders } = useQuery<{ openai: boolean; gemini: boolean }>({
    queryKey: ["/api/ai-settings"],
    enabled: open,
  });

  const [step, setStep] = useState<"form" | "preview">("form");
  const [provider, setProvider] = useState("openai");
  const [prompt, setPrompt] = useState("");

  const [questionType, setQuestionType] = useState("single_choice");
  const [count, setCount] = useState("5");
  const [difficulty, setDifficulty] = useState("medium");
  const [isGenerating, setIsGenerating] = useState(false);

  // Tự động chọn provider đầu tiên có key khi dialog mở
  useEffect(() => {
    if (!open || !configuredProviders) return;
    const hasOpenAI = configuredProviders.openai;
    const hasGemini = configuredProviders.gemini;
    if (!hasOpenAI && !hasGemini) return;
    if (hasOpenAI) { setProvider("openai"); return; }
    if (hasGemini) setProvider("gemini");
  }, [open, configuredProviders]);

  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  function handleClose() {
    if (isGenerating || isSaving) return;
    setStep("form");
    setPrompt("");
    setGeneratedQuestions([]);
    setSelectedIndices(new Set());
    onClose();
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast({ title: "Vui lòng nhập chủ đề hoặc yêu cầu", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/ai/generate-questions", {
        provider,
        prompt: prompt.trim(),
        questionType,
        count: Number(count),
        difficulty,
      });
      const data = await res.json();
      if (!data.questions || data.questions.length === 0) {
        toast({ title: "AI không tạo được câu hỏi. Hãy thử lại.", variant: "destructive" });
        return;
      }
      setGeneratedQuestions(data.questions);
      setSelectedIndices(new Set(data.questions.map((_: any, i: number) => i)));
      setStep("preview");
    } catch (err: any) {
      let msg = "Lỗi khi tạo câu hỏi bằng AI";
      try {
        const body = JSON.parse(err?.message?.replace(/^\d+:\s*/, "") || "{}");
        if (body?.message) msg = body.message;
      } catch {}
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleSelect(i: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function removeQuestion(i: number) {
    setGeneratedQuestions(prev => prev.filter((_, idx) => idx !== i));
    setSelectedIndices(prev => {
      const next = new Set<number>();
      prev.forEach(v => { if (v < i) next.add(v); else if (v > i) next.add(v - 1); });
      return next;
    });
  }

  async function handleSave() {
    const toSave = generatedQuestions.filter((_, i) => selectedIndices.has(i));
    if (toSave.length === 0) {
      toast({ title: "Chưa chọn câu hỏi nào", variant: "destructive" });
      return;
    }
    await onSave(toSave);
    handleClose();
  }

  const selectedCount = selectedIndices.size;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="w-4 h-4 text-primary" />
            Tạo câu hỏi bằng AI
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "form" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {PROVIDER_OPTIONS.map(p => {
                  const hasKey = configuredProviders ? configuredProviders[p.value as keyof typeof configuredProviders] : true;
                  const isSelected = provider === p.value;
                  const isDisabled = !hasKey;
                  return (
                    <button
                      key={p.value}
                      onClick={() => !isDisabled && setProvider(p.value)}
                      data-testid={`ai-provider-${p.value}`}
                      disabled={isDisabled}
                      title={isDisabled ? "Chưa cấu hình API key. Vào Cài đặt → Tài khoản AI để thêm." : undefined}
                      className={cn(
                        "flex items-center gap-2.5 border rounded-lg px-3 py-2.5 text-sm font-medium transition-all relative",
                        isDisabled
                          ? "border-border bg-muted/30 text-muted-foreground/40 cursor-not-allowed opacity-50"
                          : isSelected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      <span className="text-base">{p.icon}</span>
                      <span className="flex-1 text-left">{p.label}</span>
                      {isDisabled && (
                        <span className="text-[10px] font-normal text-muted-foreground/60 ml-auto">Chưa cấu hình</span>
                      )}
                      {!isDisabled && hasKey !== undefined && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-auto shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Chủ đề / Yêu cầu <span className="text-destructive">*</span></Label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Ví dụ: Tạo câu hỏi về ngữ pháp tiếng Anh thì hiện tại đơn cho học sinh lớp 8..."
                  className="min-h-[90px] resize-none text-sm"
                  data-testid="ai-prompt-input"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Loại câu hỏi</Label>
                  <Select value={questionType} onValueChange={setQuestionType}>
                    <SelectTrigger className="text-sm" data-testid="ai-question-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Số lượng</Label>
                  <Select value={count} onValueChange={setCount}>
                    <SelectTrigger className="text-sm" data-testid="ai-question-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNT_OPTIONS.map(c => (
                        <SelectItem key={c} value={String(c)}>{c} câu</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Độ khó</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="text-sm" data-testid="ai-question-difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_OPTIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {generatedQuestions.length} câu hỏi được tạo •{" "}
                  <span className="text-foreground font-medium">{selectedCount} đã chọn</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedIndices(new Set(generatedQuestions.map((_, i) => i)))}
                  >
                    Chọn tất cả
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedIndices(new Set())}
                  >
                    Bỏ chọn tất cả
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {generatedQuestions.map((q, i) => (
                  <QuestionPreviewCard
                    key={i}
                    q={q}
                    index={i}
                    selected={selectedIndices.has(i)}
                    onToggle={() => toggleSelect(i)}
                    onRemove={() => removeQuestion(i)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-2">
          {step === "preview" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("form")}
                disabled={isSaving}
                data-testid="ai-btn-back"
              >
                ← Tạo lại
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSaving}>
                  Hủy
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || selectedCount === 0}
                  data-testid="ai-btn-save"
                >
                  {isSaving ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Đang lưu...</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Lưu {selectedCount} câu hỏi {mode === "section" ? "vào section" : "vào ngân hàng"}</>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isGenerating}>
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                data-testid="ai-btn-generate"
              >
                {isGenerating ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Đang tạo...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Tạo {count} câu hỏi</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
