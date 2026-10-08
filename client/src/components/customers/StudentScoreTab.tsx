import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={isGradeBookEntry
          ? "z-[300] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden p-0"
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

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Chưa có bảng điểm nào được công bố
      </div>
    );
  }

  const totalPages = Math.ceil(entries.length / pageSize);
  const paginated = entries.slice((page - 1) * pageSize, page * pageSize);
  const from = entries.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, entries.length);

  return (
    <>
      <div className="flex-1 overflow-auto bg-gray-50/50">
        <table className="w-full min-w-[960px] text-sm border-collapse table-fixed">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[34%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-white border-b-2 border-indigo-100 shadow-sm">
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">STT</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tiêu đề</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Lớp học</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Loại</th>
              <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Điểm tổng kết</th>
              <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map((entry, idx) => (
              <tr
                key={entry.id}
                data-testid={`score-entry-row-${entry.id}`}
                className="bg-white hover:bg-indigo-50/40 transition-colors"
              >
                <td className="px-3 py-3 text-gray-400 text-xs font-mono">{(page - 1) * pageSize + idx + 1}</td>
                <td className="px-3 py-3 font-semibold text-gray-800 truncate" title={entry.title}>{entry.title}</td>
                <td className="px-3 py-3 text-gray-500 truncate text-xs">{entry.className}</td>
                <td className="px-3 py-3">
                  <span
                    data-testid={`score-entry-type-${entry.id}`}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${TYPE_COLORS[entry.type] ?? ""}`}
                  >
                    {entry.type}
                  </span>
                </td>
                <td
                  className="px-3 py-3 font-semibold text-gray-700 text-sm"
                  data-testid={`score-entry-final-${entry.id}`}
                >
                  {entry.type === "Bảng điểm quy đổi" ? (
                    <div className="flex min-w-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
                      <span>
                        {entry.finalScore ?? <span className="text-gray-300">—</span>}
                      </span>
                      {entry.conversionResult?.gradeBand && (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            color: entry.conversionResult.gradeBand.color,
                            backgroundColor: `${entry.conversionResult.gradeBand.color}1A`,
                          }}
                        >
                          {entry.conversionResult.gradeBand.label}
                        </span>
                      )}
                      {entry.conversionResult?.passStatus && (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            color: entry.conversionResult.passStatus === "passed" ? "#15803D" : "#DC2626",
                            backgroundColor: entry.conversionResult.passStatus === "passed" ? "#15803D1A" : "#DC26261A",
                          }}
                        >
                          {entry.conversionResult.passStatus === "passed" ? "Đạt" : "Không đạt"}
                        </span>
                      )}
                    </div>
                  ) : (
                    entry.finalScore ?? <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`score-entry-view-${entry.id}`}
                    onClick={() => setDetailEntry(entry)}
                    className="h-7 w-7 p-0 hover:bg-indigo-100 hover:text-indigo-700 rounded-lg"
                    title="Xem chi tiết"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entries.length > 0 && (
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-white shrink-0 shadow-sm">
          <span className="text-xs text-gray-400 font-medium">{from}–{to} / {entries.length} bản ghi</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Hiển thị:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
