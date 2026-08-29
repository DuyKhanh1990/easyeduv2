import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, XCircle, X, Plus, RefreshCw, UserCog, Calendar, Trash2, Copy } from "lucide-react";
import { ScheduleHeaderActions } from "@/hooks/use-schedule-tab";
import { WaitingTabContent } from "@/components/education/WaitingTabContent";
import { ActiveTabContent } from "@/components/education/ActiveTabContent";
import { AttendanceTabContent } from "@/components/education/AttendanceTabContent";
import { ScoreSheetTabContent } from "@/components/education/ScoreSheetTabContent";
import { ActivityLogTabContent } from "@/components/education/ActivityLogTabContent";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { CopyClassDialog } from "@/components/education/CopyClassDialog";
import { CloseClassDialog } from "@/components/education/CloseClassDialog";

const ScheduleTabContent = lazy(async () => {
  const module = await import("@/components/education/ScheduleTabContent");
  return { default: module.ScheduleTabContent };
});

export type ClassPermissions = {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(search);
  const initialTab = searchParams.get("tab") || "waiting";
  const initialSessionId = searchParams.get("sessionId");
  const [activeTab, setActiveTab] = useState(initialTab);
  // Track last non-schedule tab so background stays meaningful when popup is open
  const [bgTab, setBgTab] = useState(initialTab === "schedule" ? "waiting" : initialTab);
  const [scheduleActions, setScheduleActions] = useState<ScheduleHeaderActions | null>(null);
  const [scheduleContentReady, setScheduleContentReady] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const handleTabChange = (val: string) => {
    if (val !== "schedule") {
      setBgTab(val);
    } else {
      // Do not show actions from a previous schedule instance while the
      // popup is getting its content ready.
      setScheduleActions(null);
    }
    setActiveTab(val);
  };

  const isScheduleOpen = activeTab === "schedule";

  useEffect(() => {
    if (!isScheduleOpen) {
      setScheduleContentReady(false);
      return;
    }

    // Let the overlay paint before mounting the schedule tree. The schedule
    // contains many queries and dialogs, so mounting it in the click handler
    // can make the tab feel intermittently unresponsive on production data.
    const frame = requestAnimationFrame(() => setScheduleContentReady(true));
    return () => cancelAnimationFrame(frame);
  }, [isScheduleOpen]);

  const actionBtn = (grad: string, extra?: string) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r ${grad} text-white text-[11px] font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0 ${extra ?? ""}`;
  const { data: myPerms, isLoading: isLoadingPermissions } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const perm = myPerms?.permissions?.["/classes"];
  const canViewClassPage = isSuperAdmin || !!(perm?.canView || perm?.canViewAll);
  const classPerm: ClassPermissions = {
    canAdd: isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete),
    canEdit: isSuperAdmin || !!(perm?.canEdit || perm?.canDelete),
    canDelete: isSuperAdmin || !!perm?.canDelete,
  };


  const { data: classData, isLoading: isLoadingClass } = useQuery<any>({
    queryKey: [`/api/classes/${id}`],
    enabled: canViewClassPage,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const needsWaiting = activeTab === "waiting" || activeTab === "schedule";
  const needsActive = activeTab === "active" || activeTab === "schedule" || activeTab === "attendance";
  const needsSessions =
    activeTab === "waiting" ||
    activeTab === "schedule" ||
    activeTab === "attendance" ||
    activeTab === "score-sheet";

  const { data: waitingStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/waiting-students`],
    enabled: canViewClassPage && !!id && needsWaiting,
    staleTime: 0,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/active-students`],
    enabled: canViewClassPage && !!id && needsActive,
    staleTime: 0,
  });

  const { data: classSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/sessions`],
    enabled: canViewClassPage && !!id && needsSessions,
    staleTime: 0,
    select: (data) =>
      [...data].sort((a, b) => {
        const dateA = new Date(a.sessionDate).getTime();
        const dateB = new Date(b.sessionDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.id.localeCompare(b.id);
      }),
  });

  const { data: feePackages } = useQuery<any[]>({
    queryKey: [`/api/courses/${classData?.courseId}/fee-packages`],
    enabled: !!classData?.courseId && activeTab === "schedule",
    staleTime: 0,
  });

  const { data: allStudentSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/all-student-sessions`],
    enabled: !!id && activeTab === "attendance",
    staleTime: 0,
    refetchOnMount: "always",
  });

  const getComputedStatus = (cls: any): { label: string; className: string } => {
    if (!cls?.startDate || !cls?.endDate)
      return { label: "Không xác định", className: "" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (cls.status === "closed")
      return { label: "Đã đóng", className: "bg-red-100 text-red-600 border-red-200" };
    const start = new Date(cls.startDate);
    const end = new Date(cls.endDate);
    if (today < start)
      return { label: "Đang tuyển sinh", className: "bg-yellow-100 text-yellow-700 border-yellow-200" };
    if (today > end)
      return { label: "Kết thúc", className: "bg-gray-100 text-gray-600 border-gray-200" };
    return { label: "Đang học", className: "bg-green-100 text-green-700 border-green-200" };
  };

  const capacity = classData?.maxStudents || 0;
  const waitingCount = classData?.waitingStudentsCount ?? 0;
  const activeCount = classData?.activeStudentsCount ?? 0;
  const totalCount = waitingCount + activeCount;
  const progress = capacity > 0 ? (totalCount / capacity) * 100 : 0;

  const TABS = [
    { value: "waiting", label: `Học viên chờ (${waitingCount})` },
    { value: "active", label: `Học viên chính thức (${activeCount})` },
    { value: "schedule", label: "Lịch học" },
    { value: "attendance", label: "Điểm danh" },
    { value: "score-sheet", label: "Bảng điểm" },
    { value: "log", label: "Nhật ký" },
  ];

  if (isLoadingPermissions || (canViewClassPage && isLoadingClass)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Đang tải...
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewClassPage) {
    return (
      <DashboardLayout>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">Bạn không có quyền</h1>
          <p className="text-sm text-muted-foreground">Bạn không có quyền truy cập trang lớp học.</p>
          <Button variant="outline" onClick={() => navigate("/customers")}>
            Quay lại trang học viên
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = getComputedStatus(classData);

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-[#ECEEF4]">

        {/* ── Fixed class info header (hidden on Lịch học tab) ── */}
        {bgTab !== "schedule" && (
          <div className="shrink-0 bg-[#ECEEF4] px-4 md:px-6 lg:px-8 pt-4 pb-0">
            <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-2.5 flex items-center gap-x-5 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => navigate("/classes")}
                aria-label="Quay lại danh sách lớp học"
                title="Quay lại danh sách lớp học"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {/* Left: Name + code + status + meta info (wrappable) */}
              <div className="flex flex-col gap-y-1 flex-1 min-w-0">
                {/* Hàng 1: tên lớp + cơ sở + thời gian + sĩ số */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                {/* Name + code + status */}
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-sm font-bold truncate" data-testid="text-class-name">
                    {classData?.name}
                  </h1>
                  {classData?.classCode && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {classData.classCode}
                    </span>
                  )}
                  <Badge variant="outline" className={`shrink-0 text-xs ${status.className}`}>
                    {status.label}
                  </Badge>
                </div>

                {/* Divider */}
                <div className="hidden md:block h-4 w-px bg-border shrink-0" />

                {/* Meta info: Cơ sở + Thời gian (hàng 1) */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {classData?.location?.name && (
                    <span>
                      <span className="font-medium text-foreground">Cơ sở:</span>{" "}
                      {classData.location.name}
                    </span>
                  )}
                  {(classData?.startDate || classData?.endDate) && (
                    <span>
                      <span className="font-medium text-foreground">Thời gian:</span>{" "}
                      {classData.startDate && format(new Date(classData.startDate), "dd/MM/yyyy")}
                      {" – "}
                      {classData.endDate && format(new Date(classData.endDate), "dd/MM/yyyy")}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="hidden md:block h-4 w-px bg-border shrink-0" />

                {/* Capacity */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-[140px]">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Sĩ số: <span className="font-medium text-foreground">{totalCount}/{capacity}</span></span>
                      <span className="text-muted-foreground">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>Chờ: {waitingCount}</span>
                      <span>Chính thức: {activeCount}</span>
                    </div>
                  </div>
                </div>
                </div>{/* end hàng 1 */}

                {/* Hàng 2: Giáo viên */}
                {classData?.teachers?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Giáo viên:</span>{" "}
                    {classData.teachers.map((t: any) => t.fullName).join(", ")}
                  </div>
                )}
              </div>{/* end flex-col */}

              {/* Right: action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {classPerm.canAdd && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-primary hover:text-primary hover:bg-primary/10 h-7 text-xs px-2"
                    onClick={() => setShowCopyDialog(true)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Sao chép lớp
                  </Button>
                )}
                {classPerm.canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-red-50 h-7 text-xs px-2"
                    onClick={() => setShowCloseDialog(true)}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Đóng lớp
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Sticky tab bar ── */}
        <div className="shrink-0 bg-[#ECEEF4] px-4 md:px-6 lg:px-8 pt-3 pb-3 flex flex-wrap gap-2 items-center">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTabChange(t.value)}
              className={cn(
                "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                activeTab === t.value
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-border text-foreground hover:bg-muted/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Bounded content area (background — uses bgTab, blurs when schedule open) ── */}
        <div className={cn("flex-1 overflow-hidden px-4 md:px-6 lg:px-8 pb-4 transition-all duration-200", isScheduleOpen && "blur-sm pointer-events-none select-none")}>
          <Tabs
            value={bgTab}
            onValueChange={handleTabChange}
            className="w-full h-full"
          >
            <TabsContent value="waiting" className="h-full mt-0">
              <WaitingTabContent
                classId={id!}
                classData={classData}
                waitingStudents={waitingStudents}
                classSessions={classSessions}
                classPerm={classPerm}
              />
            </TabsContent>

            <TabsContent value="active" className="h-full mt-0">
              <ActiveTabContent classId={id!} activeStudents={activeStudents} />
            </TabsContent>

            <TabsContent value="attendance" className="h-full mt-0">
              <AttendanceTabContent
                classSessions={classSessions}
                studentSessions={allStudentSessions}
                classData={classData}
                enrolledStudents={activeStudents}
              />
            </TabsContent>

            <TabsContent value="score-sheet" className="h-full mt-0">
              <ScoreSheetTabContent
                classId={id!}
                classSessions={classSessions}
                classData={classData}
              />
            </TabsContent>

            <TabsContent value="log" className="h-full mt-0">
              <ActivityLogTabContent classId={id!} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Schedule popup overlay ── */}
        {isScheduleOpen && createPortal(
          <div
            // Keep the schedule shell below Radix dialogs opened from inside it.
            // DialogContent/DialogOverlay use z-50, so z-[45] lets every child
            // dialog and its dropdowns render above this full-screen shell.
            className="fixed inset-0 z-[45] flex items-center justify-center bg-black/40 p-2 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Lịch học"
          >
            <div className="w-[95vw] h-[95vh] max-w-[1800px] bg-[#ECEEF4] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              {/* Popup header */}
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white rounded-t-2xl flex-wrap">
                <span className="font-semibold text-sm text-slate-800 shrink-0">
                  {classData?.name}
                  {classData?.classCode && (
                    <span className="ml-2 text-slate-400 font-normal">{classData.classCode}</span>
                  )}
                </span>
                <span className="text-slate-300 text-xs shrink-0">|</span>
                {/* Action buttons */}
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {classPerm.canAdd && (
                    <button className={actionBtn("from-violet-500 to-indigo-600")} onClick={() => scheduleActions?.openContent()}>
                      <Plus className="h-3 w-3" /> Nội dung
                    </button>
                  )}
                  {scheduleActions?.selectedSessionId && (
                    <>
                      {classPerm.canEdit && (
                        <button className={actionBtn("from-sky-500 to-blue-500")} onClick={() => scheduleActions.openUpdateSession()}>
                          <RefreshCw className="h-3 w-3" /> Cập nhật buổi
                        </button>
                      )}
                      {classPerm.canEdit && (
                        <button className={actionBtn("from-amber-500 to-orange-500")} onClick={() => scheduleActions.openChangeTeacher()}>
                          <UserCog className="h-3 w-3" /> Đổi giáo viên
                        </button>
                      )}
                      {classPerm.canEdit && (
                        <button
                          className={actionBtn("from-red-500 to-rose-500", scheduleActions.isCancelled ? "opacity-50 cursor-not-allowed" : "")}
                          disabled={scheduleActions.isCancelled}
                          onClick={() => scheduleActions.openCancelSession()}
                        >
                          <XCircle className="h-3 w-3" /> Huỷ buổi
                        </button>
                      )}
                      {classPerm.canEdit && (
                        <button className={actionBtn("from-emerald-500 to-teal-500")} onClick={() => scheduleActions.openUpdateCycle()}>
                          <Calendar className="h-3 w-3" /> Cập nhật chu kỳ
                        </button>
                      )}
                      {classPerm.canEdit && (
                        <button className={actionBtn("from-slate-500 to-slate-600")} onClick={() => scheduleActions.openExcludeSession()}>
                          ··· Loại trừ ngày
                        </button>
                      )}
                      {classPerm.canDelete && (
                        <button className={actionBtn("from-rose-500 to-red-600")} onClick={() => scheduleActions.openDeleteSchedule()}>
                          <Trash2 className="h-3 w-3" /> Xoá lịch
                        </button>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleTabChange(bgTab)}
                  className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Popup content */}
              <div className="flex-1 overflow-auto p-4 bg-[#ECEEF4]">
                {!scheduleContentReady ? (
                  <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
                    Đang tải lịch học...
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
                        Đang tải lịch học...
                      </div>
                    }
                  >
                    <ScheduleTabContent
                      classId={id!}
                      classData={classData}
                      classSessions={classSessions}
                      waitingStudents={waitingStudents}
                      activeStudents={activeStudents}
                      feePackages={feePackages}
                      classPerm={classPerm}
                      onActionsChange={setScheduleActions}
                      initialSessionId={initialSessionId}
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>

      {/* Copy Class Dialog */}
      <CopyClassDialog
        open={showCopyDialog}
        onClose={() => setShowCopyDialog(false)}
        sourceClass={classData}
      />

      {/* Close Class Dialog */}
      <CloseClassDialog
        open={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        classId={id!}
        className={classData?.name ?? classData?.classCode}
      />
    </DashboardLayout>
  );
}
