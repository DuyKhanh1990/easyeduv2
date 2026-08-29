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
  rating?: number;
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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col z-[300]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">
            Nhận xét — {sessionLabel} — {dateLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-sm">
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
                  <div key={i} className="px-3 py-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">{item.criteriaName}</p>
                      {item.rating != null && item.rating > 0 && (
                        <span className="flex gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              key={star}
                              className={`text-sm ${star <= item.rating! ? "text-yellow-400" : "text-muted-foreground/30"}`}
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {item.comment ? (
                      <div
                        className="text-xs text-muted-foreground leading-relaxed review-html-content"
                        dangerouslySetInnerHTML={{ __html: item.comment }}
                      />
                    ) : null}
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  const totalPages = Math.ceil(reviews.length / pageSize);
  const paginated = reviews.slice((page - 1) * pageSize, page * pageSize);
  const from = reviews.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, reviews.length);

  return (
    <>
      <div className="flex-1 overflow-auto bg-gray-50/50">
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
            <tr className="bg-white border-b-2 border-pink-100 shadow-sm">
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">STT</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tên học viên</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Lớp</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Buổi học</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ca học</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ngày</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bảng nhận xét</th>
              <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map((review, idx) => {
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
                  className="bg-white hover:bg-pink-50/40 transition-colors"
                >
                  <td className="px-3 py-3 text-gray-400 text-xs font-mono">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-3 py-3 font-semibold text-gray-800 truncate" title={review.studentName}>
                    {review.studentName}
                  </td>
                  <td className="px-3 py-3 text-gray-500 truncate text-xs" title={review.className}>
                    {review.className}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {review.sessionIndex != null ? `Buổi ${review.sessionIndex}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-500 truncate text-xs" title={shiftLabel}>
                    {shiftLabel}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{dateLabel}</td>
                  <td className="px-3 py-3">
                    {criteriaCount > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                        ★ {criteriaCount} tiêu chí
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`review-view-${review.id}`}
                      onClick={() => setSelected(review)}
                      className="h-7 w-7 p-0 hover:bg-pink-100 hover:text-pink-700 rounded-lg"
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

      {reviews.length > 0 && (
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-white shrink-0 shadow-sm">
          <span className="text-xs text-gray-400 font-medium">{from}–{to} / {reviews.length} bản ghi</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Hiển thị:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
            >
              {[20, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">‹</button>
            <span className="text-xs font-semibold text-gray-600">{page} / {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">›</button>
          </div>
        </div>
      )}

      <ReviewDetailDialog
        review={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
