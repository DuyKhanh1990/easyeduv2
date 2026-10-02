import { useState, useEffect, useRef } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RichEditor } from "@/components/ui/rich-editor";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList, MessageSquarePlus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { orderScoreSheetItemsByCategorySnapshot } from "@/lib/score-sheet-order";

interface GradeBookEditDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  book: {
    id: string;
    title: string;
    scoreSheetId: string;
    sessionId: string | null;
    published: boolean;
  };
  onSaved?: () => void;
}

export function GradeBookEditDialog({
  open,
  onClose,
  classId,
  book,
  onSaved,
}: GradeBookEditDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [title, setTitle] = useState(book.title);
  const [published, setPublished] = useState(book.published);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [includedStudentIds, setIncludedStudentIds] = useState<Set<string>>(new Set());
  const [removedStudentIds, setRemovedStudentIds] = useState<Set<string>>(new Set());
  const [pendingStudentIds, setPendingStudentIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null);
  const [studentComments, setStudentComments] = useState<Record<string, string>>({});
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentStudentId, setCommentStudentId] = useState("");
  const [commentStudentName, setCommentStudentName] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [scoreSheetCategoryOrderSnapshot, setScoreSheetCategoryOrderSnapshot] = useState<string[] | null>(null);
  // Theo dõi book.id đã init trong lần mở này — tránh chạy lại khi activeStudents refetch
  const initializedForBookId = useRef<string | null>(null);

  const { data: allScoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"] });
  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/active-students`],
    enabled: !!classId,
  });

  const selectedScoreSheet = allScoreSheets?.find((s: any) => s.id === book.scoreSheetId);
  const sheetItems = orderScoreSheetItemsByCategorySnapshot(
    selectedScoreSheet?.items,
    scoreSheetCategoryOrderSnapshot,
  );
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
  const displayedStudents = allStudents.filter((s: any) => {
    const actualStudentId = s.studentId || s.student?.id || s.id;
    return includedStudentIds.has(actualStudentId) && !removedStudentIds.has(actualStudentId);
  });
  const removedStudents = allStudents.filter((s: any) => {
    const actualStudentId = s.studentId || s.student?.id || s.id;
    return includedStudentIds.has(actualStudentId) && removedStudentIds.has(actualStudentId);
  });
  const newStudents = allStudents.filter((s: any) => {
    const actualStudentId = s.studentId || s.student?.id || s.id;
    return !includedStudentIds.has(actualStudentId);
  });

  // Reset ref khi dialog đóng hoặc book thay đổi
  useEffect(() => {
    if (!open) {
      initializedForBookId.current = null;
    }
  }, [open, book.id]);

  // Load existing scores/comments — chờ activeStudents sẵn sàng trước khi fetch
  // Dùng ref để chỉ chạy 1 lần mỗi lần mở, tránh reset khi activeStudents refetch
  useEffect(() => {
    if (!open || !activeStudents) return;
    if (initializedForBookId.current === book.id) return;
    initializedForBookId.current = book.id;

    setTitle(book.title);
    setPublished(book.published);
    setScores({});
    setIncludedStudentIds(new Set());
    setPendingStudentIds(new Set());
    setStudentComments({});
    setRemovedStudentIds(new Set());
    setPendingRemoval(null);
    setScoreSheetCategoryOrderSnapshot(null);
    setLoadingEdit(true);

    fetch(`/api/classes/${classId}/grade-books/${book.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const existingScores: any[] = data.scores || [];
        const existingComments: Record<string, string> = data.studentComments || {};
        setScoreSheetCategoryOrderSnapshot(
          Array.isArray(data.scoreSheetCategoryOrderSnapshot)
            ? data.scoreSheetCategoryOrderSnapshot
            : null,
        );
        setIncludedStudentIds(new Set(
          Array.isArray(data.studentIds)
            ? data.studentIds
            : activeStudents.map((s: any) => s.studentId || s.student?.id || s.id),
        ));
        setRemovedStudentIds(new Set(data.excludedStudentIds || []));

        const studentIdToEnrollmentId: Record<string, string> = {};
        activeStudents.forEach((s: any) => {
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
        setStudentComments(enrollmentComments);
      })
      .catch(() => {})
      .finally(() => setLoadingEdit(false));
  }, [open, book.id, activeStudents]);

  // Formula computation
  const resolveFormulaToExpression = (
    formula: string,
    codeToFormula: Record<string, string>,
    visited: Set<string> = new Set()
  ): string => {
    const expr = formula.replace(/^=\s*/, "").trim();
    const tokens = expr.split(/([+\-*/().\s]+)/);
    return tokens.map((token) => {
      const t = token.trim();
      if (!t || /^[+\-*/().\s]+$/.test(token)) return token;
      if (visited.has(t)) return t;
      if (codeToFormula[t]) {
        const nv = new Set(visited); nv.add(t);
        return resolveFormulaToExpression(codeToFormula[t], codeToFormula, nv);
      }
      return token;
    }).join("");
  };

  const evaluateExpression = (expr: string, codeToScore: Record<string, number>): number | null => {
    let resolved = expr;
    for (const [code, val] of Object.entries(codeToScore)) {
      resolved = resolved.replace(new RegExp(`\\b${code}\\b`, "g"), String(val));
    }
    if (/[a-zA-Z_]/.test(resolved)) return null;
    try {
      const r = Function(`"use strict"; return (${resolved})`)();
      return typeof r === "number" && isFinite(r) ? r : null;
    } catch { return null; }
  };

  const computeAutoScores = (studentId: string, updatedStudentScores: Record<string, string>) => {
    const codeToId: Record<string, string> = {};
    const codeToFormula: Record<string, string> = {};
    sheetItems.forEach((item: any) => {
      const code = item.category?.code;
      const id = item.category?.id;
      if (!code || !id) return;
      codeToId[code] = id;
      const f = (item.formula || "").trim();
      if (f && f !== `= ${code}` && f !== `=${code}`) codeToFormula[code] = f;
    });

    const codeToScore: Record<string, number> = {};
    for (const [code, id] of Object.entries(codeToId)) {
      const val = parseFloat(updatedStudentScores[id] || "");
      if (!isNaN(val)) codeToScore[code] = val;
    }

    const result = { ...updatedStudentScores };
    let changed = true, iterations = 0;
    while (changed && iterations < 10) {
      changed = false; iterations++;
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
      const updated = { ...(prev[studentId] || {}), [categoryId]: value };
      return { ...prev, [studentId]: computeAutoScores(studentId, updated) };
    });
  };

  const buildPayload = () => {
    const scoreList: { studentId: string; categoryId: string; score: string }[] = [];
    const studentCommentMap: Record<string, string> = {};

    includedStudentIds.forEach((actualStudentId) => {
      const student = allStudents.find((candidate: any) =>
        (candidate.studentId || candidate.student?.id || candidate.id) === actualStudentId
      );
      const enrollmentId = student?.id || actualStudentId;
      categories.forEach((cat: any) => {
        const score = scores[enrollmentId]?.[cat.id] || scores[actualStudentId]?.[cat.id] || "";
        if (score) scoreList.push({ studentId: actualStudentId, categoryId: cat.id, score });
      });
      const comment = studentComments[enrollmentId] || studentComments[actualStudentId];
      if (comment?.trim()) studentCommentMap[actualStudentId] = comment.trim();
    });

    return {
      title: title.trim(),
      scoreSheetId: book.scoreSheetId,
      sessionId: book.sessionId,
      scores: scoreList,
      studentComments: studentCommentMap,
      excludedStudentIds: Array.from(removedStudentIds),
      studentIds: Array.from(includedStudentIds),
      published,
    };
  };

  const requestRemoveStudent = (studentId: string, studentName: string) => {
    setPendingRemoval({ id: studentId, name: studentName });
  };

  const confirmRemoveStudent = () => {
    if (!pendingRemoval) return;
    setRemovedStudentIds((prev) => {
      const next = new Set(prev);
      next.add(pendingRemoval.id);
      return next;
    });
    setPendingRemoval(null);
  };

  const togglePendingStudent = (studentId: string, checked: boolean) => {
    setPendingStudentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  };

  const addPendingStudents = () => {
    if (pendingStudentIds.size === 0) return;
    setIncludedStudentIds((prev) => {
      const next = new Set(prev);
      pendingStudentIds.forEach((studentId) => next.add(studentId));
      return next;
    });
    setRemovedStudentIds((prev) => {
      const next = new Set(prev);
      pendingStudentIds.forEach((studentId) => next.delete(studentId));
      return next;
    });
    setPendingStudentIds(new Set());
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) =>
      apiRequest("PUT", `/api/classes/${classId}/grade-books/${book.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/grade-books`] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
       toast({ title: t("mySpace.scoreSheet.updateSuccess") });
      onSaved?.();
      onClose();
    },
    onError: (err: any) => {
       toast({ title: t("mySpace.scoreSheet.error"), description: err.message, variant: "destructive" });
    },
  });

  // Check if there is any score or comment data entered
  const hasAnyScore = Object.values(scores).some((studentScores) =>
    Object.values(studentScores).some((v) => v?.trim())
  );
  const hasAnyComment = Object.values(studentComments).some((c) => c?.trim());
  const hasData = hasAnyScore || hasAnyComment;

  const handleSubmit = () => {
    if (!title.trim()) {
       toast({ title: t("mySpace.scoreSheet.enterTitle"), variant: "destructive" });
      return;
    }
    if (published && !hasData) {
      toast({
         title: t("mySpace.scoreSheet.publishEmptyTitle"),
         description: t("mySpace.scoreSheet.publishEmptyDescription"),
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(buildPayload());
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="w-screen h-screen max-w-none rounded-none m-0 flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>{t("mySpace.scoreSheet.editTitle")} — {book.title}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* Left sidebar */}
            <div className="w-64 border-r p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">{t("mySpace.scoreSheet.titleLabel")}</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("mySpace.scoreSheet.titlePlaceholder")}
                />
              </div>

              {selectedScoreSheet && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    {t("mySpace.scoreSheet.scoreSheet")}: {selectedScoreSheet.name}
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
              {loadingEdit ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">{t("mySpace.scoreSheet.loadingData")}</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ClipboardList className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("mySpace.scoreSheet.noScoreCategories")}</p>
                </div>
              ) : (
              <div>
                {(removedStudents.length > 0 || newStudents.length > 0) && (
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-muted/30">
                    <span className="text-xs text-muted-foreground">
                      {removedStudents.length > 0 && `${removedStudents.length} ${t("mySpace.scoreSheet.removedCount")}`}
                      {removedStudents.length > 0 && newStudents.length > 0 && " · "}
                      {newStudents.length > 0 && `${newStudents.length} ${t("mySpace.scoreSheet.newCount")}`}
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-7 min-w-[190px] text-xs justify-between">
                          {t("mySpace.scoreSheet.addStudentsToSheet")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] p-2">
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {removedStudents.length > 0 && (
                            <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                              {t("mySpace.scoreSheet.removedStudents")}
                            </p>
                          )}
                          {removedStudents.map((student: any) => {
                            const studentId =
                              student.studentId || student.student?.id || student.id;
                            const name =
                              student.fullName || student.full_name || student.student?.fullName || t("mySpace.scoreSheet.studentLabel");
                            return (
                              <label key={`restore-${studentId}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                <Checkbox
                                  checked={pendingStudentIds.has(studentId)}
                                  onCheckedChange={(checked) => togglePendingStudent(studentId, checked === true)}
                                />
                                <span>[{t("mySpace.scoreSheet.removedStudents")}] {name}</span>
                              </label>
                            );
                          })}
                          {newStudents.length > 0 && (
                            <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                              {t("mySpace.scoreSheet.newActiveStudents")}
                            </p>
                          )}
                          {newStudents.map((student: any) => {
                            const studentId =
                              student.studentId || student.student?.id || student.id;
                            const name =
                              student.fullName || student.full_name || student.student?.fullName || t("mySpace.scoreSheet.studentLabel");
                            return (
                              <label key={`new-${studentId}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                <Checkbox
                                  checked={pendingStudentIds.has(studentId)}
                                  onCheckedChange={(checked) => togglePendingStudent(studentId, checked === true)}
                                />
                                <span>[{t("mySpace.scoreSheet.newActiveStudents")}] {name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t pt-2">
                          <span className="text-xs text-muted-foreground">
                            {t("mySpace.scoreSheet.selectedCount")}: {pendingStudentIds.size}
                          </span>
                          <Button size="sm" className="h-7 text-xs" disabled={pendingStudentIds.size === 0} onClick={addPendingStudents}>
                            {t("mySpace.scoreSheet.addSelected")}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[180px] sticky left-0 bg-background z-20 border-r">
                        {t("mySpace.scoreSheet.studentLabel")}
                      </TableHead>
                      {categories.map((cat: any) => {
                        const isComp = computedCategoryIds.has(cat.id);
                        return (
                          <TableHead key={cat.id} className={`min-w-[110px] text-center ${isComp ? "text-blue-900 dark:text-blue-300" : ""}`}>
                            <div className="font-semibold">{cat.name}</div>
                            {cat.code && (
                              <div className={`text-[10px] font-normal ${isComp ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`}>
                                {cat.code}
                              </div>
                            )}
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-[80px] text-center sticky right-0 bg-background z-20 border-l">
                        {t("mySpace.scoreSheet.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={categories.length + 2} className="text-center text-sm text-muted-foreground py-8">
                          {t("mySpace.scoreSheet.noStudents")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedStudents.map((student: any, idx: number) => {
                        const studentId = student.id || student.studentId;
                        const actualStudentId =
                          student.studentId || student.student?.id || student.id;
                        const name = student.fullName || student.full_name || student.student?.fullName || `${t("mySpace.scoreSheet.studentLabel")} ${idx + 1}`;
                        return (
                          <TableRow key={studentId}>
                            <TableCell className="sticky left-0 bg-background border-r font-medium text-[13px]">
                              {name}
                            </TableCell>
                            {categories.map((cat: any) => {
                              const isComp = computedCategoryIds.has(cat.id);
                              return (
                                <TableCell key={cat.id} className="p-1">
                                  <Input
                                    className={`h-8 text-center text-[13px] ${isComp ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-300 cursor-default font-semibold border-blue-200 dark:border-blue-700" : ""}`}
                                    placeholder="—"
                                    readOnly={isComp}
                                    value={scores[studentId]?.[cat.id] || ""}
                                    onChange={(e) => !isComp && handleScoreChange(studentId, cat.id, e.target.value)}
                                  />
                                </TableCell>
                              );
                            })}
                            <TableCell className="sticky right-0 bg-background border-l p-1">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-7 w-7 ${studentComments[studentId]?.trim() ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground"}`}
                                  onClick={() => { setCommentStudentId(studentId); setCommentStudentName(name); setCommentDialogOpen(true); }}
                                   title={t("mySpace.scoreSheet.writeComment")}
                                >
                                  <MessageSquarePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => requestRemoveStudent(actualStudentId, name)}
                                   title={t("mySpace.scoreSheet.removeStudent")}
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

          <DialogFooter className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3">
            {/* Publish toggle – sits right beside action buttons */}
            <div className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 ${hasData ? "border-border" : "border-dashed border-border/50 bg-muted/30"}`}>
              <Switch
                id="edit-published"
                checked={published}
                disabled={!hasData}
                onCheckedChange={(val) => {
                  if (val && !hasData) return;
                  setPublished(val);
                }}
              />
              <Label
                htmlFor="edit-published"
                className={`select-none leading-tight ${hasData ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                {published ? (
                  <span className="text-[12px] font-medium text-green-600 dark:text-green-400">{t("mySpace.scoreSheet.publishedLabel")}</span>
                ) : hasData ? (
                  <span className="text-[12px] text-muted-foreground">{t("mySpace.scoreSheet.unpublishedLabel")}</span>
                ) : (
                  <span className="text-[11px] italic text-muted-foreground/60">{t("mySpace.scoreSheet.needsScoresOrComments")}</span>
                )}
              </Label>
            </div>

            <Button variant="outline" onClick={onClose}>{t("mySpace.scoreSheet.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t("mySpace.scoreSheet.saving") : t("mySpace.scoreSheet.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mySpace.scoreSheet.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mySpace.scoreSheet.removeConfirmPrefix")} {pendingRemoval?.name || t("mySpace.scoreSheet.studentLabel")} {t("mySpace.scoreSheet.removeConfirmSuffix")}
              <br />
              {t("mySpace.scoreSheet.removeDataKept")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mySpace.scoreSheet.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveStudent}>{t("mySpace.scoreSheet.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Comment sub-dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("mySpace.scoreSheet.commentTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2 pr-1">
            <p className="text-sm font-medium">{commentStudentName}</p>
            <RichEditor
              placeholder={t("mySpace.scoreSheet.commentPlaceholder")}
              minHeight="200px"
              maxHeight="50vh"
              value={studentComments[commentStudentId] || ""}
              onChange={(val) =>
                setStudentComments((prev) => ({ ...prev, [commentStudentId]: val }))
              }
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>{t("mySpace.scoreSheet.cancel")}</Button>
            <Button onClick={() => setCommentDialogOpen(false)}>{t("mySpace.scoreSheet.saveComment")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
