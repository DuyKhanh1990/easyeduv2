import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StaffScoreSheetAssessmentScoreDialog,
  type ScoreSheetAssessmentDialogContext,
} from "@/components/education/StaffScoreSheetAssessmentScoreDialog";

interface ScoreEntry {
  id: string;
  type: "Bảng điểm" | "Bảng điểm quy đổi" | "BTVN" | "Bài kiểm tra";
  title: string;
  className: string;
  classId: string;
  finalScore: string | null;
  scores: Array<{ categoryName: string; score: string | null; color?: string | null }>;
  refId: string;
  gradingComment?: string | null;
  createdAt: string;
  sessionDate?: string | null;
  conversionResult?: {
    gradeBand: { label: string; color: string } | null;
    passStatus: "passed" | "failed" | null;
  };
  conversionAssessment?: ScoreSheetAssessmentDialogContext;
}

const TYPE_COLORS: Record<string, string> = {
  "Bảng điểm": "bg-violet-100 text-violet-700 border-violet-200",
  "Bảng điểm quy đổi": "bg-violet-100 text-violet-700 border-violet-200",
  "BTVN": "bg-orange-100 text-orange-700 border-orange-200",
  "Bài kiểm tra": "bg-blue-100 text-blue-700 border-blue-200",
};

type ScoreFilter = "all" | "gradebook" | "homework" | "conversion" | "passed" | "failed";

const SCORE_FILTER_TABS: Array<{ id: ScoreFilter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "gradebook", label: "Bảng điểm" },
  { id: "homework", label: "BTVN" },
  { id: "conversion", label: "Bảng điểm quy đổi" },
  { id: "passed", label: "Đạt" },
  { id: "failed", label: "Không đạt" },
];

function getTimelineDateKey(entry: ScoreEntry): string {
  const date = entry.sessionDate || entry.conversionAssessment?.examDate || entry.createdAt;
  return date?.slice(0, 10) || "unknown";
}

