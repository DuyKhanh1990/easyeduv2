import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, PauseCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
      attended,
    }: {
      studentClassId: string;
      attended: boolean;
    }) => {
      if (!session) throw new Error("Không tìm thấy lịch học");
      await apiRequest("PATCH", `/api/classes/${session.classId}/free-schedule`, {
        studentClassId,
        date: session.sessionDate,
        action: "attend",
        value: attended,
      });
      return { studentClassId, attended };
    },
    onSuccess: ({ studentClassId, attended }) => {
      setStudents((current) =>
        current.map((student) =>
          student.studentClassId === studentClassId
            ? { ...student, status: attended ? "attended" : "registered" }
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
              Tick <strong>Có học</strong>; bỏ tick là <strong>Bảo lưu</strong>
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
                return (
                  <label
                    key={student.studentClassId}
                    className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={attended}
                      disabled={updateMutation.isPending}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({
                          studentClassId: student.studentClassId,
                          attended: checked === true,
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
                    <Badge
                      variant="outline"
                      className={
                        attended
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {attended ? (
                        <ClipboardCheck className="mr-1 h-3 w-3" />
                      ) : (
                        <PauseCircle className="mr-1 h-3 w-3" />
                      )}
                      {attended ? "Có học" : "Bảo lưu"}
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}