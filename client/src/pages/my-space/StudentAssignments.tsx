import { useState } from "react";
import { AssignmentsTable } from "@/components/my-space/assignments/AssignmentsTable";
import { useStudentAssignments } from "@/hooks/use-student-assignments";
import { ExamViewerFromId } from "@/components/education/SessionContentDialog";

function toMonthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function StudentAssignments() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);

  const monthStr = toMonthStr(year, month);
  const params = dateFrom && dateTo
    ? { dateFrom, dateTo }
    : { month: monthStr };

  const { data, isLoading } = useStudentAssignments(params);

  const goToPrevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setDateFrom(""); setDateTo("");
  };

  const goToNextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setDateFrom(""); setDateTo("");
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setDateFrom(""); setDateTo("");
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  };

  return (
    <div className="space-y-4">
      <AssignmentsTable
        rows={data?.rows ?? []}
        month={data?.month ?? monthStr}
        isLoading={isLoading}
        year={year}
        monthIndex={month}
        onPrevMonth={goToPrevMonth}
        onNextMonth={goToNextMonth}
        onToday={goToToday}
        onDateRangeChange={handleDateRangeChange}
        onExamClick={(examId) => setViewingExamId(examId)}
      />

      <ExamViewerFromId
        examId={viewingExamId || ""}
        open={!!viewingExamId}
        onClose={() => setViewingExamId(null)}
      />
    </div>
  );
}
