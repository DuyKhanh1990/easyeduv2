import type { Request, Response } from "express";
import { upsertUserTenantMap } from "../services/tenant.service.js";

/**
 * POST /api/gateway/internal/map-user
 *
 * CRM gọi endpoint này sau khi gắn Zalo với học viên.
 * Protected bằng x-gateway-secret header.
 *
 * Body: { zaloUserId, userId, tenantId }
 */
export async function handleMapUser(req: Request, res: Response): Promise<void> {
  const { zaloUserId, userId, tenantId } = req.body ?? {};

  if (!zaloUserId || typeof zaloUserId !== "string") {
    res.status(400).json({ error: "zaloUserId là bắt buộc" });
    return;
  }
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId là bắt buộc" });
    return;
  }
  if (!tenantId || typeof tenantId !== "string") {
    res.status(400).json({ error: "tenantId là bắt buộc" });
    return;
  }

  try {
    await upsertUserTenantMap(zaloUserId, userId, tenantId);
    console.log(
      `[Gateway Internal] ✓ Mapped zaloUserId=${zaloUserId} → userId=${userId}, tenantId=${tenantId}`,
    );
    res.json({ ok: true, zaloUserId, userId, tenantId });
  } catch (err: any) {
    console.error("[Gateway Internal] map-user error:", err);
    res.status(500).json({ error: err.message });
  }
}