function formatTimelineDate(dateKey: string): string {
  if (dateKey === "unknown") return "Chưa xác định ngày";
  try {
    return format(new Date(`${dateKey}T00:00:00`), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch {
    return dateKey;
  }
}

function ScoreDetailDialog({
  entry,
  open,
  onClose,
  studentId,
  studentCode,
  studentName,
}: {
  entry: ScoreEntry | null;
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentCode: string;
  studentName: string;
}) {
  if (!entry) return null;
  if (entry.type === "Bảng điểm quy đổi" && entry.conversionAssessment) {
    return (
      <StaffScoreSheetAssessmentScoreDialog
        assessment={entry.conversionAssessment}
        student={{ studentId, code: studentCode, fullName: studentName }}
        open={open}
        mode="view"
        scoreEntryUrl={`/api/students/${encodeURIComponent(studentId)}/score-entries/${encodeURIComponent(entry.conversionAssessment.sessionId)}/conversion-detail`}
        onOpenChange={(value) => !value && onClose()}
        onSaved={onClose}
      />
    );
  }
  const isGradeBookEntry = entry.type === "Bảng điểm" || entry.type === "Bảng điểm quy đổi";
  const comment = entry.gradingComment?.trim() ?? "";

  const commentContent = comment
    ? comment.startsWith("<")
      ? (
        <div
          className="prose prose-sm max-w-none break-words leading-relaxed"
          dangerouslySetInnerHTML={{ __html: comment }}
        />
      )
      : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{comment}</p>
    : <p className="text-sm italic text-muted-foreground">Chưa có nhận xét cho bảng điểm này.</p>;

  const isWideScoreEntry = entry.type === "Bảng điểm" || entry.type === "BTVN";
  const wideDialogClassName = "z-[300] max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[94vw] sm:max-w-[94vw] xl:max-w-[1180px]";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        overlayClassName="z-[250] bg-black/35 backdrop-blur-[2px]"
        className={isGradeBookEntry
          ? `${wideDialogClassName} flex flex-col overflow-hidden p-0`
          : isWideScoreEntry
            ? `${wideDialogClassName} overflow-y-auto`
            : "z-[300] max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto"}
      >
        <DialogHeader className={isGradeBookEntry ? "shrink-0 px-5 pt-5 pb-4" : ""}>
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">
            {entry.title}
          </DialogTitle>
        </DialogHeader>

        <div className={`space-y-3 text-sm ${isGradeBookEntry ? "shrink-0 border-y px-5 py-4" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Lớp học</span>
            <span className="font-medium">{entry.className}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Loại</span>
            <span
              className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded border text-xs font-medium ${TYPE_COLORS[entry.type] ?? ""}`}
            >
              {entry.type}
            </span>
          </div>

          {!isGradeBookEntry && (entry.type === "BTVN" || entry.type === "Bài kiểm tra") && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Điểm</span>
              <span className="font-semibold text-base">{entry.finalScore ?? "—"}</span>
            </div>
          )}

        </div>

        {isGradeBookEntry ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b sm:border-b-0 sm:border-r">
              <div className="shrink-0 border-b bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold">Chi tiết điểm</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {entry.scores.length > 0 ? (
                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tiêu chí</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.scores.map((score, index) => (
                          <tr key={`${score.categoryName}-${index}`} className="border-t">
                            <td className="px-3 py-2">{score.categoryName}</td>
                            <td
                              className="px-3 py-2 text-right font-medium"
                              style={{ color: score.color ?? undefined }}
                            >
                              {score.score ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Chưa có điểm được nhập.</p>
                )}
              </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold">Nhận xét của giáo viên</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {commentContent}
              </div>
            </section>
          </div>
        ) : (
          entry.gradingComment && (
            <div className="mt-3">
              <p className="mb-1 text-muted-foreground">Nhận xét</p>
              <div className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed prose prose-xs max-w-none">
                {entry.gradingComment.trimStart().startsWith("<") ? (
                  <div dangerouslySetInnerHTML={{ __html: entry.gradingComment }} />
                ) : (
                  <p className="whitespace-pre-wrap">{entry.gradingComment}</p>
                )}
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StudentScoreTab({
  studentId,
  studentCode,
  studentName,
  open,
}: {
  studentId: string;
  studentCode: string;
  studentName: string;
  open: boolean;
}) {
  const [detailEntry, setDetailEntry] = useState<ScoreEntry | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Set<ScoreFilter>>(new Set(["all"]));

  const { data: entries = [], isLoading } = useQuery<ScoreEntry[]>({
    queryKey: ["/api/students", studentId, "score-entries"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/score-entries`);
      if (!res.ok) throw new Error("Lỗi tải bảng điểm");
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

  const selectedTypes = [...filters].filter((item) =>
    item === "gradebook" || item === "homework" || item === "conversion",
  );
  const selectedStatuses = [...filters].filter((item) => item === "passed" || item === "failed");
  const filteredEntries = entries.filter((entry) => {
    const matchesType = selectedTypes.length === 0 || selectedTypes.some((type) => {
      if (type === "gradebook") return entry.type === "Bảng điểm";
      if (type === "homework") return entry.type === "BTVN";
      return entry.type === "Bảng điểm quy đổi";
    });
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.some((status) =>
      entry.conversionResult?.passStatus === (status === "passed" ? "passed" : "failed"),
    );
    return matchesType && matchesStatus;
  });
  const timelineGroups = filteredEntries.reduce<Record<string, ScoreEntry[]>>((groups, entry) => {
    const dateKey = getTimelineDateKey(entry);
    (groups[dateKey] ??= []).push(entry);
    return groups;
  }, {});
  const sortedDateKeys = Object.keys(timelineGroups).sort((a, b) =>
    a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a),
  );
  const timelinePages: string[][] = [];
  let nextPageDateKeys: string[] = [];
  let nextPageEntryCount = 0;
  for (const dateKey of sortedDateKeys) {
    const dateEntryCount = timelineGroups[dateKey].length;
    if (nextPageDateKeys.length > 0 && nextPageEntryCount + dateEntryCount > pageSize) {
      timelinePages.push(nextPageDateKeys);
      nextPageDateKeys = [];
      nextPageEntryCount = 0;
    }
    nextPageDateKeys.push(dateKey);
    nextPageEntryCount += dateEntryCount;
  }
  if (nextPageDateKeys.length > 0) timelinePages.push(nextPageDateKeys);

  const totalPages = timelinePages.length || 1;
  const currentPage = Math.min(page, totalPages);
  const sortedDates = timelinePages[currentPage - 1] ?? [];
  const entriesBeforePage = timelinePages
    .slice(0, currentPage - 1)
    .reduce((count, dateKeys) => count + dateKeys.reduce((pageCount, dateKey) => pageCount + timelineGroups[dateKey].length, 0), 0);
  const visibleEntryCount = sortedDates.reduce((count, dateKey) => count + timelineGroups[dateKey].length, 0);
  const from = visibleEntryCount === 0 ? 0 : entriesBeforePage + 1;
  const to = entriesBeforePage + visibleEntryCount;

  return (
    <>
      <div className="shrink-0 border-b bg-white px-3 py-2">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Lọc bảng điểm">
          {SCORE_FILTER_TABS.map((tab) => {
            const selected = filters.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setFilters((current) => {
                    if (tab.id === "all") return new Set(["all"]);
                    const next = new Set(current);
                    next.delete("all");
                    if (next.has(tab.id)) next.delete(tab.id);
                    else next.add(tab.id);
                    return next.size > 0 ? next : new Set(["all"]);
                  });
                  setPage(1);
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selected
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-violet-50 hover:text-violet-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 px-3 sm:px-4">
        {filteredEntries.length === 0 ? (
          <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "Chưa có bảng điểm nào được công bố"
              : "Không có bảng điểm phù hợp với bộ lọc"}
          </div>
        ) : (
          <div className="space-y-0 py-4">
            {sortedDates.map((dateKey, dateIndex) => {
              const groupEntries = timelineGroups[dateKey];
              const isLast = dateIndex === sortedDates.length - 1;
              return (
                <div
                  key={dateKey}
                  className="flex min-w-0 gap-3"
                  data-testid={`score-timeline-group-${dateKey}`}
                >
                  <div className="flex w-5 shrink-0 flex-col items-center pt-1 sm:w-8">
                    <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100" />
                    {!isLast && <div className="mt-2 min-h-6 w-px flex-1 bg-violet-200" />}
                  </div>
                  <section className="min-w-0 flex-1 pb-5">
                    <p className="mb-2 text-xs font-semibold capitalize tracking-wide text-violet-700">
                      {formatTimelineDate(dateKey)}
                    </p>
                    <div className="space-y-2">
                      {groupEntries.map((entry) => (
                        <article
                          key={entry.id}
                          data-testid={`score-entry-row-${entry.id}`}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm transition-colors hover:bg-indigo-50/40 sm:px-4"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-800" title={entry.title}>
                                {entry.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">{entry.className}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span
                                data-testid={`score-entry-type-${entry.id}`}
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TYPE_COLORS[entry.type] ?? ""}`}
                              >
                                {entry.type}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`score-entry-view-${entry.id}`}
                                aria-label={`Xem chi tiết: ${entry.title}`}
                                onClick={() => setDetailEntry(entry)}
                                className="h-7 w-7 rounded-lg p-0 hover:bg-indigo-100 hover:text-indigo-700"
                                title="Xem chi tiết"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-dashed border-gray-200 pt-2">
                            {entry.type === "Bảng điểm quy đổi" ? (
                              <>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Điểm</span>
                                  <span className="break-words text-sm font-semibold tabular-nums text-gray-700">
                                    {entry.finalScore ?? <span className="text-gray-300">—</span>}
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Phân loại</span>
                                  {entry.conversionResult?.gradeBand ? (
                                    <span
                                      className="inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                      style={{
                                        color: entry.conversionResult.gradeBand.color,
                                        backgroundColor: `${entry.conversionResult.gradeBand.color}1A`,
                                      }}
                                    >
                                      {entry.conversionResult.gradeBand.label}
                                    </span>
                                  ) : <span className="text-sm text-gray-300">—</span>}
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Trạng thái</span>
                                  {entry.conversionResult?.passStatus ? (
                                    <span
                                      className="inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                      style={{
                                        color: entry.conversionResult.passStatus === "passed" ? "#15803D" : "#DC2626",
                                        backgroundColor: entry.conversionResult.passStatus === "passed" ? "#15803D1A" : "#DC26261A",
                                      }}
                                    >
                                      {entry.conversionResult.passStatus === "passed" ? "Đạt" : "Không đạt"}
                                    </span>
                                  ) : <span className="text-sm text-gray-300">—</span>}
                                </div>
                              </>
                            ) : (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Điểm tổng kết</span>
                                <span className="break-words text-sm font-semibold text-gray-700">
                                  {entry.finalScore ?? <span className="text-gray-300">—</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filteredEntries.length > 0 && (
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-white shrink-0 shadow-sm">
          <span className="text-xs text-gray-400 font-medium">{from}–{to} / {filteredEntries.length} bản ghi</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Hiển thị:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {[20, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">‹</button>
            <span className="text-xs font-semibold text-gray-600">{currentPage} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">›</button>
          </div>
        </div>
      )}

      <ScoreDetailDialog
        entry={detailEntry}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        studentId={studentId}
        studentCode={studentCode}
        studentName={studentName}
      />
    </>
  );
}
