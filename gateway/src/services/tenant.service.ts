import { db } from "../db.js";
import { userTenantMap, centerRegistry } from "../schema.js";
import { eq, or } from "drizzle-orm";

/**
 * Lookup tenant từ zaloUserId.
 * Source of truth là user_tenant_map — được CRM push vào.
 */
export async function resolveUserTenant(
  zaloUserId: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const [row] = await db
    .select({ userId: userTenantMap.userId, tenantId: userTenantMap.tenantId })
    .from(userTenantMap)
    .where(eq(userTenantMap.zaloUserId, zaloUserId))
    .limit(1);
  return row ?? null;
}

/**
 * Lookup CRM URL từ tenantId.
 */
export async function resolveCrmUrl(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ centerUrl: centerRegistry.centerUrl })
    .from(centerRegistry)
    .where(eq(centerRegistry.centerId, tenantId))
    .limit(1);
  if (!row?.centerUrl) return null;
  return row.centerUrl;
}

/**
 * Lookup tenantId + crmUrl từ center URL (domain).
 * Frontend gửi center URL — gateway tự resolve tenantId nội bộ.
 * Normalize URL: bỏ trailing slash, thử cả http và https nếu cần.
 */
export async function resolveTenantByUrl(
  centerUrl: string,
): Promise<{ tenantId: string; crmUrl: string } | null> {
  const normalized = centerUrl.replace(/\/+$/, "");
  const withSlash = normalized + "/";

  const [row] = await db
    .select({ centerId: centerRegistry.centerId, centerUrl: centerRegistry.centerUrl })
    .from(centerRegistry)
    .where(
      or(
        eq(centerRegistry.centerUrl, normalized),
        eq(centerRegistry.centerUrl, withSlash),
      )
    )
    .limit(1);

  if (!row) return null;
  return { tenantId: row.centerId, crmUrl: row.centerUrl.replace(/\/+$/, "") };
}

/**
 * Upsert user-tenant mapping.
 * Được gọi từ /api/gateway/internal/map-user (CRM push vào).
 */
export async function upsertUserTenantMap(
  zaloUserId: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  const existing = await db
    .select({ id: userTenantMap.id })
    .from(userTenantMap)
    .where(eq(userTenantMap.zaloUserId, zaloUserId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userTenantMap)
      .set({ userId, tenantId, updatedAt: new Date() })
      .where(eq(userTenantMap.zaloUserId, zaloUserId));
  } else {
    await db.insert(userTenantMap).values({ zaloUserId, userId, tenantId });
  }
}
