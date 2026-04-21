import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  BookMarked,
  ClipboardList,
  Plus,
  ChevronDown,
  CircleDot,
  CheckSquare,
  PenLine,
  AlignLeft,
  GitMerge,
  Pencil,
  Trash2,
  ImageIcon,
  Music,
  Upload,
  Eye,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  BrainCircuit,
  ThumbsUp,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/customers/SearchableMultiSelect";
import { Search } from "lucide-react";
import { SingleChoiceDialog, type SingleChoiceData } from "./dialogs/SingleChoiceDialog";
import { MultipleChoiceDialog, type MultipleChoiceData } from "./dialogs/MultipleChoiceDialog";
import { FillBlankDialog, type FillBlankData } from "./dialogs/FillBlankDialog";
import { MatchingDialog, type MatchingData } from "./dialogs/MatchingDialog";
import { EssayDialog, type EssayData } from "./dialogs/EssayDialog";
import { ImportQuestionsDialog } from "./dialogs/ImportQuestionsDialog";
import { ExamFormDialog } from "./dialogs/ExamFormDialog";
import { ExamTakingDialog } from "./dialogs/ExamTakingDialog";
import { AIGenerateQuestionsDialog, type GeneratedQuestion } from "./dialogs/AIGenerateQuestionsDialog";
import type { Question, Exam, ExamSubmission } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type ExamWithUsers = Exam & { createdByName: string | null; updatedByName: string | null };

const PAGE_SIZE_OPTIONS = [20, 30, 50];

