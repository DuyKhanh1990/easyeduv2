import { useState, useEffect, useRef } from "react";
import { Eye, Loader2, ExternalLink, LogOut } from "lucide-react";
import { MyCalendarSessionLight, MyCalendarSession, SessionContentItem, TeacherReview, OnlineRuleConfig } from "@/types/my-calendar";
import { FeedbackModal } from "./FeedbackModal";
import { ContentViewDialog, ExamViewerFromId } from "@/components/education/SessionContentDialog";
import { useStudentSessionDetail } from "@/hooks/use-student-session-detail";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAttendanceStatus } from "@/lib/attendance-status";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  lesson: "Bài học",
  "Bài học": "Bài học",
  homework: "BTVN",
  "Bài tập về nhà": "BTVN",
  curriculum: "Giáo trình",
  "Giáo trình": "Giáo trình",
  test: "Kiểm tra",
  "Bài kiểm tra": "Kiểm tra",
};

function getOnlinePlatformName(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("meet.google")) return "Google Meet";
    if (hostname.includes("zoom.us") || hostname.includes("zoom.com")) return "Zoom";
    if (hostname.includes("teams.microsoft") || hostname.includes("teams.live")) return "Microsoft Teams";
    if (hostname.includes("webex")) return "Cisco Webex";
    if (hostname.includes("whereby")) return "Whereby";
    if (hostname.includes("jitsi")) return "Jitsi Meet";
    if (hostname.includes("skype")) return "Skype";
    const parts = hostname.replace(/^www\./, "").split(".");
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return "Link học online";
  }
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

interface ContentRowProps {
  label: string;
  items: SessionContentItem[];
  onViewItem: (item: SessionContentItem) => void;
}

function ContentRow({ label, items, onViewItem }: ContentRowProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-1.5 text-sm flex-wrap">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="flex flex-wrap gap-x-2">
        {items.map((item, idx) => (
          <button
            key={item.id}
            className="text-primary font-medium hover:underline text-left"
            onClick={() => onViewItem(item)}
            data-testid={`btn-view-content-${item.id}`}
          >
            {item.title}{idx < items.length - 1 ? " |" : ""}
          </button>
        ))}
      </span>
    </div>
  );
}

interface OnlineLinkButtonProps {
  classSessionId: string;
  studentId?: string | null;
  onlineLink: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  onlineRule?: OnlineRuleConfig | null;
  onlineClickedAt?: string | null;
  onlineEndedAt?: string | null;
  onRecorded: (clickedAt: string) => void;
}

