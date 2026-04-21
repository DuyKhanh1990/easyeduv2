import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReviewItem {
  criteriaId?: string;
  criteriaName: string;
  comment: string;
}

interface SessionReview {
  id: string;
  studentName: string;
  className: string;
  sessionIndex: number | null;
  sessionDate: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  reviewData: ReviewItem[];
}

function ReviewDetailDialog({
  review,
  open,
  onClose,
}: {
  review: SessionReview | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!review) return null;

  const sessionLabel = review.sessionIndex != null ? `Buổi ${review.sessionIndex}` : "—";
  const dateLabel = review.sessionDate
    ? new Date(review.sessionDate).toLocaleDateString("vi-VN")
    : "—";
  const shiftLabel =
    review.startTime && review.endTime
      ? `${review.shiftName} (${review.startTime} – ${review.endTime})`
      : review.shiftName;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">
            Nhận xét — {sessionLabel} — {dateLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Học viên</span>
            <span className="font-medium">{review.studentName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Lớp</span>
            <span className="font-medium">{review.className}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Ca học</span>
            <span className="font-medium">{shiftLabel}</span>
          </div>

          {review.reviewData.length > 0 ? (
            <div>
              <p className="text-muted-foreground mb-2 font-medium">Chi tiết nhận xét</p>
              <div className="border rounded-md overflow-hidden divide-y">
                {review.reviewData.map((item, i) => (
                  <div key={i} className="px-3 py-2.5 space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">{item.criteriaName}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.comment || <span className="italic">Không có nhận xét</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Không có nội dung nhận xét.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentReviewTab({
  studentId,
  open,
}: {
  studentId: string;
  open: boolean;
}) {
  const [selected, setSelected] = useState<SessionReview | null>(null);

  const { data: reviews = [], isLoading } = useQuery<SessionReview[]>({
    queryKey: ["/api/students", studentId, "session-reviews"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/session-reviews`);
      if (!res.ok) throw new Error("Lỗi tải nhận xét");
      return res.json();
    },
    enabled: open && !!studentId,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Chưa có nhận xét nào được công bố
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse table-fixed">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[9%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 border-b">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">STT</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Tên học viên</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Lớp</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Buổi học</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ca học</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ngày</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Bảng nhận xét</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review, idx) => {
              const dateLabel = review.sessionDate
                ? new Date(review.sessionDate).toLocaleDateString("vi-VN")
                : "—";
              const shiftLabel =
                review.startTime && review.endTime
                  ? `${review.shiftName} (${review.startTime} – ${review.endTime})`
                  : review.shiftName;
              const criteriaCount = review.reviewData.length;

              return (
                <tr
                  key={review.id}
                  data-testid={`review-row-${review.id}`}
                  className="border-b hover:bg-muted/20 transition-colors"
                >
                  <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-3 font-medium truncate" title={review.studentName}>
                    {review.studentName}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground truncate" title={review.className}>
                    {review.className}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {review.sessionIndex != null ? `Buổi ${review.sessionIndex}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground truncate" title={shiftLabel}>
                    {shiftLabel}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{dateLabel}</td>
                  <td className="px-3 py-3">
                    {criteriaCount > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-pink-50 text-pink-700 border-pink-200">
                        {criteriaCount} tiêu chí
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`review-view-${review.id}`}
                      onClick={() => setSelected(review)}
                      className="h-7 w-7 p-0"
                      title="Xem nhận xét"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReviewDetailDialog
        review={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
