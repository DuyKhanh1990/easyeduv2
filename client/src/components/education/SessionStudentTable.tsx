import { useState, useEffect, useRef } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ClassPermissions } from "@/pages/education/ClassDetail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Avatar gradient helper ───────────────────────────────────────────────────
const AVATAR_GRADS = [
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
];
function avatarGrad(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_GRADS[Math.abs(h) % AVATAR_GRADS.length];
}

// ── Attendance badge config ───────────────────────────────────────────────────
const ATT_CFG: Record<string, { dot: string; text: string; label: string }> = {
  present:     { dot: "bg-emerald-500", text: "text-emerald-600", label: "Có học" },
  absent:      { dot: "bg-red-500",     text: "text-red-600",     label: "Nghỉ học" },
  makeup_wait: { dot: "bg-amber-500",   text: "text-amber-600",   label: "Nghỉ chờ bù" },
  makeup_done: { dot: "bg-blue-500",    text: "text-blue-600",    label: "Đã học bù" },
  paused:      { dot: "bg-yellow-500",  text: "text-yellow-600",  label: "Bảo lưu" },
  pending:     { dot: "bg-slate-400",   text: "text-slate-500",   label: "Chưa điểm danh" },
};
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, LogIn, MoreHorizontal, Plus, RefreshCw, Settings, Star, Trash2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChangeCycleDialog } from "./ChangeCycleDialog";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatCycle(scheduledWeekdays: number[] | null | undefined, classWeekdays: number[]): string {
  if (!scheduledWeekdays || scheduledWeekdays.length === 0) return "Tất cả";
  const sorted = [...scheduledWeekdays].sort((a, b) => a - b);
  const classSorted = [...classWeekdays].sort((a, b) => a - b);
  if (sorted.length === classSorted.length && sorted.every((v, i) => v === classSorted[i])) return "Tất cả";
  return sorted.map((w) => WEEKDAY_LABELS[w] || w.toString()).join(", ");
}

interface CyclePopoverProps {
  studentClassId: string;
  scheduledWeekdays: number[] | null | undefined;
  classWeekdays: number[];
  selectedClassSessionId: string | null;
}