function OnlineLinkButton({
  classSessionId,
  studentId,
  onlineLink,
  sessionDate,
  startTime,
  endTime,
  onlineRule,
  onlineClickedAt,
  onlineEndedAt,
  onRecorded,
}: OnlineLinkButtonProps) {
  const platformName = getOnlinePlatformName(onlineLink);
  const [localClickedAt, setLocalClickedAt] = useState<string | null>(onlineClickedAt ?? null);
  const [localEndedAt, setLocalEndedAt] = useState<string | null>(onlineEndedAt ?? null);
  const [, setTick] = useState(0);

  // Re-check time window every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (onlineClickedAt && !localClickedAt) setLocalClickedAt(onlineClickedAt);
  }, [onlineClickedAt]);

  useEffect(() => {
    if (onlineEndedAt && !localEndedAt) setLocalEndedAt(onlineEndedAt);
  }, [onlineEndedAt]);

  const queryClient = useQueryClient();

  const { canJoin, canEnd } = computeOnlineWindowState(sessionDate, startTime, endTime, onlineRule);

  const recordMutation = useMutation({
    mutationFn: async () => {
      const url = studentId
        ? `/api/my-space/calendar/student/session/${classSessionId}/online-click?studentId=${studentId}`
        : `/api/my-space/calendar/student/session/${classSessionId}/online-click`;
      const res = await apiRequest("POST", url);
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.onlineClickedAt) {
        setLocalClickedAt(data.onlineClickedAt);
        onRecorded(data.onlineClickedAt);
      }
    },
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const url = studentId
        ? `/api/my-space/calendar/student/session/${classSessionId}/online-end?studentId=${studentId}`
        : `/api/my-space/calendar/student/session/${classSessionId}/online-end`;
      const res = await apiRequest("POST", url);
      return res.json();
    },
    onSuccess: (data) => {
      const endedAt = data?.onlineEndedAt ?? new Date().toISOString();
      setLocalEndedAt(endedAt);
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student/session", classSessionId] });
    },
  });

  const handleClick = () => {
    if (!localEndedAt) {
      recordMutation.mutate();
    }
    window.open(onlineLink, "_blank", "noopener,noreferrer");
  };

  const handleEnd = () => {
    const now = new Date().toISOString();
    setLocalEndedAt(now);
    endMutation.mutate();
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleClick}
          disabled={!canJoin}
          data-testid={`btn-online-link-${classSessionId}`}
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
        {localClickedAt && !localEndedAt && (
          <button
            onClick={handleEnd}
            disabled={endMutation.isPending || !canEnd}
            data-testid={`btn-online-end-${classSessionId}`}
            className={cn(
              "inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors sm:min-h-0 sm:w-auto sm:py-1.5",
              canEnd
                ? "bg-gray-500 hover:bg-gray-600 active:bg-gray-700"
                : "bg-gray-300 cursor-not-allowed opacity-60",
              endMutation.isPending && "opacity-60"
            )}
          >
            {endMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Kết thúc học online
          </button>
        )}
      </div>
      {!canJoin && !localClickedAt && onlineRule && (
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
      {localClickedAt && (
        <span className="text-[11px] text-orange-500 font-medium">
          Đã vào lúc {new Date(localClickedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          {localEndedAt && (
            <> · Kết thúc lúc {new Date(localEndedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>
          )}
        </span>
      )}
    </div>
  );
}

// ─── Countdown helpers ───────────────────────────────────────────────────────
function formatAvailableTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

function formatSessionDateLong(date: string) {
  const d = new Date(date + "T00:00:00");
  const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function CountdownClock({ targetDate, targetTime }: { targetDate: string; targetTime: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    function compute() {
      const [h, m] = targetTime.split(":").map(Number);
      const target = new Date(targetDate + "T00:00:00");
      target.setHours(h, m, 0, 0);
      return Math.max(0, target.getTime() - Date.now());
    }
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
  }, [targetDate, targetTime]);

  const totalSec = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return (
    <div className="flex items-center justify-center gap-1 text-4xl font-mono font-bold text-primary tabular-nums py-2">
      {hours > 0 && (
        <><span>{String(hours).padStart(2, "0")}</span><span className="text-2xl text-muted-foreground mx-0.5">:</span></>
      )}
      <span>{String(minutes).padStart(2, "0")}</span>
      <span className="text-2xl text-muted-foreground mx-0.5">:</span>
      <span>{String(seconds).padStart(2, "0")}</span>
    </div>
  );
}

// ─── Session Card Detail ──────────────────────────────────────────────────────
interface SessionCardDetailProps {
  session: MyCalendarSession;
  sessionDate: string;
  onlineRule?: OnlineRuleConfig | null;
}

function SessionCardDetail({ session, sessionDate, onlineRule }: SessionCardDetailProps) {
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null } | null>(null);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);
  const [countdownTarget, setCountdownTarget] = useState<{ title: string; date: string; availableAt: string } | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [isOpeningContent, setIsOpeningContent] = useState(false);
  const [showEndedPopup, setShowEndedPopup] = useState(false);

  const isTestSession = session.classCode === "TEST";

  const isTestSessionEnded = isTestSession && (() => {
    if (!session.endTime) return false;
    const [h, m] = session.endTime.split(":").map(Number);
    const end = new Date(sessionDate + "T00:00:00");
    end.setHours(h, m, 0, 0);
    return new Date() > end;
  })();

  function openContentDirect(item: SessionContentItem) {
    if (item.type === "Bài kiểm tra" || item.type === "test") {
      if (item.resourceUrl) {
        setViewingExamId(item.resourceUrl);
        return;
      }
    }
    if (item.resourceUrl) {
      setViewingContentId(item.resourceUrl);
      setViewingFallbackContent(null);
    } else {
      setViewingContentId(null);
      setViewingFallbackContent({ title: item.title, type: item.type, content: item.description });
    }
  }

  const handleViewItem = async (item: SessionContentItem) => {
    // 0. Ended gate: if this is a TEST session that has already ended → show ended popup
    if (isTestSessionEnded) {
      setShowEndedPopup(true);
      return;
    }

    // 1. Time gate: if availableAt is set and current time is before it → show countdown
    if (item.availableAt) {
      const [h, m] = item.availableAt.split(":").map(Number);
      const target = new Date(sessionDate + "T00:00:00");
      target.setHours(h, m, 0, 0);
      if (new Date() < target) {
        setCountdownTarget({ title: item.title, date: sessionDate, availableAt: item.availableAt });
        return;
      }
    }

    // 2. Attempt gate: if maxAttempts > 0, check and record via API
    const isTestSession = session.classCode === "TEST";
    if (isTestSession && item.maxAttempts && item.maxAttempts > 0) {
      if (isOpeningContent) return;
      setIsOpeningContent(true);
      try {
        const res = await apiRequest("POST", "/api/my-space/test-content-attempt", {
          testSessionId: session.classSessionId,
          contentId: item.id,
          contentType: item.type,
          studentId: (session as any).studentId ?? undefined,
        });
        const data = await res.json();
        setIsOpeningContent(false);
        if (!data.allowed) {
          setAttemptError(`Bạn đã hết lượt làm bài. (${data.attemptsUsed}/${data.maxAttempts} lần)`);
          return;
        }
      } catch {
        setIsOpeningContent(false);
      }
    }

    openContentDirect(item);
  };

  const attendance = session.attendanceStatus ? getAttendanceStatus(session.attendanceStatus) : null;

  const hasOnlineLink = !!session.onlineLink;
  const isOnline = session.learningFormat === "online" || hasOnlineLink;

  const generalLessons = session.generalContents.filter((c) => c.type === "lesson" || c.type === "Bài học");
  const generalHomework = session.generalContents.filter((c) => c.type === "homework" || c.type === "Bài tập về nhà");
  const generalOther = session.generalContents.filter((c) => !["lesson", "Bài học", "homework", "Bài tập về nhà"].includes(c.type));

  const personalLessons = session.personalContents.filter((c) => c.type === "lesson" || c.type === "Bài học");
  const personalHomework = session.personalContents.filter((c) => c.type === "homework" || c.type === "Bài tập về nhà");
  const personalOther = session.personalContents.filter((c) => !["lesson", "Bài học", "homework", "Bài tập về nhà"].includes(c.type));

  const safeReviewData: TeacherReview[] = Array.isArray(session.reviewData) ? session.reviewData : [];
  const hasPersonalContent = session.personalContents.length > 0;
  const hasGeneralContent = session.generalContents.length > 0;
  const hasReview = session.reviewPublished && safeReviewData.length > 0;

  const displayDate = new Date(sessionDate + "T00:00:00").toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

  const handleOnlineRecorded = (_clickedAt: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student/session", session.classSessionId] });
  };

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
        {/* Header row */}
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground">
              Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
            </p>
            <p className="font-bold text-foreground text-base">
              Lớp: {session.classCode === "TEST" ? session.className : session.classCode}
            </p>
            <p className="text-sm text-muted-foreground">
              GV: <span className="font-medium text-foreground">{session.teacherNames.join(", ") || "—"}</span>
            </p>
            {session.studentName && (
              <p className="text-sm text-muted-foreground">
                HV:{" "}
                <span className="font-medium text-foreground">
                  {session.studentName}
                  {session.studentCode && ` (${session.studentCode})`}
                </span>
                {session.enrolledCount !== undefined && (
                  <span className="ml-1.5 font-semibold text-orange-500">({session.enrolledCount})</span>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
            {isTestSessionEnded && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                Đã kết thúc
              </span>
            )}
            {attendance && (
              <span className={cn("text-sm", attendance.color)}>
                {attendance.label}
              </span>
            )}
            <span className={cn(
              "text-sm font-medium",
              isOnline ? "text-blue-500" : "text-muted-foreground"
            )}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        {/* Online link button */}
        {hasOnlineLink && (
          <div className="border-t border-border/50 pt-3">
            <OnlineLinkButton
              classSessionId={session.classSessionId}
              studentId={session.studentId ?? null}
              onlineLink={session.onlineLink!}
              sessionDate={sessionDate}
              startTime={session.startTime}
              endTime={session.endTime}
              onlineRule={onlineRule}
              onlineClickedAt={session.onlineClickedAt}
              onlineEndedAt={session.onlineEndedAt}
              onRecorded={handleOnlineRecorded}
            />
          </div>
        )}

        {/* General content */}
        {hasGeneralContent && (
          <div className="space-y-1.5 border-t border-border/50 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung chung</p>
            <ContentRow label="Bài học" items={generalLessons} onViewItem={handleViewItem} />
            <ContentRow label="BTVN" items={generalHomework} onViewItem={handleViewItem} />
            {generalOther.map((item) => (
              <ContentRow key={item.id} label={CONTENT_TYPE_LABELS[item.type] ?? item.type} items={[item]} onViewItem={handleViewItem} />
            ))}
          </div>
        )}

        {/* Personal content */}
        {hasPersonalContent && (
          <div className="space-y-1.5 border-t border-border/50 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung cá nhân</p>
            <ContentRow label="Bài học" items={personalLessons} onViewItem={handleViewItem} />
            <ContentRow label="BTVN" items={personalHomework} onViewItem={handleViewItem} />
            {personalOther.map((item) => (
              <ContentRow key={item.id} label={CONTENT_TYPE_LABELS[item.type] ?? item.type} items={[item]} onViewItem={handleViewItem} />
            ))}
          </div>
        )}

        {/* Review row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <span className="text-sm text-muted-foreground">Nhận xét:</span>
          {hasReview ? (
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              data-testid="btn-view-feedback"
            >
              <Eye className="h-4 w-4" />
              <span>Xem nhận xét</span>
            </button>
          ) : (
            <span className="text-sm text-muted-foreground italic">Chưa có nhận xét</span>
          )}
        </div>
      </div>

      <FeedbackModal
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        reviewData={safeReviewData}
        className={session.classCode}
        sessionDate={displayDate}
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

      {/* Countdown popup – content not yet available */}
      <Dialog open={!!countdownTarget} onOpenChange={v => { if (!v) setCountdownTarget(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-base">Bài test chưa mở</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2 font-medium">{countdownTarget?.title}</p>
            <p className="text-sm text-muted-foreground">
              Sẽ được bắt đầu lúc <span className="font-semibold text-foreground">{countdownTarget ? formatAvailableTime(countdownTarget.availableAt) : ""}</span>,{" "}
              {countdownTarget ? formatSessionDateLong(countdownTarget.date) : ""}
            </p>
            {countdownTarget && (
              <CountdownClock targetDate={countdownTarget.date} targetTime={countdownTarget.availableAt} />
            )}
          </div>
          <DialogFooter className="justify-center">
            <Button variant="outline" onClick={() => setCountdownTarget(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attempt limit exceeded popup */}
      <Dialog open={!!attemptError} onOpenChange={v => { if (!v) setAttemptError(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-base">Không thể mở bài</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{attemptError}</p>
          <DialogFooter className="justify-center">
            <Button variant="outline" onClick={() => setAttemptError(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ended test session popup */}
      <Dialog open={showEndedPopup} onOpenChange={v => { if (!v) setShowEndedPopup(false); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-base">Lịch test đã kết thúc</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-muted-foreground">
              Buổi kiểm tra <span className="font-semibold text-foreground">{session.className}</span> đã kết thúc lúc{" "}
              <span className="font-semibold text-foreground">{session.endTime}</span> ngày{" "}
              <span className="font-semibold text-foreground">{formatSessionDateLong(sessionDate)}</span>.
            </p>
            <p className="text-sm text-muted-foreground">Nội dung không còn khả dụng.</p>
          </div>
          <DialogFooter className="justify-center">
            <Button variant="outline" onClick={() => setShowEndedPopup(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SessionCardProps {
  session: MyCalendarSessionLight;
  sessionDate: string;
  onlineRule?: OnlineRuleConfig | null;
  highlighted?: boolean;
}

export function SessionCard({ session, sessionDate, onlineRule, highlighted }: SessionCardProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const { data: detail, isLoading, isError } = useStudentSessionDetail(session.classSessionId, session.studentId);

  useEffect(() => {
    if (highlighted && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const attendance = session.attendanceStatus ? getAttendanceStatus(session.attendanceStatus) : null;

  const isOnline = session.learningFormat === "online" || !!session.onlineLink;

  const ringClass = highlighted ? "ring-2 ring-primary/60 ring-offset-2 rounded-2xl" : undefined;

  if (isLoading) {
    return (
      <div ref={highlightRef} className={ringClass}>
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
              </p>
              <p className="font-bold text-foreground text-base">Lớp: {session.classCode}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {attendance && (
                <span className={cn("text-sm", attendance.color)}>{attendance.label}</span>
              )}
              <span className={cn("text-sm font-medium", isOnline ? "text-blue-500" : "text-muted-foreground")}>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 text-muted-foreground text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Đang tải nội dung...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div ref={highlightRef} className={ringClass}>
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow sm:p-5">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
              </p>
              <p className="font-bold text-foreground text-base">
                Lớp: {session.classCode === "TEST" ? session.className : session.classCode}
              </p>
              <p className="text-sm text-muted-foreground">
                GV: <span className="font-medium text-foreground">—</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {attendance && (
                <span className={cn("text-sm shrink-0", attendance.color)}>{attendance.label}</span>
              )}
              <span className={cn("text-sm font-medium", isOnline ? "text-blue-500" : "text-muted-foreground")}>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/50 pt-3">
            <span className="text-sm text-muted-foreground">Nhận xét:</span>
            <span className="text-sm text-muted-foreground italic">Chưa có nhận xét</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={highlightRef} className={ringClass}>
      <SessionCardDetail session={detail} sessionDate={sessionDate} onlineRule={onlineRule} />
    </div>
  );
}
