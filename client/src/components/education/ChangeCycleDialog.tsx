import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = String(value).slice(0, 10);
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function getSessionDate(session: any): string | undefined {
  const value = session?.sessionDate ?? session?.classSession?.sessionDate;
  return value ? String(value).slice(0, 10) : undefined;
}

function getSessionWeekday(session: any): number | undefined {
  const value = session?.weekday ?? session?.classSession?.weekday;
  if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
    return Number(value);
  }
  const date = getSessionDate(session);
  if (!date) return undefined;
  const jsWeekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return jsWeekday === 0 ? 7 : jsWeekday;
}

function formatSessionDate(session: any): string {
  const weekday = getSessionWeekday(session);
  if (weekday === undefined) return formatDate(getSessionDate(session));
  const weekdayIndex = weekday === 7 ? 0 : weekday;
  const weekdayLabel = Number.isInteger(weekdayIndex) ? WEEKDAY_LABELS[weekdayIndex] : "";
  return `${weekdayLabel ? `${weekdayLabel}, ` : ""}${formatDate(getSessionDate(session))}`;
}

function formatCycle(weekdays: number[] | null | undefined, classWeekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return "Tất cả";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const classSorted = [...classWeekdays].sort((a, b) => a - b);
  if (sorted.length === classSorted.length && sorted.every((v, i) => v === classSorted[i])) return "Tất cả";
  return sorted.map((w) => WEEKDAY_LABELS[w] || w.toString()).join(", ");
}

interface ChangeCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentClassId: string;
  studentId: string;
  studentName: string;
  fromSessionOrder: number;
  classSessionIndex?: number;
  currentWeekdays: number[] | null;
  classWeekdays: number[];
  classId: string;
  selectedClassSessionId: string | null;
}

