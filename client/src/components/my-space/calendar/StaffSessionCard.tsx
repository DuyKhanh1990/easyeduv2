import { useState } from "react";
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
} from "lucide-react";
import { MyCalendarSession, MyCalendarSessionLight } from "@/types/my-calendar";
import { cn } from "@/lib/utils";
import { SessionContentDialog, ContentViewDialog } from "@/components/education/SessionContentDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStaffSessionDetail } from "@/hooks/use-staff-session-detail";

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

interface StaffSessionCardProps {
  session: MyCalendarSessionLight;
  onViewDetail: (session: MyCalendarSession) => void;
}

export function StaffSessionCard({ session, onViewDetail }: StaffSessionCardProps) {
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null } | null>(null);

  const { data: detail, isLoading, isError } = useStaffSessionDetail(session.classSessionId);

  const handleViewContent = (contentId: string | null, fallback?: { title: string; type: string; content?: string | null } | null) => {
    setViewingContentId(contentId);
    setViewingFallbackContent(fallback ?? null);
  };

  const isCancelled = session.sessionStatus === "cancelled";
  const enrolledCount = detail?.enrolledCount ?? 0;
  const pendingCount = detail?.attendancePendingCount ?? 0;
  const reviewedCount = detail?.reviewedCount ?? 0;
  const generalContents = detail?.generalContents ?? [];

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-4">
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
                <span className={cn("font-medium", session.learningFormat === "online" ? "text-blue-600" : "text-foreground")}>
                  {session.learningFormat === "online" ? "Online" : "Offline"}
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

        <button
          onClick={(e) => { e.stopPropagation(); setContentDialogOpen(true); }}
          className="flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/50 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors shrink-0"
          data-testid={`btn-assign-content-${session.classSessionId}`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Giao nội dung</span>
        </button>
      </div>

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
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
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
          "bg-card rounded-2xl border border-border p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer",
          isCancelled && "opacity-60"
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

      <ContentViewDialog
        isOpen={!!viewingContentId || !!viewingFallbackContent}
        onOpenChange={(open) => { if (!open) { setViewingContentId(null); setViewingFallbackContent(null); } }}
        contentId={viewingContentId}
        fallbackContent={viewingFallbackContent}
      />
    </>
  );
}
