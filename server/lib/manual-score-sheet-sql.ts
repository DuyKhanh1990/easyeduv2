import { inArray, sql, type SQL } from "drizzle-orm";

export function manualStudentIdInFilter(studentIds: string[]): SQL {
  return inArray(sql`sc.student_id`, studentIds);
}
