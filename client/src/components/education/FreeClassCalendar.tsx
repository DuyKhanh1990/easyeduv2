import { useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, ClipboardCheck, CalendarDays } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface FreeClassCalendarProps {
  classId: string;
  classData: any;
  classPerm?: { canEdit: boolean };
}

type CalendarMode = "register" | "attend";

export function FreeClassCalendar({ classId, classData, classPerm }: FreeClassCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [mode, setMode] = useState<CalendarMode>("register");
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

  const updateMutation = useMutation({
    mutationFn: async (payload: { studentClassId: string; date: string; action: CalendarMode; value: boolean }) => {
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
  const visibleDays = mode === "attend"
    ? days.filter((day) => students.some((student: any) => registrations.has(`${student.id}:${day.value}`)))
    : days;

  const toggle = (student: any, date: string, current: any) => {
    if (!classPerm?.canEdit || updateMutation.isPending) return;
    if (mode === "attend" && !current) return;
    updateMutation.mutate({
      studentClassId: student.id,
      date,
      action: mode,
      value: mode === "register" ? !current : current.status !== "attended",
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
    </div>
  );
}