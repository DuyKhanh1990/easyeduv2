import { useEffect, useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, startOfMonth, subMonths } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CalendarDays,
  Star,
  HelpCircle,
  PauseCircle,
  Pencil,
  Plus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ReviewDialog } from "@/components/education/ReviewDialog";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FreeClassCalendarProps {
  classId: string;
  classData: any;
  classPerm?: { canEdit: boolean };
}

type CalendarMode = "register" | "attend";

export function FreeClassCalendar({ classId, classData, classPerm }: FreeClassCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [noteDialog, setNoteDialog] = useState<{
    studentClassId: string;
    date: string;
    value: string;
    status: "registered" | "attended" | "reserved";
  } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{
    student: any;
    registration: any;
  } | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, {
    reviewData: Record<string, any>;
    published: boolean;
  }>>({});
  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState<string[]>([]);
  const [criteriaOverride, setCriteriaOverride] = useState<string[] | undefined>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const month = format(monthDate, "yyyy-MM");
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/classes/${classId}/free-schedule`, month],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/free-schedule?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải lịch lớp tự do");
      return res.json();
    },
  });
  const { data: allEvaluationCriteria = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      studentClassId: string;
      date: string;
      action: CalendarMode;
      value: boolean;
      status?: "registered" | "attended" | "reserved";
      note?: string;
    }) => {
      await apiRequest("PATCH", `/api/classes/${classId}/free-schedule`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
    },
    onError: (error: any) => toast({ title: "Không thể cập nhật", description: error.message, variant: "destructive" }),
  });

  const days = useMemo(() => {
    const count = getDaysInMonth(monthDate);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
      return { date, value: format(date, "yyyy-MM-dd"), label: index + 1, weekday: format(date, "EE") };
    });
  }, [monthDate]);

  const registrations = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of data?.registrations || []) map.set(`${row.studentClassId}:${row.registrationDate}`, row);
    return map;
  }, [data?.registrations]);

  const students = (data?.students || []).filter((student: any) => student.status === "active");
  const classStart = String(classData?.startDate || "").slice(0, 10);
  const classEnd = String(classData?.endDate || "").slice(0, 10);
  const visibleDays = days;

  const classTeacherLabel = (classData?.teachers || [])
    .map((teacher: any) => teacher.fullName)
    .filter(Boolean)
    .join(", ") || "Chưa gán";
  const classLocationLabel = classData?.location?.name || classData?.locationName || "—";
  const evaluationCriteriaIds = criteriaOverride
    ?? data?.evaluationCriteriaIds
    ?? classData?.evaluationCriteriaIds
    ?? [];
  const reviewCriteria = (allEvaluationCriteria as any[]).filter((criterion) =>
    evaluationCriteriaIds.map(String).includes(String(criterion.id)),
  );
  const criteriaOptions = (allEvaluationCriteria as any[]).map((criterion) => ({
    value: String(criterion.id),
    label: criterion.name,
  }));
  const criteriaLabel = reviewCriteria.length > 0
    ? reviewCriteria.map((criterion) => criterion.name).join(", ")
    : "Chưa xác định";
  const reviewTeachers = (classData?.teachers || [])
    .map((teacher: any) => ({ id: teacher.id, fullName: teacher.fullName }))
    .filter((teacher: any) => teacher.id && teacher.fullName);
  if (reviewTeachers.length === 0) {
    reviewTeachers.push({ id: "free-class-teacher", fullName: classTeacherLabel });
  }

  const criteriaMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("PATCH", `/api/classes/${classId}`, {
        evaluationCriteriaIds: ids.length > 0 ? ids : null,
      });
      return ids;
    },
    onSuccess: (ids) => {
      setCriteriaOverride(ids);
      setCriteriaDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/free-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      toast({ title: "Đã cập nhật tiêu chí nhận xét" });
    },
    onError: (error: any) => {
      toast({
        title: "Không thể cập nhật tiêu chí",
        description: error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const toggle = (student: any, date: string, current: any) => {
    if (!classPerm?.canEdit || updateMutation.isPending) return;
    updateMutation.mutate({
      studentClassId: student.id,
      date,
      action: "register",
      value: !current,
    });
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarDays className="h-4 w-4 text-emerald-600" /> Lịch lớp tự do
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Đăng ký ngày học và điểm danh tách biệt</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => subMonths(d, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-28 text-center text-sm font-semibold">{format(monthDate, "MM/yyyy")}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <div className="ml-2 flex rounded-lg border bg-slate-50 p-0.5">
            <button className={cn("rounded-md px-3 py-1.5 text-xs font-medium", mode === "register" && "bg-white text-emerald-700 shadow-sm")} onClick={() => setMode("register")}>Đăng ký lịch</button>
            <button className={cn("rounded-md px-3 py-1.5 text-xs font-medium", mode === "attend" && "bg-white text-blue-700 shadow-sm")} onClick={() => setMode("attend")}>Điểm danh</button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
        <Badge variant="outline">{students.length} học viên</Badge>
        <span>•</span>
        <span>{mode === "register" ? "Tick ngày học viên dự kiến đến." : "Chỉ học viên đã đăng ký mới có thể điểm danh."}</span>
        {classStart && classEnd && <span className="ml-auto">Thời hạn lớp: {classStart} → {classEnd}</span>}
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Đang tải lịch...</div>
        ) : students.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
            Chưa có học viên đã xếp lịch trong lớp này.
          </div>
        ) : mode === "attend" && visibleDays.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
            Chưa có ngày học nào được đăng ký trong tháng này.
          </div>
        ) : mode === "attend" ? (
          <div className="space-y-4 bg-[#ECEEF4] p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Ngày điểm danh
              </span>
              {visibleDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setSelectedAttendDate(day.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedAttendDate === day.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
                </button>
              ))}
            </div>

            {selectedAttendDay && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Chi tiết lịch học
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Lớp tự do
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {format(selectedAttendDay.date, "EEEE, dd/MM/yyyy", { locale: vi })}
                    </span>
                  </div>
                  <div className="grid gap-x-6 gap-y-3 px-4 py-4 md:grid-cols-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Lớp:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">
                        {classData?.name || "—"}{classData?.classCode ? ` (${classData.classCode})` : ""}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Cơ sở:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">{classLocationLabel}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">GV:</span>
                      <span className="truncate text-sm font-semibold text-blue-600">{classTeacherLabel}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Sĩ số:</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {selectedAttendStudents.length} học viên
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 md:col-span-2">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Đã học:</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {selectedAttendedCount}/{selectedAttendStudents.length} học viên
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 md:col-span-2">
                      <Star className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Tiêu chí:</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-blue-600">{criteriaLabel}</span>
                      {classPerm?.canEdit && (
                        <button
                          type="button"
                          className="shrink-0 text-slate-300 transition-colors hover:text-indigo-500"
                          title="Gán tiêu chí nhận xét"
                          onClick={() => {
                            setCriteriaDraft(evaluationCriteriaIds.map(String));
                            setCriteriaDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                    <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Danh sách học viên
                    </span>
                    <span className="text-xs font-medium text-slate-800">({selectedAttendStudents.length})</span>
                  </div>
                  <div className="overflow-x-auto border-t border-slate-100">
                    <div className="min-w-[752px]">
                      <div className="grid grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)] items-center gap-4 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span>
                          <Checkbox
                            checked={
                              selectedAttendStudents.length > 0
                              && selectedAttendStudents.every(({ student }: any) =>
                                selectedAttendStudentIds.includes(student.id))
                            }
                            onCheckedChange={(checked) => setSelectedAttendStudentIds(
                              checked
                                ? selectedAttendStudents.map(({ student }: any) => student.id)
                                : [],
                            )}
                            aria-label="Chọn tất cả học viên"
                          />
                        </span>
                        <span>Học viên</span>
                        <span>Trạng thái điểm danh</span>
                        <span>Ghi chú</span>
                        <span>Nhận xét</span>
                      </div>
                      {selectedAttendStudents.map(({ student, registration }: any) => {
                        const status = registration.status === "attended" || registration.status === "reserved"
                          ? registration.status
                          : "registered";
                        const statusLabel = status === "attended"
                          ? "Có học"
                          : status === "reserved"
                          ? "Bảo lưu"
                          : "Chưa điểm danh";
                        return (
                          <div
                            key={registration.id}
                            className="grid grid-cols-[32px_minmax(260px,1fr)_minmax(210px,.8fr)_minmax(220px,.85fr)_minmax(180px,.7fr)] items-center gap-4 border-t border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            <Checkbox
                              checked={selectedAttendStudentIds.includes(student.id)}
                              onCheckedChange={(checked) =>
                                setSelectedAttendStudentIds((current) =>
                                  checked
                                    ? current.includes(student.id) ? current : [...current, student.id]
                                    : current.filter((id) => id !== student.id),
                                )
                              }
                              aria-label={`Chọn học viên ${student.fullName}`}
                            />
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-800">{student.fullName}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {student.code} · còn {student.remainingSessions ?? 0} buổi
                                </div>
                              </div>
                            </div>
                            <Select
                              value={status}
                              disabled={updateMutation.isPending}
                              onValueChange={(nextStatus) => {
                                updateMutation.mutate(
                                  {
                                    studentClassId: student.id,
                                    date: selectedAttendDay.value,
                                    action: "attend",
                                    value: nextStatus === "attended",
                                    status: nextStatus as "registered" | "attended" | "reserved",
                                  },
                                  {
                                    onSuccess: () => {
                                      if (nextStatus === "attended") {
                                        setSelectedAttendStudentIds((current) =>
                                          current.includes(student.id) ? current : [...current, student.id],
                                        );
                                      }
                                    },
                                  },
                                );
                              }}
                            >
                              <SelectTrigger className={cn(
                                "h-8 w-[140px] text-xs",
                                status === "attended" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                status === "reserved" && "border-amber-200 bg-amber-50 text-amber-700",
                                status === "registered" && "border-slate-200 bg-slate-50 text-slate-600",
                              )}>
                                <SelectValue>{statusLabel}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="registered">
                                  <span className="flex items-center gap-2">
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                                    Chưa điểm danh
                                  </span>
                                </SelectItem>
                                <SelectItem value="attended">
                                  <span className="flex items-center gap-2">
                                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                                    Có học
                                  </span>
                                </SelectItem>
                                <SelectItem value="reserved">
                                  <span className="flex items-center gap-2">
                                    <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                                    Bảo lưu
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              disabled={!classPerm?.canEdit}
                              className={cn(
                                "group flex min-w-0 items-center gap-1 text-left text-xs",
                                classPerm?.canEdit
                                  ? "cursor-pointer hover:text-primary"
                                  : "cursor-default",
                              )}
                              onClick={() => {
                                if (!classPerm?.canEdit) return;
                                setNoteDialog({
                                  studentClassId: student.id,
                                  value: registration.note || "",
                                  status,
                                });
                              }}
                              title={registration.note || "Chưa có ghi chú"}
                            >
                              <span className={cn(
                                "truncate",
                                registration.note
                                  ? "text-slate-700"
                                  : "italic text-muted-foreground",
                              )}>
                                {registration.note || "Ghi chú..."}
                              </span>
                              {classPerm?.canEdit && (
                                <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                              )}
                            </button>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant={(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={!classPerm?.canEdit}
                                onClick={() => {
                                  if (!classPerm?.canEdit) return;
                                  setReviewTarget({ student, registration });
                                }}
                              >
                                {(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? (
                                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                {(
                                  reviewOverrides[registration.id]?.reviewData
                                  ?? registration.reviewData
                                ) ? "Xem / sửa" : "Nhập nhận xét"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <table className="min-w-max border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="sticky left-0 z-20 min-w-52 border-b border-r bg-slate-100 px-3 py-2 text-left font-semibold">Học viên</th>
                {visibleDays.map((day) => <th key={day.value} className="min-w-10 border-b px-1 py-2 text-center font-medium"><div>{day.label}</div><div className="text-[10px] text-muted-foreground">{day.weekday}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((student: any) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-2">
                    <div className="font-medium">{student.fullName}</div>
                    <div className="text-[10px] text-muted-foreground">{student.code} · còn {student.remainingSessions ?? 0} buổi</div>
                  </td>
                  {visibleDays.map((day) => {
                    const current = registrations.get(`${student.id}:${day.value}`);
                    const outside = (classStart && day.value < classStart) || (classEnd && day.value > classEnd)
                      || (student.startDate && day.value < String(student.startDate).slice(0, 10))
                      || (student.endDate && day.value > String(student.endDate).slice(0, 10));
                    return (
                      <td key={day.value} className={cn("border-b text-center", outside && "bg-slate-50")}>
                        <Checkbox
                          checked={mode === "attend" ? current?.status === "attended" : !!current}
                          disabled={!!outside || !classPerm?.canEdit || (mode === "attend" && !current) || updateMutation.isPending}
                          onCheckedChange={() => toggle(student, day.value, current)}
                          aria-label={`${mode === "register" ? "Đăng ký" : "Điểm danh"} ${student.fullName} ngày ${day.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog
        open={!!noteDialog}
        onOpenChange={(open) => {
          if (!open) setNoteDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Ghi chú</DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            className="min-h-[100px] resize-none text-sm"
            placeholder="Nhập ghi chú..."
            value={noteDialog?.value ?? ""}
            onChange={(event) =>
              setNoteDialog((current) => current
                ? { ...current, value: event.target.value }
                : current)
            }
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteDialog(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={updateMutation.isPending || !noteDialog}
              onClick={() => {
                if (!noteDialog || !selectedAttendDay) return;
                updateMutation.mutate(
                  {
                    studentClassId: noteDialog.studentClassId,
                    date: selectedAttendDay.value,
                    action: "attend",
                    value: noteDialog.status === "attended",
                    status: noteDialog.status,
                    note: noteDialog.value,
                  },
                  {
                    onSuccess: () => {
                      setNoteDialog(null);
                      toast({ title: "Đã cập nhật ghi chú" });
                    },
                  },
                );
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={criteriaDialogOpen}
        onOpenChange={(open) => {
          if (!open && !criteriaMutation.isPending) setCriteriaDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Gán tiêu chí nhận xét</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              Chọn các tiêu chí sẽ xuất hiện trong biểu mẫu nhận xét của học viên lớp tự do.
            </p>
            <SearchableMultiSelect
              options={criteriaOptions}
              value={criteriaDraft}
              onChange={setCriteriaDraft}
              placeholder="Chọn tiêu chí..."
              searchPlaceholder="Tìm tiêu chí..."
              disabled={criteriaMutation.isPending}
              data-testid="select-free-class-evaluation-criteria"
            />
            {criteriaOptions.length === 0 && (
              <p className="text-xs text-amber-600">
                Chưa có tiêu chí đánh giá. Vui lòng tạo tiêu chí trong cấu hình giáo dục trước.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={criteriaMutation.isPending}
              onClick={() => setCriteriaDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={criteriaMutation.isPending}
              onClick={() => criteriaMutation.mutate(criteriaDraft)}
            >
              {criteriaMutation.isPending ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReviewDialog
        open={!!reviewTarget}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
        studentSessionIds={[]}
        studentNames={reviewTarget ? [reviewTarget.student.fullName] : []}
        criteria={reviewCriteria}
        teachers={reviewTeachers}
        existingReviewData={reviewTarget
          ? reviewOverrides[reviewTarget.registration.id]?.reviewData
            ?? reviewTarget.registration.reviewData
            ?? null
          : null}
        existingPublished={reviewTarget
          ? reviewOverrides[reviewTarget.registration.id]?.published
            ?? reviewTarget.registration.reviewPublished
            ?? false
          : false}
        classSessionId=""
        freeReview={reviewTarget ? {
          classId,
          registrationId: reviewTarget.registration.id,
        } : undefined}
        onSaved={(reviewData, published) => {
          if (!reviewTarget) return;
          setReviewOverrides((current) => ({
            ...current,
            [reviewTarget.registration.id]: { reviewData, published },
          }));
        }}
      />
    </div>
  );
}