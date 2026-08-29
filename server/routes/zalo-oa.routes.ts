import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { zaloOaConfigs, centerConfig } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";

// ─── HMAC-signed state (compatible với Gateway) ───────────────────────────────
// Gateway dùng ZALO_GATEWAY_SHARED_SECRET để verify — main server phải dùng
// đúng key này. Nếu không có gateway (direct mode), dùng ZALO_APP_SECRET.

function getStateSecret(): string {
  return process.env.ZALO_GATEWAY_SHARED_SECRET || process.env.ZALO_APP_SECRET || "zalo-state-secret";
}

function createSignedState(locationId: string, centerId: string, centerUrl: string, returnPath = "/settings"): string {
  const payload = JSON.stringify({ locationId, centerId, centerUrl, returnPath, ts: Date.now() });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifySignedState(state: string): { locationId: string; centerId?: string; centerUrl?: string; returnPath?: string } | null {
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const b64 = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac("sha256", getStateSecret()).update(b64).digest("base64url");
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (!payload.locationId) return null;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
    return {
      locationId: payload.locationId,
      centerId: payload.centerId,
      centerUrl: payload.centerUrl,
      returnPath: payload.returnPath || "/settings",
    };
  } catch {
    return null;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function getCallbackUrl(req: Request): string {
  if (process.env.ZALO_GATEWAY_CALLBACK_URL) return process.env.ZALO_GATEWAY_CALLBACK_URL;
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}/api/zalo-oa/callback`;
  return `${req.protocol}://${req.get("host")}/api/zalo-oa/callback`;
}

export function getWebhookUrl(req?: Request): string {
  if (process.env.ZALO_WEBHOOK_URL) return process.env.ZALO_WEBHOOK_URL;
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}/api/zalo-oa/webhook`;
  if (req) return `${req.protocol}://${req.get("host")}/api/zalo-oa/webhook`;
  return "";
}

async function registerWebhookWithZalo(accessToken: string, webhookUrl: string): Promise<void> {
  if (!webhookUrl) {
    console.warn("[ZaloOA] ZALO_WEBHOOK_URL chưa được cấu hình, bỏ qua đăng ký webhook tự động.");
    return;
  }
  try {
    // Zalo OA webhook không hỗ trợ đăng ký tự động qua API (endpoint bị deprecated).
    // Webhook URL cần được cấu hình thủ công trong Zalo Developer Portal:
    // https://developers.zalo.me → App → Official Account → Webhook
    // Log webhook URL để admin có thể copy-paste vào portal nếu cần.
    console.log(`[ZaloOA] Webhook URL (cấu hình thủ công tại Zalo Dev Portal): ${webhookUrl}`);
  } catch (e) {
    console.warn("[ZaloOA] Lỗi khi đăng ký webhook:", e);
  }
}

// ─── OAuth callback handler (dùng chung cho 2 route) ─────────────────────────

