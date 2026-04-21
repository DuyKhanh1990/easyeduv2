import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useScheduleTab, ScheduleHeaderActions } from "@/hooks/use-schedule-tab";
import { useClassMutations } from "@/hooks/use-class-mutations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpdateSessionDialog } from "@/components/education/UpdateSessionDialog";
import { UpdateCycleDialog } from "@/components/education/UpdateCycleDialog";
import { CancelSessionsDialog } from "@/components/education/CancelSessionsDialog";
import { ChangeTeacherDialog } from "@/components/education/ChangeTeacherDialog";
import { ExtensionDialog } from "@/components/education/ExtensionDialog";
import { MakeupDialog } from "@/components/education/MakeupDialog";
import { TransferClassDialog } from "@/components/education/TransferClassDialog";
import { DeleteScheduleDialog } from "@/components/education/DeleteScheduleDialog";
import { ExcludeSessionsDialog } from "@/components/education/ExcludeSessionsDialog";
import { RemoveStudentFromSessionDialog } from "@/components/education/RemoveStudentFromSessionDialog";
import { SessionContentDialog, ContentViewDialog, ExamViewerFromId } from "@/components/education/SessionContentDialog";
import { ScheduleDialog } from "@/components/education/ScheduleDialog";
import { ClassScheduleSetupDialog } from "@/components/education/ClassScheduleSetupDialog";
import { ReviewDialog } from "@/components/education/ReviewDialog";
import { SessionListPanel } from "@/components/education/SessionListPanel";
import { SessionDetailPanel } from "@/components/education/SessionDetailPanel";
import { SessionApplyProgramSection } from "@/components/education/SessionApplyProgramSection";

import type { ClassPermissions } from "@/pages/education/ClassDetail";

interface ScheduleTabContentProps {
  classId: string;
  classData: any;
  classSessions: any[] | undefined;
  waitingStudents: any[] | undefined;
  activeStudents: any[] | undefined;
  feePackages: any[] | undefined;
  onActionsChange?: (actions: ScheduleHeaderActions | null) => void;
  initialSessionId?: string | null;
  classPerm?: ClassPermissions;
}

