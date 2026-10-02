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

export async function getEffectivePermissions(roleIds: string[], resource: string): Promise<EffectivePermission> {
  if (!roleIds || roleIds.length === 0) {
    return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
  }
  const perms = await db
    .select()
    .from(rolePermissions)
    .where(and(inArray(rolePermissions.roleId, roleIds), eq(rolePermissions.resource, resource)));

  return perms.reduce(
    (acc, p) => ({
      canView: acc.canView || p.canView,
      canViewAll: acc.canViewAll || p.canViewAll,
      canCreate: acc.canCreate || p.canCreate,
      canEdit: acc.canEdit || p.canEdit,
      canDelete: acc.canDelete || p.canDelete,
    }),
    { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false }
  );
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
    invoiceScopes?: string[] | null;
  }
): Promise<RolePermission> {
  const { invoiceScopes, ...permissionFlags } = permissions;
  const existing = await db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.resource, resource)));

  if (existing.length > 0) {
    const update: Partial<typeof rolePermissions.$inferInsert> = {
      ...permissionFlags,
      updatedAt: new Date(),
    };
    if (invoiceScopes !== undefined) update.invoiceScopes = invoiceScopes;
    const [updated] = await db
      .update(rolePermissions)
      .set(update)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.resource, resource)))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(rolePermissions)
      .values({
        roleId,
        resource,
        ...permissionFlags,
        invoiceScopes: resource === "/invoices" ? invoiceScopes ?? [] : invoiceScopes ?? null,
      })
      .returning();
    return created;
  }
}
