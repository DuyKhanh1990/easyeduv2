import { describe, expect, it } from "vitest";
import {
  findTeacherMissingRole,
  getStaffRoleOptions,
  isDefaultTrainingDepartmentStaff,
  resolveTeacherRoleId,
} from "./staff-role-options";

describe("staff role options", () => {
  const staffMember = {
    id: "staff-1",
    assignments: [
      {
        locationId: "location-1",
        roleId: "teacher",
        role: { id: "teacher", name: "Giáo viên" },
        department: { id: "training", name: "Phòng Đào tạo", isSystem: true },
      },
      {
        locationId: "location-1",
        roleId: "assistant",
        role: { id: "assistant", name: "Trợ giảng" },
        department: { id: "training", name: "Phòng Đào tạo", isSystem: true },
      },
      {
        locationId: "location-2",
        roleId: "manager",
        role: { id: "manager", name: "Quản lý" },
        department: { id: "management", name: "Phòng Quản lý", isSystem: true },
      },
    ],
  };

  it("only exposes the exact system Training department as eligible staff", () => {
    expect(isDefaultTrainingDepartmentStaff(staffMember)).toBe(true);
    expect(isDefaultTrainingDepartmentStaff({
      assignments: [{
        department: { name: "Đào tạo chi nhánh", isSystem: false },
      }],
    })).toBe(false);
    expect(isDefaultTrainingDepartmentStaff({ assignments: [] })).toBe(false);
  });

  it("filters and deduplicates roles by class location", () => {
    const options = getStaffRoleOptions(staffMember, "location-1");
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.id)).toEqual(expect.arrayContaining(["assistant", "teacher"]));
  });

  it("auto-selects a single role but requires a choice when multiple roles are available", () => {
    const options = getStaffRoleOptions(staffMember, "location-1");
    expect(resolveTeacherRoleId({}, [{ id: "teacher", name: "Giáo viên" }])).toBe("teacher");
    expect(resolveTeacherRoleId({}, options)).toBe("");
    expect(resolveTeacherRoleId({ role_id: "assistant" }, options)).toBe("assistant");
  });

  it("finds a teacher with multiple roles when none has been selected", () => {
    const unselected = { teacher_id: "staff-1" };
    expect(findTeacherMissingRole([unselected], [staffMember], "location-1")).toBe(unselected);
    expect(findTeacherMissingRole([{ ...unselected, role_id: "teacher" }], [staffMember], "location-1")).toBeNull();
  });
});