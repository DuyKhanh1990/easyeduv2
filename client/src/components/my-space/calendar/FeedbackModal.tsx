import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TeacherReview, ReviewCriteriaGroup } from "@/types/my-calendar";
import { MessageSquare, Loader2, Star, ChevronDown, ChevronUp } from "lucide-react";

const CRITERIA_COLORS = [
  { bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800", icon: "bg-orange-100 dark:bg-orange-900", text: "text-orange-600 dark:text-orange-400" },
  { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", icon: "bg-green-100 dark:bg-green-900", text: "text-green-600 dark:text-green-400" },
  { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", icon: "bg-blue-100 dark:bg-blue-900", text: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", icon: "bg-purple-100 dark:bg-purple-900", text: "text-purple-600 dark:text-purple-400" },
  { bg: "bg-pink-50 dark:bg-pink-950/30", border: "border-pink-200 dark:border-pink-800", icon: "bg-pink-100 dark:bg-pink-900", text: "text-pink-600 dark:text-pink-400" },
  { bg: "bg-teal-50 dark:bg-teal-950/30", border: "border-teal-200 dark:border-teal-800", icon: "bg-teal-100 dark:bg-teal-900", text: "text-teal-600 dark:text-teal-400" },
];

const CRITERIA_INITIALS = (name: string) => name.trim().slice(0, 2).toUpperCase();

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn("h-3 w-3", s <= rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20")} />
      ))}
    </div>
  );
}

function CriteriaCard({ group, colorIdx }: { group: ReviewCriteriaGroup; colorIdx: number }) {
  const [expanded, setExpanded] = useState(true);
  const color = CRITERIA_COLORS[colorIdx % CRITERIA_COLORS.length];
  const hasComments = group.items.some((i) => i.comment);

  return (
    <div className={cn("rounded-xl border overflow-hidden", color.bg, color.border)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={cn("flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold", color.icon, color.text)}>
          {CRITERIA_INITIALS(group.criteriaName)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{group.criteriaName}</p>
          <StarDisplay rating={group.rating ?? 0} />
        </div>
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && hasComments && (
        <div className="px-4 pb-4 space-y-3 border-t border-inherit">
          {group.items.map((item, ii) => (
            <div key={ii}>
              {item.subCriteriaName && (
                <p className={cn("text-xs font-semibold mt-3 mb-1.5", color.text)}>
                  {item.subCriteriaName}
                </p>
              )}
              {item.comment ? (
                <div
                  className="bg-white/70 dark:bg-black/20 rounded-lg px-3 py-2.5 text-sm text-foreground leading-relaxed review-html-content shadow-sm"
                  dangerouslySetInnerHTML={{ __html: item.comment }}
                />
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">Chưa có nhận xét</div>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && !hasComments && (
        <div className="px-4 pb-3 border-t border-inherit">
          <p className="text-xs text-muted-foreground italic mt-2">Chưa có nhận xét</p>
        </div>
      )}
    </div>
  );
}

function TeacherReviewContent({ review }: { review: TeacherReview }) {
  return (
    <div className="space-y-3">
      {review.criteria.length > 0 && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
          Đánh giá theo tiêu chí
        </p>
      )}
      {review.criteria.map((group, gi) => (
        <CriteriaCard key={gi} group={group} colorIdx={gi} />
      ))}
    </div>
  );
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  reviewData: TeacherReview[];
  className: string;
  sessionDate: string;
  loading?: boolean;
}

export function FeedbackModal({ open, onClose, reviewData, className, sessionDate, loading }: FeedbackModalProps) {
  const [activeTeacher, setActiveTeacher] = useState(0);
  const validReviews = Array.isArray(reviewData) ? reviewData.filter((t) => t.criteria.length > 0) : [];
  const currentReview = validReviews[activeTeacher];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setActiveTeacher(0); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-5 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              Nhận xét từ Giáo viên
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Lớp <span className="font-medium text-foreground">{className}</span> · {sessionDate}
            </p>
          </DialogHeader>

          {/* Teacher tabs */}
          {validReviews.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {validReviews.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTeacher(i)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                    activeTeacher === i
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {t.teacherName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang tải nhận xét...</span>
            </div>
          ) : validReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">Chưa có nhận xét</p>
            </div>
          ) : currentReview ? (
            <TeacherReviewContent review={currentReview} />
          ) : null}
        </div>

        {/* Footer */}
        {!loading && validReviews.length > 0 && (
          <div className="border-t px-6 py-3 bg-muted/30 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">💙 Cảm ơn thầy/cô đã nhận xét!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
