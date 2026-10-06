import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, Loader2, Settings2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StaffScoreSheetAssessmentScoreDialog } from "./StaffScoreSheetAssessmentScoreDialog";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type StaffAssignedScoreSheetAssessment = {
  sessionId: string;
  classId: string;
  classCode: string;
  className: string;
  locationName?: string | null;
  teacherNames?: string | null;
  sessionIndex: number | null;
  examDate: string;
  assessmentId: string;
  assessmentCode: string | null;
  assessmentName: string | null;
  templateName: string | null;
  scoreDeadlineAt: string | null;
  published?: boolean;
  studentCount: number;
  enteredStudentCount: number;
  completedStudentCount: number;
  individuallyPublishedStudentCount?: number;
  allStudentsIndividuallyPublished?: boolean;
  attemptCount: number;
  scoringPolicy: "highest" | "latest";
  hasConversion: boolean;
};

type AssessmentRosterStudent = {
  studentId: string;
  code: string;
  fullName: string;
  attemptsTaken: number;
  attemptNumber: number | null;
  rawScore: number | null;
  convertedScore: number | null;
  gradeBandLabel: string | null;
  gradeBandColor: string | null;
  passStatus: "passed" | "failed" | null;
  inputComplete: boolean;
  individuallyPublished: boolean;
  hasPublishableScore: boolean;
  status: "not_entered" | "in_progress" | "complete";
};

