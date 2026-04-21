import { useState, useEffect } from "react";
import { isSameDay } from "date-fns";

export interface ScheduleHeaderActions {
  selectedSessionId: string | null;
  isCancelled: boolean;
  openContent: () => void;
  openUpdateSession: () => void;
  openChangeTeacher: () => void;
  openCancelSession: () => void;
  openUpdateCycle: () => void;
  openExcludeSession: () => void;
  openDeleteSchedule: () => void;
}

const SESSIONS_PER_PAGE = 40;

interface UseScheduleTabParams {
  classId: string;
  classSessions: any[] | undefined;
  onActionsChange?: (actions: ScheduleHeaderActions | null) => void;
  initialSessionId?: string | null;
}

export function useScheduleTab({
  classId,
  classSessions,
  onActionsChange,
  initialSessionId,
}: UseScheduleTabParams) {
  const [selectedClassSessionId, setSelectedClassSessionId] = useState<string | null>(null);
  const [sessionPage, setSessionPage] = useState(0);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const [isCancelSessionsDialogOpen, setIsCancelSessionsDialogOpen] = useState(false);
  const [isDeleteScheduleOpen, setIsDeleteScheduleOpen] = useState(false);
  const [isExcludeSessionsOpen, setIsExcludeSessionsOpen] = useState(false);
  const [isUpdateSessionOpen, setIsUpdateSessionOpen] = useState(false);
  const [isUpdateCycleOpen, setIsUpdateCycleOpen] = useState(false);
  const [isChangeTeacherOpen, setIsChangeTeacherOpen] = useState(false);
  const [isExtensionOpen, setIsExtensionOpen] = useState(false);
  const [isMakeupDialogOpen, setIsMakeupDialogOpen] = useState(false);
  const [selectedForMakeup, setSelectedForMakeup] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [isBulkAttendanceDialogOpen, setIsBulkAttendanceDialogOpen] = useState(false);
  const [isChangeTuitionPackageDialogOpen, setIsChangeTuitionPackageDialogOpen] = useState(false);
  const [studentPackageSelections, setStudentPackageSelections] = useState<Record<string, string>>({});
  const [bulkPackageSelection, setBulkPackageSelection] = useState<string>("");
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingChangeData, setPendingChangeData] = useState<any>(null);
  const [isSessionContentDialogOpen, setIsSessionContentDialogOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedStudentForTransfer, setSelectedStudentForTransfer] = useState<any>(null);
  const [isRemoveStudentDialogOpen, setIsRemoveStudentDialogOpen] = useState(false);
  const [studentToRemove, setStudentToRemove] = useState<{
    studentIds: string[];
    studentClassId: string;
    fromSessionOrder: number;
    toSessionOrder: number;
  } | null>(null);
  const [isAddStudentToSessionOpen, setIsAddStudentToSessionOpen] = useState(false);
  const [searchTermForSession, setSearchTermForSession] = useState("");
  const [selectedStudentsForSession, setSelectedStudentsForSession] = useState<string[]>([]);
  const [isScheduleForSessionOpen, setIsScheduleForSessionOpen] = useState(false);
  const [studentsForScheduleFromSession, setStudentsForScheduleFromSession] = useState<any[]>([]);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    ids: string[];
    names: string[];
    existing?: any;
    existingPublished?: boolean;
  } | null>(null);

  const [isApplyProgramOpen, setIsApplyProgramOpen] = useState(false);
  const [applyProgramId, setApplyProgramId] = useState<string>("");
  const [applyProgramFromIdx, setApplyProgramFromIdx] = useState<number>(1);
  const [applyProgramToIdx, setApplyProgramToIdx] = useState<number>(1);

  const [isApplyCriteriaOpen, setIsApplyCriteriaOpen] = useState(false);
  const [applyCriteriaId, setApplyCriteriaId] = useState<string>("");
  const [applyCriteriaFromIdx, setApplyCriteriaFromIdx] = useState<number>(1);
  const [applyCriteriaToIdx, setApplyCriteriaToIdx] = useState<number>(1);

  const [isApplyScoreSheetOpen, setIsApplyScoreSheetOpen] = useState(false);
  const [applyScoreSheetId, setApplyScoreSheetId] = useState<string>("");
  const [applyScoreSheetFromIdx, setApplyScoreSheetFromIdx] = useState<number>(1);
  const [applyScoreSheetToIdx, setApplyScoreSheetToIdx] = useState<number>(1);

  useEffect(() => {
    if (classSessions && classSessions.length > 0 && !selectedClassSessionId) {
      let targetSession: any;
      if (initialSessionId) {
        targetSession = classSessions.find((s) => s.id === initialSessionId);
      }
      if (!targetSession) {
        const now = new Date();
        targetSession =
          classSessions.find((s) => {
            const sessionDate = new Date(s.sessionDate);
            return sessionDate >= now || isSameDay(sessionDate, now);
          }) || classSessions[0];
      }
      setSelectedClassSessionId(targetSession.id);
      const index = classSessions.indexOf(targetSession);
      if (index !== -1) {
        setSessionPage(Math.floor(index / SESSIONS_PER_PAGE));
      }
    }
  }, [classSessions, selectedClassSessionId]);

  useEffect(() => {
    if (!onActionsChange) return;
    if (!selectedClassSessionId) {
      onActionsChange(null);
      return;
    }
    const session = classSessions?.find((s) => s.id === selectedClassSessionId);
    onActionsChange({
      selectedSessionId: selectedClassSessionId,
      isCancelled: session?.status === "cancelled",
      openContent: () => setIsSessionContentDialogOpen(true),
      openUpdateSession: () => setIsUpdateSessionOpen(true),
      openChangeTeacher: () => setIsChangeTeacherOpen(true),
      openCancelSession: () => {
        setSelectedSessionId(selectedClassSessionId);
        setIsCancelSessionsDialogOpen(true);
      },
      openUpdateCycle: () => setIsUpdateCycleOpen(true),
      openExcludeSession: () => setIsExcludeSessionsOpen(true),
      openDeleteSchedule: () => setIsDeleteScheduleOpen(true),
    });
  }, [selectedClassSessionId, classSessions, onActionsChange]);

  return {
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
  };
}
