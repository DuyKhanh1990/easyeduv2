import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { AssignmentsTable } from "@/components/my-space/assignments/AssignmentsTable";
import { useStudentAssignments } from "@/hooks/use-student-assignments";
import { ExamViewerFromId } from "@/components/education/SessionContentDialog";

function toMonthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function StudentAssignments() {
  const search = useSearch();
  const urlDateParam = new URLSearchParams(search).get("date");
  const initDate = (() => {
    if (urlDateParam) { const d = new Date(urlDateParam + "T00:00:00"); if (!isNaN(d.getTime())) return d; }
    return new Date();
  })();
  const today = new Date();
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Khi URL param ?date= thay đổi (VD: click noti khi đang ở trang này),
  // cập nhật state để hiển thị đúng tháng — useState chỉ init 1 lần nên cần effect này
  useEffect(() => {
    if (!urlDateParam) return;
    const d = new Date(urlDateParam + "T00:00:00");
    if (isNaN(d.getTime())) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDateFrom("");
    setDateTo("");
  }, [urlDateParam]);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);
  const [viewingExamClassId, setViewingExamClassId] = useState<string | undefined>(undefined);

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
        onExamClick={(examId, classId) => { setViewingExamId(examId); setViewingExamClassId(classId); }}
        highlightDate={urlDateParam ?? undefined}
      />

      <ExamViewerFromId
        examId={viewingExamId || ""}
        classId={viewingExamClassId}
        open={!!viewingExamId}
        onClose={() => { setViewingExamId(null); setViewingExamClassId(undefined); }}
      />
    </div>
  );
}
