import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, Trash2, MessageSquarePlus, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ScoreSheetTabContentProps {
  classId: string;
  classSessions: any[] | undefined;
  classData: any;
}

const NONE_VALUE = "__none__";

export function ScoreSheetTabContent({
  classId,
  classSessions,
  classData,
}: ScoreSheetTabContentProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>(NONE_VALUE);
  const [selectedScoreSheetId, setSelectedScoreSheetId] = useState<string>("");
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [removedStudentIds, setRemovedStudentIds] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentStudentId, setCommentStudentId] = useState<string>("");
  const [commentStudentName, setCommentStudentName] = useState<string>("");
  const [studentComments, setStudentComments] = useState<Record<string, string>>({});
  const [loadingEdit, setLoadingEdit] = useState(false);

  const isEditMode = !!editingBookId;

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: !!classId,
  });

  const { data: gradeBooks, isLoading } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/grade-books`],
    enabled: !!classId,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: !!classId,
  });

  const sessionList = sessions || classSessions || [];
  const dayOfWeekLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  const classScoreSheet = classData?.scoreSheetId
    ? allScoreSheets?.find((s: any) => s.id === classData.scoreSheetId)
    : null;

  const selectedSession = sessionList.find((s: any) => s.id === selectedSessionId);

  const selectedScoreSheet = allScoreSheets?.find(
    (s: any) => s.id === selectedScoreSheetId
  );

  const categories = selectedScoreSheet?.items?.map((item: any) => item.category).filter(Boolean) || [];

  const allStudents = activeStudents || [];
  const displayedStudents = allStudents.filter((s: any) => {
    const id = s.id || s.studentId;
    return !removedStudentIds.has(id);
  });

  useEffect(() => {
    if (!dialogOpen) return;
    if (isEditMode) return;
    if (selectedSessionId && selectedSessionId !== NONE_VALUE) {
      const session = sessionList.find((s: any) => s.id === selectedSessionId);
      const sheetId = session?.scoreSheetId || classData?.scoreSheetId || "";
      setSelectedScoreSheetId(sheetId);
    } else {
      setSelectedScoreSheetId(classData?.scoreSheetId || "");
    }
  }, [selectedSessionId, dialogOpen]);

  const createMutation = useMutation({
    mutationFn: async (data: any) =>
      apiRequest("POST", `/api/classes/${classId}/grade-books`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/grade-books`] });
      toast({ title: "Thêm bảng điểm thành công" });
      handleCloseDialog();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/classes/${classId}/grade-books/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/grade-books`] });
      toast({ title: "Cập nhật bảng điểm thành công" });
      handleCloseDialog();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/classes/${classId}/grade-books/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/grade-books`] });
      toast({ title: "Đã xoá bảng điểm" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = () => {
    setEditingBookId(null);
    setTitle("");
    setSelectedSessionId(NONE_VALUE);
    setSelectedScoreSheetId(classData?.scoreSheetId || "");
    setScores({});
    setRemovedStudentIds(new Set());
    setPublished(false);
    setStudentComments({});
    setDialogOpen(true);
  };

  const handleOpenEditDialog = async (book: any) => {
    setEditingBookId(book.id);
    setTitle(book.title);
    setSelectedSessionId(book.session_id || NONE_VALUE);
    setSelectedScoreSheetId(book.score_sheet_id);
    setRemovedStudentIds(new Set());
    setPublished(book.published || false);
    setStudentComments({});
    setScores({});
    setDialogOpen(true);
    setLoadingEdit(true);

    try {
      const resp = await fetch(`/api/classes/${classId}/grade-books/${book.id}`);
      const data = await resp.json();
      const existingScores: any[] = data.scores || [];
      const existingComments: Record<string, string> = data.studentComments || {};

      const studentIdToEnrollmentId: Record<string, string> = {};
      (activeStudents || []).forEach((s: any) => {
        const actualStudentId = s.studentId || s.student?.id;
        if (actualStudentId) {
          studentIdToEnrollmentId[actualStudentId] = s.id;
        }
      });

      const initialScores: Record<string, Record<string, string>> = {};
      existingScores.forEach((sc: any) => {
        const enrollmentId = studentIdToEnrollmentId[sc.studentId] || sc.studentId;
        if (!initialScores[enrollmentId]) initialScores[enrollmentId] = {};
        if (sc.score != null) initialScores[enrollmentId][sc.categoryId] = String(sc.score);
      });
      setScores(initialScores);

      // Load comments: convert actualStudentId -> enrollmentId keys
      const enrollmentComments: Record<string, string> = {};
      Object.entries(existingComments).forEach(([actualStudentId, comment]) => {
        const enrollmentId = studentIdToEnrollmentId[actualStudentId] || actualStudentId;
        if (comment) enrollmentComments[enrollmentId] = comment;
      });
      setStudentComments(enrollmentComments);
    } catch {
      // scores stay empty
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingBookId(null);
  };

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
      const updatedStudent = {
        ...(prev[studentId] || {}),
        [categoryId]: value,
      };
      const withAuto = computeAutoScores(studentId, updatedStudent);
      return {
        ...prev,
        [studentId]: withAuto,
      };
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

  const handleSaveComment = () => {
    setCommentDialogOpen(false);
  };

  const buildScoreList = () => {
    const scoreList: { studentId: string; categoryId: string; score: string }[] = [];
    displayedStudents.forEach((student: any) => {
      const enrollmentId = student.id;
      const actualStudentId = student.studentId || student.student?.id || student.id;
      categories.forEach((cat: any) => {
        const score = scores[enrollmentId]?.[cat.id] || "";
        if (score) {
          scoreList.push({ studentId: actualStudentId, categoryId: cat.id, score });
        }
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
      if (comment?.trim()) {
        result[actualStudentId] = comment.trim();
      }
    });
    return result;
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Vui lòng nhập tiêu đề", variant: "destructive" });
      return;
    }
    if (!selectedScoreSheetId) {
      toast({ title: "Vui lòng chọn bảng điểm", variant: "destructive" });
      return;
    }

    const scoreList = buildScoreList();
    const payload = {
      title: title.trim(),
      scoreSheetId: selectedScoreSheetId,
      sessionId: selectedSessionId !== NONE_VALUE ? selectedSessionId : null,
      scores: scoreList,
      studentComments: buildStudentComments(),
      published,
    };

    if (isEditMode && editingBookId) {
      updateMutation.mutate({ id: editingBookId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Sổ điểm lớp học
            </CardTitle>
            <Button
              size="sm"
              onClick={handleOpenDialog}
              data-testid="button-add-grade-book"
            >
              <Plus className="h-4 w-4 mr-1" />
              Thêm bảng điểm
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Đang tải...</div>
          ) : gradeBooks && gradeBooks.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead>Bảng điểm</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Người tạo</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Người cập nhật</TableHead>
                    <TableHead>Ngày cập nhật</TableHead>
                    <TableHead className="w-20 text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeBooks.map((book: any) => (
                    <TableRow key={book.id} data-testid={`row-grade-book-${book.id}`}>
                      <TableCell className="font-medium">
                        {book.title}
                      </TableCell>
                      <TableCell>
                        {book.score_sheet_name ? (
                          <Badge variant="outline" className="text-[11px]">
                            {book.score_sheet_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[12px]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
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
                      <TableCell className="text-[12px]">
                        {book.created_by_name || "—"}
                      </TableCell>
                      <TableCell className="text-[12px]">
                        {formatDate(book.created_at)}
                      </TableCell>
                      <TableCell className="text-[12px]">
                        {book.updated_by_name || "—"}
                      </TableCell>
                      <TableCell className="text-[12px]">
                        {formatDate(book.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-grade-book-${book.id}`}
                            onClick={() => handleOpenEditDialog(book)}
                            title="Sửa bảng điểm"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            data-testid={`button-delete-grade-book-${book.id}`}
                            onClick={() => deleteMutation.mutate(book.id)}
                            title="Xoá bảng điểm"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
              <p className="text-muted-foreground text-sm">Chưa có bảng điểm nào</p>
              <p className="text-muted-foreground text-xs mt-1">
                Nhấn "Thêm bảng điểm" để tạo bảng điểm mới
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-screen h-screen max-w-none rounded-none m-0 flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>{isEditMode ? "Sửa bảng điểm" : "Thêm bảng điểm"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* Left sidebar ~24% */}
            <div className="w-[24%] border-r p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Tiêu đề <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  data-testid="input-grade-book-title"
                  placeholder="Nhập tiêu đề bảng điểm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Buổi học</Label>
                <Select
                  value={selectedSessionId}
                  onValueChange={(v) => setSelectedSessionId(v)}
                >
                  <SelectTrigger data-testid="select-grade-book-session">
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

              <div className="space-y-1.5">
                <Label>
                  Bảng điểm <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedScoreSheetId}
                  onValueChange={(v) => setSelectedScoreSheetId(v)}
                >
                  <SelectTrigger data-testid="select-grade-book-scoresheet">
                    <SelectValue placeholder="Chọn bảng điểm" />
                  </SelectTrigger>
                  <SelectContent>
                    {allScoreSheets?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.id === classData?.scoreSheetId ? " (Mặc định lớp)" : ""}
                        {selectedSession?.scoreSheetId === s.id ? " (Buổi học)" : ""}
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

            {/* Right panel ~76% */}
            <div className="flex-1 overflow-auto">
              {loadingEdit ? (
                <div className="flex items-center justify-center h-full">
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
                            <TableHead key={cat.id} className={`min-w-[120px] text-center ${isComputedHeader ? "text-blue-900 dark:text-blue-300" : ""}`}>
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
                          const name =
                            student.fullName || student.full_name || student.student?.fullName || `Học viên ${idx + 1}`;
                          return (
                            <TableRow key={studentId} data-testid={`row-grade-student-${studentId}`}>
                              <TableCell className="sticky left-0 bg-background border-r font-medium text-[13px]">
                                {name}
                              </TableCell>
                              {categories.map((cat: any) => {
                                const isComputed = computedCategoryIds.has(cat.id);
                                return (
                                  <TableCell key={cat.id} className="p-1">
                                    <Input
                                      className={`h-8 text-center text-[13px] ${isComputed ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-300 cursor-default font-semibold border-blue-200 dark:border-blue-700" : ""}`}
                                      placeholder="—"
                                      readOnly={isComputed}
                                      data-testid={`input-score-${studentId}-${cat.id}`}
                                      value={scores[studentId]?.[cat.id] || ""}
                                      onChange={(e) =>
                                        isComputed ? undefined : handleScoreChange(studentId, cat.id, e.target.value)
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
                                    data-testid={`button-comment-student-${studentId}`}
                                    onClick={() => handleOpenComment(studentId, name)}
                                    title="Viết nhận xét"
                                  >
                                    <MessageSquarePlus className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    data-testid={`button-remove-student-${studentId}`}
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
                id="published-switch"
                checked={published}
                onCheckedChange={setPublished}
                data-testid="switch-publish-grade-book"
              />
              <Label htmlFor="published-switch" className="cursor-pointer select-none">
                {published ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">Công bố – Gửi bảng điểm đến học viên</span>
                ) : (
                  <span className="text-muted-foreground">Không công bố – Lưu trong hệ thống</span>
                )}
              </Label>
            </div>
            <Button variant="outline" onClick={handleCloseDialog}>
              Huỷ
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              data-testid="button-submit-grade-book"
            >
              {isPending ? "Đang lưu..." : isEditMode ? "Cập nhật bảng điểm" : "Lưu bảng điểm"}
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
            <Textarea
              placeholder="Nhập nhận xét cho học viên..."
              className="min-h-[240px] resize-none"
              data-testid="textarea-student-comment"
              value={studentComments[commentStudentId] || ""}
              onChange={(e) =>
                setStudentComments((prev) => ({
                  ...prev,
                  [commentStudentId]: e.target.value,
                }))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleSaveComment} data-testid="button-save-comment">
              Lưu nhận xét
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
