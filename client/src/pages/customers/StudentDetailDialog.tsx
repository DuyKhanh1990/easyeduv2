import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Facebook } from "lucide-react";

import { X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, STATIC_STALE_TIME, getAuthHeaders } from "@/lib/queryClient";
import { StudentFeePackagesTab } from "@/components/customers/StudentFeePackagesTab";
import { StudentInvoicesTab } from "@/components/customers/StudentInvoicesTab";
import { StudentFeeWalletTab } from "@/components/customers/StudentFeeWalletTab";
import { StudentScoreTab } from "@/components/customers/StudentScoreTab";
import { StudentReviewTab } from "@/components/customers/StudentReviewTab";
import { StudentOverviewTab } from "@/components/customers/StudentOverviewTab";
import { StudentAppointmentsTab } from "@/components/customers/StudentAppointmentsTab";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

const TABS = [
  { value: "overview",      labelKey: "studentDetail.tab.overview",      color: "#6366f1", gradientFrom: "#6366f1", gradientTo: "#8b5cf6" },
  { value: "appointments",  labelKey: "studentDetail.tab.appointments",  color: "#0d9488", gradientFrom: "#0d9488", gradientTo: "#0891b2" },
  { value: "discussion",    labelKey: "studentDetail.tab.discussion",    color: "#f97316", gradientFrom: "#f97316", gradientTo: "#f59e0b" },
  { value: "classes",       labelKey: "studentDetail.tab.classes",       color: "#0891b2", gradientFrom: "#0891b2", gradientTo: "#06b6d4" },
  { value: "fee-packages",  labelKey: "studentDetail.tab.feePackages",   color: "#7c3aed", gradientFrom: "#7c3aed", gradientTo: "#a855f7" },
  { value: "invoices",      labelKey: "studentDetail.tab.invoices",      color: "#16a34a", gradientFrom: "#16a34a", gradientTo: "#059669" },
  { value: "fee-wallet",    labelKey: "studentDetail.tab.feeWallet",     color: "#0369a1", gradientFrom: "#0369a1", gradientTo: "#0ea5e9" },
  { value: "score-review",  labelKey: "studentDetail.tab.scoreReview",   color: "#be185d", gradientFrom: "#be185d", gradientTo: "#e11d48" },
] as const;

const SCORE_REVIEW_SUB_TABS = [
  { value: "score",  labelKey: "studentDetail.tab.score" },
  { value: "review", labelKey: "studentDetail.tab.review" },
] as const;

interface StudentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
  starBalance?: number;
  prefetchedTasks?: any[];
}

interface Comment {
  id: string;
  studentId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
  };
}

interface CommentWithUser extends Comment {
  authorName: string;
  authorCode: string;
}

