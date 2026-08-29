import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { AssignmentsTable } from "@/components/my-space/assignments/AssignmentsTable";
import { useStaffAssignments } from "@/hooks/use-staff-assignments";

function toMonthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function StaffAssignments() {
  const search = useSearch();
  const urlDateParam = new URLSearchParams(search).get("date");
  const initDate = (() => {
    if (urlDateParam) { const d = new Date(urlDateParam + "T00:00:00"); if (!isNaN(d.getTime())) return d; }
    return new Date();
  })();
  const today = new Date();
  const [, navigate] = useLocation();
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });

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

  const monthStr = toMonthStr(year, month);
  const params = dateFrom && dateTo
    ? { dateFrom, dateTo }
    : { month: monthStr };

  const { data, isLoading } = useStaffAssignments(params);

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
    <AssignmentsTable
      rows={data?.rows ?? []}
      month={data?.month ?? monthStr}
      isLoading={isLoading}
      isStaff={true}
      year={year}
      monthIndex={month}
      onPrevMonth={goToPrevMonth}
      onNextMonth={goToNextMonth}
      onToday={goToToday}
      onDateRangeChange={handleDateRangeChange}
      onExamClick={(examId) => navigate(`/assessments/${examId}`)}
    />
  );
}