export function ChangeCycleDialog({
  open,
  onOpenChange,
  studentClassId,
  studentId,
  studentName,
  fromSessionOrder,
  classSessionIndex,
  currentWeekdays,
  classWeekdays,
  classId,
  selectedClassSessionId,
}: ChangeCycleDialogProps) {
  const { toast } = useToast();
  const sortedClassWeekdays = [...classWeekdays].sort((a, b) => a - b);

  const getInitialCycleKey = () => {
    if (!currentWeekdays || currentWeekdays.length === 0) return "all";
    const sorted = [...currentWeekdays].sort((a, b) => a - b);
    if (sorted.length === sortedClassWeekdays.length && sorted.every((v, i) => v === sortedClassWeekdays[i])) return "all";
    if (sorted.length === 1) return String(sorted[0]);
    return "all";
  };

  const [cycleKey, setCycleKey] = useState<string>(getInitialCycleKey);
  const [mode, setMode] = useState<"all" | "unattended_only">("unattended_only");
  const [scheduleMode, setScheduleMode] = useState<"keep_count" | "within_range">("keep_count");

  const { data: allStudentSessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/student/${studentId}/sessions`],
    enabled: open && !!classId && !!studentId,
  });

  const { data: classScheduleSessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: open && !!classId,
  });

  const fromOrderSessions = (allStudentSessions as any[])
    .filter((ss) => {
      const order = ss.sessionOrder ?? ss.classSession?.sessionIndex;
      return order !== undefined && order >= fromSessionOrder;
    })
    .sort((a, b) => String(getSessionDate(a) ?? "").localeCompare(String(getSessionDate(b) ?? "")));

  const attendedInRange = fromOrderSessions.filter(
    (ss) => ss.attendanceStatus && ss.attendanceStatus !== "pending"
  );

  const countToAffect = mode === "all" ? fromOrderSessions.length : fromOrderSessions.filter(ss => ss.attendanceStatus === "pending").length;
  const rangeStart = fromOrderSessions[0];
  const rangeEnd = fromOrderSessions[fromOrderSessions.length - 1];

  const getEffectiveWeekdays = (): number[] | null => {
    if (cycleKey === "all") return null;
    const wd = parseInt(cycleKey);
    return isNaN(wd) ? null : [wd];
  };
  const targetWeekdays = getEffectiveWeekdays() ?? sortedClassWeekdays;
  const targetDbWeekdays = targetWeekdays.map((day) => day === 0 ? 7 : day);
  const keptSessionIds = new Set(
    mode === "unattended_only"
      ? attendedInRange.map((session) => session.classSessionId)
      : [],
  );
  const rangeStartDate = getSessionDate(rangeStart);
  const rangeEndDate = getSessionDate(rangeEnd);
  const projectedWithinRangeCount = rangeStartDate && rangeEndDate
    ? classScheduleSessions.filter((session) => {
        const sessionDate = getSessionDate(session);
        const inRange = !!sessionDate && sessionDate >= rangeStartDate && sessionDate <= rangeEndDate;
        return inRange
          && targetDbWeekdays.includes(getSessionWeekday(session) ?? -1)
          && !keptSessionIds.has(session.id);
      }).length
    : 0;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/student-classes/${studentClassId}/change-cycle`, {
        fromSessionOrder,
        weekdays: getEffectiveWeekdays() ?? sortedClassWeekdays,
        mode,
        scheduleMode,
      }),
    onSuccess: async (res: any) => {
      const data = res instanceof Response ? await res.json() : res;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/student/${studentId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/students/${studentId}/classes`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/students/${studentId}/classes/${classId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student/classes"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student/class", classId, "sessions"] }),
      ]);
      const msg = `Đã thay đổi chu kỳ: xóa ${data.deleted} buổi, tạo ${data.created} buổi mới.${data.warning ? ` ${data.warning}` : ""}`;
      toast({ title: "Thành công", description: msg });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể thay đổi chu kỳ", variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Đổi chu kỳ học — {studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Áp dụng từ <span className="font-semibold text-foreground">buổi thứ {classSessionIndex ?? fromSessionOrder}</span> trở đi.
          </div>

          <div className="text-sm">
            <span className="text-muted-foreground">Chu kỳ hiện tại: </span>
            <span className="font-medium">{formatCycle(currentWeekdays, classWeekdays)}</span>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Chu kỳ mới</div>
            <RadioGroup value={cycleKey} onValueChange={setCycleKey} className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted">
                <RadioGroupItem value="all" id="cycle-all" />
                <Label htmlFor="cycle-all" className="cursor-pointer font-normal">
                  Tất cả ({sortedClassWeekdays.map((w) => WEEKDAY_LABELS[w]).join(", ")})
                </Label>
              </label>
              {sortedClassWeekdays.map((wd) => (
                <label key={wd} className="flex items-center gap-2 cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted">
                  <RadioGroupItem value={String(wd)} id={`cycle-${wd}`} />
                  <Label htmlFor={`cycle-${wd}`} className="cursor-pointer font-normal">
                    {WEEKDAY_LABELS[wd]}
                  </Label>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Cách sắp xếp lịch mới</div>
            <RadioGroup
              value={scheduleMode}
              onValueChange={(value) => setScheduleMode(value as "keep_count" | "within_range")}
              className="space-y-2"
            >
              <label className="flex items-start gap-2 cursor-pointer text-sm rounded px-1 py-1">
                <RadioGroupItem value="keep_count" id="schedule-keep-count" className="mt-0.5" />
                <Label htmlFor="schedule-keep-count" className="cursor-pointer font-normal leading-5">
                  Giữ đủ tổng số buổi cho học viên (lịch học có thể kéo dài)
                </Label>
              </label>
              <label className="flex items-start gap-2 cursor-pointer text-sm rounded px-1 py-1">
                <RadioGroupItem value="within_range" id="schedule-within-range" className="mt-0.5" />
                <Label htmlFor="schedule-within-range" className="cursor-pointer font-normal leading-5">
                  Giữ trong khoảng lịch cũ (số buổi có thể tăng hoặc giảm)
                </Label>
              </label>
            </RadioGroup>
          </div>

          {attendedInRange.length > 0 && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-700 p-3 space-y-2">
              <div className="flex items-start gap-2 text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm font-medium">
                  Có {attendedInRange.length} buổi đã điểm danh từ buổi {fromSessionOrder} trở đi
                </span>
              </div>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "all" | "unattended_only")} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unattended_only" id="unattended_only" />
                  <Label htmlFor="unattended_only" className="text-sm cursor-pointer">
                    Chỉ những buổi chưa điểm danh ({fromOrderSessions.filter(ss => ss.attendanceStatus === "pending").length} buổi)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all" className="text-sm cursor-pointer text-red-600 dark:text-red-400">
                    Cập nhật tất cả — bao gồm {attendedInRange.length} buổi đã điểm danh
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {fromOrderSessions.length > 0 && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2 space-y-1">
              <div>
                Bắt đầu: buổi {rangeStart?.sessionOrder ?? fromSessionOrder}, {formatSessionDate(rangeStart)}
                {" · "}
                Kết thúc: buổi {rangeEnd?.sessionOrder ?? "?"}, {formatSessionDate(rangeEnd)}
              </div>
              {scheduleMode === "keep_count" ? (
                <div>
                  Sẽ sắp xếp lại đủ <span className="font-medium text-foreground">{countToAffect} buổi</span> theo chu kỳ mới; lịch có thể kéo dài.
                </div>
              ) : (
                <div>
                  Dự kiến xếp <span className="font-medium text-foreground">{projectedWithinRangeCount} buổi</span> trong khoảng lịch cũ.
                </div>
              )}
            </div>
          )}

          {fromOrderSessions.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Đang tải dữ liệu...</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? "Đang xử lý..."
              : `Xác nhận đổi chu kỳ (${scheduleMode === "keep_count" ? countToAffect : projectedWithinRangeCount} buổi)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
