import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, BookOpen, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GradeBookEditDialog } from "@/components/education/GradeBookEditDialog";
import { GradeBookCreateDialog } from "@/components/education/GradeBookCreateDialog";

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

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-violet-500" />
          <h1 className="text-xl font-semibold">Bảng điểm của tôi</h1>
        </div>
        <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-violet-500" />
        <h1 className="text-xl font-semibold">Bảng điểm của tôi</h1>
        {gradeBooks.length > 0 && (
          <Badge variant="secondary" className="text-xs font-normal">
            {gradeBooks.length} bảng điểm
          </Badge>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-add-grade-book-staff"
          >
            <Plus className="h-4 w-4 mr-1" />
            Thêm bảng điểm
          </Button>
        </div>
      </div>

      {gradeBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-25" />
          <p className="text-sm">Chưa có bảng điểm nào trong các lớp của bạn</p>
        </div>
      ) : (
        <Card className="rounded-xl border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tất cả bảng điểm trong các lớp của bạn
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-b-xl overflow-auto">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Tiêu đề</TableHead>
                    <TableHead className="text-xs font-semibold">Lớp</TableHead>
                    <TableHead className="text-xs font-semibold">Buổi</TableHead>
                    <TableHead className="text-xs font-semibold">Bảng điểm</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Học viên</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Trạng thái</TableHead>
                    <TableHead className="text-xs font-semibold">Người tạo</TableHead>
                    <TableHead className="text-xs font-semibold">Ngày tạo</TableHead>
                    <TableHead className="text-xs font-semibold">Người cập nhật</TableHead>
                    <TableHead className="text-xs font-semibold">Ngày cập nhật</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeBooks.map((book) => (
                    <TableRow key={book.id} data-testid={`row-staff-grade-book-${book.id}`}>
                      <TableCell className="font-medium text-sm">{book.title}</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{book.classCode}</span>
                        {book.className !== book.classCode && (
                          <span className="text-muted-foreground ml-1 text-xs">— {book.className}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {book.sessionIndex != null ? `Buổi ${book.sessionIndex}` : "—"}
                        {book.sessionDate && (
                          <span className="block text-xs">{formatDate(book.sessionDate)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {book.scoreSheetName ? (
                          <Badge variant="outline" className="text-[11px]">{book.scoreSheetName}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        {book.studentCount ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {book.published ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[11px] font-medium">
                            Đã công bố
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                            Chưa công bố
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {book.createdByName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(book.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {book.updatedByName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(book.updatedAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingBook(book)}
                          data-testid={`btn-edit-grade-book-${book.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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