export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
  starBalance,
  prefetchedTasks,
}: StudentDetailDialogProps) {
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState("");
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [scoreReviewSubTab, setScoreReviewSubTab] = useState<"score" | "review">("score");
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsPageSize, setSessionsPageSize] = useState(20);
  const queryClient = useQueryClient();

  // Deferred mount flag: queries are NOT enabled on the first render so React
  // can paint the dialog shell (header/skeleton) before any network traffic
  // starts. Double RAF ensures we yield past the browser paint cycle.
  const [queryReady, setQueryReady] = useState(false);
  useEffect(() => {
    if (open) {
      let id1: number, id2: number;
      id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setQueryReady(true));
      });
      return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
    } else {
      setQueryReady(false);
    }
  }, [open]);

  // Facebook conversations linked to this student
  const { data: fbConversations = [] } = useQuery<any[]>({
    queryKey: ["/api/facebook/conversations", "student", student?.id],
    queryFn: () => apiRequest("GET", `/api/facebook/conversations?studentId=${student!.id}`).then(r => r.json()),
    enabled: !!student?.id && queryReady,
    staleTime: 30_000,
  });

  // Fetch comments
  const { data: commentsData = [], isLoading, refetch: refetchComments } = useQuery({
    queryKey: [`/api/students/${student?.id}/comments`],
    queryFn: async () => {
      if (!student?.id) return [];
      const res = await fetch(`/api/students/${student.id}/comments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!student?.id && open && queryReady,
    staleTime: 60_000,
  });

  // Fetch classes
  const { data: classesData = [], isLoading: isLoadingClasses, isFetching: isFetchingClasses, refetch: refetchClasses } = useQuery({
    queryKey: [`/api/students/${student?.id}/classes`],
    queryFn: async () => {
      if (!student?.id) return [];
      const res = await fetch(`/api/students/${student.id}/classes`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!student?.id && open && queryReady,
    staleTime: 60_000,
  });

  const selectedClassId = (classesData as any[])[selectedClassIndex]?.class?.id ?? null;

  const navigateToClassSession = (session: any) => {
    const classSessionId = session.classSession?.id;
    if (!selectedClassId || !classSessionId) return;
    const classSessionUrl =
      `/classes/${selectedClassId}?tab=schedule&sessionId=${encodeURIComponent(classSessionId)}`;
    window.open(classSessionUrl, "_blank", "noopener,noreferrer");
  };

  // Fetch paginated sessions for the selected class (server-side pagination)
  const { data: pagedSessionsData, isLoading: isLoadingSessions } = useQuery<{
    sessions: any[]; total: number; page: number; limit: number; totalPages: number;
  }>({
    queryKey: [`/api/students/${student?.id}/classes/${selectedClassId}/sessions`, sessionsPage, sessionsPageSize],
    queryFn: async () => {
      if (!student?.id || !selectedClassId) return { sessions: [], total: 0, page: 1, limit: sessionsPageSize, totalPages: 1 };
      const res = await fetch(
        `/api/students/${student.id}/classes/${selectedClassId}/sessions?page=${sessionsPage}&limit=${sessionsPageSize}`,
        { credentials: "include" }
      );
      if (!res.ok) return { sessions: [], total: 0, page: 1, limit: sessionsPageSize, totalPages: 1 };
      return res.json();
    },
    enabled: !!student?.id && !!selectedClassId && open && queryReady && activeTab === "classes",
    staleTime: 30_000,
  });

  // Fetch attendance fee rules to know which statuses deduct fees.
  // Only needed in the "classes" tab (calculateStats), so fetch lazily.
  const { data: attendanceFeeRules = [] } = useQuery({
    queryKey: ['/api/attendance-fee-rules'],
    queryFn: async () => {
      const res = await fetch('/api/attendance-fee-rules');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && activeTab === "classes",
    staleTime: STATIC_STALE_TIME,
  });

  const deductingStatuses = new Set(
    (attendanceFeeRules as any[])
      .filter((r: any) => r.deductsFee)
      .map((r: any) => r.attendanceStatus)
  );

  // Invalidate child-tab caches when switching to fee-packages or invoices tabs.
  // Comments/classes refetch is intentionally removed: mutations already call
  // invalidateQueries on those keys, and staleTime (60s) handles background
  // freshness — manually calling refetch on every tab switch caused redundant
  // network requests.
  useEffect(() => {
    if (!open || !student?.id) return;
    if (activeTab === "fee-packages" || activeTab === "invoices") {
      queryClient.invalidateQueries({ queryKey: ["/api/students", student.id, activeTab === "fee-packages" ? "fee-packages" : "invoices"] });
    }
    if (activeTab === "fee-wallet") {
      queryClient.invalidateQueries({ queryKey: ["/api/students", student.id, "fee-wallet"] });
    }
    if (activeTab === "classes") {
      queryClient.invalidateQueries({ queryKey: [`/api/students/${student.id}/classes`] });
    }
  }, [activeTab, open]);

  // Reset to overview tab when opening a new student
  useEffect(() => {
    if (open) setActiveTab("overview");
  }, [student?.id]);

  // Reset sessions page when switching class tab
  useEffect(() => { setSessionsPage(1); }, [selectedClassIndex]);

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/students/${student.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: () => {
      setInputValue("");
      queryClient.invalidateQueries({ queryKey: [`/api/students/${student?.id}/comments`] });
    },
  });

  const handleSend = () => {
    if (inputValue.trim()) {
      createCommentMutation.mutate(inputValue);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  };

  const getDayName = (dateStr: string) => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[new Date(dateStr).getDay()];
  };

  const formatSessionDate = (dateStr: string) => {
    const day = new Date(dateStr).getDate().toString().padStart(2, "0");
    const month = (new Date(dateStr).getMonth() + 1).toString().padStart(2, "0");
    const year = new Date(dateStr).getFullYear();
    const dayName = getDayName(dateStr);
    return `${dayName}, ${day}/${month}/${year}`;
  };

  const formatCourseTime = (startTime: string, endTime: string) => {
    return `${startTime} - ${endTime}`;
  };


  // Process comments to include author info
  const processedComments: CommentWithUser[] = commentsData.map((comment: Comment) => ({
    ...comment,
    authorName: comment.user?.username || "Unknown",
    authorCode: "ADMIN",
  }));

  if (!open || !student) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-hidden flex flex-col bg-background">
        {/* ── Gradient header – colour follows active tab ── */}
        <div
          className="flex-shrink-0 relative overflow-hidden transition-all duration-300"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)" }}
        >
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-6 left-1/3 w-28 h-28 rounded-full bg-white/10 blur-2xl" />

          {/* Title row */}
          <div className="relative z-10 flex items-center gap-2 px-5 pt-3 pb-2">
            {/* Avatar initials */}
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow">
              {student.fullName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <h2 className="text-sm font-bold text-white truncate max-w-[220px]">
              {student.fullName}
            </h2>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenChange(false); }}
              className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 transition-colors text-white shrink-0"
              aria-label="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab bar – glassmorphism pills */}
          <div className="relative z-10 flex items-center gap-1.5 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  data-testid={`tab-${tab.value}`}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none flex-shrink-0 ${
                    isActive
                      ? "bg-white text-gray-800 shadow-md shadow-black/20"
                      : "bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: isActive ? TABS.find(t => t.value === tab.value)?.gradientFrom : "rgba(255,255,255,0.7)" }}
                  />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Independent layout: Tổng quan ── */}
          {activeTab === "overview" && (
            <div className="flex-1 overflow-hidden">
              <StudentOverviewTab
                studentId={student.id}
                student={student}
                classesData={classesData}
                processedComments={processedComments}
                starBalance={starBalance}
                prefetchedTasks={prefetchedTasks}
                open={open}
              />
            </div>
          )}

          {/* ── Independent layout: Lịch hẹn ── */}
          {activeTab === "appointments" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <StudentAppointmentsTab studentId={student.id} open={open} />
            </div>
          )}

          {/* ── Independent layout: Bảng điểm – Nhận xét ── */}
          {activeTab === "score-review" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 bg-slate-100 border-b border-slate-200"
              >
                {SCORE_REVIEW_SUB_TABS.map((sub) => {
                  const isActive = scoreReviewSubTab === sub.value;
                  return (
                    <button
                      key={sub.value}
                      onClick={() => setScoreReviewSubTab(sub.value as "score" | "review")}
                      data-testid={`score-review-sub-${sub.value}`}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 focus:outline-none ${
                        isActive
                          ? "bg-white text-slate-700 shadow-sm shadow-black/10 border border-slate-200"
                          : "text-slate-500 hover:bg-white/70 hover:text-slate-700"
                      }`}
                    >
                      {t(sub.labelKey)}
                    </button>
                  );
                })}
              </div>
              {scoreReviewSubTab === "score" ? (
                <StudentScoreTab studentId={student.id} open={open} />
              ) : (
                <StudentReviewTab studentId={student.id} open={open} />
              )}
            </div>
          )}

          {/* Left Sidebar – shown only for non score-review, non-overview, non-appointments tabs */}
          {activeTab !== "score-review" && activeTab !== "overview" && activeTab !== "appointments" && (
          <div className="w-72 border-r bg-white overflow-y-auto p-5 space-y-5">
            {/* Basic info section */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("studentDetail.sidebar.basicInfo")}</h3>
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.studentCode")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 font-mono text-right">{student.code}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.type")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.type}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.status")}</span>
                  <span className="text-[11px] font-semibold text-indigo-600 text-right">{student.accountStatus}</span>
                </div>
              </div>
            </div>

            {/* Contact section */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("studentDetail.sidebar.contact")}</h3>
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.phone")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.phone || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">Email</span>
                  <span className="text-[11px] font-semibold text-blue-600 break-all text-right">{student.email || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.address") || "Địa chỉ"}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.address || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">Zalo/FB</span>
                  <span className="text-[11px] font-semibold text-gray-700 break-all text-right">{student.socialLink || "—"}</span>
                </div>
                {fbConversations.length > 0 && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-1">
                      <Facebook className="w-3 h-3 text-blue-600" /> Facebook
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      {fbConversations.map((conv: any) => (
                        <a
                          key={conv.id}
                          href={`/facebook?conv=${conv.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-blue-600 hover:underline text-right truncate max-w-[140px]"
                        >
                          {conv.userName ?? conv.psid}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Parents section */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("studentDetail.sidebar.parents")}</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">{t("studentDetail.sidebar.parent1")}</p>
                  <p className="text-[11px] font-semibold text-gray-700">{student.parentName || "—"}</p>
                  <p className="text-[11px] text-gray-500">{student.parentPhone || "—"}</p>
                </div>
                {student.parentName2 && (
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">{t("studentDetail.sidebar.parent2")}</p>
                    <p className="text-[11px] font-semibold text-gray-700">{student.parentName2}</p>
                    <p className="text-[11px] text-gray-500">{student.parentPhone2 || "—"}</p>
                  </div>
                )}
                {student.parentName3 && (
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">{t("studentDetail.sidebar.parent3")}</p>
                    <p className="text-[11px] font-semibold text-gray-700">{student.parentName3}</p>
                    <p className="text-[11px] text-gray-500">{student.parentPhone3 || "—"}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Other info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("studentDetail.sidebar.otherInfo")}</h3>
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.dob")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.dateOfBirth || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.level")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.academicLevel || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">{t("studentDetail.sidebar.source")}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{student.source || "—"}</span>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Right Content Area – chỉ render tab đang active, không mount các tab còn lại */}
          {activeTab !== "score-review" && activeTab !== "overview" && activeTab !== "appointments" && (
          <div className="flex-1 overflow-hidden flex flex-col bg-white">

            {/* ── Thảo luận ── */}
            {activeTab === "discussion" && (
              <div className="h-full w-full flex flex-col bg-slate-50">
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {isLoading ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <p className="text-sm">{t("studentDetail.discussion.loading")}</p>
                    </div>
                  ) : processedComments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      </div>
                      <p className="text-sm">{t("studentDetail.discussion.empty")}</p>
                    </div>
                  ) : (
                    processedComments.map((comment) => {
                      const initials = (comment.authorName || "?").slice(0, 1).toUpperCase();
                      return (
                        <div key={comment.id} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold text-sm">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-700">{comment.authorName}</span>
                              <span className="text-[10px] text-gray-400 font-mono">({comment.authorCode})</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{formatDateTime(comment.createdAt)}</span>
                            </div>
                            <div className="bg-white border border-gray-100 rounded-xl rounded-tl-none px-3.5 py-2.5 shadow-sm">
                              <p className="text-sm text-gray-800 break-words leading-relaxed">{comment.content}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t bg-white px-5 py-3.5 flex-shrink-0 shadow-sm">
                  <div className="flex gap-2 items-center">
                    <Input
                      type="text"
                      placeholder={t("studentDetail.discussion.placeholder")}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => { if (e.key === "Enter") handleSend(); }}
                      disabled={createCommentMutation.isPending}
                      className="flex-1 rounded-full border-gray-200 bg-gray-50 focus:bg-white text-sm"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!inputValue.trim() || createCommentMutation.isPending}
                      size="sm"
                      className="px-4 py-2 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
                    >
                      {t("studentDetail.discussion.send")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Lớp học ── */}
            {activeTab === "classes" && (
              <div className="h-full w-full flex flex-col overflow-hidden">
                {isLoadingClasses ? (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <p>Đang tải...</p>
                  </div>
                ) : classesData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <p>Học viên chưa đăng ký lớp nào</p>
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col">
                    <div className="border-b bg-gray-50 flex overflow-x-auto items-center">
                      <div className="flex flex-1 overflow-x-auto">
                        {classesData.map((item: any, index: number) => (
                          <button
                            key={item.studentClass?.id || index}
                            onClick={() => setSelectedClassIndex(index)}
                            className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                              selectedClassIndex === index
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            {item.class?.name} ({item.class?.classCode})
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => refetchClasses()}
                        disabled={isFetchingClasses}
                        className="flex items-center gap-1.5 px-2.5 py-1 mx-2 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white transition-colors disabled:opacity-50 shrink-0"
                        title="Làm mới dữ liệu lớp học"
                      >
                        <RefreshCw className={`h-3 w-3 ${isFetchingClasses ? "animate-spin" : ""}`} />
                        Làm mới
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto flex flex-col bg-white">
                      {classesData[selectedClassIndex] && (
                        <div className="flex-1 flex flex-col">
                          {(() => {
                            const cls = classesData[selectedClassIndex];
                            const paid      = Number(cls.invoicePaidTotal  || 0);
                            const attended  = Number(cls.attendedFeeTotal  || 0);
                            const remaining = paid - attended;
                            const notAttended = Number(cls.notAttendedCount || 0);
                            const total       = Number(cls.totalSessions    || 0);
                            return (
                              <div className="p-3 border-b grid grid-cols-4 gap-2">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                                  <p className="text-xs text-blue-600 font-semibold mb-1">Đã thanh toán</p>
                                  <p className="text-lg font-bold text-blue-700">{paid.toLocaleString('vi-VN')} VND</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                                  <p className="text-xs text-green-600 font-semibold mb-1">Đã học</p>
                                  <p className="text-lg font-bold text-green-700">{attended.toLocaleString('vi-VN')} VND</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                                  <p className="text-xs text-orange-600 font-semibold mb-1">Còn lại</p>
                                  <p className="text-lg font-bold text-orange-700">{remaining.toLocaleString('vi-VN')} VND</p>
                                </div>
                                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Chưa điểm danh</p>
                                  <p className="text-lg font-bold text-gray-700">{notAttended}/{total}</p>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex-1 overflow-x-auto p-4">
                            {(() => {
                              const paginatedSessions = pagedSessionsData?.sessions ?? [];
                              const totalSessions = pagedSessionsData?.total ?? 0;
                              const totalPages = pagedSessionsData?.totalPages ?? 1;
                              const from = totalSessions === 0 ? 0 : (sessionsPage - 1) * sessionsPageSize + 1;
                              const to = Math.min(sessionsPage * sessionsPageSize, totalSessions);
                              return (
                                <div className="flex flex-col gap-3">
                                  <table className="w-full text-sm border-collapse">
                                    <thead>
                                      <tr className="border-b-2 border-gray-300 bg-gray-50">
                                        <th className="text-left p-2 font-semibold text-gray-700">Buổi học</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Ca học</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Ngày</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Điểm danh</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Tên Học phí</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Học phí gốc</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Học phí áp dụng</th>
                                        <th className="text-left p-2 font-semibold text-gray-700">Loại</th>
                                        <th className="text-right p-2 font-semibold text-gray-700">Học phí</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {paginatedSessions.length > 0 ? (
                                        paginatedSessions.map((session: any, idx: number) => {
                                          const shiftTemplate = session.shiftTemplate;
                                          const packageType = session.studentSession?.packageType || "buổi";
                                          const sessionPrice = Number(session.studentSession?.sessionPrice || 0);
                                          const attendanceStatus = session.studentSession?.attendanceStatus;
                                          const isAttended = attendanceStatus === 'present';
                                          const isDeducted = !!attendanceStatus && deductingStatuses.has(attendanceStatus);
                                          const allocatedFee = session.allocatedFee != null ? Number(session.allocatedFee) : null;
                                          const deductAmount = allocatedFee != null ? allocatedFee : sessionPrice;
                                          const feeDisplay = isDeducted
                                            ? (packageType === 'buổi'
                                              ? `-${deductAmount.toLocaleString('vi-VN')} VND`
                                              : `-1 buổi`)
                                            : '- VND';
                                          return (
                                            <tr key={session.studentSession?.id || idx} className="border-b border-gray-200 hover:bg-gray-50">
                                               <td className="p-2">
                                                 {session.classSession?.id ? (
                                                   <button
                                                     type="button"
                                                     className="font-medium text-sky-600 hover:text-sky-800 hover:underline"
                                                     onClick={() => navigateToClassSession(session)}
                                                     aria-label={`Mở Buổi ${session.studentSession?.sessionOrder || (sessionsPage - 1) * sessionsPageSize + idx + 1} trong lịch học`}
                                                   >
                                                     Buổi {session.studentSession?.sessionOrder || (sessionsPage - 1) * sessionsPageSize + idx + 1}
                                                   </button>
                                                 ) : (
                                                   <>Buổi {session.studentSession?.sessionOrder || (sessionsPage - 1) * sessionsPageSize + idx + 1}</>
                                                 )}
                                               </td>
                                              <td className="p-2">
                                                {shiftTemplate ? (
                                                  <div>
                                                    <div>ca {shiftTemplate.name}</div>
                                                    <div className="text-xs text-gray-500">{formatCourseTime(shiftTemplate.startTime, shiftTemplate.endTime)}</div>
                                                  </div>
                                                ) : "N/A"}
                                              </td>
                                              <td className="p-2">
                                                {session.classSession?.sessionDate ? formatSessionDate(session.classSession.sessionDate) : "N/A"}
                                              </td>
                                              <td className="p-2">
                                                <span className={`text-xs px-2 py-1 rounded font-medium ${
                                                  isAttended ? 'bg-green-100 text-green-700' :
                                                  attendanceStatus === 'absent' ? 'bg-red-100 text-red-700' :
                                                  'bg-gray-100 text-gray-700'
                                                }`}>
                                                  {isAttended ? 'Có mặt' : attendanceStatus === 'absent' ? 'Vắng' : 'Chưa điểm danh'}
                                                </span>
                                              </td>
                                              <td className="p-2 text-gray-600">{session.feePackage?.name || 'N/A'}</td>
                                              <td className="p-2 text-gray-600">{sessionPrice.toLocaleString('vi-VN')} VND</td>
                                              <td className="p-2 text-gray-600">
                                                {session.allocatedFee != null
                                                  ? <span className="text-blue-700 font-medium">{Number(session.allocatedFee).toLocaleString('vi-VN')} VND</span>
                                                  : <span className="text-gray-400">-</span>}
                                              </td>
                                              <td className="p-2 text-gray-600">{packageType === 'buổi' ? 'Buổi' : 'Khoá'}</td>
                                              <td className="p-2 text-right">
                                                <span className={isDeducted ? "text-red-600 font-medium" : "text-gray-400"}>
                                                  {feeDisplay}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td colSpan={9} className="p-4 text-center text-gray-500">
                                            Không có buổi học nào
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                  {totalSessions > 0 && (
                                    <div className="flex items-center justify-between text-sm text-gray-600 pt-1">
                                      <span className="text-xs text-gray-500">{from}–{to} / {totalSessions} buổi</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">Hiển thị:</span>
                                        <select
                                          value={sessionsPageSize}
                                          onChange={e => { setSessionsPageSize(Number(e.target.value)); setSessionsPage(1); }}
                                          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none"
                                        >
                                          {[20, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                        <button
                                          onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                                          disabled={sessionsPage === 1}
                                          className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >‹</button>
                                        <span className="text-xs">{sessionsPage} / {totalPages || 1}</span>
                                        <button
                                          onClick={() => setSessionsPage(p => Math.min(totalPages, p + 1))}
                                          disabled={sessionsPage >= totalPages}
                                          className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >›</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Gói học phí – chỉ mount khi tab active ── */}
            {activeTab === "fee-packages" && (
              <div className="flex-1 overflow-hidden">
                <StudentFeePackagesTab studentId={student.id} open={open} />
              </div>
            )}

            {/* ── Hoá đơn – chỉ mount khi tab active ── */}
            {activeTab === "invoices" && (
              <div className="flex-1 overflow-hidden">
                <StudentInvoicesTab studentId={student.id} open={open} />
              </div>
            )}

            {/* ── Ví học phí – chỉ mount khi tab active ── */}
            {activeTab === "fee-wallet" && (
              <div className="flex-1 overflow-hidden">
                <StudentFeeWalletTab studentId={student.id} open={open} />
              </div>
            )}

          </div>
          )}
        </div>
    </div>,
    document.body
  );
}
