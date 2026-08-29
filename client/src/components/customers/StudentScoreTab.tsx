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

interface ScoreEntry {
  id: string;
  type: "Bảng điểm" | "BTVN" | "Bài kiểm tra";
  title: string;
  className: string;
  classId: string;
  finalScore: string | null;
  scores: Array<{ categoryName: string; score: string | null }>;
  refId: string;
  gradingComment?: string | null;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  "Bảng điểm": "bg-violet-100 text-violet-700 border-violet-200",
  "BTVN": "bg-orange-100 text-orange-700 border-orange-200",
  "Bài kiểm tra": "bg-blue-100 text-blue-700 border-blue-200",
};

function ScoreDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: ScoreEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md z-[300]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">
            {entry.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Lớp học</span>
            <span className="font-medium">{entry.className}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Loại</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TYPE_COLORS[entry.type] ?? ""}`}
            >
              {entry.type}
            </span>
          </div>

          {entry.type === "Bảng điểm" && entry.scores.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-2">Chi tiết điểm</p>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tiêu chí</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.scores.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{s.categoryName}</td>
                        <td className="px-3 py-2 text-right font-medium">{s.score ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(entry.type === "BTVN" || entry.type === "Bài kiểm tra") && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Điểm</span>
              <span className="font-semibold text-base">{entry.finalScore ?? "—"}</span>
            </div>
          )}

          {entry.gradingComment && (
            <div>
              <p className="text-muted-foreground mb-1">Nhận xét</p>
              <div
                className="bg-muted/40 rounded-md px-3 py-2 text-xs leading-relaxed prose prose-xs max-w-none"
                dangerouslySetInnerHTML={{ __html: entry.gradingComment }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentScoreTab({
  studentId,
  open,
}: {
  studentId: string;
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
        <table className="w-full text-sm border-collapse table-fixed">
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
                  {entry.finalScore ?? <span className="text-gray-300">—</span>}
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
      />
    </>
  );
}
