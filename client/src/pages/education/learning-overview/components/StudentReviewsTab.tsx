import { useState } from "react";
import { Eye, Loader2, MessageSquare, Search } from "lucide-react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SessionReview, useStudentReviewsTab } from "../hooks/useStudentReviewsTab";

function StarDisplay({ rating }: { rating: number | null | undefined }) {
  if (rating == null || rating <= 0) return null;

  return (
    <span className="flex gap-0.5 shrink-0" aria-label={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`text-base leading-none ${star <= rating ? "text-yellow-400" : "text-muted-foreground/30"}`}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ReviewItemRow({ item }: { item: SessionReview["reviewData"][number] }) {
  if (item.inputType === "checkbox") {
    return (
      <div className="flex items-center gap-2.5 rounded-md border bg-background px-3 py-2.5">
        <span
          aria-label={item.checked ? "Đã đạt" : "Chưa đạt"}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[11px] font-bold ${
            item.checked
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-slate-300 bg-white text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-foreground">
          {item.criteriaName}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">Đạt</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <p className="text-xs font-semibold leading-relaxed text-foreground">{item.criteriaName}</p>
      {item.comment ? (
        <div
          className="mt-1 text-xs text-muted-foreground leading-relaxed review-html-content"
          dangerouslySetInnerHTML={{ __html: item.comment }}
        />
      ) : null}
    </div>
  );
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
      ? `${review.shiftName} (${review.startTime.substring(0, 5)} – ${review.endTime.substring(0, 5)})`
      : review.shiftName;
  const groupedItems = new Map<string, SessionReview["reviewData"]>();
  const ungroupedItems: SessionReview["reviewData"] = [];
  for (const item of review.reviewData) {
    if (item.groupName) {
      const items = groupedItems.get(item.groupName) ?? [];
      items.push(item);
      groupedItems.set(item.groupName, items);
    } else {
      ungroupedItems.push(item);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] flex flex-col z-[300]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">
            Nhận xét — {sessionLabel} — {dateLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-3 text-sm pr-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Học viên</span>
            <StudentNameLink studentId={review.studentId} name={review.studentName} code={review.studentCode} />
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
              <div className="rounded-md border bg-background px-4 py-3">
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <p className="text-sm font-bold text-foreground">{review.criteriaName || "Bộ tiêu chí"}</p>
                  <StarDisplay rating={review.overallRating} />
                </div>
                <div className="mt-4 space-y-4">
                  {Array.from(groupedItems.entries()).map(([groupName, items]) => (
                    <div key={groupName} className="space-y-2">
                      <p className="text-sm font-bold text-foreground">{groupName}</p>
                      <div className="space-y-2 border-l-2 border-muted pl-3">
                        {items.map((item, i) => <ReviewItemRow key={`${groupName}-${i}`} item={item} />)}
                      </div>
                    </div>
                  ))}
                  {ungroupedItems.length > 0 && (
                    <div className="space-y-2">
                      {ungroupedItems.map((item, i) => <ReviewItemRow key={`ungrouped-${i}`} item={item} />)}
                    </div>
                  )}
                </div>
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
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed header + filters */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-pink-600" />
          <h2 className="text-lg font-semibold">Nhận xét học viên</h2>
          {tab.total > 0 && (
            <span className="text-sm text-muted-foreground">({tab.total} nhận xét)</span>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-4">
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
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6 pt-4">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StudentNameLink studentId={review.studentId} name={review.studentName} code={review.studentCode} />
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

      </div>

      {/* Footer - pagination */}
      <div className="shrink-0 px-6 py-3 border-t border-border/50">
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
      </div>

      <ReviewDetailDialog
        review={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
