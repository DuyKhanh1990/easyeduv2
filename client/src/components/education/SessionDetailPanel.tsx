import { useState } from "react";
import { RichContentRenderer } from "@/components/ui/rich-content-renderer";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AddStudentToSessionDialog } from "./AddStudentToSessionDialog";
import { SessionStudentTable } from "./SessionStudentTable";
import { BulkChangeCycleDialog } from "./BulkChangeCycleDialog";
import type { ClassPermissions } from "@/pages/education/ClassDetail";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  UserCog,
  Calendar,
  MapPin,
  Users,
  BookOpen,
  GraduationCap,
  Star,
  Wifi,
  WifiOff,
  Pencil,
  ClipboardList,
  Link2,
  Check,
  X,
  DoorOpen,
} from "lucide-react";

interface SessionDetailPanelProps {
  classData: any;
  updateAttendanceMutation: { mutate: Function; isPending: boolean };
  classSessions: any[] | undefined;
  selectedClassSessionId: string | null;
  currentSessionStudents: any[] | undefined;
  isLoadingSessionStudents: boolean;
  currentSessionContents: any[] | undefined;
  allEvaluationCriteria: any[] | undefined;
  filteredAvailableStudentsForSession: any[];
  combinedCandidates: any[];
  isLoadingAvailableStudents: boolean;
  activeStudents: any[] | undefined;
  selectedStudentIds: string[];
  setSelectedStudentIds: (ids: string[]) => void;
  isActionMenuOpen: boolean;
  setIsActionMenuOpen: (open: boolean) => void;
  isAddStudentToSessionOpen: boolean;
  setIsAddStudentToSessionOpen: (open: boolean) => void;
  searchTermForSession: string;
  setSearchTermForSession: (term: string) => void;
  selectedStudentsForSession: string[];
  setSelectedStudentsForSession: (ids: string[]) => void;
  setStudentsForScheduleFromSession: (students: any[]) => void;
  setIsScheduleForSessionOpen: (open: boolean) => void;
  setIsExtensionOpen: (open: boolean) => void;
  setIsMakeupDialogOpen: (open: boolean) => void;
  setSelectedForMakeup: (students: any[]) => void;
  setSelectedStudentForTransfer: (student: any) => void;
  setIsTransferOpen: (open: boolean) => void;
  setIsBulkAttendanceDialogOpen: (open: boolean) => void;
  setIsChangeTuitionPackageDialogOpen: (open: boolean) => void;
  setReviewTarget: (target: any) => void;
  setIsReviewDialogOpen: (open: boolean) => void;
  setStudentToRemove: (data: any) => void;
  setIsRemoveStudentDialogOpen: (open: boolean) => void;
  setIsApplyProgramOpen: (open: boolean) => void;
  setApplyProgramFromIdx: (idx: number) => void;
  setApplyProgramToIdx: (idx: number) => void;
  setApplyProgramId: (id: string) => void;
  setIsApplyCriteriaOpen: (open: boolean) => void;
  setApplyCriteriaFromIdx: (idx: number) => void;
  setApplyCriteriaToIdx: (idx: number) => void;
  setApplyCriteriaId: (id: string) => void;
  allScoreSheets?: any[] | undefined;
  setIsApplyScoreSheetOpen: (open: boolean) => void;
  setApplyScoreSheetFromIdx: (idx: number) => void;
  setApplyScoreSheetToIdx: (idx: number) => void;
  setApplyScoreSheetId: (id: string) => void;
  setIsSessionContentDialogOpen: (open: boolean) => void;
  onViewContent?: (contentId: string | null, fallback?: { title: string; type: string; content?: string | null; sessionNumber?: number | null } | null, contentType?: string) => void;
  mode?: "info" | "students" | "all";
  classPerm?: ClassPermissions;
}

