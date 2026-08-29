import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  MessageSquareText,
  FileText,
  ClipboardList,
  Loader2,
  ExternalLink,
  LogOut,
  ClipboardPlus,
  LibraryBig,
} from "lucide-react";
import { MyCalendarSession, MyCalendarSessionLight, OnlineRuleConfig } from "@/types/my-calendar";
import { cn } from "@/lib/utils";
import { SessionContentDialog, ContentViewDialog } from "@/components/education/SessionContentDialog";
import { LibraryContentDialog } from "@/components/courses/LibraryContentDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStaffSessionDetail } from "@/hooks/use-staff-session-detail";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import type { TestSession } from "@/components/education/TestSessionDetailDialog";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  "Bài học": "Bài học",
  "lesson": "Bài học",
  "Bài tập về nhà": "Bài tập về nhà",
  "homework": "Bài tập về nhà",
  "Giáo trình": "Giáo trình",
  "curriculum": "Giáo trình",
  "Bài kiểm tra": "Bài kiểm tra",
  "exam": "Bài kiểm tra",
};

function getOnlinePlatformName(url: string): string {
  if (url.includes("meet.google.com")) return "Google Meet";
  if (url.includes("zoom.us")) return "Zoom";
  if (url.includes("teams.microsoft.com")) return "MS Teams";
  if (url.includes("whereby.com")) return "Whereby";
  return "Vào học";
}

function computeOnlineWindowState(
  sessionDate: string,
  startTime: string,
  endTime: string,
  rule: OnlineRuleConfig | null | undefined
): { canJoin: boolean; canEnd: boolean } {
  if (!rule) return { canJoin: true, canEnd: true };

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const base = new Date(sessionDate + "T00:00:00");

  const sessionStart = new Date(base);
  sessionStart.setHours(startH, startM, 0, 0);

  const sessionEnd = new Date(base);
  sessionEnd.setHours(endH, endM, 0, 0);

  const now = new Date();

  const joinFrom = new Date(sessionStart.getTime() - rule.earlyEntryMinutes * 60_000);
  const joinUntil = new Date(sessionStart.getTime() + rule.lateEntryMinutes * 60_000);
  const endFrom = new Date(sessionEnd.getTime() - rule.earlyEndMinutes * 60_000);

  const canJoin = now >= joinFrom && now <= joinUntil;
  const canEnd = now >= endFrom;

  return { canJoin, canEnd };
}

interface StaffOnlineLinkButtonProps {
  classSessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  onlineLink: string;
  onlineRule?: OnlineRuleConfig | null;
  staffId?: string;
  initialCheckInAt?: string | null;
  initialCheckOutAt?: string | null;
}

