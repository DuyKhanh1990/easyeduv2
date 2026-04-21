import { useLocation } from "wouter";
import { AssignmentsTable } from "@/components/my-space/assignments/AssignmentsTable";
import { useAssignmentsTab } from "../hooks/useAssignmentsTab";

interface Props {
  enabled: boolean;
}

export function AssignmentsTab({ enabled }: Props) {
  const [, navigate] = useLocation();
  const tab = useAssignmentsTab(enabled);

  return (
    <AssignmentsTable
      rows={tab.rows}
      month={tab.month}
      isLoading={tab.isLoading}
      isStaff={true}
      year={tab.year}
      monthIndex={tab.monthIndex}
      onPrevMonth={tab.onPrevMonth}
      onNextMonth={tab.onNextMonth}
      onToday={tab.onToday}
      onDateRangeChange={tab.onDateRangeChange}
      onExamClick={(examId) => navigate(`/assessments/${examId}`)}
    />
  );
}
