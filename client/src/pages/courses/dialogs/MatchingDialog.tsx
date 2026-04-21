import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  X,
  GitMerge,
  Lightbulb,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchPair = {
  id: string;
  left: { text: string; imageUrl: string };
  right: { text: string; imageUrl: string };
};

export type MatchingData = {
  id?: string;
  type: "matching";
  title: string;
  content: string;
  options: MatchPair[];
  correctAnswer: string;
  score: number;
  difficulty: string | null;
  explanation: string;
  shuffleB: boolean;
  scorePerPair: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let pairCounter = 0;
function newPairId() {
  return `pair-${++pairCounter}`;
}

function makeDefaultPair(): MatchPair {
  return {
    id: newPairId(),
    left: { text: "", imageUrl: "" },
    right: { text: "", imageUrl: "" },
  };
}

function buildCorrectAnswer(scorePerPair: number, shuffleB: boolean): string {
  return JSON.stringify({ scorePerPair, shuffleB });
}

function parseCorrectAnswer(raw: string): { scorePerPair: number; shuffleB: boolean } {
  try {
    const parsed = JSON.parse(raw);
    return {
      scorePerPair: Number(parsed.scorePerPair) || 1,
      shuffleB: Boolean(parsed.shuffleB),
    };
  } catch {
    return { scorePerPair: 1, shuffleB: false };
  }
}

// ─── Sub-component: Pair Image Slot ───────────────────────────────────────────

interface ImageSlotProps {
  imageUrl: string;
  onUpload: () => void;
  onRemove: () => void;
  testId?: string;
}

function ImageSlot({ imageUrl, onUpload, onRemove, testId }: ImageSlotProps) {
  if (imageUrl) {
    return (
      <div className="relative group mt-1.5 rounded-md overflow-hidden border bg-muted/30 w-full h-20">
        <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={testId ? `${testId}-remove` : undefined}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onUpload}
      className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md px-2.5 py-1.5 w-full transition-colors hover:border-border"
      data-testid={testId}
    >
      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
      Thêm ảnh
    </button>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

interface MatchingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: MatchingData) => void;
  initialData?: MatchingData | null;
}

export function MatchingDialog({ open, onClose, onSave, initialData }: MatchingDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    pairId: string;
    side: "left" | "right";
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [content, setContent] = useState("");
  const [explanation, setExplanation] = useState("");
  const [scorePerPair, setScorePerPair] = useState(1);
  const [shuffleB, setShuffleB] = useState(false);
  const [pairs, setPairs] = useState<MatchPair[]>([makeDefaultPair(), makeDefaultPair()]);

  const isEditing = !!initialData;

  useEffect(() => {
    if (open) {
      if (initialData) {
        const { scorePerPair: sp, shuffleB: sb } = parseCorrectAnswer(initialData.correctAnswer);
        setContent(initialData.content ?? "");
        setExplanation(initialData.explanation ?? "");
        setScorePerPair(sp);
        setShuffleB(sb);
        setPairs(
          initialData.options?.length >= 2
            ? initialData.options
            : [makeDefaultPair(), makeDefaultPair()]
        );
      } else {
        setContent("");
        setExplanation("");
        setScorePerPair(1);
        setShuffleB(false);
        setPairs([makeDefaultPair(), makeDefaultPair()]);
      }
    }
  }, [open, initialData]);

  // ─── Pair operations ────────────────────────────────────────────────────────

  function addPair() {
    setPairs(prev => [...prev, makeDefaultPair()]);
  }

  function removePair(id: string) {
    setPairs(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(p => p.id !== id);
    });
  }

  function updatePairText(
    id: string,
    side: "left" | "right",
    text: string
  ) {
    setPairs(prev =>
      prev.map(p =>
        p.id === id ? { ...p, [side]: { ...p[side], text } } : p
      )
    );
  }

  function updatePairImage(id: string, side: "left" | "right", imageUrl: string) {
    setPairs(prev =>
      prev.map(p =>
        p.id === id ? { ...p, [side]: { ...p[side], imageUrl } } : p
      )
    );
  }

  // ─── Image upload ────────────────────────────────────────────────────────────

  function triggerImageUpload(pairId: string, side: "left" | "right") {
    setPendingUpload({ pairId, side });
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload) return;
    const captured = pendingUpload;
    e.target.value = "";
    setPendingUpload(null);

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      const url = data.files?.[0]?.url;
      if (url) {
        updatePairImage(captured.pairId, captured.side, url);
      } else {
        throw new Error("No URL returned");
      }
    } catch {
      toast({ title: "Tải ảnh lên thất bại", variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  }

  // ─── Score per pair ──────────────────────────────────────────────────────────

  function handleScoreChange(raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) setScorePerPair(n);
    else if (raw === "") setScorePerPair(1);
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!content.trim()) {
      toast({ title: "Vui lòng nhập nội dung câu hỏi", variant: "destructive" });
      return;
    }
    if (pairs.length < 2) {
      toast({ title: "Cần ít nhất 2 cặp nối", variant: "destructive" });
      return;
    }
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      if (!p.left.text.trim() && !p.left.imageUrl) {
        toast({ title: `Cặp ${i + 1}: Cột A chưa có nội dung`, variant: "destructive" });
        return;
      }
      if (!p.right.text.trim() && !p.right.imageUrl) {
        toast({ title: `Cặp ${i + 1}: Cột B chưa có nội dung`, variant: "destructive" });
        return;
      }
    }

    const totalScore = pairs.length * scorePerPair;

    onSave({
      id: initialData?.id,
      type: "matching",
      title: "",
      content: content.trim(),
      options: pairs,
      correctAnswer: buildCorrectAnswer(scorePerPair, shuffleB),
      score: totalScore,
      difficulty: null,
      explanation: explanation.trim(),
      shuffleB,
      scorePerPair,
    });
  }

  function handleClose() {
    onClose();
  }

  const totalScore = pairs.length * scorePerPair;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <GitMerge className="w-4 h-4 text-muted-foreground" />
              {isEditing ? "Chỉnh sửa câu hỏi nối" : "Thêm câu hỏi - Dạng nối"}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-5">
            {/* ── Content ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Câu hỏi <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Nhập nội dung câu hỏi..."
                className="min-h-[80px] resize-none text-sm"
                data-testid="input-matching-content"
              />
            </div>

            {/* ── Pairs ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  📦 Danh sách cặp nối
                </p>
                <span className="text-xs text-muted-foreground">
                  {pairs.length} cặp · tổng {totalScore} điểm
                </span>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[1fr_28px_1fr_36px] gap-2 items-center px-1">
                <span className="text-xs font-semibold text-center text-muted-foreground">Cột A</span>
                <span />
                <span className="text-xs font-semibold text-center text-muted-foreground">Cột B</span>
                <span />
              </div>

              {/* Pair rows */}
              <div className="space-y-2">
                {pairs.map((pair, idx) => (
                  <div
                    key={pair.id}
                    className="rounded-lg border bg-muted/20 p-3"
                    data-testid={`pair-row-${idx}`}
                  >
                    <div className="grid grid-cols-[1fr_28px_1fr_36px] gap-2 items-start">
                      {/* Cột A */}
                      <div className="space-y-1">
                        <Input
                          value={pair.left.text}
                          onChange={e => updatePairText(pair.id, "left", e.target.value)}
                          placeholder={`A${idx + 1}. Nhập nội dung...`}
                          className="text-sm h-8"
                          data-testid={`input-pair-left-${idx}`}
                        />
                        <ImageSlot
                          imageUrl={pair.left.imageUrl}
                          onUpload={() => triggerImageUpload(pair.id, "left")}
                          onRemove={() => updatePairImage(pair.id, "left", "")}
                          testId={`img-pair-left-${idx}`}
                        />
                      </div>

                      {/* Arrow connector */}
                      <div className="flex items-start justify-center pt-2">
                        <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                      </div>

                      {/* Cột B */}
                      <div className="space-y-1">
                        <Input
                          value={pair.right.text}
                          onChange={e => updatePairText(pair.id, "right", e.target.value)}
                          placeholder={`B${idx + 1}. Nhập nội dung...`}
                          className="text-sm h-8"
                          data-testid={`input-pair-right-${idx}`}
                        />
                        <ImageSlot
                          imageUrl={pair.right.imageUrl}
                          onUpload={() => triggerImageUpload(pair.id, "right")}
                          onRemove={() => updatePairImage(pair.id, "right", "")}
                          testId={`img-pair-right-${idx}`}
                        />
                      </div>

                      {/* Delete */}
                      <div className="flex items-start justify-center pt-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-6 w-6 text-muted-foreground hover:text-destructive transition-opacity",
                            pairs.length <= 2 && "opacity-30 pointer-events-none"
                          )}
                          onClick={() => removePair(pair.id)}
                          data-testid={`btn-remove-pair-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs border-dashed"
                onClick={addPair}
                data-testid="btn-add-pair"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm cặp
              </Button>
            </div>

            {/* ── Settings ── */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                Cài đặt
              </p>

              <div className="flex flex-wrap gap-6 items-end">
                {/* Score per pair */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Điểm mỗi cặp</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={scorePerPair}
                      onChange={e => handleScoreChange(e.target.value)}
                      className="w-20 h-8 text-sm text-center"
                      data-testid="input-score-per-pair"
                    />
                    <span className="text-xs text-muted-foreground">
                      → tổng: <span className="font-medium text-foreground">{totalScore}</span> điểm
                    </span>
                  </div>
                </div>

                {/* Shuffle */}
                <div className="flex items-center gap-2">
                  <Switch
                    id="shuffle-b"
                    checked={shuffleB}
                    onCheckedChange={setShuffleB}
                    data-testid="switch-shuffle-b"
                  />
                  <Label htmlFor="shuffle-b" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Shuffle cột B khi làm bài
                  </Label>
                </div>
              </div>
            </div>

            {/* ── Explanation ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                Giải thích
              </Label>
              <Textarea
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder="Giải thích đáp án (không bắt buộc)..."
                className="min-h-[60px] resize-none text-sm"
                data-testid="input-matching-explanation"
              />
            </div>
          </div>

          <DialogFooter className="px-6 pb-5 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              data-testid="btn-matching-cancel"
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={uploadingImage}
              data-testid="btn-matching-save"
            >
              {uploadingImage ? "Đang tải ảnh..." : isEditing ? "Cập nhật" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
