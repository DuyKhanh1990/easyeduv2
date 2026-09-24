import { useState, useEffect, useRef, useMemo } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
  Copy,
  Settings2,
  History,
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
import { ExamCommentDialog } from "@/components/my-space/assignments/ExamCommentDialog";
import { AssessmentHistoryTab } from "./AssessmentHistoryTab";

type ExamWithUsers = Exam & { createdByName: string | null; updatedByName: string | null };

type SectionStatEntry = { id: string; name: string; questionTypeCounts: Record<string, number> };
type ExamStatSummary = { examId: string; sectionCount: number; sections: SectionStatEntry[] };

const PAGE_SIZE_OPTIONS = [20, 30, 50];

function PaginationBar({ total, page, pageSize, onPageChange, onPageSizeChange }: {
  total: number; page: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 text-sm">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Hiển thị</span>
        <select
          value={pageSize}
          onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>/ <span className="font-semibold text-slate-700">{total}</span></span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm"
          className="h-7 w-7 p-0 rounded-lg border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600"
          disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</Button>
        <span className="px-3 text-xs font-medium text-slate-600">{page} <span className="text-slate-400">/</span> {totalPages}</span>
        <Button variant="outline" size="sm"
          className="h-7 w-7 p-0 rounded-lg border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600"
          disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</Button>
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
const ASSESSMENTS_HISTORY_TAB = { value: "history", label: "Lịch sử", icon: History };

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
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const myLocationIds: string[] = myPerms?.locationIds ?? [];

  function getTabPerm(tab: string) {
    return myPerms?.permissions[`${ASSESSMENTS_HREF}#${tab}`] ?? null;
  }

  const assessCan = {
    view: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canView) || !!(getTabPerm(tab)?.canViewAll),
    viewAll: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canViewAll),
    create: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canCreate),
    edit: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canEdit),
    delete: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canDelete),
  };

  function canAccessTab(tab: string) {
    if (!myPerms) return true;
    if (isSuperAdmin) return true;
    const p = getTabPerm(tab);
    if (!p) return false;
    return p.canView || p.canViewAll;
  }

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const visibleTabs = ASSESSMENTS_TABS.filter(t =>
    isSubTabVisible(ASSESSMENTS_HREF, t.value) && canAccessTab(t.value)
  );
  const canViewHistory = visibleTabs.length > 0 || isSuperAdmin;
  const urlTab = new URLSearchParams(search).get("tab");
  const requestedTab = urlTab || visibleTabs[0]?.value || "list";
  const [activeTab, setActiveTab] = useState(requestedTab);

  useEffect(() => {
    if (activeTab !== requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, requestedTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate(`/assessments?tab=${value}`);
  };
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
    classLocationId: string | null;
    hasAIGrading: boolean;
  };
  const [viewingSubmission, setViewingSubmission] = useState<{ sub: SubmissionWithDetails; exam: ExamWithUsers } | null>(null);
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editingScoreVal, setEditingScoreVal] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDialogData, setCommentDialogData] = useState<{
    submissionId: string;
    studentName: string;
    examTitle: string;
    comment: string | null;
    startInEditMode: boolean;
  } | null>(null);
  const [aiReviewSub, setAIReviewSub] = useState<SubmissionWithDetails | null>(null);
  const [triggeringAIIds, setTriggeringAIIds] = useState<Set<string>>(new Set());
  const autoTriggeredRef = useRef<Set<string>>(new Set());
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());
  const [cloningExam, setCloningExam] = useState<ExamWithUsers | null>(null);

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

  const { data: examStats = [] } = useQuery<ExamStatSummary[]>({
    queryKey: ["/api/exams/stats"],
  });

  const examStatsMap = useMemo(() => {
    const map = new Map<string, ExamStatSummary>();
    examStats.forEach(s => map.set(s.examId, s));
    return map;
  }, [examStats]);

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
      if (!assessCan.viewAll("results") && myLocationIds.length > 0) {
        if (sub.classLocationId && !myLocationIds.includes(sub.classLocationId)) return false;
      }
      if (subExamIds.length > 0 && !subExamIds.includes(sub.examId)) return false;
      const studentKey = sub.studentId || sub.studentName || "";
      if (subStudentIds.length > 0 && !subStudentIds.includes(studentKey)) return false;
      if (subClassIds.length > 0 && (!sub.className || !subClassIds.includes(sub.className))) return false;
      if (subDateFrom && sub.submittedAt && new Date(sub.submittedAt) < new Date(subDateFrom)) return false;
      if (subDateTo && sub.submittedAt && new Date(sub.submittedAt) > new Date(subDateTo + "T23:59:59")) return false;
      return true;
    });
  }, [submissions, subExamIds, subStudentIds, subClassIds, subDateFrom, subDateTo, myLocationIds, myPerms]);

  useEffect(() => {
    if (submissionsLoading) return;

    // Trigger grading for any newly-seen ungraded submissions
    const ungraded = submissions.filter(
      sub => sub.hasAIGrading && sub.aiGradingResults == null && !autoTriggeredRef.current.has(sub.id),
    );
    ungraded.forEach(sub => {
      autoTriggeredRef.current.add(sub.id);
      setTriggeringAIIds(prev => new Set([...prev, sub.id]));
      apiRequest("POST", `/api/ai/grade-submission/${sub.id}`)
        .catch(() => {})
        .finally(() => {
          setTriggeringAIIds(prev => { const s = new Set(prev); s.delete(sub.id); return s; });
        });
    });

    // Keep polling while the background grader has pre-saved questions with
    // status=pending but has not filled in a score yet. The pre-save changes
    // aiGradingResults from null to an object, so checking only for null would
    // stop polling too early (especially noticeable with slower Gemini calls).
    const anyPending = submissions.some(sub => {
      if (!sub.hasAIGrading) return false;
      if (sub.aiGradingResults == null) return true;
      return Object.values((sub.aiGradingResults as Record<string, any>) || {}).some(
        (result: any) =>
          result?.status === "pending" &&
          (result?.suggestedScore == null || result?.gradedAt == null),
      );
    });

    if (anyPending) {
      // Start polling interval if not already running (max 18 polls × 8s = 144s)
      if (!pollingIntervalRef.current) {
        let pollCount = 0;
        pollingIntervalRef.current = setInterval(() => {
          pollCount++;
          queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] });
          if (pollCount >= 18) {
            clearInterval(pollingIntervalRef.current!);
            pollingIntervalRef.current = null;
          }
        }, 8000);
      }
    } else {
      // All done — stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
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
      toast({ title: err?.message || "Lỗi khi tạo bài kiểm tra", variant: "destructive" });
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
      toast({ title: err?.message || "Lỗi khi cập nhật bài kiểm tra", variant: "destructive" });
    },
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/exams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams/stats"] });
      toast({ title: "Đã xóa bài kiểm tra" });
    },
    onError: () => {
      toast({ title: "Lỗi khi xóa bài kiểm tra", variant: "destructive" });
    },
  });

  const cloneExamMutation = useMutation({
    mutationFn: ({ sourceId, data }: { sourceId: string; data: any }) =>
      apiRequest("POST", `/api/exams/${sourceId}/clone`, data).then(r => r.json()),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams/stats"] });
      toast({ title: "Đã tạo bản sao bài kiểm tra" });
      setCloningExam(null);
      if (created?.id) navigate(`/assessments/${created.id}`);
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Lỗi khi sao chép bài kiểm tra", variant: "destructive" });
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
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-slate-100">
        {/* ── Neutral header ── */}
        <div className="shrink-0 bg-slate-600">
          <div className="px-4 md:px-6 lg:px-8 pt-5 pb-0">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}>
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-lg tracking-tight leading-tight">Kiểm tra &amp; Đánh giá</h1>
                <p className="text-slate-200 text-xs mt-0.5 font-normal">Quản lý bài kiểm tra · ngân hàng câu hỏi · kết quả học viên</p>
              </div>
            </div>
            <div className="flex gap-0.5">
              {visibleTabs.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleTabChange(t.value)}
                  data-testid={`tab-${t.value}`}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-150 outline-none",
                    activeTab === t.value
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
              {canViewHistory && (
                <button
                  onClick={() => handleTabChange(ASSESSMENTS_HISTORY_TAB.value)}
                  data-testid="tab-history"
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-150 outline-none",
                    activeTab === ASSESSMENTS_HISTORY_TAB.value
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <History className="w-4 h-4" />
                  {ASSESSMENTS_HISTORY_TAB.label}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden px-4 md:px-6 lg:px-8 pb-4 pt-4 flex flex-col">
          {activeTab === "list" && (
            <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-card">
            <div className="p-3 border-b shrink-0 space-y-3">
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
                  {assessCan.create("list") && (
                    <Button
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={() => { setEditingExam(null); setShowExamDialog(true); }}
                      data-testid="btn-add-exam"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm mới bài kiểm tra
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] caption-bottom text-sm border-collapse table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-white dark:bg-card w-[40px] px-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input cursor-pointer"
                        checked={
                          filteredExams.length > 0 &&
                          filteredExams.slice((examsPage - 1) * examsPageSize, examsPage * examsPageSize).every(e => selectedExamIds.has(e.id))
                        }
                        onChange={e => {
                          const pageExams = filteredExams.slice((examsPage - 1) * examsPageSize, examsPage * examsPageSize);
                          setSelectedExamIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) pageExams.forEach(ex => next.add(ex.id));
                            else pageExams.forEach(ex => next.delete(ex.id));
                            return next;
                          });
                        }}
                      />
                    </TableHead>
                    <TableHead className="sticky left-[40px] z-20 bg-white dark:bg-card min-w-[200px] whitespace-nowrap border-r">Tên bài kiểm tra</TableHead>
                    <TableHead className="w-[90px] text-center whitespace-nowrap">Số Session</TableHead>
                    <TableHead className="min-w-[160px] whitespace-nowrap">Số Câu hỏi</TableHead>
                    <TableHead className="w-[90px] text-center whitespace-nowrap">Số lần làm</TableHead>
                    <TableHead className="min-w-[220px] whitespace-nowrap">Thông tin</TableHead>
                    {(assessCan.edit("list") || assessCan.delete("list")) && <TableHead className="sticky right-0 z-20 bg-white dark:bg-card w-[56px] text-center whitespace-nowrap shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">Thao tác</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examsLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground text-sm">
                        Đang tải...
                      </TableCell>
                    </TableRow>
                  ) : filteredExams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground text-sm">
                        {exams.length === 0
                          ? <>Chưa có bài kiểm tra nào. Nhấn <strong>Thêm mới bài kiểm tra</strong> để bắt đầu.</>
                          : "Không có bài kiểm tra nào khớp với bộ lọc."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExams.slice((examsPage - 1) * examsPageSize, examsPage * examsPageSize).map((exam, idx) => (
                      <TableRow key={exam.id} data-testid={`row-exam-${idx}`} className={selectedExamIds.has(exam.id) ? "bg-muted/50" : ""}>
                        <TableCell className="sticky left-0 z-10 bg-white dark:bg-card px-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input cursor-pointer"
                            checked={selectedExamIds.has(exam.id)}
                            onChange={e => {
                              setSelectedExamIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(exam.id);
                                else next.delete(exam.id);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="sticky left-[40px] z-10 bg-white dark:bg-card border-r">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant={exam.status === "published" ? "default" : "secondary"}
                                className="text-[10px] px-1.5 py-0 h-4 w-fit shrink-0"
                              >
                                {exam.status === "published" ? "Công bố" : "Nháp"}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">{exam.name}</span>
                            </div>
                            {exam.code && (
                              <span className="text-xs font-mono text-muted-foreground">{exam.code}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-foreground">
                          {examStatsMap.get(exam.id)?.sectionCount ?? 0}
                        </TableCell>
                        <TableCell className="text-xs text-foreground">
                          {(() => {
                            const stat = examStatsMap.get(exam.id);
                            if (!stat || stat.sections.length === 0) return <span className="italic text-muted-foreground">—</span>;
                            return (
                              <div className="space-y-0.5">
                                {stat.sections.map(sec => {
                                  const parts = Object.entries(sec.questionTypeCounts).map(([type, cnt]) => {
                                    const label = type === "single_choice" ? "TN"
                                      : type === "multiple_choice" ? "Nhiều lựa chọn"
                                      : type === "fill_blank" ? "Điền chỗ trống"
                                      : type === "essay" ? "TL"
                                      : type === "matching" ? "Nối" : type;
                                    return `${cnt} ${label}`;
                                  }).join(", ");
                                  return (
                                    <div key={sec.id} className="whitespace-nowrap">
                                      <span className="font-medium">{sec.name}:</span> {parts || "0 câu"}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center text-sm text-foreground">
                          {exam.maxAttempts ?? 1}
                        </TableCell>
                        <TableCell className="text-xs text-foreground">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <span className="text-muted-foreground shrink-0">Người tạo:</span>
                              <span className="font-medium">{exam.createdByName || "—"}</span>
                              <span className="text-muted-foreground">{new Date(exam.createdAt).toLocaleDateString("vi-VN")}</span>
                            </div>
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <span className="text-muted-foreground shrink-0">Cập nhật:</span>
                              <span className="font-medium">{exam.updatedByName || "—"}</span>
                              <span className="text-muted-foreground">{new Date(exam.updatedAt).toLocaleDateString("vi-VN")}</span>
                            </div>
                          </div>
                        </TableCell>
                        {(assessCan.edit("list") || assessCan.delete("list")) && (
                        <TableCell className="sticky right-0 z-10 bg-white dark:bg-card shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  data-testid={`btn-actions-exam-${idx}`}
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() => setPreviewExam(exam)}
                                  className="flex items-center gap-2 cursor-pointer"
                                  data-testid={`btn-view-exam-${idx}`}
                                >
                                  <Eye className="w-3.5 h-3.5" /> Xem
                                </DropdownMenuItem>
                                {assessCan.create("list") && (
                                <DropdownMenuItem
                                  onClick={() => setCloningExam(exam)}
                                  className="flex items-center gap-2 cursor-pointer"
                                  data-testid={`btn-clone-exam-${idx}`}
                                >
                                  <Copy className="w-3.5 h-3.5" /> Sao chép
                                </DropdownMenuItem>
                                )}
                                {assessCan.edit("list") && (
                                <DropdownMenuItem
                                  onClick={() => handleEditExam(exam)}
                                  className="flex items-center gap-2 cursor-pointer"
                                  data-testid={`btn-edit-exam-${idx}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Sửa
                                </DropdownMenuItem>
                                )}
                                {assessCan.delete("list") && (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteExam(exam.id)}
                                  className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                                  data-testid={`btn-delete-exam-${idx}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
              </div>
            </div>
            <PaginationBar
              total={filteredExams.length}
              page={examsPage}
              pageSize={examsPageSize}
              onPageChange={setExamsPage}
              onPageSizeChange={s => { setExamsPageSize(s); setExamsPage(1); }}
            />
            </div>
          )}
          {activeTab === "history" && canViewHistory && (
            <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-card p-4">
              <AssessmentHistoryTab />
            </div>
          )}

          {activeTab === "question-bank" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex items-center justify-between gap-2 flex-wrap">
              {/* Type filter chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => { setQuestionTypeFilter("all"); setQuestionsPage(1); }}
                  data-testid="filter-type-all"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    questionTypeFilter === "all"
                      ? "bg-slate-700 border-slate-700 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  Tất cả
                  <span className="ml-0.5 text-[10px] font-bold opacity-70">{questions.length}</span>
                </button>
                {Object.entries(TYPE_LABEL_MAP).map(([typeKey, typeLabel]) => {
                  const isActive = questionTypeFilter === typeKey;
                  const color = TYPE_COLOR_MAP[typeKey] || "#8b5cf6";
                  const count = questions.filter(q => q.type === typeKey).length;
                  return (
                    <button
                      key={typeKey}
                      onClick={() => { setQuestionTypeFilter(typeKey); setQuestionsPage(1); }}
                      data-testid={`filter-type-${typeKey}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        isActive ? "text-white shadow-sm" : "bg-white hover:opacity-90"
                      )}
                      style={isActive
                        ? { backgroundColor: color, borderColor: color }
                        : { borderColor: `${color}55`, color }
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? "rgba(255,255,255,0.7)" : color }} />
                      {typeLabel}
                      <span className="ml-0.5 text-[10px] font-bold" style={{ opacity: 0.75 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {assessCan.create("question-bank") && (
                  <Button variant="outline" size="sm"
                    className="flex items-center gap-1.5 h-8 rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-400 text-xs"
                    onClick={() => setShowAIDialog(true)} data-testid="btn-ai-generate-questions">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    Tạo bằng AI
                  </Button>
                )}
                {assessCan.create("question-bank") && (
                  <Button variant="outline" size="sm"
                    className="flex items-center gap-1.5 h-8 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 text-xs"
                    onClick={() => setShowImportDialog(true)} data-testid="btn-import-questions">
                    <Upload className="w-3.5 h-3.5" />
                    Tải lên
                  </Button>
                )}
                {assessCan.create("question-bank") && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="flex items-center gap-1.5 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs shadow-sm shadow-indigo-200" data-testid="btn-add-question">
                        <Plus className="w-3.5 h-3.5" />
                        Thêm câu hỏi
                        <ChevronDown className="w-3 h-3 ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 rounded-xl">
                      {QUESTION_TYPES.map(qt => (
                        <DropdownMenuItem key={qt.value} onClick={() => handleSelectQuestionType(qt.value)}
                          data-testid={`menu-item-${qt.value}`} className="flex items-center gap-2 cursor-pointer rounded-lg">
                          <qt.icon className="w-4 h-4" style={{ color: TYPE_COLOR_MAP[qt.value.replace("-", "_")] || "#8b5cf6" }} />
                          {qt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* ── Table card ── */}
            <div className="flex-1 overflow-hidden flex flex-col rounded-2xl bg-white shadow-sm shadow-slate-200/60 border border-slate-200/80">
              <div className="flex-1 overflow-auto">
                <table className="w-full caption-bottom text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="w-[170px] px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tiêu đề</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nội dung câu hỏi</th>
                      <th className="w-[150px] px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loại</th>
                      <th className="w-[80px] px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Điểm</th>
                      <th className="w-[90px] px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Media</th>
                      {(assessCan.edit("question-bank") || assessCan.delete("question-bank")) && (
                        <th className="w-[80px] px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">•••</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                          <span className="text-sm">Đang tải câu hỏi...</span>
                        </div>
                      </td></tr>
                    ) : filteredQuestions.length === 0 ? (
                      <tr><td colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
                            <BookMarked className="w-7 h-7 text-violet-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-600 mb-0.5">
                              {questionTypeFilter === "all" ? "Chưa có câu hỏi nào" : `Không có câu hỏi loại "${TYPE_LABEL_MAP[questionTypeFilter] ?? questionTypeFilter}"`}
                            </p>
                            <p className="text-xs text-slate-400">
                              {questionTypeFilter === "all" ? "Nhấn Thêm câu hỏi để bắt đầu xây dựng ngân hàng" : "Thử chọn loại câu hỏi khác"}
                            </p>
                          </div>
                        </div>
                      </td></tr>
                    ) : (
                      filteredQuestions.slice((questionsPage - 1) * questionsPageSize, questionsPage * questionsPageSize).map((q, idx) => {
                        const typeColor = TYPE_COLOR_MAP[q.type] || "#8b5cf6";
                        return (
                          <tr key={q.id} data-testid={`row-question-${idx}`}
                            className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors group">
                            {/* Left color bar via box-shadow on first cell */}
                            <td className="px-4 py-3" style={{ borderLeft: `3px solid ${typeColor}20` }}>
                              <span className="text-sm font-semibold text-slate-700">
                                {q.title || <span className="text-slate-300 italic font-normal">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[320px]">
                              <span className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{q.content}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                style={{ backgroundColor: `${typeColor}15`, color: typeColor }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor }} />
                                {TYPE_LABEL_MAP[q.type] ?? q.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold">
                                {q.score}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {q.mediaImageUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium"><ImageIcon className="w-3 h-3" />Ảnh</span>}
                                {q.mediaAudioUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-medium"><Music className="w-3 h-3" />Audio</span>}
                                {!q.mediaImageUrl && !q.mediaAudioUrl && <span className="text-slate-300 text-xs">—</span>}
                              </div>
                            </td>
                            {(assessCan.edit("question-bank") || assessCan.delete("question-bank")) && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  {assessCan.edit("question-bank") && (
                                    <Button variant="ghost" size="icon"
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                                      onClick={() => handleEditQuestion(q)} data-testid={`btn-edit-question-${idx}`}>
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {assessCan.delete("question-bank") && (
                                    <Button variant="ghost" size="icon"
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                      onClick={() => handleDeleteQuestion(q.id)} data-testid={`btn-delete-question-${idx}`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                total={filteredQuestions.length}
                page={questionsPage}
                pageSize={questionsPageSize}
                onPageChange={setQuestionsPage}
                onPageSizeChange={s => { setQuestionsPageSize(s); setQuestionsPage(1); }}
              />
            </div>
          </div>)}

          {activeTab === "results" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
            {/* ── Filter panel ── */}
            <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tên bài</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả bài kiểm tra"
                    options={submissionExamOptions}
                    selected={subExamIds}
                    onSelect={v => { setSubExamIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubExamIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Học viên</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả học viên"
                    options={submissionStudentOptions}
                    selected={subStudentIds}
                    onSelect={v => { setSubStudentIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubStudentIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1 min-w-[160px]">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lớp</span>
                  <SearchableMultiSelect
                    placeholder="Tất cả lớp"
                    options={submissionClassOptions}
                    selected={subClassIds}
                    onSelect={v => { setSubClassIds(prev => [...prev, v]); setSubmissionsPage(1); }}
                    onRemove={v => { setSubClassIds(prev => prev.filter(id => id !== v)); setSubmissionsPage(1); }}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời gian nộp</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" className="h-8 text-xs w-36 border-slate-200 rounded-xl" value={subDateFrom} onChange={e => { setSubDateFrom(e.target.value); setSubmissionsPage(1); }} data-testid="input-sub-date-from" />
                    <span className="text-xs text-slate-400">→</span>
                    <Input type="date" className="h-8 text-xs w-36 border-slate-200 rounded-xl" value={subDateTo} onChange={e => { setSubDateTo(e.target.value); setSubmissionsPage(1); }} data-testid="input-sub-date-to" />
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2 self-end">
                  {(subExamIds.length > 0 || subStudentIds.length > 0 || subClassIds.length > 0 || subDateFrom || subDateTo) && (
                    <button className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                      onClick={() => { setSubExamIds([]); setSubStudentIds([]); setSubClassIds([]); setSubDateFrom(""); setSubDateTo(""); setSubmissionsPage(1); }}>
                      ✕ Xóa bộ lọc
                    </button>
                  )}
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{filteredSubmissions.length} bài làm</span>
                </div>
              </div>
            </div>

            {/* ── Results table ── */}
            <TooltipProvider>
            <div className="flex-1 overflow-hidden flex flex-col rounded-2xl bg-white shadow-sm shadow-slate-200/60 border border-slate-200/80">
              <div className="flex-1 overflow-auto">
                <table className="w-full caption-bottom text-sm border-collapse" style={{ minWidth: 1100 }}>
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[150px]">Tên bài</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[160px]">Học viên</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[110px]">Lớp</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[100px]">TG làm bài</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[80px]">Điểm</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[100px]">Điểm Cập nhật</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[150px]">Chi tiết</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[90px]">AI Chấm</th>
                      {assessCan.edit("results") && <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[110px]">Nhận xét</th>}
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[130px]">Nộp lúc</th>
                      {assessCan.delete("results") && <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap w-[80px]">•••</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsLoading ? (
                      <tr><td colSpan={11} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                          <span className="text-sm">Đang tải kết quả...</span>
                        </div>
                      </td></tr>
                    ) : filteredSubmissions.length === 0 ? (
                      <tr><td colSpan={11} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <ClipboardList className="w-7 h-7 text-emerald-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-600 mb-0.5">
                              {submissions.length === 0 ? "Chưa có bài làm nào" : "Không có kết quả khớp"}
                            </p>
                            <p className="text-xs text-slate-400">
                              {submissions.length === 0 ? "Học viên nộp bài sẽ xuất hiện ở đây" : "Thử thay đổi bộ lọc"}
                            </p>
                          </div>
                        </div>
                      </td></tr>
                    ) : (
                      filteredSubmissions.slice((submissionsPage - 1) * submissionsPageSize, submissionsPage * submissionsPageSize).map((sub, idx) => {
                        const passingScore = parseFloat(sub.examPassingScore || "0");
                        const origScore = parseFloat(String(sub.score || "0"));
                        const aiResults = (sub.aiGradingResults as Record<string, any>) || {};
                        const aiEntries = Object.values(aiResults) as any[];
                        const hasOfficialAdjustedScore = sub.adjustedScore != null;
                        const officialScore = parseFloat(String(
                          hasOfficialAdjustedScore ? sub.adjustedScore : sub.score || "0",
                        ));
                        const aiSuggestedTotal = origScore + aiEntries.reduce((total, result) => {
                          if (result?.status === "error" || result?.suggestedScore == null) return total;
                          return total + (Number(result.suggestedScore) || 0);
                        }, 0);
                        const hasAIProvisionalScore = !hasOfficialAdjustedScore &&
                          aiEntries.some(result => result?.suggestedScore != null);
                        const adjScore = hasAIProvisionalScore ? aiSuggestedTotal : officialScore;
                        const passed = passingScore > 0 ? adjScore >= passingScore : null;

                        function fmtTime(s: number | null) {
                          if (!s) return "—";
                          const m = Math.floor(s / 60);
                          const sec = s % 60;
                          if (m === 0) return `${sec}s`;
                          return `${m}p ${sec}s`;
                        }

                        return (
                          <tr key={sub.id} data-testid={`row-submission-${idx}`}
                            className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors group">
                            {/* Exam name */}
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-semibold text-slate-800 line-clamp-1">{sub.examName || "—"}</span>
                                {sub.examCode && <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md w-fit">{sub.examCode}</span>}
                              </div>
                            </td>
                            {/* Student */}
                            <td className="px-4 py-3">
                              <StudentNameLink studentId={sub.studentId} name={sub.studentName || "—"} code={sub.studentCode} />
                            </td>
                            {/* Class */}
                            <td className="px-4 py-3">
                              {sub.className
                                ? <span className="text-sm text-slate-700">{sub.className}</span>
                                : <span className="text-xs text-slate-300 italic">Tự do</span>}
                            </td>
                            {/* Time taken */}
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-lg whitespace-nowrap">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {fmtTime(sub.timeTakenSeconds)}
                              </span>
                            </td>
                            {/* Original score */}
                            <td className="px-4 py-3 text-center">
                              <span className={cn(
                                "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold",
                                passed === true ? "bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200"
                                  : passed === false ? "bg-red-50 text-red-600 ring-2 ring-red-200"
                                  : "bg-slate-100 text-slate-700"
                              )}>
                                {origScore.toFixed(1)}
                              </span>
                            </td>
                            {/* Adjusted score (editable) */}
                            <td className="px-4 py-3 text-center">
                              {editingScoreId === sub.id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <Input className="h-7 w-16 text-xs text-center border-indigo-200 rounded-lg focus-visible:ring-indigo-300"
                                    value={editingScoreVal}
                                    onChange={e => setEditingScoreVal(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") updateSubmissionMutation.mutate({ id: sub.id, data: { adjustedScore: editingScoreVal } });
                                      if (e.key === "Escape") setEditingScoreId(null);
                                    }}
                                    autoFocus data-testid={`input-score-${idx}`} />
                                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-lg hover:bg-emerald-50"
                                    onClick={() => updateSubmissionMutation.mutate({ id: sub.id, data: { adjustedScore: editingScoreVal } })}>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  className={cn(
                                    "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold border-2 border-dashed transition-all hover:border-solid",
                                    hasAIProvisionalScore ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                      : passed === true ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      : passed === false ? "border-red-300 text-red-600 hover:bg-red-50"
                                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                  )}
                                  onClick={() => { setEditingScoreId(sub.id); setEditingScoreVal(String(adjScore)); }}
                                  data-testid={`btn-adj-score-${idx}`}
                                  title={hasAIProvisionalScore
                                    ? "Điểm AI đề xuất, chưa chính thức — nhấn để chỉnh và lưu"
                                    : "Nhấn để chỉnh điểm"}
                                >
                                  {adjScore.toFixed(1)}
                                </button>
                              )}
                              {hasAIProvisionalScore && editingScoreId !== sub.id && (
                                <span className="block mt-1 text-[10px] text-amber-600 whitespace-nowrap">
                                  AI đề xuất
                                </span>
                              )}
                            </td>
                            {/* Part scores */}
                            <td className="px-4 py-3">
                              {sub.partScores && (sub.partScores as any[]).length > 0 ? (
                                <div className="space-y-0.5">
                                  {(sub.partScores as any[]).map((ps: any, pi: number) => (
                                    <div key={pi} className="text-[11px] whitespace-nowrap">
                                      <span className="text-slate-400">{ps.partName?.split(":")[0]}:</span>{" "}
                                      <span className="text-slate-600 font-medium">{ps.correct}/{ps.total}</span>
                                      <span className="text-slate-400"> · {Number(ps.score).toFixed(0)}đ</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            {/* AI grading */}
                            <td className="px-4 py-3 text-center">
                              {(() => {
                                const results = (sub.aiGradingResults as Record<string, any>) || {};
                                const resultKeys = Object.keys(results);
                                const gradedCount = resultKeys.length;
                                const acceptedCount = resultKeys.filter(k => results[k].status === "accepted" || results[k].status === "adjusted").length;
                                 const completedCount = resultKeys.filter(k =>
                                   results[k].status === "accepted" ||
                                   results[k].status === "adjusted" ||
                                   (results[k].status === "pending" && results[k].suggestedScore != null),
                                 ).length;
                                 const isStillGrading = resultKeys.some(k =>
                                   results[k].status === "pending" &&
                                   (results[k].suggestedScore == null || results[k].gradedAt == null),
                                 );
                                const isTriggering = triggeringAIIds.has(sub.id);

                                if (isTriggering || (sub.hasAIGrading && sub.aiGradingResults == null)) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-50 text-violet-500 text-[10px] font-medium">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      {isTriggering ? "Đang chấm" : "Xử lý..."}
                                    </span>
                                  );
                                }

                                if (gradedCount > 0) {
                                  const allDone = acceptedCount === gradedCount;
                                  return (
                                    <button
                                      className={cn(
                                        "inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-semibold border transition-all hover:shadow-sm",
                                        allDone
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                          : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                      )}
                                      onClick={() => setAIReviewSub(sub)}
                                      data-testid={`btn-ai-review-${idx}`}
                                    >
                                      <span className="flex items-center gap-0.5">
                                        <BrainCircuit className="w-3 h-3" />
                                         {completedCount}/{gradedCount}
                                      </span>
                                       <span className="opacity-70">
                                         {isStillGrading ? "Đang chấm" : allDone ? "Hoàn tất" : "Chờ duyệt"}
                                       </span>
                                    </button>
                                  );
                                }

                                return <span className="text-slate-300 text-xs">—</span>;
                              })()}
                            </td>
                            {/* Comment */}
                            {assessCan.edit("results") && (
                              <td className="px-4 py-3">
                                {sub.comment ? (
                                  <button
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors"
                                    onClick={() => setCommentDialogData({ submissionId: sub.id, studentName: sub.studentName || "", examTitle: sub.examName || "", comment: sub.comment ?? null, startInEditMode: false })}
                                    data-testid={`btn-comment-${idx}`}
                                  >
                                    <Eye className="w-3 h-3" /> Xem
                                  </button>
                                ) : (
                                  <button
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-400 text-xs font-medium hover:bg-slate-50 hover:text-slate-600 border border-dashed border-slate-200 transition-colors"
                                    onClick={() => setCommentDialogData({ submissionId: sub.id, studentName: sub.studentName || "", examTitle: sub.examName || "", comment: null, startInEditMode: true })}
                                    data-testid={`btn-add-comment-${idx}`}
                                  >
                                    <MessageSquare className="w-3 h-3" /> Nhận xét
                                  </button>
                                )}
                              </td>
                            )}
                            {/* Submit time */}
                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-500 whitespace-nowrap">
                                {new Date(sub.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </td>
                            {/* Actions */}
                            {assessCan.delete("results") && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <Button variant="ghost" size="icon"
                                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Xem bài làm" data-testid={`btn-view-submission-${idx}`}
                                    onClick={() => { const exam = exams.find(e => e.id === sub.examId); if (exam) setViewingSubmission({ sub, exam }); }}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon"
                                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Xóa" data-testid={`btn-delete-submission-${idx}`}
                                    onClick={() => deleteSubmissionMutation.mutate(sub.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
          </div>)}

        </div>
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

      {cloningExam && (
        <ExamFormDialog
          open={!!cloningExam}
          mode="clone"
          exam={{
            ...cloningExam,
            code: null,
            name: `${cloningExam.name} (Bản sao)`,
            status: "draft",
          } as any}
          onClose={() => setCloningExam(null)}
          onSave={(data) => cloneExamMutation.mutate({ sourceId: cloningExam.id, data })}
          isSaving={cloneExamMutation.isPending}
        />
      )}

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

      {commentDialogData && (
        <ExamCommentDialog
          open={!!commentDialogData}
          onClose={() => setCommentDialogData(null)}
          submissionId={commentDialogData.submissionId}
          studentName={commentDialogData.studentName}
          examTitle={commentDialogData.examTitle}
          initialComment={commentDialogData.comment}
          startInEditMode={commentDialogData.startInEditMode}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/exam-submissions"] })}
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
                    const isError = r.status === "error";
                    const isDone = isAccepted || isAdjusted;

                    return (
                      <div key={sqId} className={cn(
                        "border rounded-lg overflow-hidden",
                        isDone ? "border-green-200" : isError ? "border-red-200" : "border-yellow-200"
                      )}>
                        <div className={cn(
                          "px-4 py-2.5 flex items-center justify-between",
                          isDone ? "bg-green-50" : isError ? "bg-red-50" : "bg-yellow-50"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">Câu tự luận {qi + 1}</span>
                            {isDone ? (
                              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                {isAdjusted ? "Đã điều chỉnh" : "Đã xác nhận"}
                              </Badge>
                            ) : isError ? (
                              <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]" title={
                                r.errorReason === "daily_quota" ? "Đã hết hạn mức API miễn phí trong ngày (20 req/ngày). Thử lại vào ngày mai hoặc nâng cấp lên API trả phí." :
                                r.errorReason === "rate_limit" ? "Vượt quá giới hạn tốc độ API. Thử chấm lại sau vài phút." :
                                "Lỗi không xác định khi gọi AI. Thử chấm lại."
                              }>
                                <AlertCircle className="w-3 h-3 mr-0.5" />
                                {r.errorReason === "daily_quota" ? "Hết quota ngày" : "Lỗi chấm AI"}
                              </Badge>
                            ) : r.suggestedScore != null ? (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px]">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                Đã chấm · chờ xác nhận
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50 text-[10px]">
                                <Clock className="w-3 h-3 mr-0.5" />
                                Đang chấm
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!isError && (
                              <span className={cn(
                                "text-sm font-bold",
                                isDone ? "text-green-700" : "text-yellow-700"
                              )}>
                                {r.suggestedScore} / {r.maxScore} điểm
                              </span>
                            )}
                            {!isDone && !isError && (
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
                              {r.durationMs != null && (
                                <span className="text-[11px] text-muted-foreground">
                                  {r.provider ? `${r.provider} · ` : ""}
                                  {(r.durationMs / 1000).toFixed(1)} giây
                                </span>
                              )}
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