export function ScheduleTabContent({
  classId,
  classData,
  classSessions,
  waitingStudents,
  activeStudents,
  feePackages,
  onActionsChange,
  initialSessionId,
  classPerm,
}: ScheduleTabContentProps) {
  const { toast } = useToast();

  const {
    selectedClassSessionId,
    setSelectedClassSessionId,
    sessionPage,
    setSessionPage,
    selectedStudentIds,
    setSelectedStudentIds,
    isActionMenuOpen,
    setIsActionMenuOpen,
    isCancelSessionsDialogOpen,
    setIsCancelSessionsDialogOpen,
    isDeleteScheduleOpen,
    setIsDeleteScheduleOpen,
    isExcludeSessionsOpen,
    setIsExcludeSessionsOpen,
    isUpdateSessionOpen,
    setIsUpdateSessionOpen,
    isUpdateCycleOpen,
    setIsUpdateCycleOpen,
    isChangeTeacherOpen,
    setIsChangeTeacherOpen,
    isExtensionOpen,
    setIsExtensionOpen,
    isMakeupDialogOpen,
    setIsMakeupDialogOpen,
    selectedForMakeup,
    setSelectedForMakeup,
    selectedSessionId,
    setSelectedSessionId,
    isBulkAttendanceDialogOpen,
    setIsBulkAttendanceDialogOpen,
    isChangeTuitionPackageDialogOpen,
    setIsChangeTuitionPackageDialogOpen,
    studentPackageSelections,
    setStudentPackageSelections,
    bulkPackageSelection,
    setBulkPackageSelection,
    fromSessionId,
    setFromSessionId,
    toSessionId,
    setToSessionId,
    showConflictDialog,
    setShowConflictDialog,
    pendingChangeData,
    setPendingChangeData,
    isSessionContentDialogOpen,
    setIsSessionContentDialogOpen,
    isTransferOpen,
    setIsTransferOpen,
    selectedStudentForTransfer,
    setSelectedStudentForTransfer,
    isRemoveStudentDialogOpen,
    setIsRemoveStudentDialogOpen,
    studentToRemove,
    setStudentToRemove,
    isAddStudentToSessionOpen,
    setIsAddStudentToSessionOpen,
    searchTermForSession,
    setSearchTermForSession,
    selectedStudentsForSession,
    setSelectedStudentsForSession,
    isScheduleForSessionOpen,
    setIsScheduleForSessionOpen,
    studentsForScheduleFromSession,
    setStudentsForScheduleFromSession,
    isReviewDialogOpen,
    setIsReviewDialogOpen,
    reviewTarget,
    setReviewTarget,
    isApplyProgramOpen,
    setIsApplyProgramOpen,
    applyProgramId,
    setApplyProgramId,
    applyProgramFromIdx,
    setApplyProgramFromIdx,
    applyProgramToIdx,
    setApplyProgramToIdx,
    isApplyCriteriaOpen,
    setIsApplyCriteriaOpen,
    applyCriteriaId,
    setApplyCriteriaId,
    applyCriteriaFromIdx,
    setApplyCriteriaFromIdx,
    applyCriteriaToIdx,
    setApplyCriteriaToIdx,
    isApplyScoreSheetOpen,
    setIsApplyScoreSheetOpen,
    applyScoreSheetId,
    setApplyScoreSheetId,
    applyScoreSheetFromIdx,
    setApplyScoreSheetFromIdx,
    applyScoreSheetToIdx,
    setApplyScoreSheetToIdx,
  } = useScheduleTab({ classId, classSessions, onActionsChange, initialSessionId });

  const [freshSessions, setFreshSessions] = useState<any[] | null>(null);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);

  // Intercept setIsScheduleForSessionOpen — if class has no sessions, open setup dialog first
  const handleOpenScheduleForSession = (open: boolean) => {
    if (open && Array.isArray(classSessions) && classSessions.length === 0) {
      setIsSetupDialogOpen(true);
    } else {
      setIsScheduleForSessionOpen(open);
    }
  };

  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null; sessionNumber?: number | null } | null>(null);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);

  const handleViewContent = (contentId: string | null, fallback?: { title: string; type: string; content?: string | null; sessionNumber?: number | null } | null, contentType?: string) => {
    if (contentType === "Bài kiểm tra" && contentId) {
      setViewingExamId(contentId);
      return;
    }
    setViewingContentId(contentId);
    setViewingFallbackContent(fallback ?? null);
  };

  // ── Change tuition package dialog – new local state ────────────────────────
  const [studentNewPkgIds, setStudentNewPkgIds] = useState<Record<string, string>>({});
  const [studentDiscountIds, setStudentDiscountIds] = useState<Record<string, string[]>>({});
  const [studentSurchargeIds, setStudentSurchargeIds] = useState<Record<string, string[]>>({});
  const [bulkNewPkgId, setBulkNewPkgId] = useState<string>("");
  const [openPromoStudentId, setOpenPromoStudentId] = useState<string | null>(null);
  const [openSurchargeStudentId, setOpenSurchargeStudentId] = useState<string | null>(null);

  const fmtMoney = (n: number) => Math.round(n).toLocaleString("vi-VN");

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
    enabled: isChangeTuitionPackageDialogOpen,
  });
  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
    enabled: isChangeTuitionPackageDialogOpen,
  });

  // Fetch student sessions (with fee info) for the first selected student
  // Used to annotate each session in the "Từ buổi / Đến buổi" dropdowns
  const firstSelectedStudentId = selectedStudentIds[0] ?? null;
  const { data: firstStudentSessions = [] } = useQuery<any[]>({
    queryKey: ["/api/classes", classId, "student", firstSelectedStudentId, "sessions"],
    enabled: isChangeTuitionPackageDialogOpen && !!firstSelectedStudentId,
  });

  // Map: classSessionId → { packageName, sessionPrice }
  const sessionFeeMap = useMemo<Record<string, { packageName: string; sessionPrice: number }>>(() => {
    const map: Record<string, { packageName: string; sessionPrice: number }> = {};
    for (const ss of firstStudentSessions) {
      if (!ss.classSessionId) continue;
      map[ss.classSessionId] = {
        packageName: ss.feePackage?.name ?? "",
        sessionPrice: parseFloat(ss.sessionPrice ?? "0") || 0,
      };
    }
    return map;
  }, [firstStudentSessions]);

  // When exactly 1 student is selected, only show sessions that student is enrolled in
  const sessionsForDropdown = useMemo(() => {
    if (selectedStudentIds.length === 1 && firstStudentSessions.length > 0) {
      const studentClassSessionIds = new Set(firstStudentSessions.map((ss: any) => ss.classSessionId));
      return (classSessions || []).filter((cs: any) => studentClassSessionIds.has(cs.id));
    }
    return classSessions || [];
  }, [selectedStudentIds, firstStudentSessions, classSessions]);

  const tuitionSessionRange = useMemo(() => {
    if (!fromSessionId || !toSessionId || !classSessions) return { min: 0, max: 0, count: 0 };
    const from = classSessions.find((s: any) => s.id === fromSessionId);
    const to = classSessions.find((s: any) => s.id === toSessionId);
    if (!from || !to) return { min: 0, max: 0, count: 0 };
    const min = Math.min(from.sessionIndex ?? 0, to.sessionIndex ?? 0);
    const max = Math.max(from.sessionIndex ?? 0, to.sessionIndex ?? 0);
    // When 1 student selected, count only sessions that student is enrolled in
    const sessionsToCount = selectedStudentIds.length === 1 && firstStudentSessions.length > 0
      ? sessionsForDropdown
      : classSessions;
    const count = sessionsToCount.filter((s: any) => (s.sessionIndex ?? 0) >= min && (s.sessionIndex ?? 0) <= max).length;
    return { min, max, count };
  }, [fromSessionId, toSessionId, classSessions, selectedStudentIds, firstStudentSessions, sessionsForDropdown]);

  const { data: studentAllocatedFees = {} } = useQuery<Record<string, string>>({
    queryKey: [`/api/classes/${classId}/student-allocated-fees`, tuitionSessionRange.min, tuitionSessionRange.max],
    queryFn: () => fetch(`/api/classes/${classId}/student-allocated-fees?fromOrder=${tuitionSessionRange.min}&toOrder=${tuitionSessionRange.max}`).then(r => r.json()),
    enabled: isChangeTuitionPackageDialogOpen && tuitionSessionRange.count > 0,
  });

  const { data: currentSessionStudents, isLoading: isLoadingSessionStudents } = useQuery<any[]>({
    queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`],
    enabled: !!selectedClassSessionId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const calcTuitionTotals = useMemo(() => {
    if (!selectedStudentIds.length || !currentSessionStudents) return { oldTotal: 0, newTotal: 0, diff: 0 };
    let oldTotal = 0;
    let newTotal = 0;
    const count = tuitionSessionRange.count;
    for (const sid of selectedStudentIds) {
      const oldPrice = parseFloat(studentAllocatedFees[sid] ?? "0") || 0;
      oldTotal += oldPrice * count;

      const newPkgId = bulkNewPkgId || studentNewPkgIds[sid] || "";
      const newPkg = feePackages?.find((p: any) => p.id === newPkgId);
      const newPriceBase = parseFloat(newPkg?.fee ?? "0") || 0;

      const discounts = (studentDiscountIds[sid] ?? []).map((id: string) => promotionOptions.find((p: any) => p.id === id)).filter(Boolean);
      const surcharges = (studentSurchargeIds[sid] ?? []).map((id: string) => surchargeOptions.find((p: any) => p.id === id)).filter(Boolean);

      let discountAmt = 0;
      for (const d of discounts) {
        if (d.valueType === "percent") discountAmt += newPriceBase * (parseFloat(d.valueAmount) / 100);
        else discountAmt += parseFloat(d.valueAmount) || 0;
      }
      let surchargeAmt = 0;
      for (const s of surcharges) {
        if (s.valueType === "percent") surchargeAmt += newPriceBase * (parseFloat(s.valueAmount) / 100);
        else surchargeAmt += parseFloat(s.valueAmount) || 0;
      }
      const newApplied = Math.max(0, newPriceBase - discountAmt + surchargeAmt);
      newTotal += newApplied * count;
    }
    return { oldTotal, newTotal, diff: newTotal - oldTotal };
  }, [selectedStudentIds, currentSessionStudents, tuitionSessionRange, bulkNewPkgId, studentNewPkgIds, studentDiscountIds, studentSurchargeIds, feePackages, promotionOptions, surchargeOptions, studentAllocatedFees]);

  // Fresh active-students fetch used to populate allStudentSessions in the makeup dialog
  const { data: activeStudentsForMakeup } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: isMakeupDialogOpen,
    staleTime: 0,
  });

  const { data: currentSessionContents } = useQuery<any[]>({
    queryKey: [`/api/class-sessions/${selectedClassSessionId}/contents`],
    enabled: !!selectedClassSessionId,
    staleTime: 0,
  });

  const { data: allEvaluationCriteria } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
  });

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
  });

  const { data: availableStudentsForSession, isLoading: isLoadingAvailableStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/available-students`],
    enabled: isAddStudentToSessionOpen,
    staleTime: 0,
  });

  const sessionStudentIds = new Set((currentSessionStudents || []).map((s: any) => s.studentId));
  const enrolledNotInSession = [
    ...(activeStudents || []),
    ...(waitingStudents || []),
  ]
    .filter((s: any) => !sessionStudentIds.has(s.studentId))
    .map((s: any) => ({
      id: s.student?.id || s.studentId,
      fullName: s.student?.fullName || "",
      code: s.student?.code || "",
      source: "enrolled" as const,
    }));

  const enrolledStudentIds = new Set(enrolledNotInSession.map((s) => s.id));
  const availableNotInClass = (availableStudentsForSession || [])
    .filter((s: any) => !enrolledStudentIds.has(s.id))
    .map((s: any) => ({ ...s, source: "available" as const }));

  const combinedCandidates = [...enrolledNotInSession, ...availableNotInClass];

  const filteredAvailableStudentsForSession = combinedCandidates.filter(
    (s: any) =>
      !searchTermForSession ||
      s.fullName?.toLowerCase().includes(searchTermForSession.toLowerCase()) ||
      s.code?.toLowerCase().includes(searchTermForSession.toLowerCase())
  );

  const selectedStudentsForMakeup =
    currentSessionStudents
      ?.filter((s) => selectedForMakeup.includes(s.studentId))
      .map((s) => {
        // Prefer the freshly-fetched data (triggered when dialog opens) to guarantee
        // studentSessions is populated; fall back to the prop for immediate render.
        const studentPool = activeStudentsForMakeup ?? activeStudents ?? [];
        const activeStudent = studentPool.find((as: any) => as.studentId === s.studentId);
        return {
          ...s,
          allStudentSessions: activeStudent?.studentSessions ?? [],
        };
      }) || [];

  const {
    updateSessionMutation,
    updateCycleMutation,
    cancelSessionsMutation,
    changeTeacherMutation,
    makeupMutation,
    updateAttendanceMutation,
    updateTuitionPackageMutation,
    extensionMutation,
    scheduleMutation,
  } = useClassMutations(classId, selectedClassSessionId);
  return (
    <>
      <CancelSessionsDialog
        isOpen={isCancelSessionsDialogOpen}
        onOpenChange={setIsCancelSessionsDialogOpen}
        classSessions={classSessions || []}
        selectedSessionId={selectedSessionId}
        onConfirm={(data) => cancelSessionsMutation.mutate(data)}
        isPending={cancelSessionsMutation.isPending}
      />
      <ExcludeSessionsDialog
        isOpen={isExcludeSessionsOpen}
        onOpenChange={setIsExcludeSessionsOpen}
        classId={classId}
        currentSessionIndex={
          (classSessions?.findIndex((s: any) => s.id === selectedClassSessionId) ?? -1) + 1
        }
        classSessions={classSessions || []}
      />
      <DeleteScheduleDialog
        isOpen={isDeleteScheduleOpen}
        onOpenChange={setIsDeleteScheduleOpen}
        classId={classId}
        sessionId={selectedClassSessionId || ""}
        sessionIndex={
          (classSessions?.findIndex((s: any) => s.id === selectedClassSessionId) ?? -1) + 1
        }
      />
      {studentToRemove && (
        <RemoveStudentFromSessionDialog
          isOpen={isRemoveStudentDialogOpen}
          onOpenChange={(open) => {
            setIsRemoveStudentDialogOpen(open);
            if (!open) setStudentToRemove(null);
          }}
          studentIds={studentToRemove.studentIds}
          studentClassId={studentToRemove.studentClassId}
          fromSessionOrder={studentToRemove.fromSessionOrder}
          toSessionOrder={studentToRemove.toSessionOrder}
          classId={classId}
          classSessions={classSessions}
        />
      )}
      {isSetupDialogOpen && (
        <ClassScheduleSetupDialog
          isOpen={isSetupDialogOpen}
          onOpenChange={setIsSetupDialogOpen}
          classId={classId}
          classData={classData}
          locationId={classData?.locationId}
          onSuccess={(sessions) => {
            setFreshSessions(sessions);
            setIsScheduleForSessionOpen(true);
          }}
        />
      )}

      {isScheduleForSessionOpen && (
        <ScheduleDialog
          isOpen={isScheduleForSessionOpen}
          onOpenChange={(open) => {
            setIsScheduleForSessionOpen(open);
            if (!open) {
              setStudentsForScheduleFromSession([]);
              setSelectedStudentsForSession([]);
              setSearchTermForSession("");
              setFreshSessions(null);
            }
          }}
          students={studentsForScheduleFromSession}
          classData={classData}
          classSessions={freshSessions || classSessions || []}
          hasNoSessions={false}
          locationId={classData?.locationId}
          defaultStartDate={(() => {
            const sess = (freshSessions || classSessions)?.find((s: any) => s.id === selectedClassSessionId);
            return sess?.sessionDate ? new Date(sess.sessionDate) : undefined;
          })()}
          defaultEndType="date"
          onConfirm={(configs) =>
            scheduleMutation.mutate({ configs }, {
              onSuccess: () => {
                setStudentsForScheduleFromSession([]);
                setSelectedStudentsForSession([]);
                setSearchTermForSession("");
                setIsScheduleForSessionOpen(false);
                setFreshSessions(null);
              },
            })
          }
          isPending={scheduleMutation.isPending}
        />
      )}
      <UpdateCycleDialog
        isOpen={isUpdateCycleOpen}
        onOpenChange={setIsUpdateCycleOpen}
        classData={classData}
        classSessions={classSessions || []}
        isPending={updateCycleMutation.isPending}
        onConfirm={(data) => updateCycleMutation.mutate(data)}
        defaultFromSessionId={selectedClassSessionId || undefined}
      />
      <UpdateSessionDialog
        isOpen={isUpdateSessionOpen}
        onOpenChange={setIsUpdateSessionOpen}
        session={classSessions?.find((s) => s.id === selectedClassSessionId)}
        classData={classData}
        onConfirm={(data) => updateSessionMutation.mutate(data)}
        isPending={updateSessionMutation.isPending}
      />
      <SessionContentDialog
        isOpen={isSessionContentDialogOpen}
        onOpenChange={setIsSessionContentDialogOpen}
        classSessionId={selectedClassSessionId || ""}
        programId={classData?.programId}
      />
      <ContentViewDialog
        isOpen={!!viewingContentId || !!viewingFallbackContent}
        onOpenChange={(open) => { if (!open) { setViewingContentId(null); setViewingFallbackContent(null); } }}
        contentId={viewingContentId}
        fallbackContent={viewingFallbackContent}
      />
      <ExamViewerFromId
        examId={viewingExamId || ""}
        open={!!viewingExamId}
        onClose={() => setViewingExamId(null)}
      />
      <ReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={(open) => {
          setIsReviewDialogOpen(open);
          if (!open) setReviewTarget(null);
        }}
        studentSessionIds={reviewTarget?.ids || []}
        studentNames={reviewTarget?.names || []}
        criteria={(allEvaluationCriteria || []).filter((c: any) => {
          const sess = classSessions?.find((s: any) => s.id === selectedClassSessionId);
          const ids = sess?.evaluationCriteriaIds || [];
          return ids.includes(c.id);
        })}
        teachers={
          (classSessions?.find((s: any) => s.id === selectedClassSessionId)?.teachers || []) as { id: string; fullName: string }[]
        }
        existingReviewData={reviewTarget?.existing}
        existingPublished={reviewTarget?.existingPublished}
        classSessionId={selectedClassSessionId || ""}
      />

      <div className="flex gap-4 items-start">
        {/* Left column: Session list + Student list stacked */}
        <div className="flex-1 min-w-0 space-y-4">
          <SessionListPanel
            classSessions={classSessions}
            sessionPage={sessionPage}
            setSessionPage={setSessionPage}
            selectedClassSessionId={selectedClassSessionId}
            onSessionSelect={setSelectedClassSessionId}
            onActionsChange={onActionsChange}
            setIsSessionContentDialogOpen={setIsSessionContentDialogOpen}
            setIsUpdateSessionOpen={setIsUpdateSessionOpen}
            setIsChangeTeacherOpen={setIsChangeTeacherOpen}
            setSelectedSessionId={setSelectedSessionId}
            setIsCancelSessionsDialogOpen={setIsCancelSessionsDialogOpen}
            setIsUpdateCycleOpen={setIsUpdateCycleOpen}
            setIsExcludeSessionsOpen={setIsExcludeSessionsOpen}
            setIsDeleteScheduleOpen={setIsDeleteScheduleOpen}
            classPerm={classPerm}
            classId={classId}
          />
          {/* Student list - below session list */}
          <SessionDetailPanel
            mode="students"
            classData={classData}
            updateAttendanceMutation={updateAttendanceMutation}
            classSessions={classSessions}
            selectedClassSessionId={selectedClassSessionId}
            currentSessionStudents={currentSessionStudents}
            isLoadingSessionStudents={isLoadingSessionStudents}
            currentSessionContents={currentSessionContents}
            allEvaluationCriteria={allEvaluationCriteria}
            filteredAvailableStudentsForSession={filteredAvailableStudentsForSession}
            combinedCandidates={combinedCandidates}
            isLoadingAvailableStudents={isLoadingAvailableStudents}
            activeStudents={activeStudents}
            selectedStudentIds={selectedStudentIds}
            setSelectedStudentIds={setSelectedStudentIds}
            isActionMenuOpen={isActionMenuOpen}
            setIsActionMenuOpen={setIsActionMenuOpen}
            isAddStudentToSessionOpen={isAddStudentToSessionOpen}
            setIsAddStudentToSessionOpen={setIsAddStudentToSessionOpen}
            searchTermForSession={searchTermForSession}
            setSearchTermForSession={setSearchTermForSession}
            selectedStudentsForSession={selectedStudentsForSession}
            setSelectedStudentsForSession={setSelectedStudentsForSession}
            setStudentsForScheduleFromSession={setStudentsForScheduleFromSession}
            setIsScheduleForSessionOpen={handleOpenScheduleForSession}
            setIsExtensionOpen={setIsExtensionOpen}
            setIsMakeupDialogOpen={setIsMakeupDialogOpen}
            setSelectedForMakeup={setSelectedForMakeup}
            setSelectedStudentForTransfer={setSelectedStudentForTransfer}
            setIsTransferOpen={setIsTransferOpen}
            setIsBulkAttendanceDialogOpen={setIsBulkAttendanceDialogOpen}
            setIsChangeTuitionPackageDialogOpen={setIsChangeTuitionPackageDialogOpen}
            setReviewTarget={setReviewTarget}
            setIsReviewDialogOpen={setIsReviewDialogOpen}
            setStudentToRemove={setStudentToRemove}
            setIsRemoveStudentDialogOpen={setIsRemoveStudentDialogOpen}
            setIsApplyProgramOpen={setIsApplyProgramOpen}
            setApplyProgramFromIdx={setApplyProgramFromIdx}
            setApplyProgramToIdx={setApplyProgramToIdx}
            setApplyProgramId={setApplyProgramId}
            setIsApplyCriteriaOpen={setIsApplyCriteriaOpen}
            setApplyCriteriaFromIdx={setApplyCriteriaFromIdx}
            setApplyCriteriaToIdx={setApplyCriteriaToIdx}
            setApplyCriteriaId={setApplyCriteriaId}
            allScoreSheets={allScoreSheets}
            setIsApplyScoreSheetOpen={setIsApplyScoreSheetOpen}
            setApplyScoreSheetFromIdx={setApplyScoreSheetFromIdx}
            setApplyScoreSheetToIdx={setApplyScoreSheetToIdx}
            setApplyScoreSheetId={setApplyScoreSheetId}
            setIsSessionContentDialogOpen={setIsSessionContentDialogOpen}
            onViewContent={handleViewContent}
            classPerm={classPerm}
          />
        </div>

        {/* Right sidebar: Session info */}
        <div className="w-[22.5rem] shrink-0">
          <SessionDetailPanel
            mode="info"
            classData={classData}
            updateAttendanceMutation={updateAttendanceMutation}
            classSessions={classSessions}
            selectedClassSessionId={selectedClassSessionId}
            currentSessionStudents={currentSessionStudents}
            isLoadingSessionStudents={isLoadingSessionStudents}
            currentSessionContents={currentSessionContents}
            allEvaluationCriteria={allEvaluationCriteria}
            filteredAvailableStudentsForSession={filteredAvailableStudentsForSession}
            combinedCandidates={combinedCandidates}
            isLoadingAvailableStudents={isLoadingAvailableStudents}
            activeStudents={activeStudents}
            selectedStudentIds={selectedStudentIds}
            setSelectedStudentIds={setSelectedStudentIds}
            isActionMenuOpen={isActionMenuOpen}
            setIsActionMenuOpen={setIsActionMenuOpen}
            isAddStudentToSessionOpen={isAddStudentToSessionOpen}
            setIsAddStudentToSessionOpen={setIsAddStudentToSessionOpen}
            searchTermForSession={searchTermForSession}
            setSearchTermForSession={setSearchTermForSession}
            selectedStudentsForSession={selectedStudentsForSession}
            setSelectedStudentsForSession={setSelectedStudentsForSession}
            setStudentsForScheduleFromSession={setStudentsForScheduleFromSession}
            setIsScheduleForSessionOpen={handleOpenScheduleForSession}
            setIsExtensionOpen={setIsExtensionOpen}
            setIsMakeupDialogOpen={setIsMakeupDialogOpen}
            setSelectedForMakeup={setSelectedForMakeup}
            setSelectedStudentForTransfer={setSelectedStudentForTransfer}
            setIsTransferOpen={setIsTransferOpen}
            setIsBulkAttendanceDialogOpen={setIsBulkAttendanceDialogOpen}
            setIsChangeTuitionPackageDialogOpen={setIsChangeTuitionPackageDialogOpen}
            setReviewTarget={setReviewTarget}
            setIsReviewDialogOpen={setIsReviewDialogOpen}
            setStudentToRemove={setStudentToRemove}
            setIsRemoveStudentDialogOpen={setIsRemoveStudentDialogOpen}
            setIsApplyProgramOpen={setIsApplyProgramOpen}
            setApplyProgramFromIdx={setApplyProgramFromIdx}
            setApplyProgramToIdx={setApplyProgramToIdx}
            setApplyProgramId={setApplyProgramId}
            setIsApplyCriteriaOpen={setIsApplyCriteriaOpen}
            setApplyCriteriaFromIdx={setApplyCriteriaFromIdx}
            setApplyCriteriaToIdx={setApplyCriteriaToIdx}
            setApplyCriteriaId={setApplyCriteriaId}
            allScoreSheets={allScoreSheets}
            setIsApplyScoreSheetOpen={setIsApplyScoreSheetOpen}
            setApplyScoreSheetFromIdx={setApplyScoreSheetFromIdx}
            setApplyScoreSheetToIdx={setApplyScoreSheetToIdx}
            setApplyScoreSheetId={setApplyScoreSheetId}
            setIsSessionContentDialogOpen={setIsSessionContentDialogOpen}
            onViewContent={handleViewContent}
            classPerm={classPerm}
          />
        </div>
      </div>

      {/* === Dialogs rendered outside tab content === */}
      <ExtensionDialog
        isOpen={isExtensionOpen}
        onOpenChange={setIsExtensionOpen}
        classData={classData}
        classSessions={classSessions || []}
        activeStudents={activeStudents || []}
        feePackages={feePackages}
        selectedStudents={
          currentSessionStudents?.filter((s) =>
            selectedStudentIds.includes(s.studentId)
          ) || []
        }
        onConfirm={(data) =>
          extensionMutation.mutate(data, {
            onSuccess: () => setIsExtensionOpen(false),
          })
        }
        isPending={extensionMutation.isPending}
      />

      {isMakeupDialogOpen && (
        <MakeupDialog
          isOpen={isMakeupDialogOpen}
          onOpenChange={setIsMakeupDialogOpen}
          selectedStudents={selectedStudentsForMakeup}
          classSessions={classSessions || []}
          allClasses={[]}
          classId={classId}
          locationId={classData?.locationId}
          onConfirm={(data) => makeupMutation.mutate(data)}
          isPending={makeupMutation.isPending}
        />
      )}

      <ChangeTeacherDialog
        isOpen={isChangeTeacherOpen}
        onOpenChange={setIsChangeTeacherOpen}
        classData={classData}
        classSessions={classSessions || []}
        selectedSessionId={selectedClassSessionId ?? undefined}
        onConfirm={(data) => {
          setPendingChangeData(data);
          changeTeacherMutation.mutate(data);
        }}
        isPending={changeTeacherMutation.isPending}
      />

      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trùng lịch giảng dạy</DialogTitle>
            <DialogDescription>
              Giáo viên này đã có lớp khác trùng giờ. Bạn có chắc muốn tiếp tục không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConflictDialog(false)}>
              Hủy
            </Button>
            <Button
              variant="default"
              onClick={() =>
                changeTeacherMutation.mutate({ ...pendingChangeData, force: true })
              }
              disabled={changeTeacherMutation.isPending}
            >
              {changeTeacherMutation.isPending ? "Đang xử lý..." : "Vẫn đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isTransferOpen && selectedStudentForTransfer && (
        <TransferClassDialog
          isOpen={isTransferOpen}
          onClose={() => {
            setIsTransferOpen(false);
            setSelectedStudentForTransfer(null);
          }}
          student={selectedStudentForTransfer}
          currentClass={{
            id: classData?.id,
            name: classData?.name,
            classCode: classData?.classCode,
            locationId: classData?.locationId,
            teacherName:
              classData?.teachers?.length > 0
                ? classData.teachers.map((t: any) => t.fullName).join(", ")
                : undefined,
            weekdays: classData?.weekdays || [],
          }}
        />
      )}

      <Dialog
        open={isBulkAttendanceDialogOpen}
        onOpenChange={setIsBulkAttendanceDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Điểm danh hàng loạt</DialogTitle>
            <DialogDescription>
              Chọn trạng thái điểm danh cho {selectedStudentIds.length} học viên được chọn
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {[
              { status: "present", label: "Có học", color: "green" },
              { status: "absent", label: "Nghỉ học", color: "red" },
              { status: "makeup_wait", label: "Nghỉ chờ bù", color: "orange" },
              { status: "makeup_done", label: "Đã học bù", color: "blue" },
              { status: "paused", label: "Bảo lưu", color: "gray" },
            ].map(({ status, label, color }) => (
              <Button
                key={status}
                variant="outline"
                className={`w-full justify-start text-${color}-600 border-${color}-600 hover:bg-${color}-50 dark:hover:bg-${color}-950`}
                onClick={() => {
                  selectedStudentIds.forEach((studentId) => {
                    const student = currentSessionStudents?.find(
                      (s) => s.studentId === studentId
                    );
                    if (student) {
                      updateAttendanceMutation.mutate({
                        student_session_id: student.id,
                        attendance_status: status,
                      });
                    }
                  });
                  setIsBulkAttendanceDialogOpen(false);
                  setIsActionMenuOpen(false);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isChangeTuitionPackageDialogOpen}
        onOpenChange={(open) => {
          setIsChangeTuitionPackageDialogOpen(open);
          if (!open) {
            setStudentPackageSelections({});
            setBulkPackageSelection("");
            setFromSessionId("");
            setToSessionId("");
            setStudentNewPkgIds({});
            setStudentDiscountIds({});
            setStudentSurchargeIds({});
            setBulkNewPkgId("");
          } else {
            setFromSessionId(selectedClassSessionId || "");
            setToSessionId(selectedClassSessionId || "");
          }
        }}
      >
        <DialogContent className="max-w-full w-full p-0 flex flex-col h-[85vh]">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="text-base">Đổi gói học phí</DialogTitle>
            <DialogDescription className="text-xs">
              Đổi gói học phí cho {selectedStudentIds.length} học viên được chọn
            </DialogDescription>
          </DialogHeader>

          {/* Two-panel body */}
          <div className="flex flex-1 min-h-0 divide-x divide-border overflow-hidden">

            {/* ── LEFT PANEL – Gói học phí cũ ─────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="px-4 py-3 bg-muted/40 border-b shrink-0">
                <p className="text-sm font-semibold text-foreground">Gói học phí cũ</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Session range */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Khoảng buổi áp dụng</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-foreground mb-1 block">Từ buổi</label>
                      <Select value={fromSessionId} onValueChange={setFromSessionId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Chọn buổi bắt đầu" />
                        </SelectTrigger>
                        <SelectContent className="min-w-[340px]">
                          {sessionsForDropdown.map((session: any) => {
                            const feeInfo = sessionFeeMap[session.id];
                            return (
                              <SelectItem key={session.id} value={session.id} className="text-xs">
                                <span className="flex items-center gap-2 w-full">
                                  <span className="shrink-0 font-medium">
                                    Buổi {session.sessionIndex} – {session.sessionDate}
                                  </span>
                                  {feeInfo && (
                                    <span className="text-muted-foreground text-[11px] whitespace-nowrap">
                                      {feeInfo.packageName ? `${feeInfo.packageName}` : ""}
                                      {feeInfo.sessionPrice > 0
                                        ? ` (HP áp dụng: ${feeInfo.sessionPrice.toLocaleString("vi-VN")})`
                                        : ""}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-foreground mb-1 block">Đến buổi</label>
                      <Select value={toSessionId} onValueChange={setToSessionId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Chọn buổi kết thúc" />
                        </SelectTrigger>
                        <SelectContent className="min-w-[340px]">
                          {sessionsForDropdown.map((session: any) => {
                            const feeInfo = sessionFeeMap[session.id];
                            return (
                              <SelectItem key={session.id} value={session.id} className="text-xs">
                                <span className="flex items-center gap-2 w-full">
                                  <span className="shrink-0 font-medium">
                                    Buổi {session.sessionIndex} – {session.sessionDate}
                                  </span>
                                  {feeInfo && (
                                    <span className="text-muted-foreground text-[11px] whitespace-nowrap">
                                      {feeInfo.packageName ? `${feeInfo.packageName}` : ""}
                                      {feeInfo.sessionPrice > 0
                                        ? ` (HP áp dụng: ${feeInfo.sessionPrice.toLocaleString("vi-VN")})`
                                        : ""}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {tuitionSessionRange.count > 0 && (
                    <p className="text-xs text-primary font-medium">
                      → Áp dụng cho <span className="font-bold">{tuitionSessionRange.count}</span> buổi (buổi {tuitionSessionRange.min} đến {tuitionSessionRange.max})
                    </p>
                  )}
                </div>

                {/* Old package table */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Danh sách học viên</p>
                  <div className="border border-border rounded-lg overflow-auto">
                    <table className="w-full text-xs min-w-[420px]">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-semibold text-foreground">Họ và tên</th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground">Gói hiện tại</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">HP áp dụng</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">Số buổi</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudentIds.map((studentId) => {
                          const student = currentSessionStudents?.find((s: any) => s.studentId === studentId);
                          const currentPkg = feePackages?.find((p: any) => p.id === student?.packageId);
                          const currentPkgName = currentPkg?.name || (student?.packageType ? student.packageType : "—");
                          const allocatedFeePerSession = parseFloat(studentAllocatedFees[studentId] ?? "0") || 0;
                          const sessCount = tuitionSessionRange.count;
                          const oldThanhTien = allocatedFeePerSession * sessCount;
                          return (
                            <tr key={studentId} className="border-b border-border hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                                {student?.student?.fullName || studentId}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">{currentPkgName}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400 font-medium">
                                {allocatedFeePerSession > 0 ? allocatedFeePerSession.toLocaleString("vi-VN") + "đ" : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                                {sessCount > 0 ? sessCount : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                                {oldThanhTien > 0 ? oldThanhTien.toLocaleString("vi-VN") + "đ" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {selectedStudentIds.length > 1 && (
                        <tfoot className="border-t-2 border-border bg-muted/30">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-right text-muted-foreground">Tạm tính cũ:</td>
                            <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">
                              {calcTuitionTotals.oldTotal.toLocaleString("vi-VN")}đ
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL – Gói học phí mới ────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="px-4 py-3 bg-primary/5 border-b shrink-0">
                <p className="text-sm font-semibold text-primary">Gói học phí mới</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Bulk apply */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Áp dụng chung cho tất cả học viên (tùy chọn)</p>
                  <Select value={bulkNewPkgId} onValueChange={(v) => {
                    setBulkNewPkgId(v);
                    setBulkPackageSelection(v);
                  }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Chọn gói học phí áp dụng chung..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Không áp dụng chung —</SelectItem>
                      {feePackages?.map((pkg: any) => (
                        <SelectItem key={pkg.id} value={pkg.id} className="text-xs">
                          {pkg.name} — {Number(pkg.fee).toLocaleString("vi-VN")}đ
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {bulkNewPkgId && bulkNewPkgId !== "__none__" && (
                    <p className="text-xs text-muted-foreground">Gói này sẽ ghi đè lựa chọn riêng lẻ bên dưới</p>
                  )}
                </div>

                {/* New package table */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Danh sách học viên</p>
                  <div className="border border-border rounded-lg overflow-auto">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-semibold text-foreground">Họ và tên</th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground w-36">Gói mới</th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground w-32">Khuyến mãi</th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground w-32">Phụ thu</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">HP áp dụng</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">Số buổi</th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudentIds.map((studentId) => {
                          const student = currentSessionStudents?.find((s: any) => s.studentId === studentId);
                          const effectivePkgId = (bulkNewPkgId && bulkNewPkgId !== "__none__") ? bulkNewPkgId : (studentNewPkgIds[studentId] || "");
                          const newPkg = feePackages?.find((p: any) => p.id === effectivePkgId);
                          const newFeeBase = parseFloat(newPkg?.fee ?? "0") || 0;

                          const discIds = studentDiscountIds[studentId] ?? [];
                          const surchIds = studentSurchargeIds[studentId] ?? [];
                          let discAmt = 0;
                          for (const did of discIds) {
                            const d = promotionOptions.find((p: any) => p.id === did);
                            if (d) discAmt += d.valueType === "percent" ? newFeeBase * parseFloat(d.valueAmount) / 100 : parseFloat(d.valueAmount) || 0;
                          }
                          let surchAmt = 0;
                          for (const sid of surchIds) {
                            const s = surchargeOptions.find((p: any) => p.id === sid);
                            if (s) surchAmt += s.valueType === "percent" ? newFeeBase * parseFloat(s.valueAmount) / 100 : parseFloat(s.valueAmount) || 0;
                          }
                          const newApplied = Math.max(0, newFeeBase - discAmt + surchAmt);
                          const sessCount = tuitionSessionRange.count;
                          const newThanhTien = newApplied * sessCount;

                          return (
                            <tr key={studentId} className="border-b border-border hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                                {student?.student?.fullName || studentId}
                              </td>
                              <td className="px-3 py-2">
                                {(bulkNewPkgId && bulkNewPkgId !== "__none__") ? (
                                  <span className="text-xs text-muted-foreground italic">← Áp dụng chung</span>
                                ) : (
                                  <Select
                                    value={studentNewPkgIds[studentId] || ""}
                                    onValueChange={(v) => setStudentNewPkgIds(prev => ({ ...prev, [studentId]: v }))}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-full">
                                      <SelectValue placeholder="Chọn gói" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {feePackages?.map((pkg: any) => (
                                        <SelectItem key={pkg.id} value={pkg.id} className="text-xs">
                                          {pkg.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                              {/* Khuyến mãi popover */}
                              <td className="px-3 py-2">
                                <Popover
                                  open={openPromoStudentId === studentId}
                                  onOpenChange={(v) => setOpenPromoStudentId(v ? studentId : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <button className="w-full h-7 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                      <span className={discAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                        {discAmt > 0 ? `-${fmtMoney(discAmt)}đ` : "Chọn..."}
                                      </span>
                                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-56 p-2" align="start">
                                    <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn khuyến mãi</p>
                                    {promotionOptions.length === 0 ? (
                                      <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có khuyến mãi nào</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {promotionOptions.filter((p: any) => p.isActive).map((promo: any) => {
                                          const amt = promo.valueType === "percent"
                                            ? newFeeBase * parseFloat(promo.valueAmount) / 100
                                            : parseFloat(promo.valueAmount) || 0;
                                          const label = promo.valueType === "percent"
                                            ? `${parseFloat(promo.valueAmount)}%`
                                            : `${fmtMoney(parseFloat(promo.valueAmount))}đ`;
                                          return (
                                            <label key={promo.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                              <Checkbox
                                                checked={discIds.includes(promo.id)}
                                                onCheckedChange={() => {
                                                  const next = discIds.includes(promo.id)
                                                    ? discIds.filter((id: string) => id !== promo.id)
                                                    : [...discIds, promo.id];
                                                  setStudentDiscountIds(prev => ({ ...prev, [studentId]: next }));
                                                }}
                                              />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium">{promo.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {newFeeBase > 0 && promo.valueType === "percent"
                                                    ? `-${fmtMoney(amt)}đ (${label})`
                                                    : `-${label}`}
                                                </p>
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              </td>
                              {/* Phụ thu popover */}
                              <td className="px-3 py-2">
                                <Popover
                                  open={openSurchargeStudentId === studentId}
                                  onOpenChange={(v) => setOpenSurchargeStudentId(v ? studentId : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <button className="w-full h-7 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                      <span className={surchAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                                        {surchAmt > 0 ? `+${fmtMoney(surchAmt)}đ` : "Chọn..."}
                                      </span>
                                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-56 p-2" align="start">
                                    <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn phụ thu</p>
                                    {surchargeOptions.length === 0 ? (
                                      <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có phụ thu nào</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {surchargeOptions.filter((s: any) => s.isActive).map((surcharge: any) => {
                                          const amt = surcharge.valueType === "percent"
                                            ? newFeeBase * parseFloat(surcharge.valueAmount) / 100
                                            : parseFloat(surcharge.valueAmount) || 0;
                                          const label = surcharge.valueType === "percent"
                                            ? `${parseFloat(surcharge.valueAmount)}%`
                                            : `${fmtMoney(amt)}đ`;
                                          return (
                                            <label key={surcharge.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                              <Checkbox
                                                checked={surchIds.includes(surcharge.id)}
                                                onCheckedChange={() => {
                                                  const next = surchIds.includes(surcharge.id)
                                                    ? surchIds.filter((id: string) => id !== surcharge.id)
                                                    : [...surchIds, surcharge.id];
                                                  setStudentSurchargeIds(prev => ({ ...prev, [studentId]: next }));
                                                }}
                                              />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium">{surcharge.name}</p>
                                                <p className="text-xs text-muted-foreground">+{label}</p>
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {newApplied > 0 ? newApplied.toLocaleString("vi-VN") + "đ" : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">
                                {sessCount > 0 ? sessCount : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                {newThanhTien > 0 ? newThanhTien.toLocaleString("vi-VN") + "đ" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {selectedStudentIds.length > 1 && (
                        <tfoot className="border-t-2 border-border bg-muted/30">
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-right text-muted-foreground">Tạm tính mới:</td>
                            <td className="px-3 py-2 text-right text-xs font-bold tabular-nums text-primary">
                              {calcTuitionTotals.newTotal.toLocaleString("vi-VN")}đ
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer – totals + actions */}
          <div className="border-t shrink-0 px-6 py-4 bg-muted/20 space-y-3">
            {/* Tổng tiền summary */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-foreground">Tạm tính cũ:</span>
                <span className="font-semibold tabular-nums">{calcTuitionTotals.oldTotal.toLocaleString("vi-VN")}đ</span>
              </div>
              <div className="text-foreground">→</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-foreground">Tạm tính mới:</span>
                <span className="font-semibold tabular-nums text-primary">{calcTuitionTotals.newTotal.toLocaleString("vi-VN")}đ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">Chênh lệch:</span>
                {calcTuitionTotals.diff === 0 ? (
                  <Badge variant="secondary" className="text-xs">Không phát sinh hoá đơn</Badge>
                ) : calcTuitionTotals.diff > 0 ? (
                  <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200">
                    Phiếu thu +{calcTuitionTotals.diff.toLocaleString("vi-VN")}đ
                  </Badge>
                ) : (
                  <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200">
                    Phiếu chi {calcTuitionTotals.diff.toLocaleString("vi-VN")}đ
                  </Badge>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsChangeTuitionPackageDialogOpen(false)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const packageId = (bulkNewPkgId && bulkNewPkgId !== "__none__") ? bulkNewPkgId : (bulkPackageSelection || Object.values(studentNewPkgIds)[0] || Object.values(studentPackageSelections)[0]);
                  if (!packageId) {
                    toast({ title: "Lỗi", description: "Vui lòng chọn gói học phí mới", variant: "destructive" });
                    return;
                  }
                  if (!fromSessionId || !toSessionId) {
                    toast({ title: "Lỗi", description: "Vui lòng chọn khoảng buổi học", variant: "destructive" });
                    return;
                  }
                  const fromSession = classSessions?.find((s: any) => s.id === fromSessionId);
                  const toSession = classSessions?.find((s: any) => s.id === toSessionId);
                  if (!fromSession || !toSession) {
                    toast({ title: "Lỗi", description: "Buổi học không hợp lệ", variant: "destructive" });
                    return;
                  }
                  const studentClassIds: string[] = selectedStudentIds
                    .map((studentId) => currentSessionStudents?.find((s: any) => s.studentId === studentId)?.studentClassId)
                    .filter((id): id is string => !!id);
                  if (studentClassIds.length === 0) {
                    toast({ title: "Lỗi", description: "Không tìm thấy thông tin lớp học của học viên", variant: "destructive" });
                    return;
                  }
                  const minOrder = Math.min(fromSession.sessionIndex, toSession.sessionIndex);
                  const maxOrder = Math.max(fromSession.sessionIndex, toSession.sessionIndex);
                  updateTuitionPackageMutation.mutate(
                    { student_class_ids: studentClassIds, package_id: packageId, from_session_order: minOrder, to_session_order: maxOrder },
                    {
                      onSuccess: (data: any) => {
                        if (data.warning) toast({ title: "Cảnh báo", description: data.warning });
                        setIsChangeTuitionPackageDialogOpen(false);
                        setSelectedStudentIds([]);
                        setStudentPackageSelections({});
                        setBulkPackageSelection("");
                        setFromSessionId("");
                        setToSessionId("");
                        setStudentNewPkgIds({});
                        setStudentDiscountIds({});
                        setStudentSurchargeIds({});
                        setBulkNewPkgId("");
                      },
                    }
                  );
                }}
              >
                Cập nhật
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SessionApplyProgramSection
        classId={classId}
        classSessions={classSessions}
        allEvaluationCriteria={allEvaluationCriteria}
        selectedClassSessionId={selectedClassSessionId}
        isApplyProgramOpen={isApplyProgramOpen}
        setIsApplyProgramOpen={setIsApplyProgramOpen}
        applyProgramId={applyProgramId}
        setApplyProgramId={setApplyProgramId}
        applyProgramFromIdx={applyProgramFromIdx}
        setApplyProgramFromIdx={setApplyProgramFromIdx}
        applyProgramToIdx={applyProgramToIdx}
        setApplyProgramToIdx={setApplyProgramToIdx}
        isApplyCriteriaOpen={isApplyCriteriaOpen}
        setIsApplyCriteriaOpen={setIsApplyCriteriaOpen}
        applyCriteriaId={applyCriteriaId}
        setApplyCriteriaId={setApplyCriteriaId}
        applyCriteriaFromIdx={applyCriteriaFromIdx}
        setApplyCriteriaFromIdx={setApplyCriteriaFromIdx}
        applyCriteriaToIdx={applyCriteriaToIdx}
        setApplyCriteriaToIdx={setApplyCriteriaToIdx}
        isApplyScoreSheetOpen={isApplyScoreSheetOpen}
        setIsApplyScoreSheetOpen={setIsApplyScoreSheetOpen}
        applyScoreSheetId={applyScoreSheetId}
        setApplyScoreSheetId={setApplyScoreSheetId}
        applyScoreSheetFromIdx={applyScoreSheetFromIdx}
        setApplyScoreSheetFromIdx={setApplyScoreSheetFromIdx}
        applyScoreSheetToIdx={applyScoreSheetToIdx}
        setApplyScoreSheetToIdx={setApplyScoreSheetToIdx}
      />
    </>
  );
}
