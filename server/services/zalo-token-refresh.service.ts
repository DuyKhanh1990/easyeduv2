import { db } from "../db";
import { zaloOaConfigs } from "@shared/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";

const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // refresh khi còn < 30 phút

const RETRY_DELAYS_MS = [0, 2000, 4000]; // 3 attempts: ngay lập tức, 2s, 4s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptRefresh(refreshToken: string, appId: string, appSecret: string): Promise<any> {
  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "secret_key": appSecret,
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      app_id: appId,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json() as any;
  if (data.error || !data.access_token) {
    throw Object.assign(new Error(`Zalo API error: ${data.message || JSON.stringify(data)}`), { zaloError: data.error });
  }
  return data;
}

async function refreshOneToken(config: typeof zaloOaConfigs.$inferSelect): Promise<void> {
  if (!config.refreshTokenEncrypted) return;

  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) {
    console.warn("[ZaloTokenRefresh] ZALO_APP_ID hoặc ZALO_APP_SECRET chưa được cấu hình");
    return;
  }

  const refreshToken = decrypt(config.refreshTokenEncrypted);
  let lastError: Error | null = null;

  // Retry với exponential backoff: 0s → 2s → 4s
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      console.warn(`[ZaloTokenRefresh] Retry lần ${attempt}/${RETRY_DELAYS_MS.length - 1} (locationId=${config.locationId})`);
    }

    try {
      const data = await attemptRefresh(refreshToken, appId, appSecret);

      const accessTokenEncrypted = encrypt(data.access_token);
      const newRefreshTokenEncrypted = data.refresh_token ? encrypt(data.refresh_token) : config.refreshTokenEncrypted;
      const expiresIn = data.expires_in ? parseInt(data.expires_in) : 7200;
      const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);

      // Nếu config chưa có oaId, thử fetch từ Zalo API để tự động lưu lại
      let oaId = config.oaId;
      let oaName = config.oaName;
      if (!oaId) {
        try {
          const oaRes = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
            headers: { "access_token": data.access_token },
          });
          const oaData = await oaRes.json() as any;
          if (oaData.error === 0 && oaData.data?.oa_id) {
            oaId = String(oaData.data.oa_id);
            oaName = oaData.data.name || null;
            console.log(`[ZaloTokenRefresh] Đã fetch oaId=${oaId} oaName=${oaName} (locationId=${config.locationId})`);
          }
        } catch (e) {
          console.warn(`[ZaloTokenRefresh] Không thể fetch oaId (locationId=${config.locationId}):`, e);
        }
      }

      await db.update(zaloOaConfigs).set({
        accessTokenEncrypted,
        refreshTokenEncrypted: newRefreshTokenEncrypted,
        tokenExpiredAt,
        isConnected: true,
        ...(oaId ? { oaId, oaName } : {}),
        updatedAt: new Date(),
      }).where(eq(zaloOaConfigs.id, config.id));

      console.log(`[ZaloTokenRefresh] Token đã refresh (locationId=${config.locationId}), hết hạn lúc ${tokenExpiredAt.toISOString()}`);
      return; // thành công — thoát
    } catch (err: any) {
      lastError = err;
      console.error(`[ZaloTokenRefresh] Attempt ${attempt + 1} thất bại (locationId=${config.locationId}):`, err.message);
    }
  }

  // Tất cả retry đều thất bại — đánh dấu isConnected=false
  console.error(`[ZaloTokenRefresh] Tất cả ${RETRY_DELAYS_MS.length} lần thử đều thất bại (locationId=${config.locationId}). Đánh dấu isConnected=false.`, lastError);
  await db.update(zaloOaConfigs).set({
    isConnected: false,
    updatedAt: new Date(),
  }).where(eq(zaloOaConfigs.id, config.id));
}

export async function runZaloTokenRefresh(): Promise<void> {
  try {
    const all = await db.select().from(zaloOaConfigs).where(
      and(
        isNotNull(zaloOaConfigs.refreshTokenEncrypted),
        isNotNull(zaloOaConfigs.tokenExpiredAt),
      )
    );

    const thresholdTime = new Date(Date.now() + REFRESH_THRESHOLD_MS);
    const toRefresh = all.filter(c => c.tokenExpiredAt && c.tokenExpiredAt < thresholdTime);

    if (toRefresh.length === 0) return;

    console.log(`[ZaloTokenRefresh] Cần refresh ${toRefresh.length} token(s)...`);
    await Promise.all(toRefresh.map(refreshOneToken));
  } catch (err) {
    console.error("[ZaloTokenRefresh] Lỗi cron job:", err);
  }
}

export function startZaloTokenRefreshCron(): void {
  runZaloTokenRefresh();
  setInterval(runZaloTokenRefresh, 60 * 60 * 1000); // mỗi 1 giờ
  console.log("[ZaloTokenRefresh] Cron job đã khởi động (interval: 1 giờ)");
}

// Khi khởi động: tự động điền oaId cho các config đang thiếu
export async function healNullOaIds(): Promise<void> {
  try {
    const nullConfigs = await db.select().from(zaloOaConfigs).where(isNull(zaloOaConfigs.oaId));
    if (nullConfigs.length === 0) return;
    console.log(`[ZaloOA Heal] ${nullConfigs.length} config đang thiếu oaId, bắt đầu probe...`);
    for (const config of nullConfigs) {
      if (!config.accessTokenEncrypted) continue;
      try {
        const token = decrypt(config.accessTokenEncrypted);
        const res = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
          headers: { "access_token": token },
        });
        const data = await res.json() as any;
        if (data.error === 0 && data.data?.oa_id) {
          const oaId = String(data.data.oa_id);
          const oaName = data.data.name || null;
          await db.update(zaloOaConfigs).set({ oaId, oaName, updatedAt: new Date() }).where(eq(zaloOaConfigs.id, config.id));
          console.log(`[ZaloOA Heal] Config ${config.id} (locationId=${config.locationId}) → oaId=${oaId} oaName=${oaName}`);
        } else {
          console.warn(`[ZaloOA Heal] Config ${config.id} (locationId=${config.locationId}): Zalo API error ${data.error} ${data.message}`);
        }
      } catch (e) {
        console.warn(`[ZaloOA Heal] Config ${config.id} exception:`, e);
      }
    }
  } catch (e) {
    console.error("[ZaloOA Heal] Lỗi khi heal null oaIds:", e);
  }
}
