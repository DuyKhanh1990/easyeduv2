import { db } from "../db";
import { classes } from "@shared/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getEffectivePermissions } from "../storage/permissions.storage";

export type ClassViewScope = {
  userId: string;
  staffId: string | null;
  allowedLocationIds: string[] | null;
  canViewAll: boolean;
};

export type ClassViewAccess = {
  scope: ClassViewScope;
  canView: boolean;
  canViewAll: boolean;
};

/**
 * Resolve the class visibility scope for an authenticated staff member.
 *
 * `createdBy` stores users.id, while teacherIds/managerIds store staff.id.
 * Keep those identifiers separate here so the row-level predicate cannot
 * accidentally compare values from the wrong table.
 */
export async function resolveClassViewAccess(req: any): Promise<ClassViewAccess> {
  const user = req.user as { id?: string; username?: string } | undefined;
  const userId = user?.id ?? "";
  const isSuperAdmin = req.isSuperAdmin === true || user?.username === "admin";

  if (isSuperAdmin) {
    return {
      scope: {
        userId,
        staffId: req.staffId ?? null,
        allowedLocationIds: null,
        canViewAll: true,
      },
      canView: true,
      canViewAll: true,
    };
  }

  const permissions = await getEffectivePermissions(req.roleIds ?? [], "/classes");
  return {
    scope: {
      userId,
      staffId: req.staffId ?? null,
      allowedLocationIds: Array.isArray(req.allowedLocationIds) ? req.allowedLocationIds : [],
      canViewAll: permissions.canViewAll,
    },
    canView: permissions.canView,
    canViewAll: permissions.canViewAll,
  };
}

/**
 * SQL predicate for a class visible to the supplied staff scope.
 * A missing createdBy is intentionally not a wildcard: it only matches when
 * the current staff member is explicitly assigned as teacher or manager.
 */
export function buildClassVisibilityCondition(scope: ClassViewScope) {
  const locationCondition =
    scope.allowedLocationIds === null
      ? undefined
      : scope.allowedLocationIds.length > 0
        ? inArray(classes.locationId, scope.allowedLocationIds)
        : sql`FALSE`;

  if (scope.canViewAll) {
    return locationCondition ?? sql`TRUE`;
  }

  const ownerConditions = [
    eq(classes.createdBy, scope.userId),
    scope.staffId
      ? sql`${scope.staffId} = ANY(COALESCE(${classes.teacherIds}, ARRAY[]::uuid[]))`
      : sql`FALSE`,
    scope.staffId
      ? sql`${scope.staffId} = ANY(COALESCE(${classes.managerIds}, ARRAY[]::uuid[]))`
      : sql`FALSE`,
  ];

  return and(locationCondition, or(...ownerConditions))!;
}

function uuidLiteral(value: string | null | undefined): string {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? `'${value}'::uuid`
    : "NULL::uuid";
}

/**
 * Equivalent predicate for the few legacy aggregate queries that use
 * sql.raw(). All values are UUIDs originating from authenticated request
 * context or the database, and are allowlisted before interpolation.
 */
export function buildClassVisibilitySql(scope: ClassViewScope, alias = "c"): string {
  const location =
    scope.allowedLocationIds === null
      ? "1=1"
      : scope.allowedLocationIds.length > 0
        ? `${alias}.location_id = ANY(ARRAY[${scope.allowedLocationIds.map(uuidLiteral).join(",")}]::uuid[])`
        : "1=0";

  if (scope.canViewAll) return location;

  const user = `${alias}.created_by = ${uuidLiteral(scope.userId)}`;
  const teacher = `${uuidLiteral(scope.staffId)} = ANY(COALESCE(${alias}.teacher_ids, ARRAY[]::uuid[]))`;
  const manager = `${uuidLiteral(scope.staffId)} = ANY(COALESCE(${alias}.manager_ids, ARRAY[]::uuid[]))`;
  return `(${location}) AND (${user} OR ${teacher} OR ${manager})`;
}

export async function canViewClass(scope: ClassViewScope, classId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), buildClassVisibilityCondition(scope)))
    .limit(1);
  return !!row;
}
