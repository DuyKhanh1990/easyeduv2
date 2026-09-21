import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, PauseCircle, HelpCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type FreeScheduleStudent = {
  registrationId: string;
  studentClassId: string;
  studentId: string;
  fullName: string;
  code: string;
  status: string;
  teacherId?: string | null;
};

type AttendanceStatus = "registered" | "attended" | "reserved";

type FreeScheduleSession = {
  classId: string;
  classCode: string;
  className: string;
  locationName: string;
  sessionDate: string;
  enrolledCount: number;
  freeStudents?: FreeScheduleStudent[];
};

export function FreeScheduleDetailSheet({
  session,
  onClose,
  onUpdated,
}: {
  session: FreeScheduleSession | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { toast } = useToast();
  const [students, setStudents] = useState<FreeScheduleStudent[]>([]);

  useEffect(() => {
    setStudents(session?.freeStudents ?? []);
  }, [session]);

  const updateMutation = useMutation({
    mutationFn: async ({
      studentClassId,
      status,
    }: {
      studentClassId: string;
      status: AttendanceStatus;
    }) => {
      if (!session) throw new Error("Không tìm thấy lịch học");
      await apiRequest("PATCH", `/api/classes/${session.classId}/free-schedule`, {
        studentClassId,
        date: session.sessionDate,
        action: "attend",
        status,
      });
      return { studentClassId, status };
    },
    onSuccess: ({ studentClassId, status }) => {
      setStudents((current) =>
        current.map((student) =>
          student.studentClassId === studentClassId
            ? { ...student, status }
            : student,
        ),
      );
      onUpdated?.();
    },
    onError: (error: any) => {
      toast({
        title: "Không thể cập nhật điểm danh",
        description: error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const dateLabel = session
    ? format(parseISO(session.sessionDate), "EEEE, dd/MM/yyyy", { locale: vi })
    : "";

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
            {session?.className || "Lịch lớp tự do"}
          </DialogTitle>
          <DialogDescription>
            {dateLabel}
            {session?.locationName ? ` · ${session.locationName}` : ""}
            {" · "}
            {session?.enrolledCount ?? 0} học viên đã đăng ký
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              Điểm danh buổi học
            </div>
            <div className="text-xs text-muted-foreground">
              Bỏ tick là <strong>Chưa điểm danh</strong>; tick là <strong>Có học</strong>.
              Có thể chọn <strong>Bảo lưu</strong> trong dropdown trạng thái.
            </div>
          </div>

          {students.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Không có học viên đã đăng ký trong lịch này.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
              {students.map((student) => {
                const attended = student.status === "attended";
                const currentStatus: AttendanceStatus =
                  student.status === "attended" || student.status === "reserved"
                    ? student.status
                    : "registered";
                const statusLabel = currentStatus === "attended"
                  ? "Có học"
                  : currentStatus === "reserved"
                  ? "Bảo lưu"
                  : "Chưa điểm danh";
                return (
                  <div
                    key={student.studentClassId}
                    className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={attended}
                      disabled={updateMutation.isPending}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({
                          studentClassId: student.studentClassId,
                          status: checked === true ? "attended" : "registered",
                        })
                      }
                      aria-label={`Điểm danh ${student.fullName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {student.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground">{student.code}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Trạng thái điểm danh</span>
                      <Select
                        value={currentStatus}
                        disabled={updateMutation.isPending}
                        onValueChange={(nextStatus) =>
                          updateMutation.mutate({
                            studentClassId: student.studentClassId,
                            status: nextStatus as AttendanceStatus,
                          })
                        }
                      >
                        <SelectTrigger
                          className={
                            currentStatus === "attended"
                              ? "h-8 w-[112px] border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
                              : currentStatus === "reserved"
                              ? "h-8 w-[112px] border-amber-200 bg-amber-50 text-xs text-amber-700"
                              : "h-8 w-[112px] border-slate-200 bg-slate-50 text-xs text-slate-600"
                          }
                        >
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}