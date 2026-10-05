import { db, eq, and, inArray } from "./base";
import { rolePermissions } from "@shared/schema";
import type { RolePermission } from "@shared/schema";

export type EffectivePermission = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const MY_SPACE_CALENDAR_RESOURCE = "/my-space/calendar";

export async function getEffectivePermissions(roleIds: string[], resource: string): Promise<EffectivePermission> {
  if (!roleIds || roleIds.length === 0) {
    if (resource === MY_SPACE_CALENDAR_RESOURCE) {
      return { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
    }
    return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
  }
  const perms = await db
    .select()
    .from(rolePermissions)
    .where(and(inArray(rolePermissions.roleId, roleIds), eq(rolePermissions.resource, resource)));

  const effective = perms.reduce(
    (acc, p) => ({
      canView: acc.canView || p.canView,
      canViewAll: acc.canViewAll || p.canViewAll,
      canCreate: acc.canCreate || p.canCreate,
      canEdit: acc.canEdit || p.canEdit,
      canDelete: acc.canDelete || p.canDelete,
    }),
    { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false }
  );

  return resource === MY_SPACE_CALENDAR_RESOURCE
    ? { ...effective, canView: true, canViewAll: false, canDelete: false }
    : effective;
}

export async function getRolePermissions(roleId: string): Promise<RolePermission[]> {
  return await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
}

export async function getAllPermissionsForRoles(roleIds: string[]): Promise<RolePermission[]> {
  if (!roleIds || roleIds.length === 0) return [];
  return await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds));
}

export async function upsertRolePermission(
  roleId: string,
  resource: string,
  permissions: {
    canView: boolean;
    canViewAll: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }
): Promise<RolePermission> {
  const existing = await db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.resource, resource)));

  if (existing.length > 0) {
    const [updated] = await db
      .update(rolePermissions)
      .set({ ...permissions, updatedAt: new Date() })
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.resource, resource)))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(rolePermissions)
      .values({ roleId, resource, ...permissions })
      .returning();
    return created;
  }
}
