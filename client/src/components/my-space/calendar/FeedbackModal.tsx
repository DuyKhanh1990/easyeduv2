import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TeacherReview, ReviewCriteriaGroup } from "@/types/my-calendar";
import { MessageSquare } from "lucide-react";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  reviewData: TeacherReview[];
  className: string;
  sessionDate: string;
}

function CriteriaSection({ group }: { group: ReviewCriteriaGroup }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">{group.criteriaName}</p>
      <div className="space-y-3">
        {group.items.map((item, ii) => (
          <div key={ii} className="space-y-1">
            {item.subCriteriaName && (
              <p className="text-sm text-muted-foreground">{item.subCriteriaName}</p>
            )}
            {item.comment ? (
              <div className="bg-secondary/40 rounded-lg px-4 py-3 text-sm text-foreground leading-relaxed">
                {item.comment}
              </div>
            ) : (
              <div className="bg-secondary/20 rounded-lg px-4 py-3 text-sm text-muted-foreground italic">
                Chưa có nhận xét
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeacherReviewContent({ review }: { review: TeacherReview }) {
  return (
    <div className="space-y-5 py-2">
      {review.criteria.map((group, gi) => (
        <CriteriaSection key={gi} group={group} />
      ))}
    </div>
  );
}

export function FeedbackModal({ open, onClose, reviewData, className, sessionDate }: FeedbackModalProps) {
  const [activeTab, setActiveTab] = useState("0");
  const validReviews = Array.isArray(reviewData) ? reviewData.filter((t) => t.criteria.length > 0) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setActiveTab("0"); } }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col gap-0">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Nhận xét từ Giáo viên
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Lớp {className} · {sessionDate}
          </p>
        </DialogHeader>

        {validReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Chưa có nhận xét</p>
        ) : validReviews.length === 1 ? (
          <div className="overflow-y-auto">
            <TeacherReviewContent review={validReviews[0]} />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-wrap gap-2 mb-2">
              {validReviews.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(String(i))}
                  className={cn(
                    "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                    activeTab === String(i)
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-border text-foreground hover:bg-muted/50"
                  )}
                >
                  {t.teacherName}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 mt-1">
              {validReviews.map((t, i) => (
                <TabsContent key={i} value={String(i)} className="mt-3">
                  <TeacherReviewContent review={t} />
                </TabsContent>
              ))}
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
