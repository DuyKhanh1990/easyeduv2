import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Loader2, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffScoreSheetAssessmentScoreDialog } from "./StaffScoreSheetAssessmentScoreDialog";
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
  sessionIndex: number | null;
  examDate: string;
  assessmentId: string;
  assessmentCode: string | null;
  assessmentName: string | null;
  templateName: string | null;
  scoreDeadlineAt: string | null;
  studentCount: number;
  enteredStudentCount: number;
  completedStudentCount: number;
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
  inputComplete: boolean;
  status: "not_entered" | "in_progress" | "complete";
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
};

export function StaffScoreSheetAssessmentStudentsDialog({
  assessment,
  open,
  onOpenChange,
}: StaffScoreSheetAssessmentStudentsDialogProps) {
  const rosterQuery = useQuery<AssessmentRosterStudent[]>({
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
      if (!response.ok) throw new Error("Không thể tải danh sách học viên");
      return response.json();
    },
  });

  const students = rosterQuery.data ?? [];
  const assessmentName = assessment?.assessmentName ?? "Bảng điểm Quy đổi";
  const [editingStudent, setEditingStudent] = useState<AssessmentRosterStudent | null>(null);

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
            <DialogTitle className="text-base">{assessmentName}</DialogTitle>
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
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[210px]">Học viên</TableHead>
                    <TableHead className="min-w-[130px]">Bài kiểm tra</TableHead>
                    <TableHead className="min-w-[90px] text-center">Lịch học</TableHead>
                    <TableHead className="min-w-[125px]">Ngày phải trả</TableHead>
                    <TableHead className="min-w-[90px] text-center">Lần thi</TableHead>
                    <TableHead className="min-w-[110px]">
                      {assessment?.hasConversion ? "Điểm quy đổi" : "Tổng điểm"}
                    </TableHead>
                    <TableHead className="min-w-[100px]">Kết quả</TableHead>
                    <TableHead className="min-w-[110px]">Tình trạng</TableHead>
                    <TableHead className="min-w-[110px]">Công bố</TableHead>
                    <TableHead className="min-w-[90px] text-center">Quản lý</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        Buổi thi chưa có học viên.
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">
                          {student.code} - {student.fullName}
                        </TableCell>
                        <TableCell>{assessment?.assessmentName ?? assessment?.assessmentCode ?? "—"}</TableCell>
                        <TableCell className="text-center">{assessment?.sessionIndex ?? "—"}</TableCell>
                        <TableCell>{formatDeadline(assessment?.scoreDeadlineAt)}</TableCell>
                        <TableCell className="text-center">
                          {student.attemptNumber
                            ? `${student.attemptNumber}/${assessment?.attemptCount ?? 1}`
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatScore(assessment?.hasConversion ? student.convertedScore : student.rawScore)}
                        </TableCell>
                        <TableCell>{student.gradeBandLabel ?? "—"}</TableCell>
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
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">Chưa công bố</Badge>
                        </TableCell>
                        <TableCell className="text-center">
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
      <StaffScoreSheetAssessmentScoreDialog
        assessment={assessment}
        student={editingStudent}
        open={!!editingStudent}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingStudent(null);
        }}
        onSaved={() => rosterQuery.refetch()}
      />
    </Dialog>
  );
}