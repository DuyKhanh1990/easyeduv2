export type DatedStudentResult = {
  studentId: string;
  examDate: string;
  sessionIndex: number | null;
};

export function keepLatestResultPerStudent<T extends DatedStudentResult>(results: T[]): T[] {
  const latestByStudent = new Map<string, T>();

  for (const result of results) {
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

  return results.filter((result) => latestByStudent.get(result.studentId) === result);
}
