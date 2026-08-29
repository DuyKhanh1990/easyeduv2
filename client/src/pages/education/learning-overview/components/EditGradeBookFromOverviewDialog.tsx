import { useState, useEffect, useRef } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RichEditor } from "@/components/ui/rich-editor";
import { ClipboardList, Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GradeBookRow } from "../types";

const NONE_VALUE = "__none__";

interface Props {
  book: GradeBookRow | null;
  open: boolean;
  onClose: () => void;
}

export function EditGradeBookFromOverviewDialog({ book, open, onClose }: Props) {
  const { toast } = useToast();

  const classId = book?.classId ?? "";
  const bookId = book?.id ?? "";

  const [title, setTitle] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>(NONE_VALUE);
  const [selectedScoreSheetId, setSelectedScoreSheetId] = useState<string>("");
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [removedStudentIds, setRemovedStudentIds] = useState<Set<string>>(new Set());
  const [gradeBookStudentIds, setGradeBookStudentIds] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentStudentId, setCommentStudentId] = useState<string>("");
  const [commentStudentName, setCommentStudentName] = useState<string>("");
  const [studentComments, setStudentComments] = useState<Record<string, string>>({});
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Prevent double-fetching scores
  const scoresFetchedForBookId = useRef<string | null>(null);

  const dayOfWeekLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
  });

  const { data: selectedClassData } = useQuery<any>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch class");
      return res.json();
    },
    enabled: !!classId && open,
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: !!classId && open,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: !!classId && open,
  });

  const sessionList = sessions || [];
  const allStudents = activeStudents || [];
  const displayedStudents = allStudents.filter((s: any) => {
    const enrollmentId = s.id || s.studentId;
    const actualStudentId = s.studentId || s.student?.id || s.id;
    const passesDataFilter = gradeBookStudentIds.size === 0 || gradeBookStudentIds.has(actualStudentId);
    return passesDataFilter && !removedStudentIds.has(enrollmentId);
  });

  const selectedScoreSheet = allScoreSheets?.find((s: any) => s.id === selectedScoreSheetId);
  const categories =
    selectedScoreSheet?.items?.map((item: any) => item.category).filter(Boolean) || [];
  const sheetItems = selectedScoreSheet?.items || [];

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

  // Step 1: When dialog opens for a new book, reset form fields immediately
  useEffect(() => {
    if (!open || !book) {
      scoresFetchedForBookId.current = null;
      return;
    }
    // Reset the fetch guard when book changes
    if (scoresFetchedForBookId.current !== book.id) {
      scoresFetchedForBookId.current = null;
      setTitle(book.title);
      setSelectedSessionId(book.sessionId || NONE_VALUE);
      setSelectedScoreSheetId(book.scoreSheetId || "");
      setPublished(book.published);
      setScores({});
      setRemovedStudentIds(new Set());
      setGradeBookStudentIds(new Set());
      setStudentComments({});
      setLoadingEdit(true);
    }
  }, [open, book?.id]);

  // Step 2: Load scores once activeStudents is available (may run after step 1)
  useEffect(() => {
    if (!open || !book) return;
    // Already fetched for this book
    if (scoresFetchedForBookId.current === book.id) return;
    // Wait for activeStudents to arrive
    if (!activeStudents) return;

    scoresFetchedForBookId.current = book.id;
    setLoadingEdit(true);

    fetch(`/api/classes/${book.classId}/grade-books/${book.id}`)
      .then((r) => r.json())
      .then((data) => {
        const existingScores: any[] = data.scores || [];
        const existingComments: Record<string, string> = data.studentComments || {};

        const studentIdToEnrollmentId: Record<string, string> = {};
        activeStudents.forEach((s: any) => {
          const actualStudentId = s.studentId || s.student?.id;
          if (actualStudentId) {
            studentIdToEnrollmentId[actualStudentId] = s.id;
          }
        });

        // Track which actual student IDs have data in this grade book
        const idsWithData = new Set<string>();
        existingScores.forEach((sc: any) => { if (sc.studentId) idsWithData.add(sc.studentId); });
        Object.keys(existingComments).forEach((id) => idsWithData.add(id));
        setGradeBookStudentIds(idsWithData);

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
          if (comment) enrollmentComments[enrollmentId] = comment as string;
        });
        setStudentComments(enrollmentComments);
      })
      .catch(() => {})
      .finally(() => setLoadingEdit(false));
  }, [open, book?.id, activeStudents]);

  // Auto-select score sheet when session changes (not on initial load)
  useEffect(() => {
    if (!open || !book) return;
    if (selectedSessionId && selectedSessionId !== NONE_VALUE) {
      const session = sessionList.find((s: any) => s.id === selectedSessionId);
      const sheetId =
        session?.scoreSheetId || selectedClassData?.scoreSheetId || book.scoreSheetId || "";
      if (sheetId) setSelectedScoreSheetId(sheetId);
    }
  }, [selectedSessionId]);

  const resolveFormulaToExpression = (
    formula: string,
    codeToFormula: Record<string, string>,
    visited: Set<string> = new Set()
  ): string => {
    const expr = formula.replace(/^=\s*/, "").trim();
    const tokens = expr.split(/([+\-*/().\s]+)/);
    return tokens
      .map((token) => {
        const t = token.trim();
        if (!t || /^[+\-*/().\s]+$/.test(token)) return token;
        if (visited.has(t)) return t;
        if (codeToFormula[t]) {
          const nextVisited = new Set(visited);
          nextVisited.add(t);
          return resolveFormulaToExpression(codeToFormula[t], codeToFormula, nextVisited);
        }
        return token;
      })
      .join("");
  };

  const evaluateExpression = (
    expr: string,
    codeToScore: Record<string, number>
  ): number | null => {
    let resolved = expr;
    for (const [code, val] of Object.entries(codeToScore)) {
      const regex = new RegExp(`\\b${code}\\b`, "g");
      resolved = resolved.replace(regex, String(val));
    }
    if (/[a-zA-Z_]/.test(resolved)) return null;
    try {
      const result = Function(`"use strict"; return (${resolved})`)();
      if (typeof result === "number" && isFinite(result)) return result;
      return null;
    } catch {
      return null;
    }
  };

  const computeAutoScores = (
    studentId: string,
    updatedStudentScores: Record<string, string>
  ): Record<string, string> => {
    const codeToId: Record<string, string> = {};
    const codeToFormula: Record<string, string> = {};

    sheetItems.forEach((item: any) => {
      const code = item.category?.code;
      const id = item.category?.id;
      if (!code || !id) return;
      codeToId[code] = id;
      const f = (item.formula || "").trim();
      if (f && f !== `= ${code}` && f !== `=${code}`) {
        codeToFormula[code] = f;
      }
    });

    const codeToScore: Record<string, number> = {};
    for (const [code, id] of Object.entries(codeToId)) {
      const val = parseFloat(updatedStudentScores[id] || "");
      if (!isNaN(val)) codeToScore[code] = val;
    }

    const result = { ...updatedStudentScores };
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      for (const [code, formula] of Object.entries(codeToFormula)) {
        const categoryId = codeToId[code];
        if (!categoryId) continue;
        const expanded = resolveFormulaToExpression(formula, codeToFormula);
        const computed = evaluateExpression(expanded, codeToScore);
        if (computed !== null) {
          const rounded = parseFloat(computed.toFixed(2));
          const strVal = String(rounded);
          if (result[categoryId] !== strVal) {
            result[categoryId] = strVal;
            codeToScore[code] = rounded;
            changed = true;
          }
        }
      }
    }
    return result;
  };

  const handleScoreChange = (studentId: string, categoryId: string, value: string) => {
    setScores((prev) => {
      const updatedStudent = { ...(prev[studentId] || {}), [categoryId]: value };
      const withAuto = computeAutoScores(studentId, updatedStudent);
      return { ...prev, [studentId]: withAuto };
    });
  };

  const handleRemoveStudent = (studentId: string) => {
    setRemovedStudentIds((prev) => {
      const next = new Set(prev);
      next.add(studentId);
      return next;
    });
  };

  const handleOpenComment = (studentId: string, studentName: string) => {
    setCommentStudentId(studentId);
    setCommentStudentName(studentName);
    setCommentDialogOpen(true);
  };

  const buildScoreList = () => {
    const scoreList: { studentId: string; categoryId: string; score: string }[] = [];
    displayedStudents.forEach((student: any) => {
      const enrollmentId = student.id;
      const actualStudentId = student.studentId || student.student?.id || student.id;
      categories.forEach((cat: any) => {
        const score = scores[enrollmentId]?.[cat.id] || "";
        if (score) scoreList.push({ studentId: actualStudentId, categoryId: cat.id, score });
      });
    });
    return scoreList;
  };

  const buildStudentComments = () => {
    const result: Record<string, string> = {};
    allStudents.forEach((student: any) => {
      const enrollmentId = student.id;
      const actualStudentId = student.studentId || student.student?.id || student.id;
      const comment = studentComments[enrollmentId];
      if (comment?.trim()) result[actualStudentId] = comment.trim();
    });
    return result;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) =>
      apiRequest("PUT", `/api/classes/${classId}/grade-books/${bookId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/grade-books`] });
      queryClient.invalidateQueries({ queryKey: ["/api/learning-overview/grade-books"] });
      toast({ title: "Cập nhật bảng điểm thành công" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Vui lòng nhập tiêu đề", variant: "destructive" });
      return;
    }
    if (!selectedScoreSheetId) {
      toast({ title: "Vui lòng chọn bảng điểm", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      title: title.trim(),
      scoreSheetId: selectedScoreSheetId,
      sessionId: selectedSessionId !== NONE_VALUE ? selectedSessionId : null,
      scores: buildScoreList(),
      studentComments: buildStudentComments(),
      published,
    });
  };

  if (!book) return null;

  const classScoreSheet = selectedClassData?.scoreSheetId
    ? allScoreSheets?.find((s: any) => s.id === selectedClassData.scoreSheetId)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="w-screen h-screen max-w-none rounded-none m-0 flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>Sửa bảng điểm</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* Left sidebar */}
            <div className="w-[24%] border-r p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              {/* Lớp (read-only) */}
              <div className="space-y-1.5">
                <Label>Lớp học</Label>
                <div className="h-9 rounded-md border bg-muted/40 px-3 flex items-center text-sm text-muted-foreground">
                  {book.className}
                </div>
              </div>

              {/* Tiêu đề */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-ov-title">
                  Tiêu đề <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-ov-title"
                  placeholder="Nhập tiêu đề bảng điểm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Buổi học */}
              <div className="space-y-1.5">
                <Label>Buổi học</Label>
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả học viên lớp" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— Tất cả học viên lớp —</SelectItem>
                    {sessionList
                      .filter((s: any) => s.status !== "cancelled")
                      .map((s: any) => {
                        const d = s.sessionDate ? new Date(s.sessionDate) : null;
                        const dow = d ? dayOfWeekLabels[d.getDay()] : "";
                        const dateStr = d ? format(d, "dd/MM/yyyy") : "";
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            Buổi {s.sessionIndex ?? ""} – {dow} {dateStr}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Bảng điểm */}
              <div className="space-y-1.5">
                <Label>
                  Bảng điểm <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedScoreSheetId} onValueChange={setSelectedScoreSheetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn bảng điểm" />
                  </SelectTrigger>
                  <SelectContent>
                    {allScoreSheets?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.id === selectedClassData?.scoreSheetId ? " (Mặc định lớp)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedScoreSheetId && classScoreSheet && (
                  <p className="text-[11px] text-muted-foreground">
                    Mặc định: {classScoreSheet.name}
                  </p>
                )}
              </div>

              {/* Categories preview */}
              {selectedScoreSheet && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Danh mục trong bảng điểm:
                  </p>
                  {categories.length > 0 ? (
                    <ul className="space-y-1">
                      {categories.map((cat: any) => (
                        <li key={cat.id} className="text-[11px] text-foreground flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {cat.name}
                          {cat.code && (
                            <span className="text-muted-foreground">({cat.code})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Bảng điểm chưa có danh mục
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="flex-1 overflow-auto">
              {loadingEdit ? (
                <div className="flex items-center justify-center h-full gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                </div>
              ) : !selectedScoreSheetId ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ClipboardList className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Chọn bảng điểm để nhập điểm cho học viên
                  </p>
                </div>
              ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <p className="text-sm text-muted-foreground">
                    Bảng điểm này chưa có danh mục điểm
                  </p>
                </div>
              ) : (
                <div className="h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="min-w-[180px] sticky left-0 bg-background z-20 border-r">
                          Học viên
                        </TableHead>
                        {categories.map((cat: any) => {
                          const isComputedHeader = computedCategoryIds.has(cat.id);
                          return (
                            <TableHead
                              key={cat.id}
                              className={`min-w-[120px] text-center ${isComputedHeader ? "text-blue-900 dark:text-blue-300" : ""}`}
                            >
                              <div className="font-semibold">{cat.name}</div>
                              {cat.code && (
                                <div className={`text-[10px] font-normal ${isComputedHeader ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`}>
                                  {cat.code}
                                </div>
                              )}
                            </TableHead>
                          );
                        })}
                        <TableHead className="w-[80px] text-center sticky right-0 bg-background z-20 border-l shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          Thao tác
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedStudents.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={categories.length + 2}
                            className="text-center text-sm text-muted-foreground py-8"
                          >
                            Không có học viên
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedStudents.map((student: any, idx: number) => {
                          const studentId = student.id || student.studentId;
                          const actualStudentId = student.studentId || student.student?.id;
                          const name =
                            student.fullName ||
                            student.full_name ||
                            student.student?.fullName ||
                            `Học viên ${idx + 1}`;
                          const studentCode = student.code || student.student?.code;
                          return (
                            <TableRow key={studentId}>
                              <TableCell className="sticky left-0 bg-background border-r font-medium text-[13px]">
                                <StudentNameLink studentId={actualStudentId} name={name} code={studentCode} />
                              </TableCell>
                              {categories.map((cat: any) => {
                                const isComputed = computedCategoryIds.has(cat.id);
                                return (
                                  <TableCell key={cat.id} className="p-1">
                                    <Input
                                      className={`h-8 text-center text-[13px] ${isComputed ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-300 cursor-default font-semibold border-blue-200 dark:border-blue-700" : ""}`}
                                      placeholder="—"
                                      readOnly={isComputed}
                                      value={scores[studentId]?.[cat.id] || ""}
                                      onChange={(e) =>
                                        isComputed
                                          ? undefined
                                          : handleScoreChange(studentId, cat.id, e.target.value)
                                      }
                                    />
                                  </TableCell>
                                );
                              })}
                              <TableCell className="sticky right-0 bg-background border-l shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] p-1">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 ${studentComments[studentId]?.trim() ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" : "text-muted-foreground hover:text-muted-foreground hover:bg-muted"}`}
                                    onClick={() => handleOpenComment(studentId, name)}
                                    title="Viết nhận xét"
                                  >
                                    <MessageSquarePlus className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRemoveStudent(studentId)}
                                    title="Xoá học viên khỏi bảng điểm"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <div className="flex items-center gap-3 mr-auto">
              <Switch
                id="edit-ov-published-switch"
                checked={published}
                onCheckedChange={setPublished}
              />
              <Label htmlFor="edit-ov-published-switch" className="cursor-pointer select-none">
                {published ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Công bố – Gửi bảng điểm đến học viên
                  </span>
                ) : (
                  <span className="text-muted-foreground">Không công bố – Lưu trong hệ thống</span>
                )}
              </Label>
            </div>
            <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
              Huỷ
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              data-testid="button-ov-update-grade-book"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Đang lưu...
                </>
              ) : (
                "Cập nhật bảng điểm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent className="max-w-[672px]">
          <DialogHeader>
            <DialogTitle>Nhận xét học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{commentStudentName}</p>
            <RichEditor
              placeholder="Nhập nhận xét cho học viên..."
              minHeight="240px"
              value={studentComments[commentStudentId] || ""}
              onChange={(val) =>
                setStudentComments((prev) => ({ ...prev, [commentStudentId]: val }))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={() => setCommentDialogOpen(false)}>Lưu nhận xét</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
