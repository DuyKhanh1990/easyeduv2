import { describe, expect, it } from "vitest";
import {
  calculateSessionSalary,
  calculateTotalSalary,
} from "../client/src/hooks/use-teacher-salary";

const packageWithRoleRates = {
  id: "package-1",
  name: "Gói nhiều vai trò",
  type: "theo-gio",
  role: "Giáo viên",
  unitPrice: "200000",
  ranges: null,
  roleRates: [
    { role: "Giáo viên", unitPrice: "200000", ranges: null },
    { role: "Trợ giảng", unitPrice: "100000", ranges: null },
  ],
} as any;

function session(roleName: string, durationHours: number) {
  return {
    sessionId: `${roleName}-${durationHours}`,
    sessionDate: "2026-10-21",
    roleName,
    startTime: "09:00",
    endTime: "09:00",
    durationHours,
    attendedCount: 0,
    isEligible: true,
    attendanceCoefficient: null,
    checkInAt: null,
    checkOutAt: null,
  };
}

describe("teacher salary package role rates", () => {
  it("uses the rate matching each session's role", () => {
    expect(calculateSessionSalary(session("Giáo viên", 2), packageWithRoleRates)).toBe(400000);
    expect(calculateSessionSalary(session("Trợ giảng", 2), packageWithRoleRates)).toBe(200000);
  });

  it("does not apply a different role's rate when no match exists", () => {
    expect(calculateSessionSalary(session("Chủ nhiệm", 2), packageWithRoleRates)).toBeNull();
  });

  it("evaluates total-hour ranges separately for each role", () => {
    const packageWithRanges = {
      ...packageWithRoleRates,
      type: "tong-so-gio",
      roleRates: [
        { role: "Giáo viên", unitPrice: null, ranges: [{ from: 0, to: 2, price: 300000 }] },
        { role: "Trợ giảng", unitPrice: null, ranges: [{ from: 0, to: 1, price: 100000 }] },
      ],
    };
    expect(calculateTotalSalary({
      teacherId: "staff-1",
      teacherName: "Test",
      teacherCode: "",
      classId: "class-1",
      className: "Test class",
      courseId: null,
      role: "Giáo viên",
      sessions: [session("Giáo viên", 2), session("Trợ giảng", 1)],
      sessionDates: ["2026-10-21", "2026-10-21"],
    }, packageWithRanges as any)).toBe(400000);
  });
});
