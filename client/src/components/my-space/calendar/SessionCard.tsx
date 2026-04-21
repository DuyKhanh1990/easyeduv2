import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { MyCalendarSessionLight, MyCalendarSession, SessionContentItem, TeacherReview } from "@/types/my-calendar";
import { FeedbackModal } from "./FeedbackModal";
import { ContentViewDialog, ExamViewerFromId } from "@/components/education/SessionContentDialog";
import { useStudentSessionDetail } from "@/hooks/use-student-session-detail";
import { cn } from "@/lib/utils";

const ATTENDANCE_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Chưa điểm danh", color: "text-muted-foreground" },
  present: { label: "Có học", color: "text-green-600 font-semibold" },
  absent: { label: "Nghỉ học", color: "text-red-500 font-semibold" },
  makeup_wait: { label: "Nghỉ chờ bù", color: "text-orange-500 font-semibold" },
  makeup_done: { label: "Đã học bù", color: "text-blue-600 font-semibold" },
  paused: { label: "Bảo lưu", color: "text-yellow-600 font-semibold" },
};

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

function SessionCardDetail({ session, sessionDate }: { session: MyCalendarSession; sessionDate: string }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null } | null>(null);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);

  const handleViewItem = (item: SessionContentItem) => {
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
  };

  const attendance = session.attendanceStatus
    ? ATTENDANCE_LABELS[session.attendanceStatus] ?? { label: session.attendanceStatus, color: "text-muted-foreground" }
    : null;

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

  return (
    <>
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground">
              Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
            </p>
            <p className="font-bold text-foreground text-base">Lớp: {session.classCode}</p>
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
          <div className="flex flex-col items-end gap-1 shrink-0">
            {attendance && (
              <span className={cn("text-sm", attendance.color)}>
                {attendance.label}
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {session.learningFormat === "online" ? "Online" : "Offline"}
            </span>
          </div>
        </div>

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
        <div className="flex items-center gap-2 border-t border-border/50 pt-3">
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
    </>
  );
}

interface SessionCardProps {
  session: MyCalendarSessionLight;
  sessionDate: string;
}

export function SessionCard({ session, sessionDate }: SessionCardProps) {
  const { data: detail, isLoading, isError } = useStudentSessionDetail(session.classSessionId, session.studentId);

  const attendance = session.attendanceStatus
    ? ATTENDANCE_LABELS[session.attendanceStatus] ?? { label: session.attendanceStatus, color: "text-muted-foreground" }
    : null;

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
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
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 text-muted-foreground text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Đang tải nội dung...</span>
        </div>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground">
              Thời gian: <span className="font-bold text-foreground">{session.startTime} - {session.endTime}</span>
            </p>
            <p className="font-bold text-foreground text-base">Lớp: {session.classCode}</p>
          </div>
          {attendance && (
            <span className={cn("text-sm shrink-0", attendance.color)}>{attendance.label}</span>
          )}
        </div>
        <p className="text-xs text-red-500 mt-2">Không thể tải chi tiết buổi học</p>
      </div>
    );
  }

  return <SessionCardDetail session={detail} sessionDate={sessionDate} />;
}
