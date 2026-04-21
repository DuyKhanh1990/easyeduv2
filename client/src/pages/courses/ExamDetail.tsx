import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, Info, Settings, Calendar, Save, BookOpen,
  Plus, Headphones, Mic, BookOpenCheck, PenLine, Database, FilePlus, FileUp, X,
  ChevronDown, CircleDot, CheckSquare, AlignLeft, GitMerge, Trash2,
  ImageIcon, Music, GripVertical, Pencil, SlidersHorizontal,
  FileText, Upload, Loader2, ExternalLink, Sparkles, BrainCircuit,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Exam, ExamSection, Question } from "@shared/schema";
import { SingleChoiceDialog, type SingleChoiceData } from "./dialogs/SingleChoiceDialog";
import { MultipleChoiceDialog, type MultipleChoiceData } from "./dialogs/MultipleChoiceDialog";
import { FillBlankDialog, type FillBlankData } from "./dialogs/FillBlankDialog";
import { MatchingDialog, type MatchingData } from "./dialogs/MatchingDialog";
import { EssayDialog, type EssayData } from "./dialogs/EssayDialog";
import { ImportQuestionsDialog } from "./dialogs/ImportQuestionsDialog";
import { PickFromBankDialog } from "./dialogs/PickFromBankDialog";
import { AIGenerateQuestionsDialog, type GeneratedQuestion } from "./dialogs/AIGenerateQuestionsDialog";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ExamWithUsers = Exam & { createdByName: string | null; updatedByName: string | null };

const SECTION_TYPES = [
  { value: "listening", label: "Nghe", icon: Headphones, color: "text-blue-600" },
  { value: "speaking",  label: "Nói",  icon: Mic,        color: "text-green-600" },
  { value: "reading",   label: "Đọc",  icon: BookOpenCheck, color: "text-orange-600" },
  { value: "writing",   label: "Viết", icon: PenLine,    color: "text-purple-600" },
];

const QUESTION_TYPES = [
  { value: "single-choice",   label: "Câu hỏi trắc nghiệm",       icon: CircleDot },
  { value: "multiple-choice", label: "Câu hỏi có nhiều lựa chọn", icon: CheckSquare },
  { value: "fill-blank",      label: "Câu hỏi điền vào chỗ trống",icon: PenLine },
  { value: "essay",           label: "Câu hỏi Tự luận",           icon: AlignLeft },
  { value: "matching",        label: "Câu hỏi nối",               icon: GitMerge },
];

const TYPE_LABEL_MAP: Record<string, string> = {
  single_choice:   "Trắc nghiệm",
  multiple_choice: "Nhiều lựa chọn",
  fill_blank:      "Điền chỗ trống",
  essay:           "Tự luận",
  matching:        "Câu hỏi nối",
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  single_choice:   "bg-blue-50 text-blue-700 border-blue-200",
  multiple_choice: "bg-purple-50 text-purple-700 border-purple-200",
  fill_blank:      "bg-orange-50 text-orange-700 border-orange-200",
  essay:           "bg-green-50 text-green-700 border-green-200",
  matching:        "bg-pink-50 text-pink-700 border-pink-200",
};

