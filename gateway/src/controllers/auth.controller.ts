import type { Request, Response } from "express";
import crypto from "crypto";
import { upsertRoute, lookupCenter } from "../services/routing.service.js";

function getStateSecret(): string {
  return process.env.ZALO_GATEWAY_SHARED_SECRET || "";
}

interface StatePayload {
  locationId: string;
  centerId: string;
  centerUrl: string;
  returnPath: string;
  ts: number;
}

function parseStatePayload(b64: string): StatePayload | null {
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (!payload.locationId || !payload.centerId || !payload.ts) return null;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
    return { ...payload, returnPath: payload.returnPath || "/settings" } as StatePayload;
  } catch {
    return null;
  }
}

function verifySignedState(state: string): StatePayload | null {
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const b64 = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);

    const secret = getStateSecret();
    if (!secret) {
      console.error("[Gateway Auth] ZALO_GATEWAY_SHARED_SECRET not set — cannot verify state");
      return null;
    }

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(b64)
      .digest("base64url");

    if (sig !== expectedSig) {
      console.warn("[Gateway Auth] HMAC signature mismatch — state rejected");
      return null;
    }

    return parseStatePayload(b64);
  } catch {
    return null;
  }
}

async function exchangeCodeForToken(
  code: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
} | null> {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) {
    console.error("[Gateway Auth] ZALO_APP_ID / ZALO_APP_SECRET not set");
    return null;
  }

  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: appSecret,
    },
    body: new URLSearchParams({
      code,
      app_id: appId,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as any;
  if (data.error || !data.access_token) {
    console.error("[Gateway Auth] Token exchange failed:", data);
    return null;
  }
  return data;
}

async function fetchOaInfo(
  accessToken: string,
): Promise<{ oaId: string; oaName: string } | null> {
  try {
    const res = await fetch("https://openapi.zalo.me/v3.0/oa/getoa", {
      headers: { access_token: accessToken },
    });
    const data = (await res.json()) as any;
    if (data.error === 0 && data.data) {
      return { oaId: data.data.oa_id, oaName: data.data.name };
    }
  } catch (e) {
    console.warn("[Gateway Auth] Could not fetch OA info:", e);
  }
  return null;
}

async function deliverTokenToCenter(
  centerUrl: string,
  payload: {
    locationId: string;
    oaId: string;
    oaName: string;
    accessToken: string;
    refreshToken: string | undefined;
    expiresIn: number;
  },
): Promise<boolean> {
  const secret = process.env.ZALO_GATEWAY_SHARED_SECRET;
  if (!secret) {
    console.error("[Gateway Auth] ZALO_GATEWAY_SHARED_SECRET not set — cannot deliver token");
    return false;
  }

  const url = `${centerUrl}/api/zalo/receive-token`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Gateway Auth] deliver-token to ${url} failed (${res.status}):`, text);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Gateway Auth] deliver-token to ${url} threw:`, e);
    return false;
  }
}

export async function handleOAuthCallback(
  req: Request,
  res: Response,
): Promise<void> {
  const { code, state, error } = req.query;

  const errorRedirect = (msg: string, centerUrl?: string) => {
    const base = centerUrl || process.env.CENTER_PUBLIC_URL || process.env.CENTER_URL || "";
    if (!base) {
      res.status(500).send(`Gateway error: ${msg}`);
      return;
    }
    res.redirect(`${base}/settings?zalo_error=${encodeURIComponent(msg)}`);
  };

  if (error || !code || !state) {
    errorRedirect((error as string) || "Không nhận được authorization code từ Zalo");
    return;
  }

  // Bước 1: Verify HMAC state — phải hợp lệ mới xử lý tiếp
  const statePayload = verifySignedState(state as string);
  if (!statePayload) {
    errorRedirect("State không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.");
    return;
  }

  const { locationId, centerId, returnPath } = statePayload;

  // Bước 2: Lookup centerId trong DB — không tin centerUrl từ state để POST token
  const centerEntry = await lookupCenter(centerId);
  if (!centerEntry) {
    console.error(`[Gateway Auth] centerId "${centerId}" not found in center_registry or inactive`);
    errorRedirect(
      `Trung tâm "${centerId}" chưa được đăng ký với gateway. Liên hệ admin để đăng ký.`,
      statePayload.centerUrl, // dùng URL từ state chỉ để redirect lỗi về đúng trung tâm
    );
    return;
  }

  // centerUrl chính thức từ DB — đây mới là nơi gateway POST token
  const trustedCenterUrl = centerEntry.centerUrl;
  console.log(`[Gateway Auth] centerId="${centerId}" resolved to trustedUrl="${trustedCenterUrl}"`);

  // Bước 3: Exchange code → access token
  const tokenData = await exchangeCodeForToken(code as string);
  if (!tokenData) {
    errorRedirect("Lấy access token từ Zalo thất bại", trustedCenterUrl);
    return;
  }

  // Bước 4: Lấy thông tin OA
  const oaInfo = await fetchOaInfo(tokenData.access_token);
  if (!oaInfo) {
    errorRedirect("Không lấy được thông tin Zalo OA sau khi xác thực", trustedCenterUrl);
    return;
  }

  // Bước 5: Lưu routing oaId → center
  await upsertRoute(oaInfo.oaId, centerId, trustedCenterUrl);
  console.log(
    `[Gateway Auth] Routing saved: oa_id=${oaInfo.oaId} → centerId=${centerId} url=${trustedCenterUrl}`,
  );

  // Bước 6: Gửi token về center đã xác thực
  const delivered = await deliverTokenToCenter(trustedCenterUrl, {
    locationId,
    oaId: oaInfo.oaId,
    oaName: oaInfo.oaName,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in ?? 7200,
  });

  if (!delivered) {
    errorRedirect(
      "Kết nối Zalo OA thành công nhưng không thể gửi token về center. Vui lòng liên hệ admin.",
      trustedCenterUrl,
    );
    return;
  }

  res.redirect(`${trustedCenterUrl}${returnPath}?zalo_success=1`);
}
