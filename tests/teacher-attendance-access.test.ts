import { describe, expect, it } from "vitest";
import { resolveTeacherAttendanceScope } from "../server/lib/teacher-attendance-access";

describe("teacher attendance view scope", () => {
  it("limits View permission to the current staff member", () => {
    expect(resolveTeacherAttendanceScope({
      isSuperAdmin: false,
      permission: { canView: true, canViewAll: false },
      staffId: "staff-1",
    })).toEqual({ allowed: true, staffId: "staff-1" });
  });

  it("keeps View All permission unrestricted", () => {
    expect(resolveTeacherAttendanceScope({
      isSuperAdmin: false,
      permission: { canView: false, canViewAll: true },
      staffId: "staff-1",
    })).toEqual({ allowed: true, staffId: null });
  });

  it("denies users without view permission or a staff profile", () => {
    expect(resolveTeacherAttendanceScope({
      isSuperAdmin: false,
      permission: { canView: false, canViewAll: false },
      staffId: "staff-1",
    })).toEqual({ allowed: false, staffId: null });
    expect(resolveTeacherAttendanceScope({
      isSuperAdmin: false,
      permission: { canView: true, canViewAll: false },
      staffId: null,
    })).toEqual({ allowed: false, staffId: null });
  });

  it("keeps super-admin access unrestricted", () => {
    expect(resolveTeacherAttendanceScope({
      isSuperAdmin: true,
      permission: { canView: false, canViewAll: false },
      staffId: null,
    })).toEqual({ allowed: true, staffId: null });
  });
});
