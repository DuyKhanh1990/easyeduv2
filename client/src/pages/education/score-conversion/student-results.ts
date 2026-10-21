export type DatedStudentResult = {
  studentId: string;
  examDate: string;
  sessionIndex: number | null;
  status: "not_entered" | "in_progress" | "complete";
};

export type StudentPassStatus = "passed" | "failed";

export function matchesStudentPassStatus(
  passStatus: StudentPassStatus | null,
  filters: readonly StudentPassStatus[],
): boolean {
  return filters.length === 0 || (passStatus !== null && filters.includes(passStatus));
}

export function keepLatestResultPerStudent<T extends DatedStudentResult>(results: T[]): T[] {
  const latestByStudent = new Map<string, T>();
  const completedResults = results.filter((result) => result.status === "complete");

  for (const result of completedResults) {
    const current = latestByStudent.get(result.studentId);
    if (!current) {
      latestByStudent.set(result.studentId, result);
      continue;
    }

    const dateOrder = result.examDate.slice(0, 10).localeCompare(current.examDate.slice(0, 10));
    const sessionOrder = (result.sessionIndex ?? -1) - (current.sessionIndex ?? -1);
    if (dateOrder > 0 || (dateOrder === 0 && sessionOrder > 0)) {
      latestByStudent.set(result.studentId, result);
    }
  }

  return completedResults.filter((result) => latestByStudent.get(result.studentId) === result);
}
