import { and, between, eq } from "drizzle-orm";
import { classSessions, studentSessions } from "@shared/schema";

export function studentSessionClassJoinCondition() {
  return and(
    eq(studentSessions.classSessionId, classSessions.id),
    eq(studentSessions.classId, classSessions.classId),
  )!;
}

export function studentSessionClassRangeJoinCondition(fromSessionIndex: number, toSessionIndex: number) {
  return and(
    studentSessionClassJoinCondition(),
    between(classSessions.sessionIndex, fromSessionIndex, toSessionIndex),
  )!;
}