function CyclePopover({ studentClassId, scheduledWeekdays, classWeekdays }: CyclePopoverProps) {
  const [open, setOpen] = useState(false);
  const sortedClassWeekdays = [...classWeekdays].sort((a, b) => a - b);
  const displayLabel = formatCycle(scheduledWeekdays, classWeekdays);

  const activeDays = (!scheduledWeekdays || scheduledWeekdays.length === 0)
    ? sortedClassWeekdays
    : [...scheduledWeekdays].sort((a, b) => a - b);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs hover:text-primary cursor-pointer text-left"
          data-testid={`cycle-select-${studentClassId}`}
        >
          <span>{displayLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <div className="text-xs text-muted-foreground mb-1.5 font-medium">Chu kỳ học</div>
        <div className="space-y-1">
          {sortedClassWeekdays.map((wd) => (
            <div key={wd} className="flex items-center gap-2 text-xs px-1 py-0.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${activeDays.includes(wd) ? "bg-primary" : "bg-muted-foreground/30"}`} />
              <span className={activeDays.includes(wd) ? "font-medium" : "text-muted-foreground"}>
                {WEEKDAY_LABELS[wd] || wd}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SessionStudentTableProps {
  currentSessionStudents: any[] | undefined;
  isLoadingSessionStudents: boolean;
  selectedStudentIds: string[];
  setSelectedStudentIds: (ids: string[]) => void;
  setIsActionMenuOpen: (open: boolean) => void;
  updateAttendanceMutation: { mutate: Function; isPending: boolean };
  classSessions: any[] | undefined;
  selectedClassSessionId: string | null;
  setStudentToRemove: (data: any) => void;
  setIsRemoveStudentDialogOpen: (open: boolean) => void;
  setReviewTarget: (target: any) => void;
  setIsReviewDialogOpen: (open: boolean) => void;
  setIsChangeTuitionPackageDialogOpen: (open: boolean) => void;
  setSelectedStudentForTransfer: (student: any) => void;
  setIsTransferOpen: (open: boolean) => void;
  classPerm?: ClassPermissions;
  classData?: any;
}

export function SessionStudentTable({
  currentSessionStudents,
  isLoadingSessionStudents,
  selectedStudentIds,
  setSelectedStudentIds,
  setIsActionMenuOpen,
  updateAttendanceMutation,
  classSessions,
  selectedClassSessionId,
  setStudentToRemove,
  setIsRemoveStudentDialogOpen,
  setReviewTarget,
  setIsReviewDialogOpen,
  setIsChangeTuitionPackageDialogOpen,
  setSelectedStudentForTransfer,
  setIsTransferOpen,
  classPerm,
  classData,
}: SessionStudentTableProps) {
  const { toast } = useToast();
  const canAdd = classPerm?.canAdd ?? true;
  const canEdit = classPerm?.canEdit ?? true;
  const canDelete = classPerm?.canDelete ?? true;

  // Detect effective weekdays for the currently selected session using the forward-walk algorithm.
  // Walk forward from the current session until a weekday repeats (= 1 full cycle found).
  // If no repeat before end of list, also walk backward to complete the cycle.
  const classWeekdays: number[] = (() => {
    if (!classSessions || !selectedClassSessionId) return classData?.weekdays ?? [];
    const allSorted = [...classSessions]
      .filter((s) => s.status !== "cancelled")
      .sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    const startPos = allSorted.findIndex((s) => s.id === selectedClassSessionId);
    if (startPos < 0) return classData?.weekdays ?? [];
    const seen: number[] = [];
    let forwardComplete = false;
    for (let i = startPos; i < allSorted.length; i++) {
      const wd = allSorted[i].weekday as number;
      if (seen.includes(wd)) { forwardComplete = true; break; }
      seen.push(wd);
    }
    if (!forwardComplete) {
      for (let i = startPos - 1; i >= 0; i--) {
        const wd = allSorted[i].weekday as number;
        if (seen.includes(wd)) break;
        seen.push(wd);
      }
    }
    const result = [...new Set(seen)].sort((a, b) => a - b);
    return result.length > 0 ? result : (classData?.weekdays ?? []);
  })();

  const [changeCycleTarget, setChangeCycleTarget] = useState<{
    studentClassId: string;
    studentId: string;
    studentName: string;
    fromSessionOrder: number;
    classSessionIndex: number;
    scheduledWeekdays: number[] | null;
  } | null>(null);

  // ── Note dialog ────────────────────────────────────────────────────────────
  const [noteDialog, setNoteDialog] = useState<{
    open: boolean;
    studentSessionId: string;
    attendanceStatus: string;
    value: string;
  } | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(0);
  }, [selectedClassSessionId]);

  const totalStudents = currentSessionStudents?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalStudents / pageSize));
  const pagedStudents = currentSessionStudents?.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="px-0 pb-0">
      <div className="overflow-x-auto rounded-b-2xl">
        <Table className="min-w-[880px] text-xs">
          <TableHeader>
            <TableRow className="h-8 border-b border-slate-100 bg-slate-50/80">
              <TableHead className="w-[40px] py-1 sticky left-0 z-20 bg-slate-50 border-r border-slate-100">
                {canAdd && (
                <Checkbox
                  checked={
                    totalStudents > 0 &&
                    selectedStudentIds.length === totalStudents
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedStudentIds(
                        currentSessionStudents?.map((s) => s.studentId) || []
                      );
                      setIsActionMenuOpen(true);
                    } else {
                      setSelectedStudentIds([]);
                      setIsActionMenuOpen(false);
                    }
                  }}
                />
                )}
              </TableHead>
              <TableHead className="min-w-[160px] py-1 sticky left-[40px] z-20 bg-slate-50 border-r border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Tên
              </TableHead>
              <TableHead className="min-w-[140px] py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Điểm danh</TableHead>
              <TableHead className="min-w-[120px] py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Học phí</TableHead>
              <TableHead className="min-w-[100px] py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chu kỳ</TableHead>
              <TableHead className="min-w-[120px] py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ghi chú</TableHead>
              <TableHead className="min-w-[110px] py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nhận xét</TableHead>
              <TableHead className="min-w-[60px] py-1 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky right-0 z-20 bg-slate-50 border-l border-slate-100">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingSessionStudents ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : (
              pagedStudents?.map((ss) => {
                const attKey = ss.attendanceStatus || "pending";
                const att = ATT_CFG[attKey] ?? ATT_CFG.pending;
                const fullName: string = ss.student?.fullName || "?";
                return (
                <TableRow key={ss.id} className="hover:bg-indigo-50/30 border-b border-slate-50 transition-colors">
                  <TableCell className="sticky left-0 z-10 bg-white border-r border-slate-100 py-2">
                    {canAdd && (
                    <Checkbox
                      checked={selectedStudentIds.includes(ss.studentId)}
                      onCheckedChange={(checked) => {
                        const newIds = checked
                          ? [...selectedStudentIds, ss.studentId]
                          : selectedStudentIds.filter((id) => id !== ss.studentId);
                        setSelectedStudentIds(newIds);
                        setIsActionMenuOpen(newIds.length > 0);
                      }}
                    />
                    )}
                  </TableCell>
                  <TableCell className="sticky left-[40px] z-10 bg-white border-r border-slate-100 py-2">
                    <div className="flex items-center gap-2">
                      {/* Avatar circle */}
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGrad(fullName)} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}>
                        {fullName[0]}
                      </div>
                      <div className="min-w-0">
                        <StudentNameLink studentId={ss.studentId} name={ss.student?.fullName} code={ss.student?.code} />
                        {ss.note && (
                          <div
                            className={`text-[10px] font-medium mt-0.5 whitespace-pre-line ${
                              ss.note.includes("Chuyển")
                                ? "text-blue-600"
                                : "text-orange-500"
                            }`}
                          >
                            {ss.note}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Select
                      value={ss.attendanceStatus || "pending"}
                      onValueChange={(val) =>
                        canEdit && updateAttendanceMutation.mutate({
                          student_session_id: ss.id,
                          attendance_status: val,
                        })
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-auto border-0 shadow-none p-0 bg-transparent w-auto focus:ring-0">
                        <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${att.text}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${att.dot}`} />
                          {att.label}
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-white opacity-100">
                        {Object.entries(ATT_CFG).map(([val, cfg]) => (
                          <SelectItem key={val} value={val} className={`${cfg.text} font-medium text-xs`}>
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {ss.feePackage?.name ||
                      (ss.packageType
                        ? `${ss.packageType} (${ss.sessionPrice}đ)`
                        : "—")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {canEdit && ss.studentClassId && classWeekdays.length > 0 ? (
                      <CyclePopover
                        studentClassId={ss.studentClassId}
                        scheduledWeekdays={ss.scheduledWeekdays}
                        classWeekdays={classWeekdays}
                        selectedClassSessionId={selectedClassSessionId}
                      />
                    ) : (
                      <span>{formatCycle(ss.scheduledWeekdays, classWeekdays)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`text-xs truncate max-w-[150px] flex items-center gap-1 group ${canEdit ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
                            onClick={() => {
                              if (!canEdit) return;
                              setNoteDialog({
                                open: true,
                                studentSessionId: ss.id,
                                attendanceStatus: ss.attendanceStatus || "pending",
                                value: ss.attendanceNote || "",
                              });
                            }}
                          >
                            <span className="truncate">{ss.attendanceNote || <span className="text-muted-foreground italic">Ghi chú...</span>}</span>
                            {canEdit && <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs break-words">
                            {ss.attendanceNote || "Chưa có ghi chú"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canAdd && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        title="Thêm nhận xét mới"
                        onClick={() => {
                          setReviewTarget({
                            ids: [ss.id],
                            names: [ss.student?.fullName || "Học viên"],
                            existing: null,
                            existingPublished: false,
                          });
                          setIsReviewDialogOpen(true);
                        }}
                        data-testid={`button-add-review-${ss.studentId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      )}
                      {canAdd && ss.reviewData && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-yellow-500"
                          title="Xem/sửa nhận xét đã nhập"
                          onClick={() => {
                            setReviewTarget({
                              ids: [ss.id],
                              names: [ss.student?.fullName || "Học viên"],
                              existing: ss.reviewData,
                              existingPublished: ss.reviewPublished,
                            });
                            setIsReviewDialogOpen(true);
                          }}
                          data-testid={`button-review-${ss.studentId}`}
                        >
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right sticky right-0 z-10 bg-background border-l py-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          data-testid={`button-actions-${ss.studentId}`}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {canEdit && classWeekdays.length > 0 && ss.studentClassId && (
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                              const currentSession = classSessions?.find(
                                (cs) => cs.id === selectedClassSessionId
                              );
                              setChangeCycleTarget({
                                studentClassId: ss.studentClassId,
                                studentId: ss.studentId,
                                studentName: ss.student?.fullName || "Học viên",
                                fromSessionOrder: ss.sessionOrder ?? 1,
                                classSessionIndex: currentSession?.sessionIndex ?? ss.sessionOrder ?? 1,
                                scheduledWeekdays: ss.scheduledWeekdays ?? null,
                              });
                            }}
                            data-testid={`menu-change-cycle-${ss.studentId}`}
                          >
                            <RefreshCw className="h-4 w-4 text-purple-500" />
                            Đổi chu kỳ học
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                              setSelectedStudentIds([ss.studentId]);
                              setIsChangeTuitionPackageDialogOpen(true);
                            }}
                            data-testid={`menu-change-tuition-${ss.studentId}`}
                          >
                            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                            Đổi gói học phí
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                              setSelectedStudentForTransfer(ss.student);
                              setIsTransferOpen(true);
                            }}
                            data-testid={`menu-transfer-class-${ss.studentId}`}
                          >
                            <LogIn className="h-4 w-4 text-orange-500" />
                            Chuyển lớp
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onSelect={() => {
                              const currentSession = classSessions?.find(
                                (cs) => cs.id === selectedClassSessionId
                              );
                              if (currentSession && ss.studentId && ss.studentClassId) {
                                setStudentToRemove({
                                  studentIds: [ss.studentId],
                                  studentClassId: ss.studentClassId,
                                  fromSessionOrder: currentSession.sessionIndex || 1,
                                  toSessionOrder: currentSession.sessionIndex || 1,
                                });
                                setIsRemoveStudentDialogOpen(true);
                              }
                            }}
                            data-testid={`menu-delete-student-${ss.studentId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            Xoá
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                )
              })
            )}
            {!isLoadingSessionStudents && totalStudents === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  Không có học viên nào được xếp lịch cho buổi này
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalStudents > 0 && (
        <div className="flex items-center justify-between px-1 pt-2 border-t border-border/50 mt-1">
          <span className="text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalStudents)} / {totalStudents} học viên
          </span>
          <div className="flex items-center gap-1.5">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}
            >
              <SelectTrigger className="h-7 w-16 text-xs border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20" className="text-xs">20</SelectItem>
                <SelectItem value="30" className="text-xs">30</SelectItem>
                <SelectItem value="50" className="text-xs">50</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 border-border/50"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{page + 1}/{totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 border-border/50"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {changeCycleTarget && (
        <ChangeCycleDialog
          open={!!changeCycleTarget}
          onOpenChange={(open) => { if (!open) setChangeCycleTarget(null); }}
          studentClassId={changeCycleTarget.studentClassId}
          studentId={changeCycleTarget.studentId}
          studentName={changeCycleTarget.studentName}
          fromSessionOrder={changeCycleTarget.fromSessionOrder}
          classSessionIndex={changeCycleTarget.classSessionIndex}
          currentWeekdays={changeCycleTarget.scheduledWeekdays}
          classWeekdays={classWeekdays}
          classId={classData?.id ?? ""}
          selectedClassSessionId={selectedClassSessionId}
        />
      )}

      {/* ── Note dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={!!noteDialog?.open}
        onOpenChange={(open) => {
          if (!open) setNoteDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]" onOpenAutoFocus={(e) => {
          e.preventDefault();
          noteTextareaRef.current?.focus();
        }}>
          <DialogHeader>
            <DialogTitle>Ghi chú</DialogTitle>
          </DialogHeader>
          <Textarea
            ref={noteTextareaRef}
            className="min-h-[100px] resize-none text-sm"
            placeholder="Nhập ghi chú..."
            value={noteDialog?.value ?? ""}
            onChange={(e) =>
              setNoteDialog((prev) => prev ? { ...prev, value: e.target.value } : prev)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (!noteDialog) return;
                if (noteDialog.value !== undefined) {
                  updateAttendanceMutation.mutate(
                    {
                      student_session_id: noteDialog.studentSessionId,
                      attendance_status: noteDialog.attendanceStatus,
                      attendance_note: noteDialog.value,
                    },
                    { onSuccess: () => toast({ title: "Đã cập nhật ghi chú" }) }
                  );
                }
                setNoteDialog(null);
              }
            }}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteDialog(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!noteDialog) return;
                updateAttendanceMutation.mutate(
                  {
                    student_session_id: noteDialog.studentSessionId,
                    attendance_status: noteDialog.attendanceStatus,
                    attendance_note: noteDialog.value,
                  },
                  { onSuccess: () => toast({ title: "Đã cập nhật ghi chú" }) }
                );
                setNoteDialog(null);
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