type AssessmentRosterResponse = {
  students: AssessmentRosterStudent[];
  removedStudents: AssessmentRosterStudent[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function formatDeadline(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(value);
}

type StaffScoreSheetAssessmentStudentsDialogProps = {
  assessment: StaffAssignedScoreSheetAssessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageScores?: boolean;
  canManagePublication?: boolean;
};

export function StaffScoreSheetAssessmentStudentsDialog({
  assessment,
  open,
  onOpenChange,
  canManageScores = true,
  canManagePublication = false,
}: StaffScoreSheetAssessmentStudentsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const rosterQuery = useQuery<AssessmentRosterResponse>({
    queryKey: [
      "/api/my-space/score-sheet/staff-assessments",
      assessment?.sessionId,
      "students",
    ],
    enabled: open && !!assessment?.sessionId,
    queryFn: async () => {
      if (!assessment) throw new Error("Chưa chọn buổi thi");
      const response = await fetch(
        `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}/students`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message ?? "Không thể tải danh sách học viên");
      }
      return response.json();
    },
  });

  const students = rosterQuery.data?.students ?? [];
  const removedStudents = rosterQuery.data?.removedStudents ?? [];
  const scoreSheetTemplateName = assessment?.templateName ?? "Bảng điểm chưa đặt tên";
  const showIndividualPublication = Boolean(canManagePublication && assessment?.hasConversion);
  const [editingStudent, setEditingStudent] = useState<AssessmentRosterStudent | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AssessmentRosterStudent | null>(null);
  const [restoreMenuOpen, setRestoreMenuOpen] = useState(false);

  async function updateRosterStudent(studentId: string, action: "remove" | "restore") {
    if (!assessment) throw new Error("Chưa chọn buổi thi");
    const basePath =
      `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}` +
      `/students/${encodeURIComponent(studentId)}`;
    const response = await fetch(
      action === "restore" ? `${basePath}/restore` : basePath,
      {
        method: action === "restore" ? "POST" : "DELETE",
        credentials: "include",
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(payload?.message ?? "Không thể cập nhật danh sách học viên");
    }
    return response.json();
  }

  async function updateStudentPublication(studentId: string, published: boolean) {
    if (!assessment) throw new Error("Chưa chọn buổi thi");
    const response = await fetch(
      `/api/my-space/score-sheet/staff-assessments/${encodeURIComponent(assessment.sessionId)}` +
      `/students/${encodeURIComponent(studentId)}/publication`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(payload?.message ?? "Không thể cập nhật trạng thái công bố");
    }
    return response.json() as Promise<{ published: boolean }>;
  }

  const removeStudentMutation = useMutation({
    mutationFn: (studentId: string) => updateRosterStudent(studentId, "remove"),
    onSuccess: () => {
      setPendingRemoval(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/my-space/score-sheet/staff-assessments", assessment?.sessionId, "students"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned/students"] });
      toast({
        title: "Đã xóa học viên khỏi bảng điểm",
        description: "Điểm đã nhập được giữ lại. Bạn có thể thêm học viên lại sau.",
      });
    },
    onError: (error) => {
      toast({
        title: "Không thể xóa học viên",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi.",
        variant: "destructive",
      });
    },
  });

  const restoreStudentMutation = useMutation({
    mutationFn: (studentId: string) => updateRosterStudent(studentId, "restore"),
    onSuccess: () => {
      setRestoreMenuOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/my-space/score-sheet/staff-assessments", assessment?.sessionId, "students"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/score-sheet/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned/students"] });
      toast({ title: "Đã thêm học viên lại vào bảng điểm" });
    },
    onError: (error) => {
      toast({
        title: "Không thể thêm học viên",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi.",
        variant: "destructive",
      });
    },
  });

  const individualPublicationMutation = useMutation({
    mutationFn: ({ studentId, published }: { studentId: string; published: boolean }) =>
      updateStudentPublication(studentId, published),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/my-space/score-sheet/staff-assessments", assessment?.sessionId, "students"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned/students"] });
      toast({
        title: result.published ? "Đã công bố điểm cho học viên" : "Đã gỡ công bố điểm",
      });
    },
    onError: (error) => {
      toast({
        title: "Không thể cập nhật trạng thái công bố",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi.",
        variant: "destructive",
      });
    },
  });

  const allStudentsIndividuallyPublished =
    !rosterQuery.isLoading
    && !rosterQuery.isError
    && students.length > 0
    && students.every((student) => student.individuallyPublished);

  function formatScore(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setEditingStudent(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:w-[98vw] sm:max-w-[98vw]">
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base">{scoreSheetTemplateName}</DialogTitle>
            <Badge variant="outline">Bảng điểm Quy đổi</Badge>
            <Badge variant="secondary" className="font-normal">
              {rosterQuery.isLoading ? "Đang tải học viên…" : `${students.length} học viên`}
            </Badge>
          </div>
          <DialogDescription>
            {assessment && (
              <>
                {assessment.classCode}
                {assessment.sessionIndex != null ? ` · Buổi ${assessment.sessionIndex}` : ""}
                {` · Ngày thi ${formatDate(assessment.examDate)}`}
                {` · Hạn trả ${formatDeadline(assessment.scoreDeadlineAt)}`}
              </>
            )}
          </DialogDescription>
          {canManagePublication && allStudentsIndividuallyPublished && (
            <div className="flex items-center gap-2 border-t pt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Tất cả học viên đã được công bố riêng.
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {rosterQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải danh sách học viên…
            </div>
          ) : rosterQuery.isError ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {rosterQuery.error instanceof Error
                  ? rosterQuery.error.message
                  : "Không thể tải danh sách học viên"}
              </p>
              <Button variant="outline" size="sm" onClick={() => rosterQuery.refetch()}>
                Tải lại
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {canManageScores && removedStudents.length > 0 && (
                <div className="flex justify-end">
                  <Popover open={restoreMenuOpen} onOpenChange={setRestoreMenuOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoreStudentMutation.isPending}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Thêm học viên vào bảng
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[320px] p-2">
                      <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                        Học viên đã xóa khỏi bảng điểm
                      </p>
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {removedStudents.map((student) => (
                          <Button
                            key={student.studentId}
                            variant="ghost"
                            className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-sm"
                            disabled={restoreStudentMutation.isPending}
                            onClick={() => restoreStudentMutation.mutate(student.studentId)}
                          >
                            {student.code} - {student.fullName}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[210px]">Học viên</TableHead>
                    <TableHead className="min-w-[90px] text-center">Lịch học</TableHead>
                    <TableHead className="min-w-[120px]">Ngày thi</TableHead>
                    <TableHead className="min-w-[125px]">Ngày phải trả</TableHead>
                    <TableHead className="min-w-[90px] text-center">Lần thi</TableHead>
                    <TableHead className="min-w-[110px]">
                      {assessment?.hasConversion ? "Điểm quy đổi" : "Tổng điểm"}
                    </TableHead>
                    <TableHead className="min-w-[100px]">Phân loại</TableHead>
                    <TableHead className="min-w-[100px]">Kết quả</TableHead>
                    <TableHead className="min-w-[110px]">Tình trạng</TableHead>
                    {showIndividualPublication && (
                      <TableHead className="min-w-[135px] text-center">Công bố riêng</TableHead>
                    )}
                    {canManageScores && (
                      <TableHead className="min-w-[110px] text-center">Quản lý</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow>
                        <TableCell
                          colSpan={(canManageScores ? 10 : 9) + (showIndividualPublication ? 1 : 0)}
                          className="h-24 text-center text-muted-foreground"
                        >
                          Chưa có học viên trong bảng điểm.
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">
                          {student.code} - {student.fullName}
                        </TableCell>
                        <TableCell className="text-center">
                          {assessment?.sessionIndex != null ? `Buổi ${assessment.sessionIndex}` : "—"}
                        </TableCell>
                        <TableCell>{formatDate(assessment?.examDate)}</TableCell>
                        <TableCell>{formatDeadline(assessment?.scoreDeadlineAt)}</TableCell>
                        <TableCell className="text-center">
                          {student.attemptNumber
                            ? `${student.attemptNumber}/${assessment?.attemptCount ?? 1}`
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatScore(assessment?.hasConversion ? student.convertedScore : student.rawScore)}
                        </TableCell>
                        <TableCell style={{ color: student.gradeBandColor ?? undefined }}>
                          {student.gradeBandLabel ?? "—"}
                        </TableCell>
                        <TableCell className={`font-bold ${
                          student.passStatus === "passed"
                            ? "text-green-600 dark:text-green-400"
                            : student.passStatus === "failed"
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                        }`}>
                          {student.passStatus === "passed"
                            ? "Đạt"
                            : student.passStatus === "failed"
                              ? "Không đạt"
                              : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={student.status === "complete" ? "default" : "secondary"}
                            className={`font-normal ${student.status === "complete" ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                          >
                            {student.status === "complete"
                              ? "Đã nhập"
                              : student.status === "in_progress"
                                ? "Đang nhập"
                                : "Chưa nhập"}
                          </Badge>
                        </TableCell>
                        {showIndividualPublication && (
                          <TableCell className="text-center">
                            {assessment?.published ? (
                              student.hasPublishableScore ? (
                                <Badge variant="default">Toàn bảng</Badge>
                              ) : (
                                <Badge variant="secondary">Chưa có điểm</Badge>
                              )
                            ) : canManageScores ? (
                              <div className="flex items-center justify-center gap-2">
                                <Switch
                                  checked={student.individuallyPublished}
                                  onCheckedChange={(published) => individualPublicationMutation.mutate({
                                    studentId: student.studentId,
                                    published,
                                  })}
                                  disabled={
                                    (!student.hasPublishableScore && !student.individuallyPublished)
                                    || individualPublicationMutation.isPending
                                  }
                                  aria-label={`Công bố điểm cho ${student.fullName}`}
                                  data-testid={`switch-assessment-student-publication-${student.studentId}`}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {student.individuallyPublished
                                    ? "Đã công bố"
                                    : student.hasPublishableScore ? "Chưa công bố" : "Chưa có điểm"}
                                </span>
                              </div>
                            ) : (
                              <Badge variant={student.individuallyPublished ? "default" : "secondary"}>
                                {student.individuallyPublished ? "Đã công bố" : "Chưa công bố"}
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {canManageScores && (
                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditingStudent(student)}
                                title={`Nhập điểm cho ${student.fullName}`}
                                aria-label={`Quản lý kết quả của ${student.fullName}`}
                                data-testid={`btn-manage-assessment-score-${student.studentId}`}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setPendingRemoval(student)}
                                title={`Xóa ${student.fullName} khỏi bảng điểm`}
                                aria-label={`Xóa ${student.fullName} khỏi bảng điểm`}
                                data-testid={`btn-remove-assessment-student-${student.studentId}`}
                                disabled={removeStudentMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !removeStudentMutation.isPending) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa học viên khỏi bảng điểm?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa {pendingRemoval?.fullName ?? "học viên"} khỏi danh sách của buổi thi này?
              <br />
              Điểm đã nhập được giữ lại; bạn có thể thêm học viên trở lại nếu xóa nhầm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeStudentMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeStudentMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingRemoval) removeStudentMutation.mutate(pendingRemoval.studentId);
              }}
            >
              {removeStudentMutation.isPending ? "Đang xóa…" : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <StaffScoreSheetAssessmentScoreDialog
        assessment={assessment}
        student={editingStudent}
        open={!!editingStudent}
        canManagePublication={Boolean(canManagePublication && canManageScores)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingStudent(null);
        }}
        onSaved={() => {
          void rosterQuery.refetch();
          queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned/students"] });
        }}
      />
    </Dialog>
  );
}