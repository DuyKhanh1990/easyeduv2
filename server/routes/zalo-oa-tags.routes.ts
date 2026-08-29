import type { Express } from "express";
import { db } from "../db";
import { zaloOaConfigs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../lib/encryption";
import { z } from "zod";

const ZALO_BASE = "https://openapi.zalo.me/v2.0/oa";

async function getAccessToken(locationId: string): Promise<string | null> {
  const rows = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId)).limit(1);
  if (!rows.length || !rows[0].accessTokenEncrypted) return null;
  try {
    return decrypt(rows[0].accessTokenEncrypted);
  } catch {
    return null;
  }
}

async function refreshAccessToken(locationId: string): Promise<string | null> {
  const rows = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId)).limit(1);
  if (!rows.length || !rows[0].refreshTokenEncrypted) return null;
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) return null;
  try {
    const refreshToken = decrypt(rows[0].refreshTokenEncrypted);
    const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "secret_key": appSecret },
      body: new URLSearchParams({ refresh_token: refreshToken, app_id: appId, grant_type: "refresh_token" }),
    });
    const data = await res.json() as any;
    if (data.error || !data.access_token) return null;
    const accessTokenEncrypted = encrypt(data.access_token);
    const newRefreshTokenEncrypted = data.refresh_token ? encrypt(data.refresh_token) : rows[0].refreshTokenEncrypted;
    const expiresIn = data.expires_in ? parseInt(data.expires_in) : 7200;
    const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);
    await db.update(zaloOaConfigs).set({
      accessTokenEncrypted,
      refreshTokenEncrypted: newRefreshTokenEncrypted,
      tokenExpiredAt,
      isConnected: true,
      updatedAt: new Date(),
    }).where(eq(zaloOaConfigs.locationId, locationId));
    return data.access_token;
  } catch {
    return null;
  }
}

const TOKEN_EXPIRED_ERRORS = new Set([-155, -216, 216]);

async function callZaloWithRetry(
  locationId: string,
  caller: (token: string) => Promise<Response>,
): Promise<{ data: any; error?: string }> {
  let token = await getAccessToken(locationId);
  if (!token) return { data: null, error: "Không có access token hợp lệ" };

  let res = await caller(token);
  let data = await res.json() as any;

  if (TOKEN_EXPIRED_ERRORS.has(data.error)) {
    const newToken = await refreshAccessToken(locationId);
    if (!newToken) return { data: null, error: "Token hết hạn, không thể làm mới tự động" };
    res = await caller(newToken);
    data = await res.json() as any;
  }

  if (data.error !== 0) {
    return { data, error: data.message || `Zalo API lỗi (error=${data.error})` };
  }
  return { data };
}