function PaginationBar({ total, page, pageSize, onPageChange, onPageSizeChange }: {
  total: number; page: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t text-sm text-muted-foreground bg-muted/20">
      <div className="flex items-center gap-2">
        <span>Hiển thị</span>
        <select
          value={pageSize}
          onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          className="border rounded px-1.5 py-0.5 text-xs text-foreground bg-background focus:outline-none"
        >
          {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>trên tổng {total}</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</Button>
        <span className="px-2">{page} / {totalPages}</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</Button>
      </div>
    </div>
  );
}

const ASSESSMENTS_HREF = "/assessments";
const ASSESSMENTS_TABS = [
  { value: "list", label: "Danh sách Bài kiểm tra", icon: FileText },
  { value: "question-bank", label: "Ngân hàng câu hỏi", icon: BookMarked },
  { value: "results", label: "Kết quả bài làm", icon: ClipboardList },
];

const QUESTION_TYPES = [
  { value: "single-choice", label: "Câu hỏi trắc nghiệm", icon: CircleDot },
  { value: "multiple-choice", label: "Câu hỏi có nhiều lựa chọn", icon: CheckSquare },
  { value: "fill-blank", label: "Câu hỏi điền vào chỗ trống", icon: PenLine },
  { value: "essay", label: "Câu hỏi Tự luận", icon: AlignLeft },
  { value: "matching", label: "Câu hỏi nối", icon: GitMerge },
];

const TYPE_LABEL_MAP: Record<string, string> = {
  single_choice: "Trắc nghiệm",
  multiple_choice: "Nhiều lựa chọn",
  fill_blank: "Điền chỗ trống",
  essay: "Tự luận",
  matching: "Câu hỏi nối",
};

const TYPE_COLOR_MAP: Record<string, string> = {
  single_choice: "#3b82f6",
  multiple_choice: "#8b5cf6",
  fill_blank: "#f97316",
  essay: "#22c55e",
  matching: "#ec4899",
};

export default function Assessments() {
  const { isSubTabVisible } = useSidebarVisibility();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const visibleTabs = ASSESSMENTS_TABS.filter(t =>
    isSubTabVisible(ASSESSMENTS_HREF, t.value)
  );
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.value || "list");
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [isAISaving, setIsAISaving] = useState(false);
  const [showExamDialog, setShowExamDialog] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamWithUsers | null>(null);
  const [previewExam, setPreviewExam] = useState<ExamWithUsers | null>(null);

  type SubmissionWithDetails = ExamSubmission & {
    examName: string | null;
    examCode: string | null;
    examPassingScore: string | null;
    className: string | null;
    classCode: string | null;
    hasAIGrading: boolean;
  };
  const [viewingSubmission, setViewingSubmission] = useState<{ sub: SubmissionWithDetails; exam: ExamWithUsers } | null>(null);
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editingScoreVal, setEditingScoreVal] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentVal, setEditingCommentVal] = useState("");
  const [aiReviewSub, setAIReviewSub] = useState<SubmissionWithDetails | null>(null);
  const [triggeringAIIds, setTriggeringAIIds] = useState<Set<string>>(new Set());
  const autoTriggeredRef = useRef<Set<string>>(new Set());

  const [examsPage, setExamsPage] = useState(1);
  const [examsPageSize, setExamsPageSize] = useState(20);
  const [questionsPage, setQuestionsPage] = useState(1);
  const [questionsPageSize, setQuestionsPageSize] = useState(20);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>("all");
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsPageSize, setSubmissionsPageSize] = useState(20);

  const [examSearch, setExamSearch] = useState("");
  const [examStatusFilter, setExamStatusFilter] = useState("all");
  const [examCreatorFilter, setExamCreatorFilter] = useState("all");
  const [examUpdatedFrom, setExamUpdatedFrom] = useState("");
  const [examUpdatedTo, setExamUpdatedTo] = useState("");

  const [subExamIds, setSubExamIds] = useState<string[]>([]);
  const [subStudentIds, setSubStudentIds] = useState<string[]>([]);
  const [subClassIds, setSubClassIds] = useState<string[]>([]);
  const [subDateFrom, setSubDateFrom] = useState("");
  const [subDateTo, setSubDateTo] = useState("");

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  const filteredQuestions = questionTypeFilter === "all"
    ? questions
    : questions.filter(q => q.type === questionTypeFilter);

  const { data: exams = [], isLoading: examsLoading } = useQuery<ExamWithUsers[]>({
    queryKey: ["/api/exams"],
  });

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<SubmissionWithDetails[]>({
    queryKey: ["/api/exam-submissions"],
  });

  const examCreatorOptions = useMemo(() => {
    const seen = new Set<string>();
    return exams
      .filter(e => e.createdByName && !seen.has(e.createdByName) && seen.add(e.createdByName))
      .map(e => e.createdByName as string);
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter(exam => {
      if (examSearch) {
        const kw = examSearch.toLowerCase();
        if (!exam.name.toLowerCase().includes(kw) && !(exam.code || "").toLowerCase().includes(kw)) return false;
      }
      if (examStatusFilter !== "all" && exam.status !== examStatusFilter) return false;
      if (examCreatorFilter !== "all" && exam.createdByName !== examCreatorFilter) return false;
      if (examUpdatedFrom && new Date(exam.updatedAt) < new Date(examUpdatedFrom)) return false;
      if (examUpdatedTo && new Date(exam.updatedAt) > new Date(examUpdatedTo + "T23:59:59")) return false;
      return true;
    });
  }, [exams, examSearch, examStatusFilter, examCreatorFilter, examUpdatedFrom, examUpdatedTo]);

  const submissionExamOptions = useMemo(() => {
    const seen = new Set<string>();
    return submissions
      .filter(s => s.examId && s.examName && !seen.has(s.examId) && seen.add(s.examId))
      .map(s => ({ id: s.examId, name: s.examName! }));
  }, [submissions]);

  const submissionStudentOptions = useMemo(() => {
    const seen = new Set<string>();
    return submissions
      .filter(s => {
        const key = s.studentId || s.studentName || "";
        return key && s.studentName && !seen.has(key) && seen.add(key);
      })
      .map(s => ({ id: s.studentId || s.studentName || "", name: s.studentName || "" }));
  }, [submissions]);

  const submissionClassOptions = useMemo(() => {
    const seen = new Set<string>();
    return submissions
      .filter(s => s.className && !seen.has(s.className) && seen.add(s.className))
      .map(s => ({ id: s.className!, name: s.className! }));
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      if (subExamIds.length > 0 && !subExamIds.includes(sub.examId)) return false;
      const studentKey = sub.studentId || sub.studentName || "";
      if (subStudentIds.length > 0 && !subStudentIds.includes(studentKey)) return false;
      if (subClassIds.length > 0 && (!sub.className || !subClassIds.includes(sub.className))) return false;
      if (subDateFrom && sub.submittedAt && new Date(sub.submittedAt) < new Date(subDateFrom)) return false;
      if (subDateTo && sub.submittedAt && new Date(sub.submittedAt) > new Date(subDateTo + "T23:59:59")) return false;
      return true;
    });
  }, [submissions, subExamIds, subStudentIds, subClassIds, subDateFrom, subDateTo]);

  useEffect(() => {
    if (submissionsLoading || submissions.length === 0) return;
    const ungraded = submissions.filter(sub => {
      return sub.hasAIGrading && sub.aiGradingResults == null && !autoTriggeredRef.current.has(sub.id);
    });
    if (ungraded.length === 0) return;
    ungraded.forEach(sub => {
      autoTriggeredRef.current.add(sub.id);
      setTriggeringAIIds(prev => new Set([...prev, sub.id]));
      apiRequest("POST", `/api/ai/grade-submission/${sub.id}`).catch(() => {}).finally(() => {
        setTriggeringAIIds(prev => { const s = new Set(prev); s.delete(sub.id); return s; });
      });
    });
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
    }, 5000);
    return () => clearTimeout(timer);
  }, [submissions, submissionsLoading]);

  const updateSubmissionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { adjustedScore?: string | null; comment?: string | null } }) =>
      apiRequest("PATCH", `/api/exam-submissions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
      toast({ title: "Đã cập nhật" });
      setEditingScoreId(null);
      setEditingCommentId(null);
    },
    onError: () => toast({ title: "Lỗi cập nhật", variant: "destructive" }),
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/exam-submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
      toast({ title: "Đã xóa bài làm" });
    },
    onError: () => toast({ title: "Lỗi xóa bài làm", variant: "destructive" }),
  });

  const updateAIGradingMutation = useMutation({
    mutationFn: ({ id, aiGradingResults }: { id: string; aiGradingResults: Record<string, any> }) =>
      apiRequest("PATCH", `/api/exam-submissions/${id}`, { aiGradingResults }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
      toast({ title: "Đã cập nhật kết quả AI" });
    },
    onError: () => toast({ title: "Lỗi cập nhật", variant: "destructive" }),
  });

  async function handleTriggerAIGrading(subId: string) {
    setTriggeringAIIds(prev => new Set([...prev, subId]));
    try {
      await apiRequest("POST", `/api/ai/grade-submission/${subId}`);
      await new Promise(r => setTimeout(r, 3000));
      queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
      toast({ title: "AI đang chấm bài, kết quả sẽ cập nhật trong giây lát" });
    } catch {
      toast({ title: "Lỗi khi chấm bài bằng AI", variant: "destructive" });
    } finally {
      setTriggeringAIIds(prev => { const s = new Set(prev); s.delete(subId); return s; });
    }
  }

  function handleAcceptAIScore(sub: SubmissionWithDetails, sqId: string) {
    const results = (sub.aiGradingResults as Record<string, any>) || {};
    const r = results[sqId];
    if (!r) return;
    const updated = { ...results, [sqId]: { ...r, status: "accepted" } };
    const totalAISuggested = Object.values(updated).reduce((acc: number, v: any) => {
      if (v.status === "accepted" || v.status === "adjusted") acc += Number(v.suggestedScore) || 0;
      return acc;
    }, 0);
    const origScore = parseFloat(String(sub.score || "0"));
    updateAIGradingMutation.mutate({
      id: sub.id,
      aiGradingResults: updated,
    });
    updateSubmissionMutation.mutate({
      id: sub.id,
      data: { adjustedScore: (origScore + totalAISuggested).toFixed(2) },
    });
    setAIReviewSub(prev => prev ? { ...prev, aiGradingResults: updated } as any : null);
  }

  const createExamMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/exams", data).then(r => r.json()),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Đã tạo bài kiểm tra thành công" });
      setShowExamDialog(false);
      setEditingExam(null);
      if (created?.id) navigate(`/assessments/${created.id}`);
    },
    onError: (err: any) => {
      let msg = "Lỗi khi tạo bài kiểm tra";
      try { const body = JSON.parse(err?.message?.replace(/^\d+:\s*/, "")); if (body?.message) msg = body.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const updateExamMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/exams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Đã cập nhật bài kiểm tra" });
      setShowExamDialog(false);
      setEditingExam(null);
    },
    onError: (err: any) => {
      let msg = "Lỗi khi cập nhật bài kiểm tra";
      try { const body = JSON.parse(err?.message?.replace(/^\d+:\s*/, "")); if (body?.message) msg = body.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/exams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Đã xóa bài kiểm tra" });
    },
    onError: () => {
      toast({ title: "Lỗi khi xóa bài kiểm tra", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: SingleChoiceData) =>
      apiRequest("POST", "/api/questions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({ title: "Đã lưu câu hỏi thành công" });
    },
    onError: () => {
      toast({ title: "Lỗi khi lưu câu hỏi", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SingleChoiceData }) =>
      apiRequest("PUT", `/api/questions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({ title: "Đã cập nhật câu hỏi" });
    },
    onError: () => {
      toast({ title: "Lỗi khi cập nhật câu hỏi", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({ title: "Đã xóa câu hỏi" });
    },
    onError: () => {
      toast({ title: "Lỗi khi xóa câu hỏi", variant: "destructive" });
    },
  });

  function handleSaveExam(data: any) {
    const payload = {
      ...data,
      openAt: data.openAt ? new Date(data.openAt).toISOString() : null,
      closeAt: data.closeAt ? new Date(data.closeAt).toISOString() : null,
      timeLimitMinutes: data.timeLimitMinutes ?? null,
      passingScore: data.passingScore != null ? String(data.passingScore) : null,
    };
    if (editingExam) {
      updateExamMutation.mutate({ id: editingExam.id, data: payload });
    } else {
      createExamMutation.mutate(payload);
    }
  }

  function handleEditExam(exam: ExamWithUsers) {
    navigate(`/assessments/${exam.id}`);
  }

  function handleDeleteExam(id: string) {
    deleteExamMutation.mutate(id);
  }

  function handleSelectQuestionType(type: string) {
    setEditingQuestion(null);
    setOpenDialog(type);
  }

  function handleEditQuestion(q: Question) {
    setEditingQuestion(q);
    if (q.type === "single_choice") setOpenDialog("single-choice");
    else if (q.type === "multiple_choice") setOpenDialog("multiple-choice");
    else if (q.type === "fill_blank") setOpenDialog("fill-blank");
    else if (q.type === "matching") setOpenDialog("matching");
    else if (q.type === "essay") setOpenDialog("essay");
    else setOpenDialog(q.type);
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

  function handleSaveQuestion(data: SingleChoiceData) {
    const payload = mapDialogDataToApi(data);
    if (editingQuestion) {
      updateMutation.mutate({ id: editingQuestion.id, data: payload as any });
      setEditingQuestion(null);
    } else {
      createMutation.mutate(payload as any);
    }
    setOpenDialog(null);
  }

  function handleSaveFillBlank(data: FillBlankData) {
    const payload = {
      type: data.type,
      title: data.title || null,
      content: data.content,
      mediaImageUrl: null,
      mediaAudioUrl: null,
      options: data.options,
      correctAnswer: data.correct_answer,
      score: String(data.score),
      difficulty: data.difficulty || null,
      explanation: data.explanation || null,
    };
    if (editingQuestion) {
      updateMutation.mutate({ id: editingQuestion.id, data: payload as any });
      setEditingQuestion(null);
    } else {
      createMutation.mutate(payload as any);
    }
    setOpenDialog(null);
  }

  function handleSaveEssay(data: EssayData) {
    const payload = {
      type: data.type,
      title: null,
      content: data.content,
      mediaImageUrl: null,
      mediaAudioUrl: null,
      options: [],
      correctAnswer: JSON.stringify({ minWords: data.minWords, maxWords: data.maxWords }),
      score: String(data.score),
      difficulty: null,
      explanation: data.rubric || null,
    };
    if (editingQuestion) {
      updateMutation.mutate({ id: editingQuestion.id, data: payload as any });
      setEditingQuestion(null);
    } else {
      createMutation.mutate(payload as any);
    }
    setOpenDialog(null);
  }

  function handleSaveMatching(data: MatchingData) {
    const payload = {
      type: data.type,
      title: null,
      content: data.content,
      mediaImageUrl: null,
      mediaAudioUrl: null,
      options: data.options,
      correctAnswer: data.correctAnswer,
      score: String(data.score),
      difficulty: null,
      explanation: data.explanation || null,
    };
    if (editingQuestion) {
      updateMutation.mutate({ id: editingQuestion.id, data: payload as any });
      setEditingQuestion(null);
    } else {
      createMutation.mutate(payload as any);
    }
    setOpenDialog(null);
  }

  function handleDialogClose() {
    setOpenDialog(null);
    setEditingQuestion(null);
  }

  function handleDeleteQuestion(id: string) {
    deleteMutation.mutate(id);
  }

  async function handleAISave(generatedQuestions: GeneratedQuestion[]) {
    setIsAISaving(true);
    try {
      for (const q of generatedQuestions) {
        await apiRequest("POST", "/api/questions", {
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
      }
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({ title: `Đã thêm ${generatedQuestions.length} câu hỏi vào ngân hàng` });
      setShowAIDialog(false);
    } catch {
      toast({ title: "Lỗi khi lưu câu hỏi AI", variant: "destructive" });
    } finally {
      setIsAISaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
          <div className="flex flex-wrap gap-2 mb-6">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                data-testid={`tab-${t.value}`}
                className={cn(
                  "px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5",
                  activeTab === t.value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-foreground hover:bg-muted/50"
                )}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <TabsContent value="list" className="mt-0">
            <div className="border rounded-lg p-3 bg-muted/5 mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Tìm tên / mã bài kiểm tra..."
                    className="pl-8 h-8 text-xs"
                    value={examSearch}
                    onChange={e => { setExamSearch(e.target.value); setExamsPage(1); }}
                    data-testid="input-exam-search"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(["all", "draft", "published"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => { setExamStatusFilter(s); setExamsPage(1); }}
                      data-testid={`filter-exam-status-${s}`}
                      className={cn(
                        "px-2.5 py-1 rounded-md border text-xs font-medium transition-all",
                        examStatusFilter === s
                          ? "bg-primary border-primary text-primary-foreground shadow-sm"
                          : "bg-white border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      {s === "all" ? "Tất cả" : s === "draft" ? "Nháp" : "Công bố"}
                    </button>
                  ))}
                </div>
                <Select value={examCreatorFilter} onValueChange={v => { setExamCreatorFilter(v); setExamsPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-44" data-testid="select-exam-creator">
                    <SelectValue placeholder="Người tạo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả người tạo</SelectItem>
                    {examCreatorOptions.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <span>Cập nhật từ</span>
                  <Input
                    type="date"
                    className="h-8 text-xs w-36"
                    value={examUpdatedFrom}
                    onChange={e => { setExamUpdatedFrom(e.target.value); setExamsPage(1); }}
                    data-testid="input-exam-updated-from"
                  />
                  <span>đến</span>
                  <Input
                    type="date"
                    className="h-8 text-xs w-36"
                    value={examUpdatedTo}
                    onChange={e => { setExamUpdatedTo(e.target.value); setExamsPage(1); }}
                    data-testid="input-exam-updated-to"
                  />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {(examSearch || examStatusFilter !== "all" || examCreatorFilter !== "all" || examUpdatedFrom || examUpdatedTo) && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setExamSearch(""); setExamStatusFilter("all"); setExamCreatorFilter("all"); setExamUpdatedFrom(""); setExamUpdatedTo(""); setExamsPage(1); }}
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {filteredExams.length} bài kiểm tra
                  </span>
                  <Button
                    size="sm"
                    className="flex items-center gap-1.5"
                    onClick={() => { setEditingExam(null); setShowExamDialog(true); }}
                    data-testid="btn-add-exam"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm mới bài kiểm tra
                  </Button>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px] whitespace-nowrap">Mã</TableHead>
                    <TableHead className="whitespace-nowrap">Tên bài kiểm tra</TableHead>
                    <TableHead className="w-[150px] whitespace-nowrap">Người tạo</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">Ngày tạo</TableHead>
                    <TableHead className="w-[150px] whitespace-nowrap">Người cập nhật</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">Ngày cập nhật</TableHead>
                    <TableHead className="w-[90px] text-center whitespace-nowrap">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                        Đang tải...
                      </TableCell>
                    </TableRow>
                  ) : filteredExams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                        {exams.length === 0
                          ? <>Chưa có bài kiểm tra nào. Nhấn <strong>Thêm mới bài kiểm tra</strong> để bắt đầu.</>
                          : "Không có bài kiểm tra nào khớp với bộ lọc."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExams.slice((examsPage - 1) * examsPageSize, examsPage * examsPageSize).map((exam, idx) => (
                      <TableRow key={exam.id} data-testid={`row-exam-${idx}`}>
                        <TableCell className="text-sm font-mono text-foreground">
                          {exam.code || <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground">{exam.name}</span>
                            <Badge
                              variant={exam.status === "published" ? "default" : "secondary"}
                              className="text-xs w-fit"
                            >
                              {exam.status === "published" ? "Công bố" : "Nháp"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {exam.createdByName || <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-foreground whitespace-nowrap">
                          {new Date(exam.createdAt).toLocaleDateString("vi-VN")}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {exam.updatedByName || <span className="italic text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-foreground whitespace-nowrap">
                          {new Date(exam.updatedAt).toLocaleDateString("vi-VN")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Xem toàn bộ bài kiểm tra"
                              onClick={() => setPreviewExam(exam)}
                              data-testid={`btn-view-exam-${idx}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditExam(exam)}
                              title="Sửa"
                              data-testid={`btn-edit-exam-${idx}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteExam(exam.id)}
                              title="Xóa"
                              data-testid={`btn-delete-exam-${idx}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <PaginationBar
                total={filteredExams.length}
                page={examsPage}
                pageSize={examsPageSize}
                onPageChange={setExamsPage}
                onPageSizeChange={s => { setExamsPageSize(s); setExamsPage(1); }}
              />
            </div>
          </TabsContent>

          <TabsContent value="question-bank" className="mt-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => { setQuestionTypeFilter("all"); setQuestionsPage(1); }}
                  data-testid="filter-type-all"
                  style={questionTypeFilter === "all"
                    ? { backgroundColor: "#64748b", borderColor: "#64748b" }
                    : { borderColor: "#64748b", color: "#64748b" }
                  }
                  className={cn(
                    "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                    questionTypeFilter === "all" ? "text-white shadow-sm" : "bg-white hover:opacity-80"
                  )}
                >
                  Tất cả
                </button>
                {Object.entries(TYPE_LABEL_MAP).map(([typeKey, typeLabel]) => {
                  const isActive = questionTypeFilter === typeKey;
                  const color = TYPE_COLOR_MAP[typeKey] || "#8b5cf6";
                  return (
                    <button
                      key={typeKey}
                      onClick={() => { setQuestionTypeFilter(typeKey); setQuestionsPage(1); }}
                      data-testid={`filter-type-${typeKey}`}
                      style={isActive
                        ? { backgroundColor: color, borderColor: color }
                        : { borderColor: color, color }
                      }
                      className={cn(
                        "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                        isActive ? "text-white shadow-sm" : "bg-white hover:opacity-80"
                      )}
                    >
                      {typeLabel}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                  onClick={() => setShowAIDialog(true)}
                  data-testid="btn-ai-generate-questions"
                >
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  Tạo bằng AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => setShowImportDialog(true)}
                  data-testid="btn-import-questions"
                >
                  <Upload className="w-4 h-4" />
                  Tải lên
                </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="flex items-center gap-1.5"
                    data-testid="btn-add-question"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm mới câu hỏi
                    <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {QUESTION_TYPES.map(qt => (
                    <DropdownMenuItem
                      key={qt.value}
                      onClick={() => handleSelectQuestionType(qt.value)}
                      data-testid={`menu-item-${qt.value}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <qt.icon className="w-4 h-4 text-muted-foreground" />
                      {qt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Tiêu đề</TableHead>
                    <TableHead>Câu hỏi</TableHead>
                    <TableHead className="w-[140px]">Loại</TableHead>
                    <TableHead className="w-[80px] text-center">Điểm</TableHead>
                    <TableHead className="w-[100px] text-center">Tập tin</TableHead>
                    <TableHead className="w-[90px] text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                        Đang tải...
                      </TableCell>
                    </TableRow>
                  ) : filteredQuestions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                        {questionTypeFilter === "all"
                          ? <>Chưa có câu hỏi nào. Nhấn <strong>Thêm mới câu hỏi</strong> để bắt đầu.</>
                          : `Không có câu hỏi loại "${TYPE_LABEL_MAP[questionTypeFilter] ?? questionTypeFilter}".`}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredQuestions.slice((questionsPage - 1) * questionsPageSize, questionsPage * questionsPageSize).map((q, idx) => (
                      <TableRow key={q.id} data-testid={`row-question-${idx}`}>
                        <TableCell className="font-medium text-sm">
                          {q.title || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[280px]">
                          <span className="line-clamp-2">{q.content}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">
                            {TYPE_LABEL_MAP[q.type] ?? q.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {q.score}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {q.mediaImageUrl ? (
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                            ) : null}
                            {q.mediaAudioUrl ? (
                              <Music className="w-3.5 h-3.5 text-purple-500" />
                            ) : null}
                            {!q.mediaImageUrl && !q.mediaAudioUrl && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditQuestion(q)}
                              data-testid={`btn-edit-question-${idx}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteQuestion(q.id)}
                              data-testid={`btn-delete-question-${idx}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <PaginationBar
                total={filteredQuestions.length}
                page={questionsPage}
                pageSize={questionsPageSize}
                onPageChange={setQuestionsPage}
                onPageSizeChange={s => { setQuestionsPageSize(s); setQuestionsPage(1); }}
              />
            </div>
          </TabsContent>

          <TabsContent value="results" className="mt-0">
            <div className="border rounded-lg p-3 bg-muted/5 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-xs text-muted-foreground font-medium">Tên bài</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả bài kiểm tra"
                    options={submissionExamOptions}
                    selected={subExamIds}
                    onSelect={v => { setSubExamIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubExamIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-xs text-muted-foreground font-medium">Học viên</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả học viên"
                    options={submissionStudentOptions}
                    selected={subStudentIds}
                    onSelect={v => { setSubStudentIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubStudentIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-xs text-muted-foreground font-medium">Lớp</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả lớp"
                    options={submissionClassOptions}
                    selected={subClassIds}
                    onSelect={v => { setSubClassIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubClassIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Thời gian nộp</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      className="h-9 text-xs w-36"
                      value={subDateFrom}
                      onChange={e => { setSubDateFrom(e.target.value); setSubmissionsPage(1); }}
                      data-testid="input-sub-date-from"
                    />
                    <span className="text-xs text-muted-foreground">đến</span>
                    <Input
                      type="date"
                      className="h-9 text-xs w-36"
                      value={subDateTo}
                      onChange={e => { setSubDateTo(e.target.value); setSubmissionsPage(1); }}
                      data-testid="input-sub-date-to"
                    />
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2 self-end pb-0.5">
                  {(subExamIds.length > 0 || subStudentIds.length > 0 || subClassIds.length > 0 || subDateFrom || subDateTo) && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setSubExamIds([]); setSubStudentIds([]); setSubClassIds([]); setSubDateFrom(""); setSubDateTo(""); setSubmissionsPage(1); }}
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">{filteredSubmissions.length} bài làm</span>
                </div>
              </div>
            </div>
            <TooltipProvider>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap min-w-[140px]">Tên bài</TableHead>
                    <TableHead className="w-[160px] whitespace-nowrap">Học viên (mã)</TableHead>
                    <TableHead className="w-[120px] whitespace-nowrap">Lớp</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">TG làm bài</TableHead>
                    <TableHead className="w-[80px] text-center whitespace-nowrap">Điểm</TableHead>
                    <TableHead className="w-[110px] text-center whitespace-nowrap">Cập nhật điểm</TableHead>
                    <TableHead className="w-[140px] whitespace-nowrap">Chi tiết điểm</TableHead>
                    <TableHead className="w-[80px] text-center whitespace-nowrap">AI Chấm</TableHead>
                    <TableHead className="w-[120px] whitespace-nowrap">Nhận xét</TableHead>
                    <TableHead className="w-[130px] whitespace-nowrap">Thời gian nộp</TableHead>
                    <TableHead className="w-[90px] text-center whitespace-nowrap">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-32 text-center text-muted-foreground text-sm">Đang tải...</TableCell>
                    </TableRow>
                  ) : filteredSubmissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-32 text-center text-muted-foreground text-sm">
                        {submissions.length === 0
                          ? "Chưa có bài làm nào. Học viên nộp bài sẽ xuất hiện ở đây."
                          : "Không có bài làm nào khớp với bộ lọc."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubmissions.slice((submissionsPage - 1) * submissionsPageSize, submissionsPage * submissionsPageSize).map((sub, idx) => {
                      const passingScore = parseFloat(sub.examPassingScore || "0");
                      const origScore = parseFloat(String(sub.score || "0"));
                      const adjScore = parseFloat(String(sub.adjustedScore || sub.score || "0"));
                      const passed = passingScore > 0 ? adjScore >= passingScore : null;

                      function fmtTime(s: number | null) {
                        if (!s) return "—";
                        const m = Math.floor(s / 60);
                        const sec = s % 60;
                        if (m === 0) return `${sec}s`;
                        return `${m}p ${sec}s`;
                      }

                      return (
                        <TableRow key={sub.id} data-testid={`row-submission-${idx}`}>
                          <TableCell className="text-sm text-foreground">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{sub.examName || "—"}</span>
                              {sub.examCode && <span className="text-xs text-muted-foreground">{sub.examCode}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            <div className="flex flex-col gap-0.5">
                              <span>{sub.studentName || "—"}</span>
                              {sub.studentCode && <span className="text-xs text-muted-foreground">({sub.studentCode})</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {sub.className
                              ? <span>{sub.className}</span>
                              : <span className="text-muted-foreground italic">Tự do</span>}
                          </TableCell>
                          <TableCell className="text-sm text-foreground whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                              {fmtTime(sub.timeTakenSeconds)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "text-sm font-bold",
                              passed === true ? "text-green-600" : passed === false ? "text-red-600" : "text-foreground"
                            )}>
                              {origScore.toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {editingScoreId === sub.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-7 w-16 text-xs text-center"
                                  value={editingScoreVal}
                                  onChange={e => setEditingScoreVal(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") updateSubmissionMutation.mutate({ id: sub.id, data: { adjustedScore: editingScoreVal } });
                                    if (e.key === "Escape") setEditingScoreId(null);
                                  }}
                                  autoFocus
                                  data-testid={`input-score-${idx}`}
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => updateSubmissionMutation.mutate({ id: sub.id, data: { adjustedScore: editingScoreVal } })}>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                className={cn(
                                  "text-sm font-bold hover:underline cursor-pointer",
                                  passed === true ? "text-green-600" : passed === false ? "text-red-600" : "text-foreground"
                                )}
                                onClick={() => { setEditingScoreId(sub.id); setEditingScoreVal(String(adjScore)); }}
                                data-testid={`btn-adj-score-${idx}`}
                              >
                                {adjScore.toFixed(1)}
                              </button>
                            )}
                          </TableCell>
                          <TableCell>
                            {sub.partScores && (sub.partScores as any[]).length > 0 ? (
                              <div className="space-y-0.5">
                                {(sub.partScores as any[]).map((ps: any, pi: number) => (
                                  <div key={pi} className="text-xs text-foreground whitespace-nowrap">
                                    <span className="text-muted-foreground">{ps.partName?.split(":")[0]}:</span>{" "}
                                    <span>{ps.correct}/{ps.total}, {Number(ps.score).toFixed(0)}đ</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              const results = (sub.aiGradingResults as Record<string, any>) || {};
                              const resultKeys = Object.keys(results);
                              const gradedCount = resultKeys.length;
                              const acceptedCount = resultKeys.filter(k => results[k].status === "accepted" || results[k].status === "adjusted").length;
                              const isTriggering = triggeringAIIds.has(sub.id);

                              if (isTriggering) {
                                return (
                                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                                    <span>Đang chấm...</span>
                                  </div>
                                );
                              }

                              if (gradedCount > 0) {
                                return (
                                  <div className="flex flex-col items-center gap-1">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80",
                                        acceptedCount === gradedCount
                                          ? "border-green-300 bg-green-50 text-green-700"
                                          : "border-yellow-300 bg-yellow-50 text-yellow-700"
                                      )}
                                      onClick={() => setAIReviewSub(sub)}
                                      data-testid={`btn-ai-review-${idx}`}
                                    >
                                      <BrainCircuit className="w-3 h-3 mr-0.5" />
                                      {acceptedCount}/{gradedCount} câu
                                    </Badge>
                                    <button
                                      className="text-[10px] text-blue-600 hover:underline"
                                      onClick={() => setAIReviewSub(sub)}
                                    >
                                      Xem kết quả
                                    </button>
                                  </div>
                                );
                              }

                              if (sub.hasAIGrading && sub.aiGradingResults == null) {
                                return (
                                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                                    <span>Đang xử lý...</span>
                                  </div>
                                );
                              }

                              return <span className="text-muted-foreground text-xs">—</span>;
                            })()}
                          </TableCell>
                          <TableCell className="max-w-[120px]">
                            {editingCommentId === sub.id ? (
                              <div className="flex flex-col gap-1">
                                <Textarea
                                  className="text-xs min-h-[60px]"
                                  value={editingCommentVal}
                                  onChange={e => setEditingCommentVal(e.target.value)}
                                  autoFocus
                                  data-testid={`input-comment-${idx}`}
                                />
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                    onClick={() => updateSubmissionMutation.mutate({ id: sub.id, data: { comment: editingCommentVal } })}>
                                    Lưu
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                    onClick={() => setEditingCommentId(null)}>
                                    Hủy
                                  </Button>
                                </div>
                              </div>
                            ) : sub.comment ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="text-xs text-foreground truncate max-w-[110px] block text-left hover:underline"
                                    onClick={() => { setEditingCommentId(sub.id); setEditingCommentVal(sub.comment || ""); }}
                                    data-testid={`btn-comment-${idx}`}
                                  >
                                    {sub.comment.slice(0, 30)}{sub.comment.length > 30 ? "..." : ""}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[260px] whitespace-pre-wrap text-xs">
                                  {sub.comment}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => { setEditingCommentId(sub.id); setEditingCommentVal(""); }}
                                data-testid={`btn-add-comment-${idx}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Nhận xét
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-foreground whitespace-nowrap">
                            {new Date(sub.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Xem bài làm"
                                data-testid={`btn-view-submission-${idx}`}
                                onClick={() => {
                                  const exam = exams.find(e => e.id === sub.examId);
                                  if (exam) setViewingSubmission({ sub, exam });
                                }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Xóa"
                                data-testid={`btn-delete-submission-${idx}`}
                                onClick={() => deleteSubmissionMutation.mutate(sub.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
              <PaginationBar
                total={filteredSubmissions.length}
                page={submissionsPage}
                pageSize={submissionsPageSize}
                onPageChange={setSubmissionsPage}
                onPageSizeChange={s => { setSubmissionsPageSize(s); setSubmissionsPage(1); }}
              />
            </div>
            </TooltipProvider>
          </TabsContent>

        </Tabs>
      </div>

      <SingleChoiceDialog
        open={openDialog === "single-choice"}
        onClose={handleDialogClose}
        onSave={handleSaveQuestion}
        initialData={editingQuestion && editingQuestion.type === "single_choice" ? {
          id: editingQuestion.id,
          type: editingQuestion.type,
          title: editingQuestion.title ?? "",
          content: editingQuestion.content,
          media: {
            image_url: editingQuestion.mediaImageUrl ?? "",
            audio_url: editingQuestion.mediaAudioUrl ?? "",
          },
          options: (editingQuestion.options as { id: string; text: string }[]) ?? [],
          correct_answer: editingQuestion.correctAnswer ?? "",
          score: Number(editingQuestion.score ?? 1),
          difficulty: editingQuestion.difficulty ?? null,
          explanation: editingQuestion.explanation ?? "",
        } : null}
      />

      <MultipleChoiceDialog
        open={openDialog === "multiple-choice"}
        onClose={handleDialogClose}
        onSave={(data: MultipleChoiceData) => handleSaveQuestion(data as unknown as SingleChoiceData)}
        initialData={editingQuestion && editingQuestion.type === "multiple_choice" ? {
          id: editingQuestion.id,
          type: editingQuestion.type,
          title: editingQuestion.title ?? "",
          content: editingQuestion.content,
          media: {
            image_url: editingQuestion.mediaImageUrl ?? "",
            audio_url: editingQuestion.mediaAudioUrl ?? "",
          },
          options: (editingQuestion.options as { id: string; text: string }[]) ?? [],
          correct_answer: editingQuestion.correctAnswer ?? "",
          score: Number(editingQuestion.score ?? 1),
          difficulty: editingQuestion.difficulty ?? null,
          explanation: editingQuestion.explanation ?? "",
        } : null}
      />

      <FillBlankDialog
        open={openDialog === "fill-blank"}
        onClose={handleDialogClose}
        onSave={handleSaveFillBlank}
        initialData={editingQuestion && editingQuestion.type === "fill_blank" ? {
          id: editingQuestion.id,
          type: "fill_blank",
          title: editingQuestion.title ?? "",
          content: editingQuestion.content,
          media: { image_url: "", audio_url: "" },
          options: (editingQuestion.options as any[]) ?? [],
          correct_answer: editingQuestion.correctAnswer ?? "",
          score: Number(editingQuestion.score ?? 1),
          difficulty: editingQuestion.difficulty ?? null,
          explanation: editingQuestion.explanation ?? "",
        } : null}
      />

      <MatchingDialog
        open={openDialog === "matching"}
        onClose={handleDialogClose}
        onSave={handleSaveMatching}
        initialData={editingQuestion && editingQuestion.type === "matching" ? {
          id: editingQuestion.id,
          type: "matching",
          title: "",
          content: editingQuestion.content,
          options: (editingQuestion.options as any[]) ?? [],
          correctAnswer: editingQuestion.correctAnswer ?? "",
          score: Number(editingQuestion.score ?? 1),
          difficulty: editingQuestion.difficulty ?? null,
          explanation: editingQuestion.explanation ?? "",
          shuffleB: false,
          scorePerPair: 1,
        } : null}
      />

      <EssayDialog
        open={openDialog === "essay"}
        onClose={handleDialogClose}
        onSave={handleSaveEssay}
        initialData={editingQuestion && editingQuestion.type === "essay" ? {
          id: editingQuestion.id,
          content: editingQuestion.content,
          correctAnswer: editingQuestion.correctAnswer ?? "",
          score: Number(editingQuestion.score ?? 5),
          explanation: editingQuestion.explanation ?? "",
        } : null}
      />

      <ImportQuestionsDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
      />

      <AIGenerateQuestionsDialog
        open={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onSave={handleAISave}
        isSaving={isAISaving}
        mode="bank"
      />

      <ExamFormDialog
        open={showExamDialog}
        onClose={() => { setShowExamDialog(false); setEditingExam(null); }}
        onSave={handleSaveExam}
        exam={editingExam}
        isSaving={createExamMutation.isPending || updateExamMutation.isPending}
      />

      {previewExam && (
        <ExamTakingDialog
          exam={previewExam}
          open={!!previewExam}
          onClose={() => setPreviewExam(null)}
          onSubmitSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] })}
        />
      )}

      {viewingSubmission && (
        <ExamTakingDialog
          exam={viewingSubmission.exam}
          open={!!viewingSubmission}
          onClose={() => setViewingSubmission(null)}
          readonlySubmission={viewingSubmission.sub}
        />
      )}

      {aiReviewSub && (() => {
        const results = (aiReviewSub.aiGradingResults as Record<string, any>) || {};
        const resultKeys = Object.keys(results);
        const answers = (aiReviewSub.answers as Record<string, any>) || {};

        return (
          <Dialog open={!!aiReviewSub} onOpenChange={v => { if (!v) setAIReviewSub(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
              <DialogHeader className="px-6 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <BrainCircuit className="w-4 h-4 text-purple-600" />
                  Kết quả AI chấm tự luận
                  <span className="text-muted-foreground text-sm font-normal">
                    — {aiReviewSub.studentName || "Học viên"} · {aiReviewSub.examName}
                  </span>
                </DialogTitle>
              </DialogHeader>

              {resultKeys.length === 0 ? (
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                  Chưa có kết quả chấm AI. Bài làm chưa có câu tự luận hoặc chưa chạy AI.
                </div>
              ) : (
                <div className="px-6 py-4 space-y-5">
                  {resultKeys.map((sqId, qi) => {
                    const r = results[sqId];
                    const studentAnswer = answers[sqId];
                    const isAccepted = r.status === "accepted";
                    const isAdjusted = r.status === "adjusted";
                    const isDone = isAccepted || isAdjusted;

                    return (
                      <div key={sqId} className={cn(
                        "border rounded-lg overflow-hidden",
                        isDone ? "border-green-200" : "border-yellow-200"
                      )}>
                        <div className={cn(
                          "px-4 py-2.5 flex items-center justify-between",
                          isDone ? "bg-green-50" : "bg-yellow-50"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">Câu tự luận {qi + 1}</span>
                            {isDone ? (
                              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                {isAdjusted ? "Đã điều chỉnh" : "Đã xác nhận"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50 text-[10px]">
                                <Clock className="w-3 h-3 mr-0.5" />
                                Chờ xác nhận
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-bold",
                              isDone ? "text-green-700" : "text-yellow-700"
                            )}>
                              {r.suggestedScore} / {r.maxScore} điểm
                            </span>
                            {!isDone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => handleAcceptAIScore(aiReviewSub, sqId)}
                                data-testid={`btn-accept-ai-${qi}`}
                              >
                                <ThumbsUp className="w-3 h-3 mr-1" />
                                Chấp nhận
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="px-4 py-3 space-y-3">
                          {studentAnswer && (
                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Bài làm học viên</p>
                              <p className="text-sm text-foreground bg-muted/30 rounded p-2.5 max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                {String(studentAnswer)}
                              </p>
                            </div>
                          )}

                          {r.feedback && (
                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Nhận xét tổng quan</p>
                              <p className="text-sm text-foreground leading-relaxed">{r.feedback}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            {r.strengths && (
                              <div className="bg-green-50 border border-green-100 rounded p-2.5">
                                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Điểm mạnh</p>
                                <p className="text-xs text-foreground leading-relaxed">{r.strengths}</p>
                              </div>
                            )}
                            {r.weaknesses && (
                              <div className="bg-red-50 border border-red-100 rounded p-2.5">
                                <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Cần cải thiện</p>
                                <p className="text-xs text-foreground leading-relaxed">{r.weaknesses}</p>
                              </div>
                            )}
                          </div>

                          {!isDone && (
                            <div className="flex items-center gap-2 pt-1">
                              <AdjustScoreInline
                                sqId={sqId}
                                r={r}
                                sub={aiReviewSub}
                                onAdjust={(newScore) => {
                                  const updated = {
                                    ...results,
                                    [sqId]: { ...r, suggestedScore: newScore, status: "adjusted" },
                                  };
                                  const totalAISuggested = Object.values(updated).reduce((acc: number, v: any) => {
                                    if (v.status === "accepted" || v.status === "adjusted") acc += Number(v.suggestedScore) || 0;
                                    return acc;
                                  }, 0);
                                  const origScore = parseFloat(String(aiReviewSub.score || "0"));
                                  updateAIGradingMutation.mutate({ id: aiReviewSub.id, aiGradingResults: updated });
                                  updateSubmissionMutation.mutate({ id: aiReviewSub.id, data: { adjustedScore: (origScore + totalAISuggested).toFixed(2) } });
                                  setAIReviewSub(prev => prev ? { ...prev, aiGradingResults: updated } as any : null);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="border-t pt-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Sau khi xác nhận, điểm điều chỉnh sẽ được cập nhật tự động.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setAIReviewSub(null)}>
                      Đóng
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </DashboardLayout>
  );
}

function AdjustScoreInline({
  sqId, r, sub, onAdjust,
}: {
  sqId: string;
  r: any;
  sub: any;
  onAdjust: (score: number) => void;
}) {
  const [val, setVal] = useState(String(r.suggestedScore ?? 0));

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Hoặc điều chỉnh điểm:</span>
      <input
        type="number"
        min={0}
        max={r.maxScore}
        step={0.5}
        value={val}
        onChange={e => setVal(e.target.value)}
        className="h-7 w-16 border rounded px-2 text-sm text-center text-foreground"
        data-testid={`input-adjust-ai-score-${sqId}`}
      />
      <span className="text-muted-foreground">/ {r.maxScore}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs px-2 text-blue-600 hover:text-blue-700"
        onClick={() => {
          const score = Math.min(Math.max(parseFloat(val) || 0, 0), r.maxScore);
          onAdjust(score);
        }}
        data-testid={`btn-adjust-ai-score-${sqId}`}
      >
        Lưu điểm
      </Button>
    </div>
  );
}
