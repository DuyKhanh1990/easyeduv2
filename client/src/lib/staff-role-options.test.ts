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
        role: { id: "teacher", name: "Giáo viên", isSystem: true },
        department: { id: "training", name: "Phòng Đào tạo", isSystem: true },
      },
      {
        locationId: "location-1",
        roleId: "assistant",
        role: { id: "assistant", name: "Trợ giảng", isSystem: true },
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

  it("auto-selects a single role or the default teacher role, while respecting a saved choice", () => {
    const options = getStaffRoleOptions(staffMember, "location-1");
    expect(resolveTeacherRoleId({}, [{ id: "teacher", name: "Giáo viên" }])).toBe("teacher");
    expect(resolveTeacherRoleId({}, options)).toBe("teacher");
    expect(resolveTeacherRoleId({ role_id: "assistant" }, options)).toBe("assistant");
    expect(resolveTeacherRoleId({ role_id: "stale-role" }, options)).toBe("");
  });

  it("does not prefer a custom teacher/assistant role pair over user choice", () => {
    const customRoles = getStaffRoleOptions({
      assignments: [
        {
          locationId: "location-1",
          roleId: "custom-teacher",
          role: { id: "custom-teacher", name: "Giáo viên", isSystem: false },
          department: { name: "Phòng Đào tạo", isSystem: true },
        },
        {
          locationId: "location-1",
          roleId: "custom-assistant",
          role: { id: "custom-assistant", name: "Trợ giảng", isSystem: false },
          department: { name: "Phòng Đào tạo", isSystem: true },
        },
      ],
    }, "location-1");
    expect(resolveTeacherRoleId({}, customRoles)).toBe("");
  });

  it("does not require a choice when the default teacher role is available", () => {
    const unselected = { teacher_id: "staff-1" };
    expect(findTeacherMissingRole([unselected], [staffMember], "location-1")).toBeNull();
    expect(findTeacherMissingRole([{ ...unselected, role_id: "teacher" }], [staffMember], "location-1")).toBeNull();
    expect(findTeacherMissingRole([{ ...unselected, role_id: "assistant" }], [staffMember], "location-1")).toBeNull();
  });
});