export function registerZaloOATagRoutes(app: Express) {

  // ─── GET /api/zalo-oa/tags?locationId=xxx — Lấy danh sách nhãn của OA ────────
  app.get("/api/zalo-oa/tags", async (req, res) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const { data, error } = await callZaloWithRetry(locationId as string, (token) =>
        fetch(`${ZALO_BASE}/tag/gettagsofoa`, {
          headers: { "access_token": token },
        }),
      );

      if (error && !data) return res.status(400).json({ message: error });
      if (error) return res.status(400).json({ message: error, detail: data });

      console.log(`[ZaloOA Tags] getTagsOfOA: locationId=${locationId}, count=${data?.data?.length ?? 0}`);
      return res.json(data.data ?? []);
    } catch (err: any) {
      console.error("[ZaloOA Tags] getTagsOfOA error:", err);
      return res.status(500).json({ message: err.message || "Lỗi lấy danh sách nhãn" });
    }
  });

  // ─── POST /api/zalo-oa/tags/assign — Gắn nhãn cho người dùng ────────────────
  app.post("/api/zalo-oa/tags/assign", async (req, res) => {
    try {
      const { locationId, user_id, tag_id } = z.object({
        locationId: z.string(),
        user_id: z.string(),
        tag_id: z.union([z.string(), z.number()]),
      }).parse(req.body);

      const { data, error } = await callZaloWithRetry(locationId, (token) =>
        fetch(`${ZALO_BASE}/tag/tagfollower`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": token },
          body: JSON.stringify({ user_id, tag_id }),
        }),
      );

      if (error && !data) return res.status(400).json({ message: error });
      if (error) return res.status(400).json({ message: error, detail: data });

      console.log(`[ZaloOA Tags] assignTag: user_id=${user_id}, tag_id=${tag_id}, locationId=${locationId}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA Tags] assignTag error:", err);
      return res.status(500).json({ message: err.message || "Lỗi gắn nhãn người dùng" });
    }
  });

  // ─── POST /api/zalo-oa/tags/remove-follower — Gỡ nhãn khỏi người dùng ───────
  app.post("/api/zalo-oa/tags/remove-follower", async (req, res) => {
    try {
      const { locationId, user_id, tag_id } = z.object({
        locationId: z.string(),
        user_id: z.string(),
        tag_id: z.union([z.string(), z.number()]),
      }).parse(req.body);

      const { data, error } = await callZaloWithRetry(locationId, (token) =>
        fetch(`${ZALO_BASE}/tag/rmfollowerfromtag`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": token },
          body: JSON.stringify({ user_id, tag_id }),
        }),
      );

      if (error && !data) return res.status(400).json({ message: error });
      if (error) return res.status(400).json({ message: error, detail: data });

      console.log(`[ZaloOA Tags] removeFollowerFromTag: user_id=${user_id}, tag_id=${tag_id}, locationId=${locationId}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA Tags] removeFollowerFromTag error:", err);
      return res.status(500).json({ message: err.message || "Lỗi gỡ nhãn người dùng" });
    }
  });

  // ─── DELETE /api/zalo-oa/tags/:tagId?locationId=xxx — Xóa nhãn ──────────────
  app.delete("/api/zalo-oa/tags/:tagId", async (req, res) => {
    try {
      const { tagId } = req.params;
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const { data, error } = await callZaloWithRetry(locationId as string, (token) =>
        fetch(`${ZALO_BASE}/tag/rmtag`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": token },
          body: JSON.stringify({ tag_id: tagId }),
        }),
      );

      if (error && !data) return res.status(400).json({ message: error });
      if (error) return res.status(400).json({ message: error, detail: data });

      console.log(`[ZaloOA Tags] deleteTag: tag_id=${tagId}, locationId=${locationId}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA Tags] deleteTag error:", err);
      return res.status(500).json({ message: err.message || "Lỗi xóa nhãn" });
    }
  });

  // ─── GET /api/zalo-oa/tags/:tagId/followers?locationId=xxx&offset=0&count=50 ─
  app.get("/api/zalo-oa/tags/:tagId/followers", async (req, res) => {
    try {
      const { tagId } = req.params;
      const { locationId, offset = "0", count = "50" } = req.query;
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const offsetNum = parseInt(offset as string) || 0;
      const countNum = Math.min(parseInt(count as string) || 50, 50);

      const { data, error } = await callZaloWithRetry(locationId as string, (token) => {
        const params = new URLSearchParams({
          tag_id: tagId,
          offset: String(offsetNum),
          count: String(countNum),
        });
        return fetch(`${ZALO_BASE}/tag/getfollowersbytag?${params}`, {
          headers: { "access_token": token },
        });
      });

      if (error && !data) return res.status(400).json({ message: error });
      if (error) return res.status(400).json({ message: error, detail: data });

      console.log(`[ZaloOA Tags] getFollowersByTag: tag_id=${tagId}, offset=${offsetNum}, count=${countNum}, locationId=${locationId}`);
      return res.json(data.data ?? { followers: [], total: 0 });
    } catch (err: any) {
      console.error("[ZaloOA Tags] getFollowersByTag error:", err);
      return res.status(500).json({ message: err.message || "Lỗi lấy danh sách người dùng theo nhãn" });
    }
  });
}
