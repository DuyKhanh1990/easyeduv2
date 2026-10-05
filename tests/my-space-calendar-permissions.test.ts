import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUseMySpaceCalendarAction,
  isStaffAssignedToEffectiveFreeClassStudent,
  normalizeMySpaceCalendarPermissions,
} from "../shared/my-space-calendar-permissions";

const { mockDb, setPermissionRows } = vi.hoisted(() => {
  let permissionRows: any[] = [];
  const where = vi.fn(async () => permissionRows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    mockDb: { select },
    setPermissionRows: (rows: any[]) => {
      permissionRows = rows;
    },
  };
});

vi.mock("../server/storage/base", () => ({
  db: mockDb,
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}));

import { getEffectivePermissions } from "../server/storage/permissions.storage";

const storedPermissions = (overrides: Record<string, boolean> = {}) => ({
  roleId: "role-1",
  resource: "/my-space/calendar",
  canView: false,
  canViewAll: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  ...overrides,
});

describe("My Space calendar permissions", () => {
  beforeEach(() => {
    setPermissionRows([]);
    mockDb.select.mockClear();
  });

  it("defaults to View only, even when the staff member has no roles", async () => {
    await expect(getEffectivePermissions([], "/my-space/calendar")).resolves.toEqual({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("keeps View fixed, retains staff Create/Edit/Delete, and removes View All", async () => {
    setPermissionRows([
      storedPermissions({
        canView: false,
        canViewAll: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      }),
    ]);

    await expect(getEffectivePermissions(["role-1"], "/my-space/calendar")).resolves.toEqual({
      canView: true,
      canViewAll: false,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it("does not alter permissions for Education resources", async () => {
    setPermissionRows([
      storedPermissions({
        resource: "/schedule",
        canView: true,
        canViewAll: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      }),
    ]);

    await expect(getEffectivePermissions(["role-1"], "/schedule")).resolves.toEqual({
      canView: true,
      canViewAll: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it("limits student roles to View only", () => {
    expect(normalizeMySpaceCalendarPermissions({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canViewAll: true,
    }, true)).toEqual({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("keeps Create, Edit, and Delete independently configurable while View All remains unavailable", () => {
    const viewOnly = normalizeMySpaceCalendarPermissions();
    expect(canUseMySpaceCalendarAction(viewOnly, "canView")).toBe(true);
    expect(canUseMySpaceCalendarAction(viewOnly, "canCreate")).toBe(false);
    expect(canUseMySpaceCalendarAction(viewOnly, "canEdit")).toBe(false);
    expect(canUseMySpaceCalendarAction(viewOnly, "canDelete")).toBe(false);

    const createAndEdit = normalizeMySpaceCalendarPermissions({ canCreate: true, canEdit: true });
    expect(canUseMySpaceCalendarAction(createAndEdit, "canCreate")).toBe(true);
    expect(canUseMySpaceCalendarAction(createAndEdit, "canEdit")).toBe(true);
    expect(canUseMySpaceCalendarAction(createAndEdit, "canDelete")).toBe(false);

    const deleteOnly = normalizeMySpaceCalendarPermissions({ canDelete: true, canViewAll: true });
    expect(deleteOnly).toEqual({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: true,
    });
    expect(canUseMySpaceCalendarAction(deleteOnly, "canDelete")).toBe(true);
  });

  it("resolves free-class access by student override, then day assignment, then class teacher", () => {
    const staffId = "teacher-a";
    const anotherTeacher = "teacher-b";
    const classTeacherIds = [staffId];

    expect(isStaffAssignedToEffectiveFreeClassStudent({
      staffId,
      registrationTeacherId: anotherTeacher,
      dayTeacherId: staffId,
      classTeacherIds,
    })).toBe(false);
    expect(isStaffAssignedToEffectiveFreeClassStudent({
      staffId,
      dayTeacherId: staffId,
      classTeacherIds: [anotherTeacher],
    })).toBe(true);
    expect(isStaffAssignedToEffectiveFreeClassStudent({
      staffId,
      dayTeacherId: anotherTeacher,
      classTeacherIds,
    })).toBe(false);
    expect(isStaffAssignedToEffectiveFreeClassStudent({
      staffId,
      classTeacherIds,
    })).toBe(true);
  });
});