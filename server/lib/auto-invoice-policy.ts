import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { rolePermissions, systemSettings } from "@shared/schema";
import { AUTO_INVOICE_FEATURE_PERMISSION_RESOURCE, EDUCATION_OTHER_CONFIG_RESOURCE } from "@shared/permission-resources";

export const AUTO_INVOICE_POLICY_SETTINGS_KEY = "autoInvoicePolicy";
export const DEFAULT_AUTO_INVOICE_ENABLED = true;

export type AutoInvoicePolicy = {
  defaultEnabled: boolean;
  roleIds: string[];
};

const autoInvoicePolicySchema = z.object({
  defaultEnabled: z.boolean(),
  roleIds: z.array(z.string().uuid()),
});

export async function getAutoInvoicePolicy(): Promise<AutoInvoicePolicy> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, AUTO_INVOICE_POLICY_SETTINGS_KEY))
    .limit(1);

  if (!row) {
    return { defaultEnabled: DEFAULT_AUTO_INVOICE_ENABLED, roleIds: [] };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(row.value);
  } catch {
    throw new Error("Cấu hình hóa đơn tự động không hợp lệ.");
  }

  const result = autoInvoicePolicySchema.safeParse(parsedValue);
  if (!result.success) {
    throw new Error("Cấu hình hóa đơn tự động không hợp lệ.");
  }

  return result.data;
}

export function canOverrideAutoInvoice(req: any, policy: AutoInvoicePolicy): boolean {
  if (req?.isSuperAdmin === true) return true;
  const roleIds: string[] = Array.isArray(req?.roleIds) ? req.roleIds : [];
  return roleIds.some((roleId) => policy.roleIds.includes(roleId));
}

export function resolveAutoInvoiceValue(
  req: any,
  policy: AutoInvoicePolicy,
  requestedValue: unknown,
): boolean {
  return canOverrideAutoInvoice(req, policy) && typeof requestedValue === "boolean"
    ? requestedValue
    : policy.defaultEnabled;
}

export async function hasEducationConfigPermission(
  req: any,
  resource: string,
  permission: "canView" | "canEdit",
): Promise<boolean> {
  if (req?.isSuperAdmin === true) return true;
  const roleIds: string[] = Array.isArray(req?.roleIds)
    ? req.roleIds.filter((roleId: unknown): roleId is string => typeof roleId === "string")
    : [];
  if (roleIds.length === 0) return false;

  const rows = await db
    .select({ allowed: rolePermissions[permission] })
    .from(rolePermissions)
    .where(and(
      inArray(rolePermissions.roleId, roleIds),
      eq(rolePermissions.resource, resource),
    ));

  return rows.some((row) => row.allowed);
}

export async function canViewAutoInvoiceFeature(req: any): Promise<boolean> {
  const [canViewTab, canViewFeature] = await Promise.all([
    hasEducationConfigPermission(req, EDUCATION_OTHER_CONFIG_RESOURCE, "canView"),
    hasEducationConfigPermission(req, AUTO_INVOICE_FEATURE_PERMISSION_RESOURCE, "canView"),
  ]);
  return canViewTab && canViewFeature;
}