async function handleZaloOAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error } = req.query;

    console.log("[ZaloOA] callback received:", {
      hasCode: !!code,
      hasState: !!state,
      stateValue: state ? (state as string).substring(0, 20) + "..." : null,
      error: error || null,
      secretUsed: process.env.ZALO_GATEWAY_SHARED_SECRET ? "GATEWAY_SECRET" : (process.env.ZALO_APP_SECRET ? "APP_SECRET" : "DEFAULT"),
    });

    if (error) {
      res.redirect(`/settings?zalo_error=${encodeURIComponent(error as string)}`);
      return;
    }
    if (!code || !state) {
      // Không có code/state và không có lỗi → có thể là bot probe hoặc browser prefetch
      // Redirect im lặng về settings, không hiện thông báo lỗi giả cho người dùng
      res.redirect("/settings");
      return;
    }

    const statePayload = verifySignedState(state as string);
    console.log("[ZaloOA] verifySignedState result:", statePayload ? `locationId=${statePayload.locationId}, centerUrl=${statePayload.centerUrl}` : "FAILED");
    if (!statePayload) {
      res.redirect("/settings?zalo_error=" + encodeURIComponent("State không hợp lệ hoặc đã hết hạn. Vui lòng thử lại."));
      return;
    }
    const { locationId, centerUrl, returnPath = "/settings" } = statePayload;

    // Helper: tạo URL redirect đúng domain của trung tâm
    const centerRedirect = (path: string) => centerUrl ? `${centerUrl}${path}` : path;

    const appId = process.env.ZALO_APP_ID;
    const appSecret = process.env.ZALO_APP_SECRET;
    if (!appId || !appSecret) {
      res.redirect(centerRedirect("/settings?zalo_error=" + encodeURIComponent("Hệ thống chưa cấu hình ZALO_APP_ID/ZALO_APP_SECRET")));
      return;
    }

    const tokenRes = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "secret_key": appSecret },
      body: new URLSearchParams({ code: code as string, app_id: appId, grant_type: "authorization_code" }),
    });

    const tokenData = await tokenRes.json() as any;
    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.message || "Lấy access token thất bại";
      console.error("[ZaloOA] token exchange error:", tokenData);
      res.redirect(centerRedirect(`/settings?zalo_error=${encodeURIComponent(errMsg)}`));
      return;
    }

    let oaId: string | null = null;
    let oaName: string | null = null;
    try {
      const oaRes = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
        headers: { "access_token": tokenData.access_token },
      });
      const oaData = await oaRes.json() as any;
      if (oaData.error === 0 && oaData.data) {
        oaId = oaData.data.oa_id || null;
        oaName = oaData.data.name || null;
      }
    } catch (e) {
      console.warn("[ZaloOA] could not fetch OA info:", e);
    }

    // ─── Gateway mode: forward token đến DB của trung tâm đúng ───────────────
    // Mỗi trung tâm có DB riêng → phải POST sang centerUrl/api/zalo/receive-token
    // thay vì lưu vào DB local (của gateway/easyeduv2).
    const isGatewayMode = Boolean(process.env.ZALO_GATEWAY_CALLBACK_URL) && Boolean(centerUrl);
    if (isGatewayMode) {
      const sharedSecret = process.env.ZALO_GATEWAY_SHARED_SECRET;
      if (!sharedSecret) {
        console.error("[ZaloOA] Gateway mode nhưng thiếu ZALO_GATEWAY_SHARED_SECRET");
        res.redirect(centerRedirect(`/settings?zalo_error=${encodeURIComponent("Cấu hình Gateway thiếu ZALO_GATEWAY_SHARED_SECRET")}`));
        return;
      }
      console.log(`[ZaloOA] Gateway mode → forward token đến ${centerUrl}/api/zalo/receive-token (locationId=${locationId}, oaId=${oaId})`);
      const forwardRes = await fetch(`${centerUrl}/api/zalo/receive-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gateway-secret": sharedSecret,
        },
        body: JSON.stringify({
          locationId,
          oaId,
          oaName,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresIn: tokenData.expires_in || 7200,
        }),
      });
      if (!forwardRes.ok) {
        const errBody = await forwardRes.text().catch(() => "");
        console.error(`[ZaloOA] Forward token thất bại (${forwardRes.status}):`, errBody);
        res.redirect(centerRedirect(`/settings?zalo_error=${encodeURIComponent("Lưu token Zalo thất bại. Vui lòng thử lại.")}`));
        return;
      }
      res.redirect(centerRedirect(`${returnPath}?zalo_success=1`));
      return;
    }

    // ─── Direct mode: lưu vào DB local (single-tenant / dev) ─────────────────
    const accessTokenEncrypted = encrypt(tokenData.access_token);
    const refreshTokenEncrypted = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    const expiresIn = tokenData.expires_in ? parseInt(tokenData.expires_in) : 7200;
    const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);

    const existing = await db.select().from(zaloOaConfigs)
      .where(eq(zaloOaConfigs.locationId, locationId)).limit(1);

    if (existing.length > 0) {
      await db.update(zaloOaConfigs).set({
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiredAt,
        connectedAt: new Date(),
        isConnected: true,
        oaId,
        oaName,
        updatedAt: new Date(),
      }).where(eq(zaloOaConfigs.locationId, locationId));
    } else {
      await db.insert(zaloOaConfigs).values({
        locationId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiredAt,
        connectedAt: new Date(),
        isConnected: true,
        oaId,
        oaName,
      });
    }

    const webhookUrl = getWebhookUrl(req);
    await registerWebhookWithZalo(tokenData.access_token, webhookUrl);

    res.redirect(centerRedirect(`${returnPath}?zalo_success=1`));
  } catch (err: any) {
    console.error("[ZaloOA] callback error:", err);
    res.redirect(`/settings?zalo_error=${encodeURIComponent(err.message || "Lỗi xử lý callback")}`);
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerZaloOARoutes(app: Express) {

  // GET /api/zalo-oa/configs — danh sách kết nối (không trả app credentials)
  app.get("/api/zalo-oa/configs", async (req, res) => {
    try {
      const { locationId } = req.query;
      const rows = locationId
        ? await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId as string))
        : await db.select().from(zaloOaConfigs);

      const result = rows.map((row) => ({
        id: row.id,
        locationId: row.locationId,
        oaId: row.oaId,
        oaName: row.oaName,
        tokenExpiredAt: row.tokenExpiredAt,
        connectedAt: row.connectedAt,
        hasToken: Boolean(row.accessTokenEncrypted),
        isTokenExpired: row.tokenExpiredAt ? new Date(row.tokenExpiredAt) < new Date() : true,
        isConnected: row.isConnected,
      }));
      return res.json(result);
    } catch (err: any) {
      console.error("[ZaloOA] GET configs error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy cấu hình Zalo OA" });
    }
  });

  // GET /api/zalo-oa/connect — tạo OAuth URL (dùng App credentials từ ENV)
  app.get("/api/zalo-oa/connect", async (req, res) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const appId = process.env.ZALO_APP_ID;
      if (!appId) {
        return res.status(500).json({ message: "Hệ thống chưa cấu hình ZALO_APP_ID. Vui lòng liên hệ quản trị viên." });
      }

      const callbackUrl = getCallbackUrl(req);

      // centerId = UUID ổn định từ DB, không phụ thuộc domain/ENV
      const [cfg] = await db.select().from(centerConfig).limit(1);
      if (!cfg) {
        return res.status(500).json({ message: "Center chưa được khởi tạo. Vui lòng liên hệ quản trị viên." });
      }
      const centerId = cfg.id;
      const centerUrl = cfg.centerUrl ||
        process.env.CENTER_PUBLIC_URL ||
        (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "") ||
        `${req.protocol}://${req.get("host")}`;
      const returnPath = (req.query.returnPath as string) || "/settings";
      const state = createSignedState(locationId as string, centerId, centerUrl, returnPath);
      const oauthUrl = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${appId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
      return res.json({ url: oauthUrl });
    } catch (err: any) {
      console.error("[ZaloOA] connect error:", err);
      return res.status(500).json({ message: "Lỗi tạo OAuth URL" });
    }
  });

  // GET /zalo/callback — Gateway mode: Zalo redirect về domain chính
  app.get("/zalo/callback", (req, res) => handleZaloOAuthCallback(req, res));

  // GET /api/zalo-oa/callback — Direct mode: Zalo redirect về API path
  app.get("/api/zalo-oa/callback", (req, res) => handleZaloOAuthCallback(req, res));

  // POST /api/zalo/receive-token — Gateway gửi token về sau khi exchange OAuth (multi-tenant mode)
  app.post("/api/zalo/receive-token", async (req, res) => {
    try {
      const expectedSecret = process.env.ZALO_GATEWAY_SHARED_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ message: "Endpoint này chưa được kích hoạt (thiếu ZALO_GATEWAY_SHARED_SECRET)" });
      }
      const authHeader = req.headers["x-gateway-secret"];
      if (authHeader !== expectedSecret) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { locationId, oaId, oaName, accessToken, refreshToken, expiresIn } = req.body;
      if (!locationId || !accessToken) {
        return res.status(400).json({ message: "Thiếu locationId hoặc accessToken" });
      }

      const accessTokenEncrypted = encrypt(accessToken);
      const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;
      const expiry = expiresIn ? parseInt(expiresIn) : 7200;
      const tokenExpiredAt = new Date(Date.now() + expiry * 1000);

      const existing = await db.select().from(zaloOaConfigs)
        .where(eq(zaloOaConfigs.locationId, locationId)).limit(1);

      if (existing.length > 0) {
        await db.update(zaloOaConfigs).set({
          accessTokenEncrypted,
          refreshTokenEncrypted: refreshTokenEncrypted ?? existing[0].refreshTokenEncrypted,
          tokenExpiredAt,
          oaId: oaId || existing[0].oaId,
          oaName: oaName || existing[0].oaName,
          connectedAt: new Date(),
          isConnected: true,
          updatedAt: new Date(),
        }).where(eq(zaloOaConfigs.locationId, locationId));
      } else {
        await db.insert(zaloOaConfigs).values({
          locationId,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiredAt,
          oaId: oaId || null,
          oaName: oaName || null,
          connectedAt: new Date(),
          isConnected: true,
        });
      }

      const webhookUrl = getWebhookUrl();
      if (webhookUrl) await registerWebhookWithZalo(accessToken, webhookUrl);

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA] receive-token error:", err);
      return res.status(500).json({ message: err.message || "Lỗi xử lý token" });
    }
  });

  // DELETE /api/zalo-oa/configs/:locationId — ngắt kết nối
  app.delete("/api/zalo-oa/configs/:locationId", async (req, res) => {
    try {
      const { locationId } = req.params;
      await db.delete(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId));
      return res.status(204).send();
    } catch (err: any) {
      console.error("[ZaloOA] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xóa cấu hình Zalo OA" });
    }
  });

  // POST /api/zalo-oa/configs/:locationId/refresh-token — làm mới token thủ công
  app.post("/api/zalo-oa/configs/:locationId/refresh-token", async (req, res) => {
    try {
      const { locationId } = req.params;
      const rows = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy cấu hình" });

      const config = rows[0];
      if (!config.refreshTokenEncrypted) return res.status(400).json({ message: "Không có refresh token" });

      const appId = process.env.ZALO_APP_ID;
      const appSecret = process.env.ZALO_APP_SECRET;
      if (!appId || !appSecret) {
        return res.status(500).json({ message: "Hệ thống chưa cấu hình ZALO_APP_ID/ZALO_APP_SECRET" });
      }

      const refreshToken = decrypt(config.refreshTokenEncrypted);

      const tokenRes = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "secret_key": appSecret },
        body: new URLSearchParams({ refresh_token: refreshToken, app_id: appId, grant_type: "refresh_token" }),
      });

      const tokenData = await tokenRes.json() as any;
      if (tokenData.error || !tokenData.access_token) {
        return res.status(400).json({ message: tokenData.error_description || "Làm mới token thất bại" });
      }

      const accessTokenEncrypted = encrypt(tokenData.access_token);
      const newRefreshTokenEncrypted = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : config.refreshTokenEncrypted;
      const expiresIn = tokenData.expires_in ? parseInt(tokenData.expires_in) : 7200;
      const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);

      await db.update(zaloOaConfigs).set({
        accessTokenEncrypted,
        refreshTokenEncrypted: newRefreshTokenEncrypted,
        tokenExpiredAt,
        updatedAt: new Date(),
      }).where(eq(zaloOaConfigs.locationId, locationId));

      const webhookUrl = getWebhookUrl();
      await registerWebhookWithZalo(tokenData.access_token, webhookUrl);

      return res.json({ ok: true, tokenExpiredAt });
    } catch (err: any) {
      console.error("[ZaloOA] refresh-token error:", err);
      return res.status(500).json({ message: err.message || "Lỗi làm mới token" });
    }
  });

  // GET /api/zalo-oa/webhook-info — thông tin URL cho admin
  app.get("/api/zalo-oa/webhook-info", (req, res) => {
    const callbackUrl = getCallbackUrl(req);
    const webhookUrl = getWebhookUrl(req);
    const isGatewayMode = Boolean(process.env.ZALO_GATEWAY_CALLBACK_URL);
    return res.json({ callbackUrl, webhookUrl, isGatewayMode });
  });
}
