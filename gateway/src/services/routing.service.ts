import { db } from "../db.js";
import { facebookPageRoutes, zaloRouting, centerRegistry } from "../schema.js";
import { eq } from "drizzle-orm";

// ─── Zalo OA → Center routing ─────────────────────────────────────────────────

export async function upsertRoute(
  oaId: string,
  centerId: string,
  centerUrl: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(zaloRouting)
    .where(eq(zaloRouting.oaId, oaId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(zaloRouting)
      .set({ centerId, centerUrl, connectedAt: new Date(), isActive: true })
      .where(eq(zaloRouting.oaId, oaId));
  } else {
    await db
      .insert(zaloRouting)
      .values({ oaId, centerId, centerUrl, connectedAt: new Date(), isActive: true });
  }
}

export async function lookupRoute(
  oaId: string,
): Promise<{ centerUrl: string; centerId: string } | null> {
  const rows = await db
    .select()
    .from(zaloRouting)
    .where(eq(zaloRouting.oaId, oaId))
    .limit(1);

  if (!rows.length || !rows[0].isActive) return null;
  return { centerUrl: rows[0].centerUrl, centerId: rows[0].centerId };
}

export async function markRouteInactive(oaId: string): Promise<void> {
  await db
    .update(zaloRouting)
    .set({ isActive: false })
    .where(eq(zaloRouting.oaId, oaId));
}

export async function markRouteActive(oaId: string): Promise<void> {
  await db
    .update(zaloRouting)
    .set({ isActive: true })
    .where(eq(zaloRouting.oaId, oaId));
}

export async function listRoutes() {
  return db.select().from(zaloRouting);
}

// ─── Facebook Page → Center routing ───────────────────────────────────────────

/**
 * Register or move a Facebook Page to an active center.
 *
 * The URL is resolved from center_registry so callers cannot redirect routing
 * to an arbitrary URL by supplying their own centerUrl.
 */
export async function upsertFacebookPageRoute(
  pageId: string,
  centerId: string,
): Promise<{
  pageId: string;
  centerId: string;
  centerUrl: string;
  isActive: boolean;
}> {
  const center = await lookupCenter(centerId);
  if (!center) {
    throw new Error(`Center "${centerId}" chưa được đăng ký hoặc đang bị vô hiệu hóa`);
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(facebookPageRoutes)
    .where(eq(facebookPageRoutes.pageId, pageId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(facebookPageRoutes)
      .set({
        centerId,
        centerUrl: center.centerUrl,
        connectedAt: now,
        updatedAt: now,
        isActive: true,
      })
      .where(eq(facebookPageRoutes.pageId, pageId))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(facebookPageRoutes)
    .values({
      pageId,
      centerId,
      centerUrl: center.centerUrl,
      connectedAt: now,
      updatedAt: now,
      isActive: true,
    })
    .returning();

  return created;
}

export async function lookupFacebookPageRoute(
  pageId: string,
): Promise<{ centerUrl: string; centerId: string } | null> {
  const [route] = await db
    .select()
    .from(facebookPageRoutes)
    .where(eq(facebookPageRoutes.pageId, pageId))
    .limit(1);

  if (!route || !route.isActive) return null;

  // Re-resolve the center on every lookup so deactivated centers stop
  // receiving traffic and changed center URLs take effect immediately.
  const center = await lookupCenter(route.centerId);
  if (!center) return null;
  return { centerUrl: center.centerUrl, centerId: route.centerId };
}

export async function markFacebookPageRouteInactive(pageId: string): Promise<void> {
  await db
    .update(facebookPageRoutes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(facebookPageRoutes.pageId, pageId));
}

export async function markFacebookPageRouteActive(pageId: string): Promise<void> {
  const [route] = await db
    .select({ centerId: facebookPageRoutes.centerId })
    .from(facebookPageRoutes)
    .where(eq(facebookPageRoutes.pageId, pageId))
    .limit(1);

  if (!route) {
    throw new Error(`Không tìm thấy Facebook Page route "${pageId}"`);
  }

  const center = await lookupCenter(route.centerId);
  if (!center) {
    throw new Error(`Center "${route.centerId}" chưa được đăng ký hoặc đang bị vô hiệu hóa`);
  }

  await db
    .update(facebookPageRoutes)
    .set({ centerUrl: center.centerUrl, isActive: true, updatedAt: new Date() })
    .where(eq(facebookPageRoutes.pageId, pageId));
}

export async function listFacebookPageRoutes() {
  return db.select().from(facebookPageRoutes);
}

// ─── Center Registry — danh sách trung tâm được phép nhận token ───────────────

export async function lookupCenter(
  centerId: string,
): Promise<{ centerUrl: string } | null> {
  const rows = await db
    .select()
    .from(centerRegistry)
    .where(eq(centerRegistry.centerId, centerId))
    .limit(1);

  if (!rows.length || !rows[0].isActive) return null;
  return { centerUrl: rows[0].centerUrl };
}

export async function registerCenter(
  centerId: string,
  centerUrl: string,
  description?: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(centerRegistry)
    .where(eq(centerRegistry.centerId, centerId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(centerRegistry)
      .set({ centerUrl, description: description ?? existing[0].description, isActive: true, updatedAt: new Date() })
      .where(eq(centerRegistry.centerId, centerId));
  } else {
    await db
      .insert(centerRegistry)
      .values({ centerId, centerUrl, description, isActive: true });
  }
}

export async function deactivateCenter(centerId: string): Promise<void> {
  await db
    .update(centerRegistry)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(centerRegistry.centerId, centerId));
}

export async function listCenters() {
  return db.select().from(centerRegistry);
}
