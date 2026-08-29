import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList, MessageSquare } from "lucide-react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";

interface GradeBookViewDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  book: {
    id: string;
    title: string;
    score_sheet_id: string;
    score_sheet_name?: string;
    session_id: string | null;
    published: boolean;
  };
}

export function GradeBookViewDialog({
  open,
  onClose,
  classId,
  book,
}: GradeBookViewDialogProps) {
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [commentViewOpen, setCommentViewOpen] = useState(false);
  const [commentViewName, setCommentViewName] = useState("");
  const [commentViewText, setCommentViewText] = useState("");

  const { data: allScoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"] });
  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: !!classId,
  });

  const selectedScoreSheet = allScoreSheets?.find((s: any) => s.id === book.score_sheet_id);
  const sheetItems = selectedScoreSheet?.items || [];
  const categories = sheetItems.map((item: any) => item.category).filter(Boolean);

  const computedCategoryIds = new Set<string>(
    sheetItems
      .filter((item: any) => {
        const code = item.category?.code;
        const f = (item.formula || "").trim();
        return f && f !== `= ${code}` && f !== `=${code}`;
      })
      .map((item: any) => item.category?.id)
      .filter(Boolean)
  );

  const allStudents = activeStudents || [];

  useEffect(() => {
    if (!open) return;
    setScores({});
    setComments({});
    setLoading(true);

    fetch(`/api/classes/${classId}/grade-books/${book.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const existingScores: any[] = data.scores || [];
        const existingComments: Record<string, string> = data.studentComments || {};

        const studentIdToEnrollmentId: Record<string, string> = {};
        (activeStudents || []).forEach((s: any) => {
          const actualStudentId = s.studentId || s.student?.id;
          if (actualStudentId) studentIdToEnrollmentId[actualStudentId] = s.id;
        });

        const initialScores: Record<string, Record<string, string>> = {};
        existingScores.forEach((sc: any) => {
          const enrollmentId = studentIdToEnrollmentId[sc.studentId] || sc.studentId;
          if (!initialScores[enrollmentId]) initialScores[enrollmentId] = {};
          if (sc.score != null) initialScores[enrollmentId][sc.categoryId] = String(sc.score);
        });
        setScores(initialScores);

        const enrollmentComments: Record<string, string> = {};
        Object.entries(existingComments).forEach(([actualStudentId, comment]) => {
          const enrollmentId = studentIdToEnrollmentId[actualStudentId] || actualStudentId;
          if (comment) enrollmentComments[enrollmentId] = String(comment);
        });
        setComments(enrollmentComments);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, book.id]);

  const handleViewComment = (studentId: string, name: string) => {
    setCommentViewName(name);
    setCommentViewText(comments[studentId] || "");
    setCommentViewOpen(true);
  };

  const hasAnyComment = Object.values(comments).some((c) => c?.trim());

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="w-screen h-screen max-w-none rounded-none m-0 flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>Xem bảng điểm — {book.title}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* Left sidebar */}
            <div className="w-64 border-r p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-muted-foreground">Tiêu đề</p>
                <p className="text-sm font-semibold">{book.title}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-muted-foreground">Trạng thái</p>
                {book.published ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[11px] font-medium">
                    Đã công bố
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                    Chưa công bố
                  </Badge>
                )}
              </div>

              {selectedScoreSheet && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Bảng điểm: {selectedScoreSheet.name}
                  </p>
                  {categories.length > 0 && (
                    <ul className="space-y-1">
                      {categories.map((cat: any) => (
                        <li key={cat.id} className="text-[11px] text-foreground flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {cat.name}
                          {cat.code && <span className="text-muted-foreground">({cat.code})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Score table */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ClipboardList className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-sm text-muted-foreground">Bảng điểm này chưa có danh mục điểm</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[180px] sticky left-0 bg-background z-20 border-r">
                        Học viên
                      </TableHead>
                      {categories.map((cat: any) => {
                        const isComp = computedCategoryIds.has(cat.id);
                        return (
                          <TableHead
                            key={cat.id}
                            className={`min-w-[110px] text-center ${isComp ? "text-blue-900 dark:text-blue-300" : ""}`}
                          >
                            <div className="font-semibold">{cat.name}</div>
                            {cat.code && (
                              <div className={`text-[10px] font-normal ${isComp ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`}>
                                {cat.code}
                              </div>
                            )}
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-[70px] text-center sticky right-0 bg-background z-20 border-l">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allStudents.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={categories.length + 2}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          Không có học viên
                        </TableCell>
                      </TableRow>
                    ) : (
                      allStudents.map((student: any, idx: number) => {
                        const enrollmentId = student.id || student.studentId;
                        const actualStudentId = student.studentId || student.student?.id;
                        const name =
                          student.fullName ||
                          student.full_name ||
                          student.student?.fullName ||
                          `Học viên ${idx + 1}`;
                        const studentCode = student.code || student.student?.code;
                        const hasComment = !!comments[enrollmentId]?.trim();
                        return (
                          <TableRow key={enrollmentId}>
                            <TableCell className="sticky left-0 bg-background border-r font-medium text-[13px]">
                              <StudentNameLink studentId={actualStudentId} name={name} code={studentCode} />
                            </TableCell>
                            {categories.map((cat: any) => {
                              const isComp = computedCategoryIds.has(cat.id);
                              const val = scores[enrollmentId]?.[cat.id];
                              return (
                                <TableCell key={cat.id} className="text-center text-[13px]">
                                  {val != null && val !== "" ? (
                                    <span
                                      className={`inline-flex items-center justify-center w-full h-8 rounded border px-2 ${
                                        isComp
                                          ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-700 font-semibold"
                                          : "bg-background border-border"
                                      }`}
                                    >
                                      {val}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="sticky right-0 bg-background border-l p-1 text-center">
                              {hasComment ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-orange-500 hover:text-orange-600"
                                  onClick={() => handleViewComment(enrollmentId, name)}
                                  title="Xem nhận xét"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-[12px]">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-only comment viewer */}
      <Dialog open={commentViewOpen} onOpenChange={setCommentViewOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Nhận xét học viên</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2 pr-1">
            <p className="text-sm font-medium">{commentViewName}</p>
            <div
              className="min-h-[120px] rounded-md border bg-muted/40 p-3 text-sm prose prose-sm max-w-none dark:prose-invert [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: commentViewText || "<p class='text-muted-foreground'>Không có nhận xét</p>" }}
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setCommentViewOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