function renderFillBlankContent(content: string) {
  const parts = content.split(/(\{\d+\})/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (/^\{\d+\}$/.test(part)) {
          return (
            <span
              key={i}
              className="inline-block min-w-[60px] border-b-2 border-foreground/40 mx-1 text-center text-muted-foreground text-xs align-bottom pb-0.5"
            >
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function ExamQuestionCard({
  question, index, onRemove, onEdit, isRemoving,
}: {
  question: Question;
  index: number;
  onRemove: () => void;
  onEdit: () => void;
  isRemoving: boolean;
}) {
  const options = Array.isArray(question.options) ? (question.options as any[]) : [];
  const typeLabel = TYPE_LABEL_MAP[question.type] ?? question.type;
  const typeBadge = TYPE_BADGE_COLOR[question.type] ?? "bg-gray-50 text-gray-600 border-gray-200";

  let correctAnswers: string[] = [];
  if (question.type === "single_choice" && question.correctAnswer) {
    correctAnswers = [question.correctAnswer];
  } else if (question.type === "multiple_choice" && question.correctAnswer) {
    correctAnswers = question.correctAnswer.split(",").map((s: string) => s.trim());
  }

  return (
    <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden" data-testid={`card-question-${index}`}>
      {/* Card header */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Câu {index + 1}{question.title ? `: ${question.title}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold text-foreground">
              {question.score} đ
            </span>
            <span className={cn("text-[11px] px-2 py-0.5 rounded border font-medium whitespace-nowrap", typeBadge)}>
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-1 mt-1.5">
          <button
            className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
            title="Kéo để sắp xếp"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <button
            className="p-1 rounded text-muted-foreground hover:text-blue-600 transition-colors"
            onClick={onEdit}
            title="Sửa câu hỏi"
            data-testid={`btn-edit-question-${index}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
            onClick={onRemove}
            disabled={isRemoving}
            title="Xóa khỏi session"
            data-testid={`btn-remove-question-${index}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {question.mediaAudioUrl && (
            <span className="ml-1 flex items-center gap-1 text-[11px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
              <Music className="w-3 h-3" />Audio
            </span>
          )}
          {question.mediaImageUrl && (
            <span className="ml-1 flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
              <ImageIcon className="w-3 h-3" />Hình ảnh
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-5" />

      {/* Question body */}
      <div className="px-5 py-4 space-y-3">
        {/* Media preview */}
        {question.mediaImageUrl && (
          <img
            src={question.mediaImageUrl}
            alt="Question image"
            className="max-h-48 rounded border object-contain bg-muted"
          />
        )}

        {/* Question content */}
        <div className="text-sm text-foreground leading-relaxed">
          {question.type === "fill_blank"
            ? renderFillBlankContent(question.content)
            : question.content
          }
        </div>

        {/* Options: single / multiple choice */}
        {(question.type === "single_choice" || question.type === "multiple_choice") && options.length > 0 && (
          <div className="space-y-2 pt-1">
            {options.map((opt: { id: string; text: string; imageUrl?: string }, i: number) => {
              const isCorrect = correctAnswers.includes(opt.id);
              const isMultiple = question.type === "multiple_choice";
              return (
                <div
                  key={opt.id ?? i}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2 rounded-md border text-sm",
                    isCorrect
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-border bg-muted/20 text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center rounded-full border",
                    isCorrect ? "border-green-500 bg-green-500" : "border-muted-foreground/40",
                    isMultiple && "rounded"
                  )}>
                    {isCorrect && (
                      <div className={cn("w-2 h-2 rounded-full bg-white", isMultiple && "rounded-sm")} />
                    )}
                  </div>
                  <span className="font-medium shrink-0 text-muted-foreground">{opt.id}.</span>
                  <div className="flex-1 min-w-0">
                    {opt.text && <span>{opt.text}</span>}
                    {opt.imageUrl && (
                      <img src={opt.imageUrl} alt={`Option ${opt.id}`} className="mt-1 max-h-24 rounded border object-contain" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fill blank: show blank slots */}
        {question.type === "fill_blank" && options.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {options.map((blank: { id: string; answers: string[]; score: number }, i: number) => (
              <div key={blank.id ?? i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">Ô {blank.id}:</span>
                <span className="italic">{Array.isArray(blank.answers) ? blank.answers.join(" | ") : ""}</span>
                <span className="text-xs text-muted-foreground/60">({blank.score}đ)</span>
              </div>
            ))}
          </div>
        )}

        {/* Essay: show word limit */}
        {question.type === "essay" && question.correctAnswer && (() => {
          try {
            const parsed = JSON.parse(question.correctAnswer);
            return (
              <p className="text-xs text-muted-foreground italic">
                Tự luận — từ {parsed.minWords} đến {parsed.maxWords} từ
              </p>
            );
          } catch { return null; }
        })()}

        {/* Matching: show pairs */}
        {question.type === "matching" && options.length > 0 && (
          <div className="pt-1 space-y-1.5">
            {options.map((pair: { id: string; left: { text: string; imageUrl: string }; right: { text: string; imageUrl: string } }, i: number) => (
              <div key={pair.id ?? i} className="flex items-center gap-3 text-sm">
                <div className="flex-1 px-3 py-1.5 rounded border border-border bg-muted/20 min-w-0">
                  {pair.left?.text || <span className="italic text-muted-foreground text-xs">Hình ảnh</span>}
                </div>
                <span className="text-muted-foreground shrink-0">→</span>
                <div className="flex-1 px-3 py-1.5 rounded border border-border bg-blue-50/50 min-w-0">
                  {pair.right?.text || <span className="italic text-muted-foreground text-xs">Hình ảnh</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sortable item for right sidebar ──
function SortableQuestionItem({
  sq, index, isActive, onClick,
}: {
  sq: SectionQuestionRow;
  index: number;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sq.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const shortContent = sq.question.content.length > 60
    ? sq.question.content.slice(0, 60) + "..."
    : sq.question.content;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded-md border text-xs cursor-pointer transition-colors",
        isDragging ? "shadow-lg bg-white border-primary/30" : "bg-white border-border hover:border-primary/30 hover:bg-muted/20"
      )}
      onClick={onClick}
      data-testid={`sidebar-question-${index}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-foreground shrink-0">Câu {index + 1}:</span>
        </div>
        <p className="text-muted-foreground leading-relaxed line-clamp-2">{shortContent}</p>
      </div>
    </div>
  );
}

const examFormSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "Tên bài kiểm tra là bắt buộc"),
  status: z.enum(["draft", "published"]).default("draft"),
  description: z.string().optional(),
  timeLimitMinutes: z.coerce.number().min(1).optional().nullable(),
  maxAttempts: z.coerce.number().min(1).default(1),
  passingScore: z.coerce.number().min(0).optional().nullable(),
  showResult: z.boolean().default(false),
  openAt: z.string().optional().nullable(),
  closeAt: z.string().optional().nullable(),
});

const sectionFormSchema = z.object({
  name: z.string().min(1, "Tên session là bắt buộc"),
  type: z.enum(["listening", "speaking", "reading", "writing"], {
    required_error: "Vui lòng chọn loại bài",
  }),
});

type ExamFormValues = z.infer<typeof examFormSchema>;
type SectionFormValues = z.infer<typeof sectionFormSchema>;

type SectionQuestionRow = {
  id: string;
  sectionId: string;
  questionId: string;
  orderIndex: number;
  question: Question;
};

function toDatetimeLocal(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapDialogDataToApi(data: SingleChoiceData) {
  return {
    type: data.type,
    title: data.title || null,
    content: data.content,
    mediaImageUrl: data.media?.image_url || null,
    mediaAudioUrl: data.media?.audio_url || null,
    options: data.options,
    correctAnswer: data.correct_answer,
    score: String(data.score),
    difficulty: data.difficulty || null,
    explanation: data.explanation || null,
  };
}

function questionToSingleChoiceData(q: Question): SingleChoiceData {
  return {
    id: q.id,
    type: q.type as any,
    title: q.title ?? "",
    content: q.content,
    media: {
      image_url: q.mediaImageUrl ?? "",
      audio_url: q.mediaAudioUrl ?? "",
    },
    options: Array.isArray(q.options) ? (q.options as any[]) : [],
    correct_answer: q.correctAnswer ?? "",
    score: Number(q.score) || 1,
    difficulty: q.difficulty ?? "",
    explanation: q.explanation ?? "",
  };
}

function questionToFillBlankData(q: Question): FillBlankData {
  return {
    id: q.id,
    type: "fill_blank",
    title: q.title ?? "",
    content: q.content,
    options: Array.isArray(q.options) ? (q.options as any[]) : [],
    correct_answer: q.correctAnswer ?? "",
    score: Number(q.score) || 1,
    difficulty: q.difficulty ?? "",
    explanation: q.explanation ?? "",
  };
}

function questionToEssayData(q: Question) {
  let minWords = 50, maxWords = 500;
  try {
    const parsed = JSON.parse(q.correctAnswer ?? "{}");
    minWords = parsed.minWords ?? 50;
    maxWords = parsed.maxWords ?? 500;
  } catch {}
  return {
    id: q.id,
    type: "essay" as const,
    content: q.content,
    correctAnswer: q.correctAnswer ?? "",
    score: Number(q.score) || 5,
    minWords,
    maxWords,
    explanation: q.explanation ?? "",
  };
}

function questionToMatchingData(q: Question): MatchingData {
  let scorePerPair = 1, shuffleB = false;
  try {
    const parsed = JSON.parse(q.correctAnswer ?? "{}");
    scorePerPair = parsed.scorePerPair ?? 1;
    shuffleB = parsed.shuffleB ?? false;
  } catch {}
  return {
    id: q.id,
    type: "matching",
    content: q.content,
    options: Array.isArray(q.options) ? (q.options as any[]) : [],
    correctAnswer: q.correctAnswer ?? "",
    scorePerPair,
    shuffleB,
    score: Number(q.score) || 1,
    explanation: q.explanation ?? "",
  };
}

export function ExamDetail() {
  const [, params] = useRoute("/assessments/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const examId = params?.id ?? "";

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showSectionDialog, setShowSectionDialog] = useState(false);

  const [showPickFromBank, setShowPickFromBank] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [isAISaving, setIsAISaving] = useState(false);
  const [openDirectDialog, setOpenDirectDialog] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Local order for drag-and-drop sidebar
  const [localOrder, setLocalOrder] = useState<SectionQuestionRow[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: exam, isLoading } = useQuery<ExamWithUsers>({
    queryKey: ["/api/exams", examId],
    enabled: !!examId,
  });

  const { data: sections = [] } = useQuery<ExamSection[]>({
    queryKey: ["/api/exams", examId, "sections"],
    enabled: !!examId,
  });

  const { data: sectionQuestions = [], isLoading: sqLoading } = useQuery<SectionQuestionRow[]>({
    queryKey: ["/api/exam-sections", activeSection, "questions"],
    enabled: !!activeSection,
  });

  useEffect(() => {
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].id);
    }
  }, [sections]);

  useEffect(() => {
    setLocalOrder(sectionQuestions);
  }, [sectionQuestions]);

  // ── Exam CRUD ──
  const updateExamMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/exams/${examId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId] });
      setShowConfigDialog(false);
      toast({ title: "Đã lưu thay đổi" });
    },
    onError: (err: any) => {
      let msg = "Lỗi khi cập nhật bài kiểm tra";
      try { const body = JSON.parse(err?.message?.replace(/^\d+:\s*/, "")); if (body?.message) msg = body.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  // ── Section CRUD ──
  const createSectionMutation = useMutation({
    mutationFn: (data: SectionFormValues) =>
      apiRequest("POST", `/api/exams/${examId}/sections`, {
        ...data,
        orderIndex: sections.length,
      }).then(r => r.json()),
    onSuccess: (created: ExamSection) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "sections"] });
      setShowSectionDialog(false);
      sectionForm.reset();
      setActiveSection(created.id);
      toast({ title: "Đã thêm session" });
    },
    onError: () => {
      toast({ title: "Lỗi khi thêm session", variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/exams/${examId}/sections/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "sections"] });
      if (activeSection === deletedId) {
        const remaining = sections.filter(s => s.id !== deletedId);
        setActiveSection(remaining[0]?.id ?? null);
      }
      toast({ title: "Đã xóa session" });
    },
    onError: () => {
      toast({ title: "Lỗi khi xóa session", variant: "destructive" });
    },
  });

  // ── Section Question mutations ──
  const addToSectionMutation = useMutation({
    mutationFn: (questionIds: string[]) =>
      apiRequest("POST", `/api/exam-sections/${activeSection}/questions`, { questionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-sections", activeSection, "questions"] });
      toast({ title: "Đã thêm câu hỏi vào session" });
    },
    onError: () => {
      toast({ title: "Lỗi khi thêm câu hỏi", variant: "destructive" });
    },
  });

  const removeFromSectionMutation = useMutation({
    mutationFn: (questionId: string) =>
      apiRequest("DELETE", `/api/exam-sections/${activeSection}/questions/${questionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-sections", activeSection, "questions"] });
      toast({ title: "Đã xóa câu hỏi khỏi session" });
    },
    onError: () => {
      toast({ title: "Lỗi khi xóa câu hỏi", variant: "destructive" });
    },
  });

  const createQuestionAndAddMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/questions", payload);
      const created: Question = await res.json();
      await apiRequest("POST", `/api/exam-sections/${activeSection}/questions`, { questionIds: [created.id] });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exam-sections", activeSection, "questions"] });
      toast({ title: "Đã thêm câu hỏi vào section" });
      setOpenDirectDialog(null);
    },
    onError: () => {
      toast({ title: "Lỗi khi thêm câu hỏi", variant: "destructive" });
    },
  });

  // ── Session file attachments ──
  const [uploadingVisual, setUploadingVisual] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const updateSectionMediaMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest("PUT", `/api/exams/${examId}/sections/${activeSection}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "sections"] });
      toast({ title: "Đã lưu file đính kèm" });
    },
    onError: () => {
      toast({ title: "Lỗi khi lưu file đính kèm", variant: "destructive" });
    },
  });

  const toggleAIGradingMutation = useMutation({
    mutationFn: ({ sectionId, enabled }: { sectionId: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/exams/${examId}/sections/${sectionId}`, { aiGradingEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "sections"] });
    },
    onError: () => {
      toast({ title: "Lỗi khi cập nhật chế độ chấm AI", variant: "destructive" });
    },
  });

  async function handleVisualFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo",
    ];
    const allowedExts = /\.(pdf|docx|doc|mp4|webm|ogg|mov|avi|mkv)$/i;
    if (!allowedTypes.includes(file.type) && !allowedExts.test(file.name)) {
      toast({ title: "Chỉ hỗ trợ PDF, Word (.docx, .doc) hoặc video (mp4, webm...)", variant: "destructive" });
      return;
    }
    setUploadingVisual(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      const uploaded = data.files?.[0];
      if (!uploaded) throw new Error("Upload failed");
      updateSectionMediaMutation.mutate({
        readingPassageUrl: uploaded.url,
        readingPassageName: file.name,
      });
    } catch {
      toast({ title: "Lỗi khi tải file lên", variant: "destructive" });
    } finally {
      setUploadingVisual(false);
      e.target.value = "";
    }
  }

  async function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a"];
    const allowedExts = /\.(mp3|wav|ogg|aac|m4a|flac)$/i;
    if (!allowedTypes.includes(file.type) && !allowedExts.test(file.name)) {
      toast({ title: "Chỉ hỗ trợ file âm thanh (mp3, wav, ogg, aac...)", variant: "destructive" });
      return;
    }
    setUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      const uploaded = data.files?.[0];
      if (!uploaded) throw new Error("Upload failed");
      updateSectionMediaMutation.mutate({
        sessionAudioUrl: uploaded.url,
        sessionAudioName: file.name,
      });
    } catch {
      toast({ title: "Lỗi khi tải file âm thanh", variant: "destructive" });
    } finally {
      setUploadingAudio(false);
      e.target.value = "";
    }
  }

  function handleRemoveVisualFile() {
    updateSectionMediaMutation.mutate({ readingPassageUrl: "", readingPassageName: "" });
  }

  function handleRemoveAudioFile() {
    updateSectionMediaMutation.mutate({ sessionAudioUrl: "", sessionAudioName: "" });
  }

  // ── Update existing question mutation ──
  const updateQuestionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiRequest("PUT", `/api/questions/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exam-sections", activeSection, "questions"] });
      toast({ title: "Đã cập nhật câu hỏi" });
      setEditingQuestion(null);
    },
    onError: () => {
      toast({ title: "Lỗi khi cập nhật câu hỏi", variant: "destructive" });
    },
  });

  // ── Exam form ──
  const examForm = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      code: "", name: "", status: "draft", description: "",
      timeLimitMinutes: null, maxAttempts: 1, passingScore: null,
      showResult: false, openAt: null, closeAt: null,
    },
  });

  useEffect(() => {
    if (exam) {
      examForm.reset({
        code: exam.code ?? "",
        name: exam.name,
        status: (exam.status as "draft" | "published") ?? "draft",
        description: exam.description ?? "",
        timeLimitMinutes: exam.timeLimitMinutes ?? null,
        maxAttempts: exam.maxAttempts ?? 1,
        passingScore: exam.passingScore ? Number(exam.passingScore) : null,
        showResult: exam.showResult ?? false,
        openAt: toDatetimeLocal(exam.openAt),
        closeAt: toDatetimeLocal(exam.closeAt),
      });
    }
  }, [exam]);

  const sectionForm = useForm<SectionFormValues>({
    resolver: zodResolver(sectionFormSchema),
    defaultValues: { name: "", type: "listening" },
  });

  function handleExamSubmit(values: ExamFormValues) {
    const payload = {
      ...values,
      openAt: values.openAt ? new Date(values.openAt).toISOString() : null,
      closeAt: values.closeAt ? new Date(values.closeAt).toISOString() : null,
      timeLimitMinutes: values.timeLimitMinutes ?? null,
      passingScore: values.passingScore != null ? String(values.passingScore) : null,
    };
    updateExamMutation.mutate(payload);
  }

  function handleSectionSubmit(values: SectionFormValues) {
    createSectionMutation.mutate(values);
  }

  function handlePickFromBank(questionIds: string[]) {
    if (!activeSection) return;
    addToSectionMutation.mutate(questionIds, {
      onSuccess: () => setShowPickFromBank(false),
    });
  }

  async function handleAISave(generatedQuestions: GeneratedQuestion[]) {
    if (!activeSection) return;
    setIsAISaving(true);
    try {
      const createdIds: string[] = [];
      for (const q of generatedQuestions) {
        const res = await apiRequest("POST", "/api/questions", {
          type: q.type,
          title: q.title ?? null,
          content: q.content,
          options: q.options ?? null,
          correctAnswer: q.correctAnswer ?? null,
          score: String(q.score ?? 1),
          difficulty: q.difficulty ?? null,
          explanation: q.explanation ?? null,
          mediaUrl: null,
          mediaType: null,
        });
        const created = await res.json();
        if (created?.id) createdIds.push(created.id);
      }
      if (createdIds.length > 0) {
        await apiRequest("POST", `/api/exam-sections/${activeSection}/questions`, { questionIds: createdIds });
        queryClient.invalidateQueries({ queryKey: ["/api/exam-sections", activeSection, "questions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      }
      toast({ title: `Đã thêm ${createdIds.length} câu hỏi AI vào session` });
      setShowAIDialog(false);
    } catch {
      toast({ title: "Lỗi khi lưu câu hỏi AI", variant: "destructive" });
    } finally {
      setIsAISaving(false);
    }
  }

  function handleSaveDirectQuestion(data: SingleChoiceData) {
    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, payload: mapDialogDataToApi(data) });
    } else {
      createQuestionAndAddMutation.mutate(mapDialogDataToApi(data));
    }
  }

  function handleSaveFillBlank(data: FillBlankData) {
    const payload = {
      type: data.type, title: data.title || null, content: data.content,
      mediaImageUrl: null, mediaAudioUrl: null,
      options: data.options, correctAnswer: data.correct_answer,
      score: String(data.score), difficulty: data.difficulty || null,
      explanation: data.explanation || null,
    };
    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, payload });
    } else {
      createQuestionAndAddMutation.mutate(payload);
    }
  }

  function handleSaveEssay(data: EssayData) {
    const payload = {
      type: data.type, title: null, content: data.content,
      mediaImageUrl: null, mediaAudioUrl: null, options: [],
      correctAnswer: JSON.stringify({ minWords: data.minWords, maxWords: data.maxWords }),
      score: String(data.score), difficulty: null,
      explanation: data.rubric || null,
    };
    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, payload });
    } else {
      createQuestionAndAddMutation.mutate(payload);
    }
  }

  function handleSaveMatching(data: MatchingData) {
    const payload = {
      type: data.type, title: null, content: data.content,
      mediaImageUrl: null, mediaAudioUrl: null, options: data.options,
      correctAnswer: JSON.stringify({
        scorePerPair: data.scorePerPair,
        shuffleB: data.shuffleB ?? false,
      }),
      score: String(data.score), difficulty: null, explanation: null,
    };
    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, payload });
    } else {
      createQuestionAndAddMutation.mutate(payload);
    }
  }

  function handleQuestionsImported(questionIds: string[]) {
    if (!activeSection || !questionIds.length) return;
    addToSectionMutation.mutate(questionIds);
  }

  function handleEditQuestion(question: Question) {
    setEditingQuestion(question);
    const typeMap: Record<string, string> = {
      single_choice: "single-choice",
      multiple_choice: "multiple-choice",
      fill_blank: "fill-blank",
      essay: "essay",
      matching: "matching",
    };
    setOpenDirectDialog(typeMap[question.type] ?? null);
  }

  // ── Drag-and-drop for sidebar ──
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder(items => {
      const oldIndex = items.findIndex(i => i.id === active.id);
      const newIndex = items.findIndex(i => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }, []);

  const activeS = sections.find(s => s.id === activeSection) ?? null;
  const activeSectionType = SECTION_TYPES.find(t => t.value === activeS?.type);
  const alreadyAddedIds = new Set(sectionQuestions.map(sq => sq.questionId));

  // Determine which dialog's initialData to pass
  const editingType = editingQuestion ? (() => {
    const m: Record<string, string> = { single_choice: "single-choice", multiple_choice: "multiple-choice", fill_blank: "fill-blank", essay: "essay", matching: "matching" };
    return m[editingQuestion.type] ?? null;
  })() : null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Đang tải...</div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground text-sm">
          <p>Không tìm thấy bài kiểm tra.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/assessments")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />Quay lại
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] overflow-hidden">

        {/* ── Center: Question area ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-muted/30 min-w-0">

          <div className="px-6 py-3 border-b bg-background flex items-center gap-3">
            <button
              onClick={() => navigate("/assessments")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              data-testid="btn-back-assessments"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Danh sách
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{exam.name}</h3>
              <Badge variant={exam.status === "published" ? "default" : "secondary"} className="text-xs shrink-0">
                {exam.status === "published" ? "Công bố" : "Nháp"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5 text-xs h-8"
                onClick={() => setShowConfigDialog(true)}
                data-testid="btn-config-exam"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Cấu hình
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5 text-xs h-8"
                onClick={() => setShowSectionDialog(true)}
                data-testid="btn-add-section"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm session
              </Button>
            </div>
          </div>

          {sections.length > 0 && (
            <div className="px-6 py-2 border-b bg-background flex items-center gap-2 flex-wrap">
              {sections.map((s) => {
                const typeInfo = SECTION_TYPES.find(t => t.value === s.type);
                const Icon = typeInfo?.icon ?? BookOpen;
                const isActive = activeSection === s.id;
                return (
                  <div key={s.id} className="relative group">
                    <button
                      onClick={() => setActiveSection(s.id)}
                      data-testid={`btn-section-${s.id}`}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all pr-7",
                        isActive
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5", isActive ? "" : typeInfo?.color)} />
                      {s.name}
                      <span className={cn("text-[10px] opacity-70")}>
                        · {typeInfo?.label}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSectionMutation.mutate(s.id); }}
                      className={cn(
                        "absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center transition-opacity",
                        isActive ? "opacity-70 hover:opacity-100 text-primary-foreground" : "opacity-0 group-hover:opacity-60 hover:opacity-100 text-muted-foreground"
                      )}
                      data-testid={`btn-delete-section-${s.id}`}
                      title="Xóa session"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <BookOpen className="w-10 h-10 opacity-20" />
                <p className="text-sm">Chưa có session nào. Nhấn <strong>Thêm session</strong> để bắt đầu.</p>
              </div>
            ) : activeS ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  {activeSectionType && (
                    <activeSectionType.icon className={cn("w-4 h-4", activeSectionType.color)} />
                  )}
                  <h4 className="text-sm font-semibold">{activeS.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {activeSectionType?.label}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 h-9 text-xs"
                    onClick={() => setShowPickFromBank(true)}
                    data-testid="btn-pick-from-bank"
                  >
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    Chọn từ ngân hàng câu hỏi
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 h-9 text-xs"
                        data-testid="btn-add-question-direct"
                      >
                        <FilePlus className="w-3.5 h-3.5 text-green-500" />
                        Thêm câu hỏi trực tiếp
                        <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {QUESTION_TYPES.map(qt => (
                        <DropdownMenuItem
                          key={qt.value}
                          onClick={() => { setEditingQuestion(null); setOpenDirectDialog(qt.value); }}
                          data-testid={`menu-direct-${qt.value}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <qt.icon className="w-4 h-4 text-muted-foreground" />
                          {qt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 h-9 text-xs"
                    onClick={() => setShowImportDialog(true)}
                    data-testid="btn-import-questions"
                  >
                    <FileUp className="w-3.5 h-3.5 text-orange-500" />
                    Import file mẫu
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 h-9 text-xs border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                    onClick={() => setShowAIDialog(true)}
                    data-testid="btn-ai-generate-section"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    Tạo bằng AI
                  </Button>

                  <div
                    className={cn(
                      "flex items-center gap-2 h-9 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer select-none",
                      activeS.aiGradingEnabled
                        ? "border-green-300 bg-green-50 text-green-700"
                        : "border-border bg-background text-muted-foreground hover:border-green-300 hover:text-green-700 hover:bg-green-50"
                    )}
                    onClick={() => activeSection && toggleAIGradingMutation.mutate({
                      sectionId: activeSection,
                      enabled: !activeS.aiGradingEnabled,
                    })}
                    data-testid="btn-toggle-ai-grading"
                    title={activeS.aiGradingEnabled ? "Đang bật AI chấm tự luận. Nhấn để tắt." : "Bật AI chấm tự luận tự động"}
                  >
                    <BrainCircuit className={cn("w-3.5 h-3.5", activeS.aiGradingEnabled ? "text-green-600" : "text-muted-foreground")} />
                    <span>Chấm tự luận AI</span>
                    <Switch
                      checked={!!activeS.aiGradingEnabled}
                      onCheckedChange={() => {}}
                      className="pointer-events-none h-4 w-7"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {/* Visual file attachment (PDF/Word/Video) */}
                    {activeS.readingPassageUrl ? (
                      <div className="flex items-center gap-1.5 h-9 px-2.5 border rounded-md bg-orange-50 border-orange-200 text-xs text-orange-700">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <a
                          href={activeS.readingPassageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-[120px] truncate hover:underline"
                          title={activeS.readingPassageName || "File bài"}
                        >
                          {activeS.readingPassageName || "File bài"}
                        </a>
                        <button
                          onClick={handleRemoveVisualFile}
                          disabled={updateSectionMediaMutation.isPending}
                          className="text-orange-400 hover:text-destructive transition-colors"
                          data-testid="btn-remove-visual-file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex items-center gap-1.5 h-9 px-2.5 border rounded-md text-xs cursor-pointer transition-colors",
                          uploadingVisual
                            ? "opacity-60 pointer-events-none border-border text-muted-foreground"
                            : "border-border text-muted-foreground hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50"
                        )}
                        title="Đính kèm PDF, Word hoặc Video"
                        data-testid="label-visual-file"
                      >
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.mp4,.webm,.mov,.avi,.mkv"
                          className="hidden"
                          onChange={handleVisualFileChange}
                          data-testid="input-visual-file"
                        />
                        {uploadingVisual
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <FileText className="w-3.5 h-3.5" />
                        }
                        {uploadingVisual ? "Đang tải..." : "Đính kèm bài"}
                      </label>
                    )}

                    {/* Audio file attachment */}
                    {activeS.sessionAudioUrl ? (
                      <div className="flex items-center gap-1.5 h-9 px-2.5 border rounded-md bg-purple-50 border-purple-200 text-xs text-purple-700">
                        <Music className="w-3.5 h-3.5 shrink-0" />
                        <a
                          href={activeS.sessionAudioUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-[120px] truncate hover:underline"
                          title={activeS.sessionAudioName || "File nghe"}
                        >
                          {activeS.sessionAudioName || "File nghe"}
                        </a>
                        <button
                          onClick={handleRemoveAudioFile}
                          disabled={updateSectionMediaMutation.isPending}
                          className="text-purple-400 hover:text-destructive transition-colors"
                          data-testid="btn-remove-audio-file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex items-center gap-1.5 h-9 px-2.5 border rounded-md text-xs cursor-pointer transition-colors",
                          uploadingAudio
                            ? "opacity-60 pointer-events-none border-border text-muted-foreground"
                            : "border-border text-muted-foreground hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50"
                        )}
                        title="Đính kèm file âm thanh (mp3, wav...)"
                        data-testid="label-audio-file"
                      >
                        <input
                          type="file"
                          accept=".mp3,.wav,.ogg,.aac,.m4a,.flac"
                          className="hidden"
                          onChange={handleAudioFileChange}
                          data-testid="input-audio-file"
                        />
                        {uploadingAudio
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Music className="w-3.5 h-3.5" />
                        }
                        {uploadingAudio ? "Đang tải..." : "File nghe"}
                      </label>
                    )}
                  </div>
                </div>

                {sqLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Đang tải...</div>
                ) : localOrder.length === 0 ? (
                  <div className="border rounded-lg bg-background flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <BookOpen className="w-8 h-8 opacity-20" />
                    <p className="text-sm">Chưa có câu hỏi nào trong session này</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {localOrder.map((sq, idx) => (
                      <ExamQuestionCard
                        key={sq.id}
                        question={sq.question}
                        index={idx}
                        onRemove={() => removeFromSectionMutation.mutate(sq.question.id)}
                        onEdit={() => handleEditQuestion(sq.question)}
                        isRemoving={removeFromSectionMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>

        {/* ── Right sidebar: Question list (25%) ── */}
        <aside className="w-[25%] min-w-[200px] max-w-[280px] border-l flex flex-col bg-background overflow-hidden">
          <div className="px-4 py-3 border-b sticky top-0 bg-background z-10">
            <h4 className="text-sm font-semibold text-foreground">Danh sách câu hỏi</h4>
            {localOrder.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">{localOrder.length} câu hỏi · Kéo để sắp xếp</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {sqLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Đang tải...</div>
            ) : localOrder.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                <BookOpen className="w-6 h-6 opacity-20" />
                <p className="text-xs text-center">Chưa có câu hỏi nào</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localOrder.map(sq => sq.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {localOrder.map((sq, idx) => (
                      <SortableQuestionItem
                        key={sq.id}
                        sq={sq}
                        index={idx}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </aside>
      </div>

      {/* ── Config Dialog ── */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Cấu hình bài kiểm tra
            </DialogTitle>
          </DialogHeader>
          <Form {...examForm}>
            <form onSubmit={examForm.handleSubmit(handleExamSubmit)} className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Info className="w-3.5 h-3.5" />Thông tin chung
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={examForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Mã bài kiểm tra</FormLabel>
                      <FormControl>
                        <Input placeholder="VD: EXAM-001" className="h-8 text-sm" data-testid="input-exam-code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={examForm.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Trạng thái</FormLabel>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-3 pt-1">
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="draft" id="cfg-status-draft" data-testid="radio-draft" />
                            <label htmlFor="cfg-status-draft" className="text-xs cursor-pointer">Nháp</label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="published" id="cfg-status-published" data-testid="radio-published" />
                            <label htmlFor="cfg-status-published" className="text-xs cursor-pointer">Công bố</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={examForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Tên bài kiểm tra <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên..." className="h-8 text-sm" data-testid="input-exam-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={examForm.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Mô tả</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Mô tả bài kiểm tra..." className="text-sm resize-none min-h-[60px]" data-testid="input-exam-description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                  <Settings className="w-3.5 h-3.5" />Cài đặt
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={examForm.control} name="timeLimitMinutes" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Thời gian (phút)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} placeholder="Không giới hạn" className="h-8 text-sm" data-testid="input-exam-time-limit" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={examForm.control} name="maxAttempts" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Số lần làm tối đa</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} className="h-8 text-sm" data-testid="input-exam-max-attempts" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={examForm.control} name="passingScore" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Điểm đạt</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder="Không đặt" className="h-8 text-sm" data-testid="input-exam-passing-score" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={examForm.control} name="showResult" render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} id="cfg-show-result" data-testid="checkbox-show-result" />
                      </FormControl>
                      <label htmlFor="cfg-show-result" className="text-xs cursor-pointer text-muted-foreground">
                        Cho phép học viên xem kết quả sau khi nộp bài
                      </label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                  <Calendar className="w-3.5 h-3.5" />Thời gian
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={examForm.control} name="openAt" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Thời gian mở</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" className="h-8 text-sm" data-testid="input-exam-open-at" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={examForm.control} name="closeAt" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Thời gian đóng</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" className="h-8 text-sm" data-testid="input-exam-close-at" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowConfigDialog(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={updateExamMutation.isPending} data-testid="btn-save-exam">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {updateExamMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Add Section Dialog ── */}
      <Dialog open={showSectionDialog} onOpenChange={(o) => { if (!o) { setShowSectionDialog(false); sectionForm.reset(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm session mới</DialogTitle>
          </DialogHeader>
          <Form {...sectionForm}>
            <form onSubmit={sectionForm.handleSubmit(handleSectionSubmit)} className="space-y-4">
              <FormField control={sectionForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên session</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Section 1 - Listening" data-testid="input-section-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={sectionForm.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại bài</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-section-type">
                        <SelectValue placeholder="Chọn loại bài..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SECTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <t.icon className={cn("w-3.5 h-3.5", t.color)} />
                            {t.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowSectionDialog(false); sectionForm.reset(); }} data-testid="btn-cancel-section">
                  Hủy
                </Button>
                <Button type="submit" disabled={createSectionMutation.isPending} data-testid="btn-save-section">
                  {createSectionMutation.isPending ? "Đang lưu..." : "Thêm session"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Pick From Bank Dialog ── */}
      <PickFromBankDialog
        open={showPickFromBank}
        onClose={() => setShowPickFromBank(false)}
        onConfirm={handlePickFromBank}
        alreadyAddedIds={alreadyAddedIds}
        isSaving={addToSectionMutation.isPending}
      />

      {/* ── Import File Dialog ── */}
      <ImportQuestionsDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onQuestionsImported={handleQuestionsImported}
      />

      {/* ── AI Generate Questions Dialog ── */}
      <AIGenerateQuestionsDialog
        open={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onSave={handleAISave}
        isSaving={isAISaving}
        mode="section"
      />

      {/* ── Direct Question Dialogs (create & edit) ── */}
      <SingleChoiceDialog
        open={openDirectDialog === "single-choice"}
        onClose={() => { setOpenDirectDialog(null); setEditingQuestion(null); }}
        onSave={handleSaveDirectQuestion}
        initialData={editingQuestion && editingType === "single-choice" ? questionToSingleChoiceData(editingQuestion) : null}
      />
      <MultipleChoiceDialog
        open={openDirectDialog === "multiple-choice"}
        onClose={() => { setOpenDirectDialog(null); setEditingQuestion(null); }}
        onSave={handleSaveDirectQuestion}
        initialData={editingQuestion && editingType === "multiple-choice" ? questionToSingleChoiceData(editingQuestion) : null}
      />
      <FillBlankDialog
        open={openDirectDialog === "fill-blank"}
        onClose={() => { setOpenDirectDialog(null); setEditingQuestion(null); }}
        onSave={handleSaveFillBlank}
        initialData={editingQuestion && editingType === "fill-blank" ? questionToFillBlankData(editingQuestion) : null}
      />
      <EssayDialog
        open={openDirectDialog === "essay"}
        onClose={() => { setOpenDirectDialog(null); setEditingQuestion(null); }}
        onSave={handleSaveEssay}
        initialData={editingQuestion && editingType === "essay" ? questionToEssayData(editingQuestion) : undefined}
      />
      <MatchingDialog
        open={openDirectDialog === "matching"}
        onClose={() => { setOpenDirectDialog(null); setEditingQuestion(null); }}
        onSave={handleSaveMatching}
        initialData={editingQuestion && editingType === "matching" ? questionToMatchingData(editingQuestion) : null}
      />
    </DashboardLayout>
  );
}
