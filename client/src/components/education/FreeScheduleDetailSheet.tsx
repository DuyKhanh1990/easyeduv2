import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  PauseCircle,
  HelpCircle,
  MapPin,
  Users,
  UserRound,
  BookOpen,
  Star,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReviewDialog } from "@/components/education/ReviewDialog";
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
  note?: string | null;
  reviewData?: Record<string, any> | null;
  reviewPublished?: boolean;
};

type AttendanceStatus = "registered" | "attended" | "reserved";

function normalizeAttendanceStatus(status: string): AttendanceStatus {
  return status === "attended" || status === "reserved" ? status : "registered";
}

type FreeScheduleSession = {
  classId: string;
  classCode: string;
  className: string;
  locationName: string;
  sessionDate: string;
  enrolledCount: number;
  evaluationCriteriaIds?: string[];
  teacherIds?: string[];
  teachers?: string[];
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
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<FreeScheduleStudent | null>(null);

  const { data: allEvaluationCriteria = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
    enabled: !!session,
  });

  useEffect(() => {
    const initialStudents = session?.freeStudents ?? [];
    setStudents(initialStudents);
    setSavedNotes(Object.fromEntries(
      initialStudents.map((student) => [student.studentClassId, student.note ?? ""]),
    ));
    setReviewTarget(null);
  }, [session]);

  const updateMutation = useMutation({
    mutationFn: async ({
      studentClassId,
      status,
      note,
    }: {
      studentClassId: string;
      status: AttendanceStatus;
      note?: string;
    }) => {
      if (!session) throw new Error("Không tìm thấy lịch học");
      await apiRequest("PATCH", `/api/classes/${session.classId}/free-schedule`, {
        studentClassId,
        date: session.sessionDate,
        action: "attend",
        status,
        ...(note !== undefined ? { note } : {}),
      });
      return { studentClassId, status, note };
    },
    onSuccess: ({ studentClassId, status, note }) => {
      setStudents((current) =>
        current.map((student) =>
          student.studentClassId === studentClassId
            ? { ...student, status, ...(note !== undefined ? { note: note || null } : {}) }
            : student,
        ),
      );
      if (note !== undefined) {
        setSavedNotes((current) => ({ ...current, [studentClassId]: note }));
      }
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
  const criteria = (allEvaluationCriteria as any[]).filter((criterion) =>
    (session?.evaluationCriteriaIds ?? []).includes(criterion.id),
  );
  const reviewTeachers = (session?.teacherIds ?? []).map((id, index) => ({
    id,
    fullName: session?.teachers?.[index] || "Giáo viên",
  }));
  if (reviewTeachers.length === 0 && reviewTarget?.teacherId) {
    reviewTeachers.push({ id: reviewTarget.teacherId, fullName: "Giáo viên" });
  }
  if (reviewTeachers.length === 0) {
    reviewTeachers.push({ id: "free-class-teacher", fullName: "Giáo viên" });
  }

  const teacherLabel = session?.teachers?.join(", ") || "Chưa gán";
  const criteriaLabel = criteria.length > 0
    ? criteria.map((criterion) => criterion.name).join(", ")
    : "Chưa xác định";

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b bg-white px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
            {session?.className || "Lịch lớp tự do"}
            {session?.classCode && (
              <span className="text-sm font-normal text-muted-foreground">({session.classCode})</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {dateLabel}
            {session?.locationName ? ` · ${session.locationName}` : ""}
            {" · "}
            {session?.enrolledCount ?? 0} học viên đã đăng ký
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#ECEEF4] p-5">
          <div className="space-y-4">
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
                <span className="text-xs font-medium text-slate-500">{dateLabel}</span>
              </div>
              <div className="grid gap-x-6 gap-y-3 px-4 py-4 md:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Lớp:</span>
                  <span className="truncate text-sm font-semibold text-blue-600">
                    {session?.className}{session?.classCode ? ` (${session.classCode})` : ""}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Cơ sở:</span>
                  <span className="truncate text-sm font-semibold text-blue-600">{session?.locationName || "—"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-600">GV:</span>
                  <span className="truncate text-sm font-semibold text-blue-600">{teacherLabel}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Users className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Sĩ số:</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {students.length} học viên
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2 md:col-span-2">
                  <Star className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-600">Tiêu chí:</span>
                  <span className="truncate text-sm font-semibold text-blue-600">{criteriaLabel}</span>
                </div>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                <div className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Danh sách học viên
                </span>
                <span className="text-xs font-medium text-slate-800">({students.length})</span>
              </div>

              {students.length === 0 ? (
                <div className="mx-4 mb-4 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  Không có học viên đã đăng ký trong lịch này.
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-slate-100">
                  <div className="min-w-[980px]">
                    <div className="grid grid-cols-[minmax(230px,1.1fr)_minmax(180px,.85fr)_minmax(260px,1fr)_minmax(180px,.75fr)] items-center gap-4 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Học viên</span>
                      <span>Trạng thái điểm danh</span>
                      <span>Ghi chú</span>
                      <span>Nhận xét</span>
                    </div>
                    {students.map((student) => {
                      const attended = student.status === "attended";
                      const currentStatus = normalizeAttendanceStatus(student.status);
                      const statusLabel = currentStatus === "attended"
                        ? "Có học"
                        : currentStatus === "reserved"
                        ? "Bảo lưu"
                        : "Chưa điểm danh";
                      return (
                        <div
                          key={student.registrationId}
                          className="grid grid-cols-[minmax(230px,1.1fr)_minmax(180px,.85fr)_minmax(260px,1fr)_minmax(180px,.75fr)] items-center gap-4 border-t border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Checkbox
                              checked={attended}
                              disabled={updateMutation.isPending}
                              onCheckedChange={(checked) =>
                                updateMutation.mutate({
                                  studentClassId: student.studentClassId,
                                  status: checked === true ? "attended" : "registered",
                                  note: student.note ?? "",
                                })
                              }
                              aria-label={`Điểm danh ${student.fullName}`}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-800">{student.fullName}</div>
                              <div className="truncate text-xs text-muted-foreground">{student.code}</div>
                            </div>
                          </div>
                          <Select
                            value={currentStatus}
                            disabled={updateMutation.isPending}
                            onValueChange={(nextStatus) =>
                              updateMutation.mutate({
                                studentClassId: student.studentClassId,
                                status: nextStatus as AttendanceStatus,
                                note: student.note ?? "",
                              })
                            }
                          >
                            <SelectTrigger
                              className={
                                currentStatus === "attended"
                                  ? "h-8 w-[132px] border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
                                  : currentStatus === "reserved"
                                  ? "h-8 w-[132px] border-amber-200 bg-amber-50 text-xs text-amber-700"
                                  : "h-8 w-[132px] border-slate-200 bg-slate-50 text-xs text-slate-600"
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
                          <Input
                            value={student.note ?? ""}
                            disabled={updateMutation.isPending}
                            onChange={(event) =>
                              setStudents((current) =>
                                current.map((item) =>
                                  item.registrationId === student.registrationId
                                    ? { ...item, note: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            onBlur={() => {
                              const note = student.note ?? "";
                              if (note === (savedNotes[student.studentClassId] ?? "")) return;
                              updateMutation.mutate({
                                studentClassId: student.studentClassId,
                                status: currentStatus,
                                note,
                              });
                            }}
                            placeholder="Nhập ghi chú..."
                            className="h-8 bg-white text-xs"
                          />
                          <Button
                            type="button"
                            variant={student.reviewData ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 w-fit gap-1.5 text-xs"
                            onClick={() => setReviewTarget(student)}
                          >
                            <span className="text-yellow-500">★</span>
                            {student.reviewData ? "Xem / sửa" : "Nhập nhận xét"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <ReviewDialog
          open={!!reviewTarget}
          onOpenChange={(open) => !open && setReviewTarget(null)}
          studentSessionIds={[]}
          studentNames={reviewTarget ? [reviewTarget.fullName] : []}
          criteria={criteria}
          teachers={reviewTeachers}
          existingReviewData={reviewTarget?.reviewData ?? null}
          existingPublished={reviewTarget?.reviewPublished ?? false}
          classSessionId=""
          freeReview={reviewTarget && session ? {
            classId: session.classId,
            registrationId: reviewTarget.registrationId,
          } : undefined}
          onSaved={(reviewData, published) => {
            if (!reviewTarget) return;
            setStudents((current) => current.map((student) =>
              student.registrationId === reviewTarget.registrationId
                ? { ...student, reviewData, reviewPublished: published }
                : student,
            ));
            setReviewTarget((current) => current ? {
              ...current,
              reviewData,
              reviewPublished: published,
            } : current);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}