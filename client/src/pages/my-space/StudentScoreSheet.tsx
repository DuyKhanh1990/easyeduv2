import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, BookOpen, Eye, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ScoreEntry = {
  categoryId: string;
  categoryName: string;
  score: string | null;
};

type GradeBookRow = {
  id: string;
  title: string;
  classCode: string;
  className: string;
  scoreSheetName: string;
  sessionIndex: number | null;
  sessionDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  scores: ScoreEntry[] | null;
  teacherComment: string | null;
  studentName: string | null;
};

const formatDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

export function StudentScoreSheet() {
  const [selected, setSelected] = useState<GradeBookRow | null>(null);

  const { data, isLoading } = useQuery<GradeBookRow[]>({
    queryKey: ["/api/my-space/score-sheet"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/score-sheet", { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi khi tải bảng điểm");
      return res.json();
    },
  });

  const gradeBooks = data ?? [];

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-violet-500" />
          <h1 className="text-xl font-semibold">Bảng điểm của tôi</h1>
        </div>
        <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />
      </div>
    );
  }

  const selectedScores = selected?.scores ?? [];
  const lastScore = selectedScores.length > 0 ? selectedScores[selectedScores.length - 1] : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-violet-500" />
        <h1 className="text-xl font-semibold">Bảng điểm của tôi</h1>
        {gradeBooks.length > 0 && (
          <Badge variant="secondary" className="text-xs font-normal">
            {gradeBooks.length} bảng điểm
          </Badge>
        )}
      </div>

      {gradeBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">Chưa có bảng điểm nào được ghi nhận</p>
        </div>
      ) : (
        <Card className="rounded-xl border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Danh sách bảng điểm
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-b-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Tiêu đề</TableHead>
                    <TableHead className="text-xs font-semibold">Lớp</TableHead>
                    {gradeBooks.some((b) => b.studentName) && (
                      <TableHead className="text-xs font-semibold">Học viên</TableHead>
                    )}
                    <TableHead className="text-xs font-semibold">Người tạo</TableHead>
                    <TableHead className="text-xs font-semibold">Ngày tạo</TableHead>
                    <TableHead className="text-xs font-semibold">Ngày cập nhật</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Điểm</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Xem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeBooks.map((book) => {
                    const scores = book.scores ?? [];
                    const last = scores.length > 0 ? scores[scores.length - 1] : null;
                    const showStudentCol = gradeBooks.some((b) => b.studentName);
                    return (
                      <TableRow key={book.id} data-testid={`row-grade-book-${book.id}`}>
                        <TableCell className="font-medium text-sm">{book.title}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{book.classCode}</span>
                          {book.className !== book.classCode && (
                            <span className="text-muted-foreground ml-1 text-xs">— {book.className}</span>
                          )}
                        </TableCell>
                        {showStudentCol && (
                          <TableCell className="text-sm text-muted-foreground">
                            {book.studentName ?? "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">
                          {book.createdByName ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(book.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(book.updatedAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          {last && last.score != null && last.score !== "" ? (
                            <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                              {last.score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setSelected(book)}
                            data-testid={`btn-view-grade-book-${book.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="text-base">{selected?.title}</DialogTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              {selected?.classCode && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {selected.classCode}{selected.className !== selected.classCode ? ` — ${selected.className}` : ""}
                </Badge>
              )}
              {selected?.scoreSheetName && (
                <Badge variant="outline" className="text-xs font-normal">
                  {selected.scoreSheetName}
                </Badge>
              )}
              {selected?.studentName && (
                <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                  HV: {selected.studentName}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Scores column */}
            <div className="w-64 shrink-0 overflow-y-auto border-r">
              {selectedScores.length > 0 ? (
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Tiêu chí</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Điểm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedScores.map((entry, idx) => (
                      <TableRow
                        key={entry.categoryId}
                        className={idx === selectedScores.length - 1 ? "font-semibold bg-secondary/30" : ""}
                      >
                        <TableCell className="text-sm">{entry.categoryName}</TableCell>
                        <TableCell className="text-sm text-right font-semibold">
                          {entry.score != null && entry.score !== "" ? (
                            <span className={idx === selectedScores.length - 1 ? "text-violet-600 dark:text-violet-400" : ""}>
                              {entry.score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-normal">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6">
                  <p className="text-sm text-muted-foreground italic">
                    Chưa có điểm được nhập cho bảng điểm này.
                  </p>
                </div>
              )}
            </div>

            {/* Comment column */}
            {selected?.teacherComment && (
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="flex items-center gap-1.5 text-muted-foreground px-4 py-3 border-b bg-secondary/30 shrink-0">
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-semibold">Nhận xét của giáo viên</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{selected.teacherComment}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