export function SessionDetailPanel({
  classData,
  updateAttendanceMutation,
  classSessions,
  selectedClassSessionId,
  currentSessionStudents,
  isLoadingSessionStudents,
  currentSessionContents,
  allEvaluationCriteria,
  filteredAvailableStudentsForSession,
  combinedCandidates,
  isLoadingAvailableStudents,
  activeStudents,
  selectedStudentIds,
  setSelectedStudentIds,
  isActionMenuOpen,
  setIsActionMenuOpen,
  isAddStudentToSessionOpen,
  setIsAddStudentToSessionOpen,
  searchTermForSession,
  setSearchTermForSession,
  selectedStudentsForSession,
  setSelectedStudentsForSession,
  setStudentsForScheduleFromSession,
  setIsScheduleForSessionOpen,
  setIsExtensionOpen,
  setIsMakeupDialogOpen,
  setSelectedForMakeup,
  setSelectedStudentForTransfer,
  setIsTransferOpen,
  setIsBulkAttendanceDialogOpen,
  setIsChangeTuitionPackageDialogOpen,
  mode = "all",
  setReviewTarget,
  setIsReviewDialogOpen,
  setStudentToRemove,
  setIsRemoveStudentDialogOpen,
  setIsApplyProgramOpen,
  setApplyProgramFromIdx,
  setApplyProgramToIdx,
  setApplyProgramId,
  setIsApplyCriteriaOpen,
  setApplyCriteriaFromIdx,
  setApplyCriteriaToIdx,
  setApplyCriteriaId,
  allScoreSheets,
  setIsApplyScoreSheetOpen,
  setApplyScoreSheetFromIdx,
  setApplyScoreSheetToIdx,
  setApplyScoreSheetId,
  setIsSessionContentDialogOpen,
  onViewContent,
  classPerm,
}: SessionDetailPanelProps) {
  const { toast } = useToast();
  const canAdd = classPerm?.canAdd ?? true;
  const canEdit = classPerm?.canEdit ?? true;
  const canDelete = classPerm?.canDelete ?? true;
  const [selectedContent, setSelectedContent] = useState<{
    id: string;
    title: string;
    description: string | null;
    contentType: string;
    resourceUrl: string | null;
  } | null>(null);

  const [isBulkChangeCycleOpen, setIsBulkChangeCycleOpen] = useState(false);

  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkInputValue, setLinkInputValue] = useState("");

  const updateOnlineLinkMutation = useMutation({
    mutationFn: (link: string) =>
      apiRequest("PATCH", `/api/classes/${classData?.id}`, { onlineLink: link || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classData?.id}`] });
      setIsEditingLink(false);
      toast({ title: "Đã cập nhật link online" });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể cập nhật link online", variant: "destructive" });
    },
  });

  function detectOnlinePlatform(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname.includes("meet.google")) return "Google Meet";
      if (hostname.includes("zoom.us")) return "Zoom";
      if (hostname.includes("teams.microsoft") || hostname.includes("teams.live")) return "Microsoft Teams";
      if (hostname.includes("webex")) return "Webex";
      if (hostname.includes("whereby")) return "Whereby";
      if (hostname.includes("skype")) return "Skype";
      return hostname.replace(/^www\./, "");
    } catch {
      return "Link";
    }
  }

  const session = classSessions?.find((s) => s.id === selectedClassSessionId);

  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/classrooms?locationId=${classData?.locationId}`);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      return res.json();
    },
    enabled: !!classData?.locationId,
  });

  const NULL_UUID = "00000000-0000-0000-0000-000000000000";
  const sessionRoomId = session?.roomId && session.roomId !== NULL_UUID ? session.roomId : null;
  const roomName = sessionRoomId ? (classrooms?.find((r: any) => r.id === sessionRoomId)?.name ?? null) : null;

  if (!selectedClassSessionId) {
    if (mode === "students") {
      return (
        <div className="flex flex-col items-center justify-center py-10 bg-muted/20 rounded-xl border-2 border-dashed">
          <Calendar className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
          <p className="text-muted-foreground font-medium text-sm">
            Vui lòng chọn một buổi học để xem danh sách học viên
          </p>
        </div>
      );
    }
    if (mode === "info") {
      return (
        <div className="flex flex-col items-center justify-center py-10 bg-muted/20 rounded-xl border-2 border-dashed h-full">
          <Calendar className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
          <p className="text-muted-foreground font-medium text-sm text-center px-4">
            Chọn buổi học để xem thông tin
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-muted/20 rounded-xl border-2 border-dashed">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <p className="text-muted-foreground font-medium">
          Vui lòng chọn một buổi học để xem chi tiết
        </p>
      </div>
    );
  }

  const totalSessions = classSessions?.length || 0;
  const sessionIndex = (classSessions?.indexOf(session) ?? -1) + 1;
  const isOnline = classData?.learningFormat === "online";
  const teacherName =
    (session?.teachers?.length > 0
      ? session.teachers.map((t: any) => t.fullName).join(", ")
      : null) ||
    (classData?.teachers?.length > 0
      ? classData.teachers.map((t: any) => t.fullName).join(", ")
      : "Chưa gán");
  const sessionDate = session?.sessionDate ? new Date(session.sessionDate) : null;
  const dayOfWeekLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const dayLabel = sessionDate ? dayOfWeekLabels[sessionDate.getDay()] : "";
  const dateFormatted = sessionDate ? format(sessionDate, "d/M/yyyy") : "";
  const startTime = session?.shiftTemplate?.startTime?.slice(0, 5) || "";
  const endTime = session?.shiftTemplate?.endTime?.slice(0, 5) || "";
  const sessionTimeStr = dayLabel && dateFormatted
    ? `${dayLabel}, ${dateFormatted}${startTime ? ` ${startTime}` : ""}${endTime ? ` - ${endTime}` : ""}`
    : "—";

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const clsStart = classData?.startDate ? new Date(classData.startDate) : null;
  const clsEnd = classData?.endDate ? new Date(classData.endDate) : null;
  const computedStatus = !clsStart || !clsEnd
    ? null
    : today < clsStart
      ? { label: "Đang tuyển sinh", className: "bg-yellow-100 text-yellow-700 border-yellow-200" }
      : today > clsEnd
        ? { label: "Kết thúc", className: "bg-gray-100 text-gray-600 border-gray-200" }
        : { label: "Đang học", className: "bg-green-100 text-green-700 border-green-200" };

  const studentCount = currentSessionStudents?.length || 0;
  const maxStudents = classData?.maxStudents || 0;
  const studentProgress = maxStudents > 0 ? Math.round((studentCount / maxStudents) * 100) : 0;

  const sessionCriteriaIds = session?.evaluationCriteriaIds || [];
  const assignedCriteria = allEvaluationCriteria?.filter((c: any) =>
    sessionCriteriaIds.includes(c.id)
  ) || [];

  const sessionScoreSheetId = session?.scoreSheetId || null;
  const assignedScoreSheet = allScoreSheets?.find((s: any) => s.id === sessionScoreSheetId) || null;

  const infoCard = (
    <div className={`${mode === "info" ? "w-full" : "sticky top-0"} rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white`}>
      {/* ── Clean header ── */}
      <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider shrink-0">Buổi học</span>
          <span className="text-2xl font-extrabold text-slate-800 leading-none">
            {sessionIndex}
            <span className="text-base font-medium text-slate-600"> / {totalSessions}</span>
          </span>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold shrink-0 ${
          isOnline
            ? "bg-blue-50 text-blue-600 border border-blue-200"
            : "bg-slate-100 text-slate-500 border border-slate-200"
        }`}>
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      {/* Date row */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-white">
        <Calendar className="h-4 w-4 text-slate-600 shrink-0" />
        <span className="text-sm font-semibold text-slate-800">{sessionTimeStr}</span>
      </div>

      {/* ── Two-column body: left = basic info, right = program/criteria/scoresheet/link ── */}
      <div className="bg-white px-4 py-3 flex gap-4">
        {/* Left column */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Lớp */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-14 shrink-0 font-medium">Lớp:</span>
            <span className="text-sm font-semibold text-blue-600 flex-1 min-w-0 truncate">
              {classData?.name}{classData?.classCode ? ` (${classData.classCode})` : ""}
            </span>
            {computedStatus && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold shrink-0 ${computedStatus.className}`}>
                {computedStatus.label}
              </span>
            )}
          </div>
          {/* Cơ sở */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-14 shrink-0 font-medium">Cơ sở:</span>
            <span className="text-sm font-semibold text-blue-600 flex-1 min-w-0 truncate">{classData?.location?.name || "—"}</span>
          </div>
          {/* Phòng */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <DoorOpen className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-14 shrink-0 font-medium whitespace-nowrap">Phòng:</span>
            <span className="text-sm font-semibold text-blue-600 flex-1 min-w-0 truncate">
              {roomName ?? <span className="text-slate-400 italic font-normal">Chưa có phòng</span>}
            </span>
          </div>
          {/* GV */}
          <div className="flex items-start gap-2" data-testid="text-session-teacher">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
              <UserCog className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-14 shrink-0 mt-0.5 font-medium">GV:</span>
            <span className="text-sm font-semibold text-blue-600 flex-1 min-w-0 leading-snug break-words">{teacherName}</span>
          </div>
          {/* Sĩ số */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <Users className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-14 shrink-0 font-medium">Sĩ số:</span>
            <span className="text-sm font-semibold text-blue-600">{studentCount} / {maxStudents} HV</span>
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${studentProgress}%` }} />
              </div>
              <span className="text-xs text-slate-700 font-medium">{studentProgress}%</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-slate-100 self-stretch shrink-0" />

        {/* Right column */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Chương trình */}
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
              <GraduationCap className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-20 shrink-0 mt-0.5 font-medium whitespace-nowrap">Chương trình:</span>
            <span className="text-xs font-semibold text-blue-600 break-words min-w-0 flex-1 mt-0.5">{session?.program?.name || classData?.program?.name || <span className="text-slate-400 italic font-normal">Chưa xác định</span>}</span>
            {canEdit && (
              <button data-testid="btn-apply-program" className="shrink-0 text-slate-300 hover:text-indigo-500 transition-colors mt-0.5"
                onClick={() => { const i = session?.sessionIndex ?? 1; setApplyProgramFromIdx(i); setApplyProgramToIdx(i); setApplyProgramId(""); setIsApplyProgramOpen(true); }}>
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Tiêu chí */}
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
              <Star className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-20 shrink-0 mt-0.5 font-medium whitespace-nowrap">Tiêu chí:</span>
            <span className="text-xs font-semibold text-blue-600 break-words min-w-0 flex-1 mt-0.5">
              {assignedCriteria.length > 0 ? assignedCriteria.map((c: any) => c.name).join(", ") : <span className="text-slate-400 italic font-normal">Chưa xác định</span>}
            </span>
            {canEdit && (
              <button data-testid="btn-apply-criteria" className="shrink-0 text-slate-300 hover:text-indigo-500 transition-colors mt-0.5"
                onClick={() => { const i = session?.sessionIndex ?? 1; setApplyCriteriaFromIdx(i); setApplyCriteriaToIdx(i); setApplyCriteriaId(""); setIsApplyCriteriaOpen(true); }}>
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Bảng điểm */}
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
              <ClipboardList className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-20 shrink-0 mt-0.5 font-medium whitespace-nowrap">Bảng điểm:</span>
            <span className="text-xs font-semibold text-blue-600 break-words min-w-0 flex-1 mt-0.5">
              {assignedScoreSheet ? assignedScoreSheet.name : <span className="text-slate-400 italic font-normal">Chưa xác định</span>}
            </span>
            {canEdit && (
              <button data-testid="btn-apply-score-sheet" className="shrink-0 text-slate-300 hover:text-indigo-500 transition-colors mt-0.5"
                onClick={() => { const i = session?.sessionIndex ?? 1; setApplyScoreSheetFromIdx(i); setApplyScoreSheetToIdx(i); setApplyScoreSheetId(sessionScoreSheetId || ""); setIsApplyScoreSheetOpen(true); }}>
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Link online */}
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
              <Link2 className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-600 w-20 shrink-0 mt-0.5 font-medium whitespace-nowrap">Link online:</span>
            {isEditingLink ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <Input data-testid="input-online-link" className="h-6 text-[11px] px-1.5 py-0 flex-1 min-w-0"
                  value={linkInputValue} onChange={(e) => setLinkInputValue(e.target.value)} placeholder="https://..." autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") updateOnlineLinkMutation.mutate(linkInputValue); if (e.key === "Escape") setIsEditingLink(false); }} />
                <button data-testid="btn-save-online-link" className="shrink-0 text-green-600 hover:text-green-700 transition-colors"
                  onClick={() => updateOnlineLinkMutation.mutate(linkInputValue)} disabled={updateOnlineLinkMutation.isPending}>
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button data-testid="btn-cancel-online-link" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => setIsEditingLink(false)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className="text-xs font-semibold break-words min-w-0 flex-1 mt-0.5">
                  {classData?.onlineLink ? (
                    <a href={classData.onlineLink} target="_blank" rel="noopener noreferrer"
                       className="text-blue-600 hover:underline" data-testid="link-online-meeting">
                      {detectOnlinePlatform(classData.onlineLink)}
                    </a>
                  ) : (
                    <span className="text-slate-400 italic font-normal">Chưa có</span>
                  )}
                </span>
                {canEdit && (
                  <button data-testid="btn-edit-online-link" className="shrink-0 text-slate-300 hover:text-indigo-500 transition-colors mt-0.5"
                    onClick={() => { setLinkInputValue(classData?.onlineLink || ""); setIsEditingLink(true); }}>
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
          {session?.status === "cancelled" && (
            <div className="mt-1 px-2.5 py-2 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-[10px] text-red-500 uppercase font-bold mb-0.5">Lý do huỷ</p>
              <p className="text-xs text-red-400 italic">{session.cancelReason || "Không có lý do"}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Session content ── */}
      <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 rounded-b-2xl">
        <p className="text-[10px] text-slate-800 uppercase font-bold tracking-wider mb-2">Nội dung buổi học</p>
              {currentSessionContents && currentSessionContents.length > 0 ? (
                (() => {
                  const grouped = currentSessionContents.reduce(
                    (acc: any, item: any) => {
                      if (!acc[item.contentType]) acc[item.contentType] = [];
                      acc[item.contentType].push({
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        contentType: item.contentType,
                        resourceUrl: item.resourceUrl,
                      });
                      return acc;
                    },
                    {}
                  );
                  const typeLabels: Record<string, string> = {
                    "Bài học": "Bài học",
                    "Bài tập về nhà": "BTVN",
                    "Giáo trình": "Giáo trình",
                    "Bài kiểm tra": "Bài kiểm tra",
                  };
                  return Object.entries(grouped).map(([type, items]: [string, any]) => (
                    <div key={type} className="mb-2">
                      <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                        {typeLabels[type] || type}:
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {(items as { id: string; title: string; description: string | null; contentType: string; resourceUrl: string | null }[]).map((item, idx: number) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span className="text-slate-600 text-[11px] mt-0.5 shrink-0">•</span>
                            <button
                              className="text-blue-700 hover:underline font-medium text-left text-[12px] leading-snug break-words min-w-0"
                              onClick={() => {
                                if (onViewContent) {
                                  onViewContent(
                                    item.resourceUrl || null,
                                    item.resourceUrl ? null : { title: item.title, type: item.contentType, content: item.description },
                                    item.contentType
                                  );
                                } else {
                                  setSelectedContent(item);
                                }
                              }}
                            >
                              {item.title}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              ) : (
                <p className="text-xs text-slate-700 italic">Chưa có nội dung</p>
              )}
      </div>
    </div>
  );

  const studentListCard = (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm shadow-slate-100">
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Danh sách học viên
          </span>
          <span className="text-[10px] text-slate-800 font-medium">
            ({currentSessionStudents?.length || 0})
          </span>
          <div className="ml-auto flex items-center gap-1">
              {canAdd && (
              <AddStudentToSessionDialog
                open={isAddStudentToSessionOpen}
                onOpenChange={setIsAddStudentToSessionOpen}
                searchTerm={searchTermForSession}
                onSearchChange={setSearchTermForSession}
                selectedIds={selectedStudentsForSession}
                onSelectionChange={setSelectedStudentsForSession}
                filteredCandidates={filteredAvailableStudentsForSession}
                allCandidates={combinedCandidates}
                isLoading={isLoadingAvailableStudents}
                classId={classData?.id}
                locationId={classData?.locationId}
                onConfirm={(students) => {
                  setStudentsForScheduleFromSession(students);
                  setIsScheduleForSessionOpen(true);
                }}
              />
              )}

              {canEdit && (
              <Button
                variant={selectedStudentIds.length > 0 ? "default" : "outline"}
                size="sm"
                className={`h-7 px-2 text-[10px] ${
                  selectedStudentIds.length > 0
                    ? "bg-green-600 hover:bg-green-700 border-green-600 text-white"
                    : ""
                }`}
                onClick={() => {
                  if (selectedStudentIds.length > 0) setIsExtensionOpen(true);
                }}
                disabled={selectedStudentIds.length === 0}
              >
                Gia hạn
              </Button>
              )}

              {canEdit && (
              <Button
                variant={
                  currentSessionStudents?.some(
                    (s) =>
                      s.attendanceStatus === "makeup_wait" &&
                      selectedStudentIds.includes(s.studentId)
                  )
                    ? "default"
                    : "outline"
                }
                size="sm"
                className={`h-7 px-2 text-[10px] ${
                  currentSessionStudents?.some(
                    (s) =>
                      s.attendanceStatus === "makeup_wait" &&
                      selectedStudentIds.includes(s.studentId)
                  )
                    ? "bg-blue-600 hover:bg-blue-700 border-blue-600 text-white"
                    : ""
                }`}
                onClick={() => {
                  const makeupStudents =
                    currentSessionStudents
                      ?.filter(
                        (s) =>
                          s.attendanceStatus === "makeup_wait" &&
                          selectedStudentIds.includes(s.studentId)
                      )
                      .map((s) => {
                        const activeStudent = activeStudents?.find(
                          (as) => as.studentId === s.studentId
                        );
                        return {
                          ...s,
                          sessionIndex: classSessions?.find(
                            (cs) => cs.id === selectedClassSessionId
                          )?.sessionIndex,
                          sessionDate: classSessions?.find(
                            (cs) => cs.id === selectedClassSessionId
                          )?.sessionDate,
                          startTime: classSessions?.find(
                            (cs) => cs.id === selectedClassSessionId
                          )?.shiftTemplate?.startTime,
                          endTime: classSessions?.find(
                            (cs) => cs.id === selectedClassSessionId
                          )?.shiftTemplate?.endTime,
                          allStudentSessions:
                            activeStudent?.studentSessions || [],
                        };
                      }) || [];
                  if (makeupStudents.length > 0) {
                    setSelectedForMakeup(makeupStudents.map((s) => s.studentId));
                    setIsMakeupDialogOpen(true);
                  }
                }}
                disabled={
                  !currentSessionStudents?.some(
                    (s) =>
                      s.attendanceStatus === "makeup_wait" &&
                      selectedStudentIds.includes(s.studentId)
                  )
                }
              >
                Xếp bù
              </Button>
              )}

              {canAdd && (
              <Popover open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={selectedStudentIds.length > 0 ? "default" : "outline"}
                    size="sm"
                    className={`h-7 px-2 text-[10px] ${
                      selectedStudentIds.length > 0
                        ? "bg-gray-700 hover:bg-gray-800 border-gray-700 text-white"
                        : ""
                    }`}
                    disabled={selectedStudentIds.length === 0}
                  >
                    Hành động
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-white dark:bg-slate-950 opacity-100">
                  <div className="flex flex-col gap-2">
                    {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs h-8"
                      onClick={() => setIsBulkAttendanceDialogOpen(true)}
                    >
                      Điểm danh hàng loạt
                    </Button>
                    )}
                    {canEdit && (classData?.weekdays ?? []).length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs h-8 text-purple-600 dark:text-purple-400"
                      onClick={() => {
                        setIsBulkChangeCycleOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                      data-testid="button-bulk-change-cycle"
                    >
                      Đổi chu kỳ học
                    </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs h-8"
                      onClick={() => {
                        const selected = currentSessionStudents?.filter((s) =>
                          selectedStudentIds.includes(s.studentId)
                        ) || [];
                        setReviewTarget({
                          ids: selected.map((s) => s.id),
                          names: selected.map((s) => s.student?.fullName || "Học viên"),
                        });
                        setIsReviewDialogOpen(true);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      Nhận xét hàng loạt
                    </Button>
                    {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => {
                        const currentSession = classSessions?.find(
                          (cs) => cs.id === selectedClassSessionId
                        );
                        if (currentSession && selectedStudentIds.length > 0) {
                          const firstStudent = currentSessionStudents?.find(
                            (s) => s.studentId === selectedStudentIds[0]
                          );
                          if (firstStudent?.studentClassId) {
                            setStudentToRemove({
                              studentIds: selectedStudentIds,
                              studentClassId: firstStudent.studentClassId,
                              fromSessionOrder: currentSession.sessionIndex || 1,
                              toSessionOrder: currentSession.sessionIndex || 1,
                            });
                            setIsRemoveStudentDialogOpen(true);
                            setIsActionMenuOpen(false);
                          }
                        }
                      }}
                      data-testid="button-delete-multiple-students"
                    >
                      Xoá nhiều
                    </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              )}
            </div>
          </div>
        <SessionStudentTable
          currentSessionStudents={currentSessionStudents}
          isLoadingSessionStudents={isLoadingSessionStudents}
          selectedStudentIds={selectedStudentIds}
          setSelectedStudentIds={setSelectedStudentIds}
          setIsActionMenuOpen={setIsActionMenuOpen}
          updateAttendanceMutation={updateAttendanceMutation}
          classSessions={classSessions}
          selectedClassSessionId={selectedClassSessionId}
          classPerm={classPerm}
          classData={classData}
          setStudentToRemove={setStudentToRemove}
          setIsRemoveStudentDialogOpen={setIsRemoveStudentDialogOpen}
          setReviewTarget={setReviewTarget}
          setIsReviewDialogOpen={setIsReviewDialogOpen}
          setIsChangeTuitionPackageDialogOpen={setIsChangeTuitionPackageDialogOpen}
          setSelectedStudentForTransfer={setSelectedStudentForTransfer}
          setIsTransferOpen={setIsTransferOpen}
        />
      </div>
  );

  const contentViewDialog = (
    <Dialog open={!!selectedContent} onOpenChange={(open) => { if (!open) setSelectedContent(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px] uppercase font-bold">
              {selectedContent?.contentType}
            </Badge>
          </div>
          <DialogTitle className="text-base font-bold leading-snug">{selectedContent?.title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {selectedContent?.description ? (
            <RichContentRenderer text={selectedContent.description} />
          ) : (
            <p className="text-sm text-muted-foreground italic">Không có nội dung chi tiết</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (mode === "info") {
    return (
      <>
        {infoCard}
        {contentViewDialog}
      </>
    );
  }

  const bulkCycleStudents = (currentSessionStudents ?? [])
    .filter((s) => selectedStudentIds.includes(s.studentId) && s.studentClassId)
    .map((s) => ({
      studentId: s.studentId,
      studentClassId: s.studentClassId,
      studentName: s.student?.fullName ?? "Học viên",
      currentWeekdays: s.scheduledWeekdays ?? null,
    }));

  // Detect effective weekdays for the currently selected session using the same
  // forward-walk algorithm as UpdateCycleDialog — walk forward until a weekday repeats,
  // then walk backward if needed (e.g. last few sessions).
  const effectiveClassWeekdays: number[] = (() => {
    if (!classSessions || !selectedClassSessionId) return classData?.weekdays ?? [];
    const allSorted = [...classSessions]
      .filter((s) => s.status !== "cancelled")
      .sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    const startPos = allSorted.findIndex((s) => s.id === selectedClassSessionId);
    if (startPos < 0) return classData?.weekdays ?? [];
    const seen: number[] = [];
    let forwardComplete = false;
    for (let i = startPos; i < allSorted.length; i++) {
      const wd = allSorted[i].weekday as number;
      if (seen.includes(wd)) { forwardComplete = true; break; }
      seen.push(wd);
    }
    if (!forwardComplete) {
      for (let i = startPos - 1; i >= 0; i--) {
        const wd = allSorted[i].weekday as number;
        if (seen.includes(wd)) break;
        seen.push(wd);
      }
    }
    return [...new Set(seen)].sort((a, b) => a - b);
  })();

  const currentSessionIndex = classSessions?.find((cs) => cs.id === selectedClassSessionId)?.sessionIndex;

  const bulkChangeCycleDialog = selectedClassSessionId && bulkCycleStudents.length > 0 ? (
    <BulkChangeCycleDialog
      open={isBulkChangeCycleOpen}
      onOpenChange={setIsBulkChangeCycleOpen}
      students={bulkCycleStudents}
      classWeekdays={effectiveClassWeekdays}
      classId={classData?.id ?? ""}
      selectedClassSessionId={selectedClassSessionId}
      classSessionIndex={currentSessionIndex}
    />
  ) : null;

  if (mode === "students") {
    return (
      <>
        {studentListCard}
        {bulkChangeCycleDialog}
      </>
    );
  }

  return (
    <>
      <div className="w-[17rem] shrink-0">
        {infoCard}
      </div>
      {studentListCard}
      {contentViewDialog}
      {bulkChangeCycleDialog}
    </>
  );
}
