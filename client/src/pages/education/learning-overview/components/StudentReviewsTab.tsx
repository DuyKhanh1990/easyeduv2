import { useState } from "react";
import { Eye, Loader2, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SessionReview, useStudentReviewsTab } from "../hooks/useStudentReviewsTab";

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
      ? `${review.shiftName} (${review.startTime.substring(0, 5)} – ${review.endTime.substring(0, 5)})`
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

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface Props {
  enabled: boolean;
}

export function StudentReviewsTab({ enabled }: Props) {
  const [selected, setSelected] = useState<SessionReview | null>(null);
  const [searchInput, setSearchInput] = useState("");

  const tab = useStudentReviewsTab(enabled);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    tab.onFiltersChange({ search: searchInput });
  }

  const totalPages = Math.ceil(tab.total / tab.pageSize);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-pink-600" />
          <h2 className="text-xl font-bold text-foreground">Nhận xét học viên</h2>
          {tab.total > 0 && (
            <span className="text-sm text-muted-foreground">({tab.total} nhận xét)</span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-background border border-border rounded-2xl px-4 py-3 flex flex-wrap items-center gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              data-testid="input-search-reviews"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm học viên hoặc lớp..."
              className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-sm bg-background text-foreground w-56"
            />
          </div>
          <button
            type="submit"
            data-testid="btn-search-reviews"
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-secondary/70 transition-colors"
          >
            Tìm
          </button>
        </form>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Từ</span>
          <input
            data-testid="input-date-from"
            type="date"
            value={tab.filters.dateFrom}
            onChange={(e) => tab.onFiltersChange({ dateFrom: e.target.value })}
            className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background"
          />
          <span>Đến</span>
          <input
            data-testid="input-date-to"
            type="date"
            value={tab.filters.dateTo}
            onChange={(e) => tab.onFiltersChange({ dateTo: e.target.value })}
            className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background"
          />
          {(tab.filters.dateFrom || tab.filters.dateTo) && (
            <button
              data-testid="btn-clear-dates"
              onClick={() => tab.onFiltersChange({ dateFrom: "", dateTo: "" })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Xóa
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Page size */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Hiển thị</span>
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              data-testid={`pagesize-${n}`}
              onClick={() => tab.setPageSize(n)}
              className={cn(
                "w-8 h-8 rounded-full text-sm font-semibold transition-colors",
                tab.pageSize === n
                  ? "bg-pink-500 text-white"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide w-12">STT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide">Tên học viên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide">Lớp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap">Buổi học</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide">Ca học</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap">Ngày học</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide">Bảng nhận xét</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wide">Xem</th>
              </tr>
            </thead>
            <tbody>
              {tab.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-secondary/40 animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tab.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                      <span>Chưa có nhận xét nào được công bố</span>
                    </div>
                  </td>
                </tr>
              ) : (
                tab.rows.map((review, idx) => {
                  const offset = (tab.page - 1) * tab.pageSize;
                  const dateLabel = review.sessionDate
                    ? new Date(review.sessionDate).toLocaleDateString("vi-VN")
                    : "—";
                  const shiftLabel =
                    review.startTime && review.endTime
                      ? `${review.shiftName} (${review.startTime.substring(0, 5)} – ${review.endTime.substring(0, 5)})`
                      : review.shiftName;

                  return (
                    <tr
                      key={review.id}
                      data-testid={`review-row-${review.id}`}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-center">
                        {offset + idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {review.studentName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {review.className}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {review.sessionIndex != null ? `Buổi ${review.sessionIndex}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {shiftLabel}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {dateLabel}
                      </td>
                      <td className="px-4 py-3">
                        {review.reviewData.length > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800">
                            {review.reviewData.length} tiêu chí
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`review-view-${review.id}`}
                          onClick={() => setSelected(review)}
                          className="h-7 w-7 p-0 text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                          title="Xem nhận xét"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {tab.page} / {totalPages} &nbsp;·&nbsp; {tab.total} kết quả
          </span>
          <div className="flex items-center gap-1">
            <button
              data-testid="btn-prev-page"
              disabled={tab.page === 1}
              onClick={() => tab.setPage(tab.page - 1)}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ‹ Trước
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7
                ? i + 1
                : tab.page <= 4
                  ? i + 1
                  : tab.page >= totalPages - 3
                    ? totalPages - 6 + i
                    : tab.page - 3 + i;
              return (
                <button
                  key={p}
                  data-testid={`page-${p}`}
                  onClick={() => tab.setPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg border text-xs font-medium transition-colors",
                    tab.page === p
                      ? "bg-pink-500 border-pink-500 text-white"
                      : "border-border hover:bg-secondary/70"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              data-testid="btn-next-page"
              disabled={tab.page >= totalPages}
              onClick={() => tab.setPage(tab.page + 1)}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sau ›
            </button>
          </div>
        </div>
      )}

      <ReviewDetailDialog
        review={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
