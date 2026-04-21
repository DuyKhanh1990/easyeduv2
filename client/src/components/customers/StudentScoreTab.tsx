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
      <DialogContent className="max-w-md">
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
              <p className="bg-muted/40 rounded-md px-3 py-2 text-xs leading-relaxed">
                {entry.gradingComment}
              </p>
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

  return (
    <>
      <div className="flex-1 overflow-auto">
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
            <tr className="bg-muted/60 border-b">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">STT</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Tiêu đề</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Lớp học</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Loại</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Điểm tổng kết</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr
                key={entry.id}
                data-testid={`score-entry-row-${entry.id}`}
                className="border-b hover:bg-muted/20 transition-colors"
              >
                <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-3 font-medium truncate" title={entry.title}>{entry.title}</td>
                <td className="px-3 py-3 text-muted-foreground truncate">{entry.className}</td>
                <td className="px-3 py-3">
                  <span
                    data-testid={`score-entry-type-${entry.id}`}
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TYPE_COLORS[entry.type] ?? ""}`}
                  >
                    {entry.type}
                  </span>
                </td>
                <td
                  className="px-3 py-3 text-muted-foreground text-xs"
                  data-testid={`score-entry-final-${entry.id}`}
                >
                  {entry.finalScore ?? "—"}
                </td>
                <td className="px-3 py-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`score-entry-view-${entry.id}`}
                    onClick={() => setDetailEntry(entry)}
                    className="h-7 w-7 p-0"
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

      <ScoreDetailDialog
        entry={detailEntry}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
      />
    </>
  );
}
