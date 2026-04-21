import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CardContent } from "@/components/ui/card";
import type { ClassPermissions } from "@/pages/education/ClassDetail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ArrowRightLeft, ChevronDown, LogIn, Plus, RefreshCw, Settings, Star, Trash2 } from "lucide-react";
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
    scheduledWeekdays: number[] | null;
  } | null>(null);

  return (
    <CardContent>
      <div className="overflow-x-auto">
        <Table className="min-w-[960px] text-xs">
          <TableHeader className="bg-muted/50">
            <TableRow className="h-8">
              <TableHead className="w-[40px] py-1 sticky left-0 z-20 bg-muted border-r">
                {canAdd && (
                <Checkbox
                  checked={
                    (currentSessionStudents?.length ?? 0) > 0 &&
                    selectedStudentIds.length ===
                      (currentSessionStudents?.length ?? 0)
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
              <TableHead className="min-w-[130px] py-1 sticky left-[40px] z-20 bg-muted border-r text-xs font-bold text-foreground">
                Tên
              </TableHead>
              <TableHead className="min-w-[130px] py-1 text-xs">Điểm danh</TableHead>
              <TableHead className="min-w-[120px] py-1 text-xs">Học phí</TableHead>
              <TableHead className="min-w-[100px] py-1 text-xs">Chu kỳ</TableHead>
              <TableHead className="min-w-[120px] py-1 text-xs">Ghi chú</TableHead>
              <TableHead className="min-w-[120px] py-1 text-xs">Nhận xét</TableHead>
              <TableHead className="min-w-[80px] py-1 text-right text-xs sticky right-0 z-20 bg-muted border-l">
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
              currentSessionStudents?.map((ss) => (
                <TableRow key={ss.id} className="hover:bg-muted/50">
                  <TableCell className="sticky left-0 z-10 bg-background border-r py-1">
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
                  <TableCell className="sticky left-[40px] z-10 bg-background border-r py-1">
                    <div className="font-medium text-xs">{ss.student?.fullName}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {ss.student?.code}
                    </div>
                    {ss.note && (
                      <div
                        className={`text-[10px] font-medium mt-0.5 whitespace-pre-line ${
                          ss.note.includes("Chuyển")
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-orange-500"
                        }`}
                      >
                        {ss.note}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div
                      className={`text-xs font-medium h-8 flex items-center px-2 rounded ${
                        ss.attendanceStatus === "present"
                          ? "text-green-600"
                          : ss.attendanceStatus === "absent"
                          ? "text-red-600"
                          : ss.attendanceStatus === "makeup_wait"
                          ? "text-orange-600"
                          : ss.attendanceStatus === "makeup_done"
                          ? "text-blue-600"
                          : ss.attendanceStatus === "paused"
                          ? "text-yellow-600"
                          : "text-slate-600"
                      }`}
                    >
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
                        <SelectTrigger className="w-full h-8 text-xs bg-transparent border-0 shadow-none p-0">
                          <SelectValue
                            className={`${
                              ss.attendanceStatus === "present"
                                ? "text-green-600"
                                : ss.attendanceStatus === "absent"
                                ? "text-red-600"
                                : ss.attendanceStatus === "makeup_wait"
                                ? "text-orange-600"
                                : ss.attendanceStatus === "makeup_done"
                                ? "text-blue-600"
                                : ss.attendanceStatus === "paused"
                                ? "text-yellow-600"
                                : "text-slate-600"
                            }`}
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-white opacity-100">
                          <SelectItem value="pending" className="text-slate-600">
                            Chưa điểm danh
                          </SelectItem>
                          <SelectItem
                            value="present"
                            className="text-green-600 font-medium"
                          >
                            Có học
                          </SelectItem>
                          <SelectItem
                            value="absent"
                            className="text-red-600 font-medium"
                          >
                            Nghỉ học
                          </SelectItem>
                          <SelectItem
                            value="makeup_wait"
                            className="text-orange-600 font-medium"
                          >
                            Nghỉ chờ bù
                          </SelectItem>
                          <SelectItem
                            value="makeup_done"
                            className="text-blue-600 font-medium"
                          >
                            Đã học bù
                          </SelectItem>
                          <SelectItem
                            value="paused"
                            className="text-yellow-600 font-medium"
                          >
                            Bảo lưu
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                            className={`text-xs truncate max-w-[150px] flex items-center gap-1 ${canEdit ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
                            onClick={() => {
                              if (!canEdit) return;
                              const note = prompt(
                                "Nhập ghi chú:",
                                ss.attendanceNote || ""
                              );
                              if (note !== null && note !== ss.attendanceNote) {
                                updateAttendanceMutation.mutate(
                                  {
                                    student_session_id: ss.id,
                                    attendance_status: ss.attendanceStatus,
                                    attendance_note: note,
                                  },
                                  {
                                    onSuccess: () => {
                                      toast({
                                        title: "Thành công",
                                        description: "Đã cập nhật ghi chú",
                                      });
                                    },
                                  }
                                );
                              }
                            }}
                          >
                            {ss.attendanceNote || "—"}
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
                              setChangeCycleTarget({
                                studentClassId: ss.studentClassId,
                                studentId: ss.studentId,
                                studentName: ss.student?.fullName || "Học viên",
                                fromSessionOrder: ss.sessionOrder ?? 1,
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
              ))
            )}
            {(currentSessionStudents?.length ?? 0) === 0 && (
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

      {changeCycleTarget && (
        <ChangeCycleDialog
          open={!!changeCycleTarget}
          onOpenChange={(open) => { if (!open) setChangeCycleTarget(null); }}
          studentClassId={changeCycleTarget.studentClassId}
          studentId={changeCycleTarget.studentId}
          studentName={changeCycleTarget.studentName}
          fromSessionOrder={changeCycleTarget.fromSessionOrder}
          currentWeekdays={changeCycleTarget.scheduledWeekdays}
          classWeekdays={classWeekdays}
          classId={classData?.id ?? ""}
          selectedClassSessionId={selectedClassSessionId}
        />
      )}
    </CardContent>
  );
}