function StaffOnlineLinkButton({
  classSessionId,
  sessionDate,
  startTime,
  endTime,
  onlineLink,
  onlineRule,
  staffId,
  initialCheckInAt,
  initialCheckOutAt,
}: StaffOnlineLinkButtonProps) {
  const platformName = getOnlinePlatformName(onlineLink);
  const [clickedAt, setClickedAt] = useState<string | null>(initialCheckInAt ?? null);
  const [endedAt, setEndedAt] = useState<string | null>(initialCheckOutAt ?? null);
  const [, setTick] = useState(0);

  // Sync from props when calendar data reloads (e.g. refetch)
  useEffect(() => {
    setClickedAt(initialCheckInAt ?? null);
    setEndedAt(initialCheckOutAt ?? null);
  }, [initialCheckInAt, initialCheckOutAt]);

  // Re-check time window every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { canJoin, canEnd } = computeOnlineWindowState(sessionDate, startTime, endTime, onlineRule);

  /**
   * Clamp an ISO timestamp to the scheduled [startTime, endTime] window.
   * - If actual time < scheduled start → return scheduled start
   * - If actual time > scheduled end   → return scheduled end
   * - Otherwise                        → return original ISO unchanged
   */
  const clampToSchedule = (isoTime: string): string => {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const base = new Date(sessionDate + "T00:00:00");

    const scheduledStart = new Date(base);
    scheduledStart.setHours(startH, startM, 0, 0);

    const scheduledEnd = new Date(base);
    scheduledEnd.setHours(endH, endM, 0, 0);

    const actual = new Date(isoTime);
    const actualMins = actual.getHours() * 60 + actual.getMinutes();
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    if (actualMins < startMins) return scheduledStart.toISOString();
    if (actualMins > endMins) return scheduledEnd.toISOString();
    return isoTime;
  };

  const saveAttendance = async (checkInAt: string | null, checkOutAt: string | null) => {
    if (!staffId) return;
    try {
      await fetch(`/api/learning-overview/teacher-attendance/${classSessionId}/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ checkInAt, checkOutAt, note: "" }),
      });
    } catch {
      // silent — UI already updated optimistically
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!endedAt) {
      const raw = new Date().toISOString();
      const clamped = clampToSchedule(raw);
      const newClickedAt = clickedAt ?? clamped;
      setClickedAt(newClickedAt);
      saveAttendance(newClickedAt, endedAt);
    }
    window.open(onlineLink, "_blank", "noopener,noreferrer");
  };

  const handleEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    const raw = new Date().toISOString();
    const clamped = clampToSchedule(raw);
    setEndedAt(clamped);
    saveAttendance(clickedAt, clamped);
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleClick}
          disabled={!canJoin}
          data-testid={`btn-staff-online-link-${classSessionId}`}
          className={cn(
            "inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors sm:min-h-0 sm:w-auto sm:py-1.5",
            canJoin
              ? "bg-purple-600 hover:bg-purple-700 active:bg-purple-800"
              : "bg-purple-300 cursor-not-allowed opacity-60"
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {platformName}
        </button>
        {clickedAt && !endedAt && (
          <button
            onClick={handleEnd}
            disabled={!canEnd}
            data-testid={`btn-staff-online-end-${classSessionId}`}
            className={cn(
              "inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors sm:min-h-0 sm:w-auto sm:py-1.5",
              canEnd
                ? "bg-gray-500 hover:bg-gray-600 active:bg-gray-700"
                : "bg-gray-300 cursor-not-allowed opacity-60"
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            Kết thúc học online
          </button>
        )}
      </div>
      {!canJoin && !clickedAt && onlineRule && (
        <span className="text-[11px] text-muted-foreground">
          Nút sẽ mở lúc{" "}
          {(() => {
            const [h, m] = startTime.split(":").map(Number);
            const t = new Date(sessionDate + "T00:00:00");
            t.setHours(h, m - onlineRule.earlyEntryMinutes, 0, 0);
            return t.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
          })()}
        </span>
      )}
      {clickedAt && (
        <span className="text-[11px] text-orange-500 font-medium">
          Đã vào lúc {new Date(clickedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          {endedAt && (
            <> · Kết thúc lúc {new Date(endedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>
          )}
        </span>
      )}
    </div>
  );
}

function AttendanceStatus({ enrolledCount, pendingCount }: { enrolledCount: number; pendingCount: number }) {
  const attendedCount = enrolledCount - pendingCount;
  const allPending = pendingCount === enrolledCount || enrolledCount === 0;
  const partial = attendedCount > 0 && pendingCount > 0;
  const allDone = attendedCount > 0 && pendingCount === 0;

  if (allPending) {
    return <span className="text-sm text-muted-foreground font-medium">Chưa điểm danh</span>;
  }

  if (allDone) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-sm text-green-600 font-semibold">Đã điểm danh</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600 font-semibold">Đã điểm danh</span>
            {partial && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>
        </TooltipTrigger>
        {partial && (
          <TooltipContent side="top">
            <p>Đã điểm danh {attendedCount}/{enrolledCount} học viên</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function ReviewStatus({ reviewedCount, enrolledCount, reviewPublished }: { reviewedCount: number; enrolledCount: number; reviewPublished: boolean }) {
  const allPending = reviewedCount === 0;
  const allDone = reviewedCount > 0 && reviewedCount >= enrolledCount;
  const partial = reviewedCount > 0 && reviewedCount < enrolledCount;

  if (allPending) {
    return <span className="text-sm text-muted-foreground font-medium">Chưa nhận xét</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <MessageSquareText className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600 font-semibold">Đã nhận xét</span>
            {partial && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            {allDone && (
              reviewPublished
                ? <Eye className="h-3.5 w-3.5 text-green-500" />
                : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </TooltipTrigger>
        {partial && (
          <TooltipContent side="top">
            <p>Đã nhận xét {reviewedCount}/{enrolledCount} học viên</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Returns true when the test session's end time has already passed
function isTestSessionEnded(session: MyCalendarSessionLight): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (session.sessionDate < todayStr) return true;
  if (session.sessionDate > todayStr) return false;
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return !!(session.endTime && nowTime > session.endTime);
}

interface StaffSessionCardProps {
  session: MyCalendarSessionLight;
  onViewDetail: (session: MyCalendarSession) => void;
  onOpenTestDetail?: (testSessionId: string) => void;
  onAddTestContent?: (session: TestSession) => void;
  onlineRule?: OnlineRuleConfig | null;
  staffId?: string;
  highlighted?: boolean;
}

export function StaffSessionCard({ session, onViewDetail, onOpenTestDetail, onAddTestContent, onlineRule, staffId, highlighted }: StaffSessionCardProps) {
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null } | null>(null);

  const isTestSession = session.classCode === "TEST";
  const testEnded = isTestSession && isTestSessionEnded(session);
  const { data: detail, isLoading, isError } = useStaffSessionDetail(isTestSession ? null : session.classSessionId);

  // Fetch test session detail to show assigned content names on the card
  const { data: testDetail } = useQuery<TestSession>({
    queryKey: ["/api/test-sessions", session.classSessionId],
    queryFn: () => apiRequest("GET", `/api/test-sessions/${session.classSessionId}`).then(r => r.json()),
    enabled: isTestSession,
    staleTime: 30_000,
  });

  const handleViewContent = (contentId: string | null, fallback?: { title: string; type: string; content?: string | null } | null) => {
    setViewingContentId(contentId);
    setViewingFallbackContent(fallback ?? null);
  };

  const isCancelled = session.sessionStatus === "cancelled";
  const enrolledCount = detail?.enrolledCount ?? 0;
  const pendingCount = detail?.attendancePendingCount ?? 0;
  const reviewedCount = detail?.reviewedCount ?? 0;
  const generalContents = detail?.generalContents ?? [];

  // ── Test session card layout ───────────────────────────────────────────────
  if (isTestSession) {
    const assignedExams = testDetail?.examsData ?? [];
    const assignedAssignments = testDetail?.assignmentsData ?? [];
    const hasContent = assignedExams.length > 0 || assignedAssignments.length > 0;

    return (
      <div
        className={cn(
          "bg-card rounded-2xl border border-border p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer sm:p-5",
          testEnded && "opacity-70",
          highlighted && "ring-2 ring-primary/60 ring-offset-2"
        )}
        onClick={() => onOpenTestDetail?.(session.classSessionId)}
        data-testid={`staff-session-card-${session.classSessionId}`}
      >
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground">
              Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
              {testEnded && (
                <span className="ml-2 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">Đã kết thúc</span>
              )}
            </p>
            <p className="font-bold text-foreground text-base">Lớp: TEST</p>
            {session.className && session.className !== "TEST" && (
              <p className="text-sm text-muted-foreground">{session.className}</p>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!testEnded && testDetail) onAddTestContent?.(testDetail);
            }}
            disabled={testEnded || !testDetail}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto",
              testEnded
                ? "text-muted-foreground border-border cursor-not-allowed opacity-50"
                : "text-primary border-primary/50 hover:bg-primary/5"
            )}
            data-testid={`btn-add-test-${session.classSessionId}`}
          >
            <ClipboardPlus className="h-4 w-4" />
            <span>Thêm bài test</span>
          </button>
        </div>

        {/* Assigned content names */}
        {hasContent && (
          <div className="border-t border-border/50 pt-3 space-y-1">
            {assignedExams.map(e => (
              <div key={e.id} className="flex items-center gap-1.5 text-xs text-foreground">
                <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="font-medium">{e.name || e.code}</span>
                <span className="text-muted-foreground">(Bài kiểm tra)</span>
              </div>
            ))}
            {assignedAssignments.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 text-xs text-foreground">
                <ClipboardList className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground">(BTVN)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Regular session card layout ────────────────────────────────────────────
  const cardContent = (
    <>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="space-y-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
            {isCancelled && (
              <span className="ml-2 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">Đã huỷ</span>
            )}
          </p>
          <p className="font-bold text-foreground text-base">Lớp: {session.classCode}</p>
          {!isLoading && !isError && (
            <>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Sĩ số: <span className="font-medium text-foreground">{enrolledCount}</span></span>
                <span className="text-border">·</span>
                <span className={cn("font-medium", (session.learningFormat === "online" || !!session.onlineLink) ? "text-blue-600" : "text-foreground")}>
                  {(session.learningFormat === "online" || !!session.onlineLink) ? "Online" : "Offline"}
                </span>
              </div>
              {detail?.teachers && detail.teachers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Giáo viên:{" "}
                  <span className="font-medium text-foreground">
                    {detail.teachers.map((t) => t.code ? `${t.fullName} (${t.code})` : t.fullName).join(", ")}
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={(e) => { e.stopPropagation(); setLibraryDialogOpen(true); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-400/60 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 sm:w-auto"
            data-testid={`btn-add-library-content-${session.classSessionId}`}
          >
            <LibraryBig className="h-4 w-4" />
            <span>Thêm nội dung</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setContentDialogOpen(true); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 sm:w-auto"
            data-testid={`btn-assign-content-${session.classSessionId}`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Giao nội dung</span>
          </button>
        </div>
      </div>

      {/* Online link button */}
      {session.onlineLink && (
        <div className="border-t border-border/50 pt-3">
          <StaffOnlineLinkButton
            classSessionId={session.classSessionId}
            sessionDate={session.sessionDate}
            startTime={session.startTime}
            endTime={session.endTime}
            onlineLink={session.onlineLink}
            onlineRule={onlineRule}
            staffId={staffId}
            initialCheckInAt={session.checkInAt}
            initialCheckOutAt={session.checkOutAt}
          />
        </div>
      )}

      {/* Loading skeleton for detail area */}
      {isLoading && (
        <div className="flex items-center gap-2 border-t border-border/50 pt-3 text-muted-foreground text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Đang tải...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-xs text-red-500 border-t border-border/50 pt-3">Không thể tải chi tiết buổi dạy</p>
      )}

      {/* General contents */}
      {!isLoading && !isError && generalContents.length > 0 && (
        <div className="border-t border-border/50 pt-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung chung</p>
          <div className="space-y-1">
            {generalContents.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-sm">
                {c.type === "Bài tập về nhà" ? (
                  <ClipboardList className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                ) : (
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-primary/60 shrink-0" />
                )}
                <div className="min-w-0">
                  <button
                    className="font-medium text-primary hover:underline text-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewContent(
                        c.resourceUrl || null,
                        c.resourceUrl ? null : { title: c.title, type: c.type, content: c.description }
                      );
                    }}
                    data-testid={`btn-view-content-${c.id}`}
                  >
                    {c.title}
                  </button>
                  {c.type && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({CONTENT_TYPE_LABELS[c.type] ?? c.type})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attendance + Review row */}
      {!isLoading && !isError && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border/50 pt-3 sm:items-center">
          <AttendanceStatus enrolledCount={enrolledCount} pendingCount={pendingCount} />
          <ReviewStatus reviewedCount={reviewedCount} enrolledCount={enrolledCount} reviewPublished={detail?.reviewPublished ?? false} />
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        className={cn(
          "bg-card rounded-2xl border border-border p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer sm:p-5",
          isCancelled && "opacity-60",
          highlighted && "ring-2 ring-primary/60 ring-offset-2"
        )}
        onClick={() => detail && onViewDetail(detail)}
        data-testid={`staff-session-card-${session.classSessionId}`}
      >
        {cardContent}
      </div>

      <SessionContentDialog
        isOpen={contentDialogOpen}
        onOpenChange={setContentDialogOpen}
        classSessionId={session.classSessionId}
      />

      <LibraryContentDialog
        open={libraryDialogOpen}
        onOpenChange={setLibraryDialogOpen}
      />

      <ContentViewDialog
        isOpen={!!viewingContentId || !!viewingFallbackContent}
        onOpenChange={(open) => { if (!open) { setViewingContentId(null); setViewingFallbackContent(null); } }}
        contentId={viewingContentId}
        fallbackContent={viewingFallbackContent}
      />
    </>
  );
}
