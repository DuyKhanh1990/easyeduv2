import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { BarChart3, BookOpen, Eye, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
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

const formatDateLabel = (d: string) => {
  try {
    return format(new Date(d), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch { return d; }
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

  // Group by timeline date: prefer sessionDate, fallback to createdAt date
  const grouped = gradeBooks.reduce<Record<string, GradeBookRow[]>>((acc, book) => {
    const dateKey = book.sessionDate
      ? book.sessionDate.substring(0, 10)
      : book.createdAt.substring(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(book);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const selectedScores = selected?.scores ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="text-lg font-semibold sm:text-xl">Bảng điểm của tôi</h1>
          </div>
          <PageGuideButton pageTitle="Bảng điểm của tôi" className="shrink-0" />
        </div>
        <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="truncate text-lg font-semibold sm:text-xl">Bảng điểm của tôi</h1>
          {gradeBooks.length > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {gradeBooks.length} bảng điểm
            </Badge>
          )}
        </div>
        <PageGuideButton pageTitle="Bảng điểm của tôi" className="shrink-0" />
      </div>

      {gradeBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">Chưa có bảng điểm nào được ghi nhận</p>
        </div>
      ) : (
        <div className="space-y-0">
          {sortedDates.map((dateKey, dateIdx) => {
            const books = grouped[dateKey];
            const isLast = dateIdx === sortedDates.length - 1;

            return (
              <div key={dateKey} className="flex min-w-0 gap-2 sm:gap-4">
                {/* Timeline spine */}
                <div className="flex w-8 shrink-0 flex-col items-center pt-1 sm:w-12 md:w-16 xl:w-[130px]">
                  <div className="w-3 h-3 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40 shrink-0 mt-1" />
                  {!isLast && (
                    <div className="flex-1 w-px bg-border mt-2 min-h-[24px]" />
                  )}
                </div>

                {/* Date + cards */}
                <div className="flex-1 pb-6 min-w-0">
                  {/* Date label */}
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-2 capitalize">
                    {formatDateLabel(dateKey)}
                  </p>

                  <div className="space-y-2">
                    {books.map((book) => {
                      const scores = book.scores ?? [];
                      const lastScore = scores.length > 0 ? scores[scores.length - 1] : null;
                      const hasComment = !!book.teacherComment;

                      return (
                        <div
                          key={book.id}
                          className="grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-accent/40 sm:grid-cols-3 sm:px-4 md:grid-cols-4 xl:grid-cols-[minmax(160px,1fr)_160px_80px_minmax(160px,1fr)_48px] xl:items-center xl:gap-x-4 xl:gap-y-0"
                          data-testid={`row-grade-book-${book.id}`}
                        >
                          {/* Col 1: Title + class */}
                          <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-2 xl:col-span-1">
                            <p className="text-sm font-semibold text-foreground truncate leading-tight">
                              {book.title}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                {book.classCode}
                              </span>
                              {book.className !== book.classCode && (
                                <span className="text-xs text-muted-foreground/70 truncate">
                                  — {book.className}
                                </span>
                              )}
                              {book.sessionIndex != null && (
                                <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                                  · Buổi {book.sessionIndex}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Col 2: Score sheet type */}
                          <div className="min-w-0">
                            {book.scoreSheetName ? (
                              <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                                {book.scoreSheetName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>

                          {/* Col 3: Score */}
                          <div className="flex min-w-0 items-center gap-1.5">
                            {lastScore && lastScore.score != null && lastScore.score !== "" ? (
                              <span className="text-sm font-bold text-violet-600 dark:text-violet-400 whitespace-nowrap">
                                {lastScore.score}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Chưa có</span>
                            )}
                            {hasComment && (
                              <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Có nhận xét" />
                            )}
                          </div>

                          {/* Col 4: Creator + date */}
                          <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-2 xl:col-span-1">
                            <p className="text-[11px] text-muted-foreground whitespace-nowrap truncate">
                              Tạo: {book.createdByName ?? "—"} · {formatDate(book.createdAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap truncate">
                              Cập nhật: {formatDate(book.updatedAt)}
                            </p>
                          </div>

                          {/* Col 5: View button */}
                          <div className="col-span-2 flex justify-end border-t border-border/60 pt-2 sm:col-span-1 sm:border-0 sm:pt-0 md:col-span-4 xl:col-span-1 xl:border-0 xl:pt-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setSelected(book)}
                              data-testid={`btn-view-grade-book-${book.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
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
                  {selected.teacherComment.trimStart().startsWith("<") ? (
                    <div
                      className="text-sm prose prose-sm max-w-none dark:prose-invert leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selected.teacherComment }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{selected.teacherComment}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
