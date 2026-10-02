import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEffectivePermissionsMock } = vi.hoisted(() => ({
  getEffectivePermissionsMock: vi.fn(),
}));

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/storage/permissions.storage", () => ({
  getEffectivePermissions: getEffectivePermissionsMock,
}));

import { buildClassVisibilitySql, resolveClassViewAccess } from "../server/lib/class-access";
import {
  canScheduleWrite,
  getScheduleWriteCapabilities,
  isScheduleEntryVisible,
  isScheduleViewOnly,
} from "../shared/schedule-access";

const emptyPermissions = () => ({
  canView: false,
  canViewAll: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
});

const locationId = "11111111-1111-4111-8111-111111111111";

describe("schedule permissions", () => {
  let classPermissions = emptyPermissions();
  let schedulePermissions = emptyPermissions();

  beforeEach(() => {
    classPermissions = emptyPermissions();
    schedulePermissions = emptyPermissions();
    getEffectivePermissionsMock.mockReset();
    getEffectivePermissionsMock.mockImplementation(async (_roleIds: string[], resource: string) =>
      resource === "/classes" ? classPermissions : schedulePermissions,
    );
  });

  it("uses /schedule view access only when a schedule detail endpoint opts in", async () => {
    schedulePermissions.canView = true;
    const req = {
      user: { id: "22222222-2222-4222-8222-222222222222" },
      staffId: "33333333-3333-4333-8333-333333333333",
      roleIds: ["role"],
      allowedLocationIds: [locationId],
    };

    expect((await resolveClassViewAccess(req)).canView).toBe(false);
    const access = await resolveClassViewAccess(req, true);

    expect(access.canView).toBe(true);
    expect(access.canViewAll).toBe(false);
    expect(buildClassVisibilitySql(access.scope)).toContain("manager_ids");
    expect(access.scope.allowedLocationIds).toEqual([locationId]);
  });

  it("limits View All class scope to assigned locations", async () => {
    schedulePermissions.canViewAll = true;
    const access = await resolveClassViewAccess({
      user: { id: "22222222-2222-4222-8222-222222222222" },
      staffId: "33333333-3333-4333-8333-333333333333",
      roleIds: ["role"],
      allowedLocationIds: [locationId],
    }, true);

    expect(access.canViewAll).toBe(true);
    expect(buildClassVisibilitySql(access.scope)).toBe(
      `c.location_id = ANY(ARRAY['${locationId}'::uuid]::uuid[])`,
    );
    expect(buildClassVisibilitySql({ ...access.scope, allowedLocationIds: [] })).toBe("1=0");
  });

  it("shows only managed, directly assigned, or session-assigned entries for View", () => {
    const visibleClassIds = new Set(["managed-class"]);
    const staffId = "assigned-teacher";

    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      classId: "managed-class",
    })).toBe(true);
    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      classId: "other-class",
      sessionTeacherIds: [staffId],
    })).toBe(true);
    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      classId: "other-class",
    })).toBe(false);
  });

  it("applies the same assigned-teacher rule to free-class and TEST entries", () => {
    const visibleClassIds = new Set<string>();
    const staffId = "assigned-teacher";

    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      classId: "free-class",
      teacherIds: [staffId],
    })).toBe(true);
    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      teacherIds: [staffId],
    })).toBe(true);
    expect(isScheduleEntryVisible({
      visibleClassIds,
      staffId,
      teacherIds: ["another-teacher"],
    })).toBe(false);
  });

  it("keeps schedule view-only until the role has a write permission", () => {
    expect(isScheduleViewOnly(false, { canView: true } as any)).toBe(true);
    expect(isScheduleViewOnly(false, { canViewAll: true } as any)).toBe(true);
    expect(isScheduleViewOnly(false, { canCreate: true })).toBe(false);
    expect(isScheduleViewOnly(false, { canEdit: true })).toBe(false);
    expect(isScheduleViewOnly(false, { canDelete: true })).toBe(false);
    expect(isScheduleViewOnly(true, null)).toBe(false);
  });

  it("grants create-only users only the explicitly allowed add workflows", () => {
    const permissions = { canCreate: true };

    expect(getScheduleWriteCapabilities(false, permissions)).toEqual({
      canAdd: true,
      canEdit: false,
      canDelete: false,
    });
    expect(canScheduleWrite(permissions, "canCreate")).toBe(true);
    expect(canScheduleWrite(permissions, "canEdit")).toBe(false);
    expect(canScheduleWrite(permissions, "canDelete")).toBe(false);
  });

  it("lets edit users perform all non-delete work and delete users perform every workflow", () => {
    const editPermissions = { canEdit: true };
    expect(getScheduleWriteCapabilities(false, editPermissions)).toEqual({
      canAdd: true,
      canEdit: true,
      canDelete: false,
    });
    expect(canScheduleWrite(editPermissions, "canCreate")).toBe(true);
    expect(canScheduleWrite(editPermissions, "canEdit")).toBe(true);
    expect(canScheduleWrite(editPermissions, "canDelete")).toBe(false);

    const deletePermissions = { canDelete: true };
    expect(getScheduleWriteCapabilities(false, deletePermissions)).toEqual({
      canAdd: true,
      canEdit: true,
      canDelete: true,
    });
    expect(canScheduleWrite(deletePermissions, "canCreate")).toBe(true);
    expect(canScheduleWrite(deletePermissions, "canEdit")).toBe(true);
    expect(canScheduleWrite(deletePermissions, "canDelete")).toBe(true);
  });
});