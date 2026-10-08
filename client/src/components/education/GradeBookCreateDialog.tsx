import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { RichEditor } from "@/components/ui/rich-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ScoreSheetTypeSwitch, type ScoreSheetDialogMode } from "./ScoreSheetTypeSwitch";
import { ScoreSheetConversionSelector } from "./ScoreSheetConversionSelector";

interface GradeBookCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const NONE_VALUE = "__none__";
const DAY_LABEL_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function GradeBookCreateDialog({ open, onClose, onSaved }: GradeBookCreateDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>(NONE_VALUE);
  const [selectedScoreSheetId, setSelectedScoreSheetId] = useState<string>("");
  const [dialogMode, setDialogMode] = useState<ScoreSheetDialogMode>("regular");
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [removedStudentIds, setRemovedStudentIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null);
  const [published, setPublished] = useState(false);
  const [studentComments, setStudentComments] = useState<Record<string, string>>({});
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentStudentId, setCommentStudentId] = useState("");
  const [commentStudentName, setCommentStudentName] = useState("");

  const { data: staffClasses } = useQuery<any[]>({
    queryKey: ["/api/my-space/classes/staff"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/classes/staff", { credentials: "include" });
      if (!res.ok) throw new Error(t("mySpace.scoreSheet.loadClassesError"));
      return res.json();
    },
    enabled: open,
  });

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
    enabled: open,
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${selectedClassId}/sessions`],
    enabled: !!selectedClassId,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${selectedClassId}/active-students`],
    enabled: !!selectedClassId,
  });

  const selectedClass = staffClasses?.find((c) => c.id === selectedClassId);
  const selectedSession = sessions?.find((s: any) => s.id === selectedSessionId);
  const selectedScoreSheet = allScoreSheets?.find((s: any) => s.id === selectedScoreSheetId);
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
  const displayedStudents = allStudents.filter((s: any) => {
    const actualStudentId = s.studentId || s.student?.id || s.id;
    return !removedStudentIds.has(actualStudentId);
  });

  useEffect(() => {
    if (!open) {
      setSelectedClassId("");
      setTitle("");
      setSelectedSessionId(NONE_VALUE);
      setSelectedScoreSheetId("");
      setDialogMode("regular");
      setScores({});
      setRemovedStudentIds(new Set());
      setPublished(false);
      setStudentComments({});
    }
  }, [open]);

  useEffect(() => {
    if (!selectedClassId) return;
    setSelectedSessionId(NONE_VALUE);
    setScores({});
    setRemovedStudentIds(new Set());
    const defaultSheetId = selectedClass?.scoreSheetId || "";
    setSelectedScoreSheetId(defaultSheetId);
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedSessionId && selectedSessionId !== NONE_VALUE) {
      const sheetId = selectedSession?.scoreSheetId || selectedClass?.scoreSheetId || "";
      setSelectedScoreSheetId(sheetId);
    } else if (selectedClassId) {
      setSelectedScoreSheetId(selectedClass?.scoreSheetId || "");
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
          const nv = new Set(visited);
          nv.add(t);
          return resolveFormulaToExpression(codeToFormula[t], codeToFormula, nv);
        }
        return token;
      })
      .join("");
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
      if (f && f !== `= ${code}` && f !== `=${code}`) codeToFormula[code] = f;
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
      const updated = { ...(prev[studentId] || {}), [categoryId]: value };
      return { ...prev, [studentId]: computeAutoScores(studentId, updated) };
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) =>
      apiRequest("POST", `/api/my-space/score-sheet/classes/${selectedClassId}/grade-books`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${selectedClassId}/grade-books`] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
      toast({ title: t("mySpace.scoreSheet.createSuccess") });
      onSaved?.();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: t("mySpace.scoreSheet.error"), description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (dialogMode !== "regular") return;
    if (!selectedClassId) {
      toast({ title: t("mySpace.scoreSheet.chooseClass"), variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: t("mySpace.scoreSheet.enterTitle"), variant: "destructive" });
      return;
    }
    if (!selectedScoreSheetId) {
      toast({ title: t("mySpace.scoreSheet.chooseScoreSheet"), variant: "destructive" });
      return;
    }

    const scoreList: { studentId: string; categoryId: string; score: string }[] = [];
    const studentCommentMap: Record<string, string> = {};

    allStudents.forEach((student: any) => {
      const enrollmentId = student.id;
      const actualStudentId = student.studentId || student.student?.id || student.id;
      if (!removedStudentIds.has(actualStudentId)) {
        categories.forEach((cat: any) => {
          const score = scores[enrollmentId]?.[cat.id] || "";
          if (score) scoreList.push({ studentId: actualStudentId, categoryId: cat.id, score });
        });
      }
      const comment = studentComments[enrollmentId];
      if (comment?.trim()) studentCommentMap[actualStudentId] = comment.trim();
    });

    createMutation.mutate({
      title: title.trim(),
      scoreSheetId: selectedScoreSheetId,
      sessionId: selectedSessionId !== NONE_VALUE ? selectedSessionId : null,
      scores: scoreList,
      studentComments: studentCommentMap,
      excludedStudentIds: Array.from(removedStudentIds),
      studentIds: allStudents.map((student: any) =>
        student.studentId || student.student?.id || student.id
      ),
      published,
    });
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

  const restoreStudent = (studentId: string) => {
    setRemovedStudentIds((prev) => {
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="w-screen h-screen max-w-none rounded-none m-0 flex flex-col p-0 gap-0">
          <DialogHeader className="flex-row flex-wrap items-center gap-x-6 gap-y-3 space-y-0 border-b px-6 py-3 shrink-0">
            <DialogTitle className="shrink-0">{t("mySpace.scoreSheet.createTitle")}</DialogTitle>
            <ScoreSheetTypeSwitch
              value={dialogMode}
              onValueChange={setDialogMode}
              className="w-full max-w-[360px]"
            />
          </DialogHeader>

          {dialogMode === "regular" ? (
          <div className="flex flex-1 min-h-0">
            <div className="w-[24%] border-r p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              <div className="space-y-1.5">
                <Label>
                  {t("mySpace.scoreSheet.class")} <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger data-testid="select-create-gradebook-class">
                    <SelectValue placeholder={t("mySpace.scoreSheet.selectClass")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffClasses || []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.classCode}
                        {c.name && c.name !== c.classCode ? ` — ${c.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t("mySpace.scoreSheet.titleLabel")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  data-testid="input-create-gradebook-title"
                  placeholder={t("mySpace.scoreSheet.titlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!selectedClassId}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("mySpace.scoreSheet.session")}</Label>
                <Select
                  value={selectedSessionId}
                  onValueChange={setSelectedSessionId}
                  disabled={!selectedClassId}
                >
                  <SelectTrigger data-testid="select-create-gradebook-session">
                    <SelectValue placeholder={t("mySpace.scoreSheet.allStudentsInClass")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>{t("mySpace.scoreSheet.allStudentsInClassOption")}</SelectItem>
                    {(sessions || [])
                      .filter((s: any) => s.status !== "cancelled")
                      .map((s: any) => {
                        const d = s.sessionDate ? new Date(s.sessionDate) : null;
                        const dow = d ? t(`mySpace.scoreSheet.weekday.${DAY_LABEL_KEYS[d.getDay()]}`) : "";
                        const dateStr = d ? format(d, "dd/MM/yyyy") : "";
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {t("mySpace.scoreSheet.sessionOption")} {s.sessionIndex ?? ""} – {dow} {dateStr}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t("mySpace.scoreSheet.scoreSheet")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedScoreSheetId}
                  onValueChange={setSelectedScoreSheetId}
                  disabled={!selectedClassId}
                >
                  <SelectTrigger data-testid="select-create-gradebook-scoresheet">
                    <SelectValue placeholder={t("mySpace.scoreSheet.selectScoreSheet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(allScoreSheets || []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.id === selectedClass?.scoreSheetId ? ` (${t("mySpace.scoreSheet.defaultClass")})` : ""}
                        {selectedSession?.scoreSheetId === s.id ? ` (${t("mySpace.scoreSheet.session")})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedScoreSheet && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    {t("mySpace.scoreSheet.categoriesInSheet")}:
                  </p>
                  {categories.length > 0 ? (
                    <ul className="space-y-1">
                      {categories.map((cat: any) => (
                        <li key={cat.id} className="text-[11px] text-foreground flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {cat.name}
                          {cat.code && <span className="text-muted-foreground">({cat.code})</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">{t("mySpace.scoreSheet.noCategories")}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {!selectedClassId ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ClipboardList className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("mySpace.scoreSheet.selectClassToEnterScores")}</p>
                </div>
              ) : !selectedScoreSheetId ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ClipboardList className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("mySpace.scoreSheet.selectSheetToEnterScores")}</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <p className="text-sm text-muted-foreground">{t("mySpace.scoreSheet.noScoreCategories")}</p>
                </div>
              ) : (
                <div>
                  {removedStudentIds.size > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-muted/30">
                      <span className="text-xs text-muted-foreground">
                        {removedStudentIds.size} {t("mySpace.scoreSheet.removedFromSheet")}
                      </span>
                      <Select onValueChange={restoreStudent}>
                        <SelectTrigger className="h-7 w-auto min-w-[170px] text-xs">
                        <SelectValue placeholder={t("mySpace.scoreSheet.restoreStudent")} />
                        </SelectTrigger>
                        <SelectContent>
                          {allStudents
                            .filter((student: any) =>
                              removedStudentIds.has(
                                student.studentId || student.student?.id || student.id
                              )
                            )
                            .map((student: any) => {
                              const restoredStudentId =
                                student.studentId || student.student?.id || student.id;
                              return (
                                <SelectItem
                                  key={restoredStudentId}
                                  value={restoredStudentId}
                                  className="text-xs"
                                >
                                  {student.fullName ||
                                    student.full_name ||
                                    student.student?.fullName ||
                                    t("mySpace.scoreSheet.studentLabel")}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12 min-w-[3rem] sticky left-0 bg-background z-30 border-r text-center">
                        STT
                      </TableHead>
                      <TableHead className="min-w-[180px] sticky left-12 bg-background z-20 border-r">
                        {t("mySpace.scoreSheet.studentLabel")}
                      </TableHead>
                      {categories.map((cat: any) => {
                        const isComp = computedCategoryIds.has(cat.id);
                        return (
                          <TableHead key={cat.id} className={`min-w-[120px] text-center ${isComp ? "text-blue-900 dark:text-blue-300" : ""}`}>
                            <div className="font-semibold">{cat.name}</div>
                            {cat.code && (
                              <div className={`text-[10px] font-normal ${isComp ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`}>
                                {cat.code}
                              </div>
                            )}
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-[80px] text-center sticky right-0 bg-background z-20 border-l shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        {t("mySpace.scoreSheet.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedStudents.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={categories.length + 3}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          {t("mySpace.scoreSheet.noStudents")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedStudents.map((student: any, idx: number) => {
                        const studentId = student.id || student.studentId;
                        const actualStudentId =
                          student.studentId || student.student?.id || student.id;
                        const name =
                          student.fullName || student.full_name || student.student?.fullName || `${t("mySpace.scoreSheet.studentLabel")} ${idx + 1}`;
                        return (
                          <TableRow key={studentId}>
                            <TableCell className="w-12 min-w-[3rem] sticky left-0 bg-background border-r text-center text-xs text-muted-foreground tabular-nums">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="sticky left-12 bg-background border-r font-medium text-[13px]">
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
                                    onChange={(e) =>
                                      !isComp && handleScoreChange(studentId, cat.id, e.target.value)
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
                                  className={`h-7 w-7 ${studentComments[studentId]?.trim() ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" : "text-muted-foreground hover:bg-muted"}`}
                                  onClick={() => {
                                    setCommentStudentId(studentId);
                                    setCommentStudentName(name);
                                    setCommentDialogOpen(true);
                                  }}
                                   title={t("mySpace.scoreSheet.writeComment")}
                                >
                                  <MessageSquarePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
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
          ) : (
            <ScoreSheetConversionSelector enabled={open && dialogMode === "conversion"} layout="create" />
          )}

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            {dialogMode === "regular" && (
              <div className="flex items-center gap-3 mr-auto">
                <Switch
                  id="create-published-switch"
                  checked={published}
                  onCheckedChange={setPublished}
                />
                <Label htmlFor="create-published-switch" className="cursor-pointer select-none">
                  {published ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {t("mySpace.scoreSheet.publishAndSend")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("mySpace.scoreSheet.saveInSystem")}</span>
                  )}
                </Label>
              </div>
            )}
            <Button variant="outline" onClick={onClose}>
              {t("mySpace.scoreSheet.cancel")}
            </Button>
            {dialogMode === "regular" && (
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                data-testid="button-create-gradebook-submit"
              >
                {createMutation.isPending ? t("mySpace.scoreSheet.saving") : t("mySpace.scoreSheet.save")}
              </Button>
            )}
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

      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent className="max-w-[672px] max-h-[90vh] flex flex-col">
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
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>
              {t("mySpace.scoreSheet.cancel")}
            </Button>
            <Button onClick={() => setCommentDialogOpen(false)}>{t("mySpace.scoreSheet.saveComment")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
