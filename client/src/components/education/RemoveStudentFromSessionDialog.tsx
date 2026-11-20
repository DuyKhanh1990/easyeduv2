import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface RemoveStudentFromSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  studentClassId: string;
  studentClassIds?: Record<string, string>;
  fromSessionOrder: number;
  toSessionOrder: number;
  classId: string;
  classSessions?: any[];
  quickDeleteAll?: boolean;
}

export function RemoveStudentFromSessionDialog({
  isOpen,
  onOpenChange,
  studentIds,
  studentClassId,
  studentClassIds,
  fromSessionOrder: initialFromSessionOrder,
  toSessionOrder: initialToSessionOrder,
  classId,
  classSessions = [],
  quickDeleteAll = false,
}: RemoveStudentFromSessionDialogProps) {
  const [showScopeSelection, setShowScopeSelection] = useState(!quickDeleteAll);
  const [showWarning, setShowWarning] = useState(false);
  const [showOrphanWarning, setShowOrphanWarning] = useState(false);
  const [orphanedStudents, setOrphanedStudents] = useState<Array<{ studentClassId: string; studentId: string; studentName: string }>>([]);
  const [deleteOption, setDeleteOption] = useState<"all" | "unattended">("all");
  const [quickDeleteAction, setQuickDeleteAction] = useState<"waiting" | "remove">("waiting");
  const [deletionScope, setDeletionScope] = useState<"current" | "toEnd" | "range">("current");
  const [fromSessionOrder, setFromSessionOrder] = useState(initialFromSessionOrder);
  const [toSessionOrder, setToSessionOrder] = useState(initialToSessionOrder);
  const [customToSession, setCustomToSession] = useState(initialToSessionOrder);
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) {
      setShowScopeSelection(!quickDeleteAll);
      setShowWarning(false);
      setShowOrphanWarning(false);
      setOrphanedStudents([]);
      setDeleteOption("all");
      setQuickDeleteAction("waiting");
    }
  }, [isOpen]);

  const maxSessionOrder = Math.max(...(classSessions?.map(s => s.sessionIndex || 0) || [0]));

  const updateSessionRange = (scope: string) => {
    setDeletionScope(scope as any);
    setFromSessionOrder(initialFromSessionOrder);
    if (scope === "current") {
      setToSessionOrder(initialFromSessionOrder);
    } else if (scope === "toEnd") {
      setToSessionOrder(maxSessionOrder);
    } else {
      setToSessionOrder(customToSession);
    }
  };

  const checkAttendanceMutation = useMutation({
    mutationFn: async () => {
      const validStudentIds = studentIds.filter(id => id);
      if (!validStudentIds.length) {
         throw new Error(t("mySpace.calendar.invalidStudentId"));
      }
      if (!studentClassId) {
         throw new Error(t("mySpace.calendar.invalidClassId"));
      }
      const res = await apiRequest("POST", "/api/students/remove-from-sessions", {
        studentIds: validStudentIds,
        studentClassId,
        studentClassIds,
        fromSessionOrder,
        toSessionOrder,
        deleteMode: fromSessionOrder === toSessionOrder ? "single" : "range",
        deleteOnlyUnattended: false,
        deleteAllSessions: quickDeleteAll,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setOrphanedStudents(data.orphanedStudents ?? []);
      if (data.hasAttendedSessions) {
        setShowWarning(true);
      } else if ((data.orphanedStudents ?? []).length > 0) {
        setShowOrphanWarning(true);
      } else {
        executeDelete(false);
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("mySpace.calendar.error"),
        description: error.message || t("mySpace.calendar.checkSessionFailed"),
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ deleteOnlyUnattended, orphanAction }: {
      deleteOnlyUnattended: boolean;
      orphanAction: "keep" | "remove" | "waiting";
    }) => {
      const validStudentIds = studentIds.filter(id => id);
      if (!validStudentIds.length) {
         throw new Error(t("mySpace.calendar.invalidStudentId"));
      }
      if (!studentClassId) {
         throw new Error(t("mySpace.calendar.invalidClassId"));
      }
      await apiRequest("POST", "/api/students/remove-from-sessions-confirm", {
        studentIds: validStudentIds,
        studentClassId,
        studentClassIds,
        fromSessionOrder,
        toSessionOrder,
        deleteMode: fromSessionOrder === toSessionOrder ? "single" : "range",
        deleteOnlyUnattended,
         deleteAllSessions: quickDeleteAll,
        orphanAction,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/waiting-students`] });
      const affectedSessionIds = classSessions
        .filter((session) => {
          if (!session.id) return false;
          if (quickDeleteAll) return true;
          const sessionIndex = Number(session.sessionIndex);
          return Number.isFinite(sessionIndex)
            && sessionIndex >= fromSessionOrder
            && sessionIndex <= toSessionOrder;
        })
        .map((session) => session.id as string);
      for (const sessionId of affectedSessionIds) {
        queryClient.invalidateQueries({
          queryKey: [`/api/class-sessions/${sessionId}/student-sessions`],
        });
      }
      toast({
        title: t("mySpace.calendar.success"),
        description: quickDeleteAll
          ? t("mySpace.calendar.removedAllSchedule")
          : t("mySpace.calendar.removedStudentFromSession"),
      });
      onOpenChange(false);
      setShowWarning(false);
      setShowScopeSelection(true);
    },
    onError: (error: Error) => {
      toast({
        title: t("mySpace.calendar.error"),
        description: error.message || t("mySpace.calendar.removeStudentFailed"),
        variant: "destructive"
      });
    }
  });

  const checkOrphansAfterAttendanceMutation = useMutation({
    mutationFn: async () => {
      const validStudentIds = studentIds.filter(id => id);
      const res = await apiRequest("POST", "/api/students/remove-from-sessions", {
        studentIds: validStudentIds,
        studentClassId,
        studentClassIds,
        fromSessionOrder,
        toSessionOrder,
        deleteMode: fromSessionOrder === toSessionOrder ? "single" : "range",
        deleteOnlyUnattended: true,
         deleteAllSessions: quickDeleteAll,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const nextOrphanedStudents = data.orphanedStudents ?? [];
      setOrphanedStudents(nextOrphanedStudents);
      if (nextOrphanedStudents.length > 0 && !quickDeleteAll) {
        setShowOrphanWarning(true);
      } else {
        deleteMutation.mutate({
          deleteOnlyUnattended: true,
          orphanAction: quickDeleteAll ? quickDeleteAction : "keep",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("mySpace.calendar.error"),
        description: error.message || t("mySpace.calendar.checkRemainingSessionsFailed"),
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = () => {
    if (quickDeleteAll) {
      deleteMutation.mutate({
        deleteOnlyUnattended: false,
        orphanAction: quickDeleteAction,
      });
      return;
    }
    setShowScopeSelection(false);
    checkAttendanceMutation.mutate();
  };

  const executeDelete = (deleteOnlyUnattended: boolean) => {
    if (deleteOnlyUnattended) {
      setShowWarning(false);
      checkOrphansAfterAttendanceMutation.mutate();
      return;
    }
    if (orphanedStudents.length > 0) {
      setShowWarning(false);
      setShowOrphanWarning(true);
      return;
    }
    deleteMutation.mutate({ deleteOnlyUnattended: false, orphanAction: "keep" });
  };

  const executeOrphanDelete = (orphanAction: "remove" | "waiting") => {
    deleteMutation.mutate({
      deleteOnlyUnattended: deleteOption === "unattended",
      orphanAction,
    });
  };

  return (
    <>
      <Dialog open={isOpen && showScopeSelection && !showWarning && !showOrphanWarning} onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setShowScopeSelection(true);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {t("mySpace.calendar.removeScopeTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("mySpace.calendar.removeScopeDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("current")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "current" ? "#ef4444" : undefined, backgroundColor: deletionScope === "current" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">{t("mySpace.calendar.removeCurrent")}</p>
                  <p className="text-xs text-muted-foreground">Chỉ xoá từ buổi {initialFromSessionOrder}</p>
                </div>
              </div>
            </div>

            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("toEnd")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "toEnd" ? "#ef4444" : undefined, backgroundColor: deletionScope === "toEnd" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">{t("mySpace.calendar.removeToEnd")}</p>
                  <p className="text-xs text-muted-foreground">Xoá từ buổi {initialFromSessionOrder} đến buổi {maxSessionOrder}</p>
                </div>
              </div>
            </div>

            <div 
              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => updateSessionRange("range")}
            >
              <div className="flex items-start space-x-3">
                <div className="w-4 h-4 mt-1 border-2 border-gray-300 rounded-full flex-shrink-0" style={{ borderColor: deletionScope === "range" ? "#ef4444" : undefined, backgroundColor: deletionScope === "range" ? "#ef4444" : "transparent" }} />
                <div className="flex-1">
                  <p className="font-medium">{t("mySpace.calendar.removeCustomRange")}</p>
                  <p className="text-xs text-muted-foreground">{t("mySpace.calendar.chooseSessionRange")}</p>
                  {deletionScope === "range" && (
                    <div className="mt-3 flex gap-2">
                      <select 
                        value={customToSession} 
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setCustomToSession(val);
                          setToSessionOrder(val);
                        }}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      >
                        {classSessions?.filter(s => (s.sessionIndex || 0) >= initialFromSessionOrder).map(s => (
                          <option key={s.id} value={s.sessionIndex || 0}>
                            Buổi {s.sessionIndex}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("mySpace.calendar.cancelAction")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
            >
              {t("mySpace.calendar.continueAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpen && !showScopeSelection && !showWarning && !showOrphanWarning} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
                {quickDeleteAll ? t("mySpace.calendar.removeAllSchedule") : t("mySpace.calendar.removeStudentFromSession")}
            </DialogTitle>
            <DialogDescription>
              {quickDeleteAll
                ? t("mySpace.calendar.removeAllScheduleDescription")
                : `${t("mySpace.calendar.confirmRemoveStudents")} ${studentIds.length} ${t("mySpace.calendar.student").toLowerCase()} ${t("mySpace.calendar.fromSession")} ${fromSessionOrder === toSessionOrder ? t("mySpace.calendar.thisSession") : `${t("mySpace.calendar.session")} ${fromSessionOrder} ${t("mySpace.calendar.toSession")} ${toSessionOrder}`}?`}
            </DialogDescription>
          </DialogHeader>

          {quickDeleteAll ? (
            <div className="py-4 space-y-4">
              <RadioGroup
                value={quickDeleteAction}
                onValueChange={(value: "waiting" | "remove") => setQuickDeleteAction(value)}
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="waiting" id="quick-delete-waiting" className="mt-1" />
                  <Label htmlFor="quick-delete-waiting" className="cursor-pointer flex-1">
                    {t("mySpace.calendar.moveToWaiting")}
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="remove" id="quick-delete-remove" className="mt-1" />
                  <Label htmlFor="quick-delete-remove" className="cursor-pointer flex-1">
                    {t("mySpace.calendar.deleteFromClass")}
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-sm text-muted-foreground">
                {t("mySpace.calendar.deleteWarning")}
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">
                {t("mySpace.calendar.deleteWarning")}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={checkAttendanceMutation.isPending || deleteMutation.isPending}
            >
              {quickDeleteAll ? t("mySpace.calendar.cancel") : t("mySpace.calendar.cancelAction")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={checkAttendanceMutation.isPending || deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t("mySpace.calendar.deleting")
                : checkAttendanceMutation.isPending
                ? t("mySpace.calendar.checking")
                : quickDeleteAll ? t("mySpace.calendar.confirm") : t("mySpace.calendar.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarning} onOpenChange={(open) => {
        if (!open) {
          setShowWarning(false);
          onOpenChange(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              {t("mySpace.calendar.attendedSessionsWarning")}
            </DialogTitle>
            <DialogDescription>
              {t("mySpace.calendar.attendedSessionsQuestion")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <RadioGroup value={deleteOption} onValueChange={(value: any) => setDeleteOption(value)}>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="all" id="delete-all" />
                <Label htmlFor="delete-all" className="cursor-pointer flex-1">
                  <div>
                    <p className="font-medium">{t("mySpace.calendar.deleteAll")}</p>
                    <p className="text-xs text-muted-foreground">{t("mySpace.calendar.deleteAllDescription")}</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unattended" id="delete-unattended" />
                <Label htmlFor="delete-unattended" className="cursor-pointer flex-1">
                  <div>
                    <p className="font-medium">{t("mySpace.calendar.deleteOnlyUnattended")}</p>
                    <p className="text-xs text-muted-foreground">{t("mySpace.calendar.deleteOnlyUnattendedDescription")}</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWarning(false);
                onOpenChange(false);
              }}
              disabled={deleteMutation.isPending}
            >
              {t("mySpace.calendar.cancelAction")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => executeDelete(deleteOption === "unattended")}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("mySpace.calendar.deleting") : t("mySpace.calendar.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOrphanWarning} onOpenChange={(open) => {
        if (!open) {
          setShowOrphanWarning(false);
          onOpenChange(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              {t("mySpace.calendar.noRemainingSessions")}
            </DialogTitle>
            <DialogDescription className="text-foreground pt-2">
              {t("mySpace.calendar.noRemainingSessionsDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {orphanedStudents.map((student) => (
                <div key={student.studentClassId} className="py-0.5">
                  {student.studentName}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t("mySpace.calendar.chooseOrphanAction")}
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => executeOrphanDelete("waiting")}
              disabled={deleteMutation.isPending}
            >
              {t("mySpace.calendar.moveToWaiting")}
            </Button>
            <Button
              variant="destructive"
              className="sm:flex-1"
              onClick={() => executeOrphanDelete("remove")}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("mySpace.calendar.processing") : t("mySpace.calendar.deleteFromClass")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
