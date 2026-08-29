import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { BarChart3, BookOpen, Pencil, Plus, Users, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradeBookEditDialog } from "@/components/education/GradeBookEditDialog";
import { GradeBookCreateDialog } from "@/components/education/GradeBookCreateDialog";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";

type StaffGradeBookRow = {
  id: string;
  title: string;
  classId: string;
  classCode: string;
  className: string;
  scoreSheetId: string;
  scoreSheetName: string;
  sessionId: string | null;
  sessionIndex: number | null;
  sessionDate: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  scoreCount: number;
  studentCount: number;
  createdByName: string | null;
  updatedByName: string | null;
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

export function StaffScoreSheet() {
  const [editingBook, setEditingBook] = useState<StaffGradeBookRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery<StaffGradeBookRow[]>({
    queryKey: ["/api/my-space/score-sheet/staff"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/score-sheet/staff", { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi khi tải bảng điểm");
      return res.json();
    },
  });

  const gradeBooks = data ?? [];

  // Group by timeline date: prefer sessionDate, fallback to createdAt date
  const grouped = gradeBooks.reduce<Record<string, StaffGradeBookRow[]>>((acc, book) => {
    const dateKey = book.sessionDate
      ? book.sessionDate.substring(0, 10)
      : book.createdAt.substring(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(book);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

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
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-violet-500 sm:h-6 sm:w-6" />
          <h1 className="truncate text-lg font-semibold sm:text-xl">Bảng điểm của tôi</h1>
          {gradeBooks.length > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {gradeBooks.length} bảng điểm
            </Badge>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-add-grade-book-staff"
          >
            <Plus className="h-4 w-4 mr-1" />
            Thêm bảng điểm
          </Button>
          <PageGuideButton pageTitle="Bảng điểm của tôi" className="shrink-0" />
        </div>
      </div>

      {gradeBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">Chưa có bảng điểm nào trong các lớp của bạn</p>
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
                    {books.map((book) => (
                      <div
                        key={book.id}
                        className="grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-accent/40 sm:grid-cols-3 sm:px-4 md:grid-cols-4 xl:grid-cols-[minmax(160px,1fr)_160px_60px_120px_minmax(180px,1fr)_56px] xl:items-center xl:gap-x-4 xl:gap-y-0"
                        data-testid={`row-staff-grade-book-${book.id}`}
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

                        {/* Col 2: Score sheet badge */}
                        <div className="min-w-0">
                          {book.scoreSheetName ? (
                            <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                              {book.scoreSheetName}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>

                        {/* Col 3: Students */}
                        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{book.studentCount ?? 0} HV</span>
                        </div>

                        {/* Col 4: Status */}
                        <div className="min-w-0">
                          {book.published ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 whitespace-nowrap">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              Đã công bố
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              Chưa công bố
                            </span>
                          )}
                        </div>

                        {/* Col 5: Creator / updater */}
                        <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-2 xl:col-span-1">
                          <p className="text-[11px] text-muted-foreground whitespace-nowrap truncate">
                            Tạo: {book.createdByName ?? "—"} · {formatDate(book.createdAt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap truncate">
                            Cập nhật: {book.updatedByName ?? "—"} · {formatDate(book.updatedAt)}
                          </p>
                        </div>

                        {/* Col 6: Edit action */}
                        <div className="col-span-2 flex justify-end border-t border-border/60 pt-2 sm:col-span-3 md:col-span-4 xl:col-span-1 xl:border-0 xl:pt-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground whitespace-nowrap"
                            onClick={() => setEditingBook(book)}
                            data-testid={`btn-edit-grade-book-${book.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingBook && (
        <GradeBookEditDialog
          open={!!editingBook}
          onClose={() => setEditingBook(null)}
          classId={editingBook.classId}
          book={{
            id: editingBook.id,
            title: editingBook.title,
            scoreSheetId: editingBook.scoreSheetId,
            sessionId: editingBook.sessionId,
            published: editingBook.published,
          }}
          onSaved={() => refetch()}
        />
      )}

      <GradeBookCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); refetch(); }}
      />
    </div>
  );
}
