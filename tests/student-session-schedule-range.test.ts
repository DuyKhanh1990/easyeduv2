import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { studentSessionClassRangeJoinCondition } from "../server/lib/student-session-schedule-range";

describe("student session schedule range", () => {
  it("targets class timetable indices, not the student's own course order", () => {
    const query = new PgDialect().sqlToQuery(studentSessionClassRangeJoinCondition(10, 17));

    expect(query.sql).toContain('"student_sessions"."class_session_id" = "class_sessions"."id"');
    expect(query.sql).toContain('"student_sessions"."class_id" = "class_sessions"."class_id"');
    expect(query.sql).toContain('"class_sessions"."session_index" between');
    expect(query.sql).not.toContain('"student_sessions"."session_order"');
    expect(query.params).toEqual([10, 17]);
  });
});
