import { createHash } from "node:crypto";
import { db, pool } from "../db";
import { zaloOaConfigs } from "@shared/schema";
import { eq, and, inArray, isNotNull, isNull } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";
import { withDatabaseMutationPermit } from "./database-mutation-permit.service";

const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // refresh khi còn < 30 phút
const LOCK_WAIT_TIMEOUT_MS = 15_000;
const LOCK_RETRY_INTERVAL_MS = 100;
const REFRESH_HTTP_TIMEOUT_MS = 20_000;

type ZaloOaConfig = typeof zaloOaConfigs.$inferSelect;
type RefreshState = "ready" | "pending" | "unknown" | "invalid";
type RefreshReason = "cron" | "manual" | "token_expired";

export type ZaloTokenRefreshResult =
  | { status: "refreshed" | "already_refreshed"; accessToken: string; tokenExpiredAt: Date | null }
  | { status: "temporary_failure"; retrySafe: boolean; message: string }
  | { status: "invalid_refresh_token"; message: string };

export interface RefreshZaloOaTokenInput {
  configId?: string;
  locationId?: string;
  reason: RefreshReason;
  /** Access token that produced the expired-token response; kept in memory and never logged. */
  accessTokenUsed?: string;
}

class CompareAndSetConflict extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readConfig(input: RefreshZaloOaTokenInput): Promise<ZaloOaConfig | null> {
  if (input.configId) {
    const [row] = await db.select().from(zaloOaConfigs)
      .where(eq(zaloOaConfigs.id, input.configId))
      .limit(1);
    return row ?? null;
  }
  if (input.locationId) {
    const rows = await db.select().from(zaloOaConfigs)
      .where(eq(zaloOaConfigs.locationId, input.locationId));
    if (input.accessTokenUsed) {
      const matchingRow = rows.find((row) => {
        if (!row.accessTokenEncrypted) return false;
        try {
          return decrypt(row.accessTokenEncrypted) === input.accessTokenUsed;
        } catch {
          return false;
        }
      });
      if (matchingRow) return matchingRow;
    }
    return rows[0] ?? null;
  }
  return null;
}

async function findRowsWithFingerprint(appId: string, fingerprint: string): Promise<ZaloOaConfig[]> {
  const rows = await db.select().from(zaloOaConfigs)
    .where(isNotNull(zaloOaConfigs.refreshTokenEncrypted));
  return rows.filter((row) => {
    if (!row.refreshTokenEncrypted) return false;
    if (row.appId && row.appId !== appId) return false;
    try {
      return tokenFingerprint(decrypt(row.refreshTokenEncrypted)) === fingerprint;
    } catch {
      return false;
    }
  });
}

function makeLockNames(appId: string, rows: ZaloOaConfig[], fingerprint: string): string[] {
  const names = new Set<string>();
  let hasOaId = false;
  for (const oaId of rows.map((row) => row.oaId).filter((value): value is string => Boolean(value))) {
    hasOaId = true;
    names.add(`easyedu:zalo-refresh:app:${appId}:oa:${oaId}`);
  }
  if (!hasOaId || rows.some((row) => !row.oaId)) {
    names.add(`easyedu:zalo-refresh:app:${appId}:token:${fingerprint}`);
  }
  return [...names].sort();
}

async function acquireRefreshLocks(
  names: string[],
): Promise<{ release: () => Promise<void> } | null> {
  const client = await pool.connect();
  const acquired: string[] = [];
  let released = false;

  const release = async () => {
    if (released) return;
    released = true;
    try {
      for (const name of [...acquired].reverse()) {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [name],
        ).catch(() => undefined);
      }
    } finally {
      client.release();
    }
  };

  try {
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    for (const name of names) {
      let locked = false;
      while (!locked && Date.now() < deadline) {
        const result = await client.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
          [name],
        );
        locked = Boolean(result.rows[0]?.locked);
        if (!locked) await sleep(LOCK_RETRY_INTERVAL_MS);
      }
      if (!locked) {
        await release();
        return null;
      }
      acquired.push(name);
    }
    return { release };
  } catch (error) {
    await release();
    throw error;
  }
}

function temporaryFailure(message: string, retrySafe: boolean): ZaloTokenRefreshResult {
  return { status: "temporary_failure", retrySafe, message };
}

function successFromConfig(
  config: ZaloOaConfig,
  status: "refreshed" | "already_refreshed",
): ZaloTokenRefreshResult {
  if (!config.accessTokenEncrypted) {
    return temporaryFailure("Không có access token hiện hành.", false);
  }
  try {
    return {
      status,
      accessToken: decrypt(config.accessTokenEncrypted),
      tokenExpiredAt: config.tokenExpiredAt,
    };
  } catch {
    return temporaryFailure("Không thể đọc access token hiện hành.", false);
  }
}

async function transitionGroup(
  rows: ZaloOaConfig[],
  allowedStates: RefreshState[],
  nextState: RefreshState,
  connected?: boolean,
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const changed = await tx.update(zaloOaConfigs).set({
          refreshState: nextState,
          ...(connected !== undefined ? { isConnected: connected } : {}),
          updatedAt: new Date(),
        }).where(and(
          eq(zaloOaConfigs.id, row.id),
          eq(zaloOaConfigs.refreshTokenEncrypted, row.refreshTokenEncrypted!),
          inArray(zaloOaConfigs.refreshState, allowedStates),
        )).returning({ id: zaloOaConfigs.id });
        if (changed.length !== 1) throw new CompareAndSetConflict();
      }
    });
    return true;
  } catch (error) {
    if (error instanceof CompareAndSetConflict) return false;
    throw error;
  }
}

function isExplicitInvalidRefreshToken(data: any): boolean {
  const description = [data?.error_name, data?.error_description, data?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /invalid[\s_-]+refresh[\s_-]+token/.test(description)
    || /refresh[\s_-]+token\s+(?:(?:is|has)\s+)?(?:invalid|expired|revoked|used)\b/.test(description)
    || /refresh[\s_-]+token\s+has\s+been\s+(?:revoked|used)\b/.test(description);
}

async function markUnknown(rows: ZaloOaConfig[]): Promise<boolean> {
  try {
    return await transitionGroup(rows, ["pending"], "unknown", false);
  } catch {
    // Pending is durable; the next lock holder converts it to unknown.
    return false;
  }
}

async function markInvalid(rows: ZaloOaConfig[]): Promise<boolean> {
  try {
    return await transitionGroup(rows, ["pending"], "invalid", false);
  } catch {
    return false;
  }
}

async function fetchOaIdentity(accessToken: string): Promise<{ oaId: string; oaName: string | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
      headers: { access_token: accessToken },
      signal: controller.signal,
    });
    const data = await response.json() as any;
    if (data.error === 0 && data.data?.oa_id) {
      return { oaId: String(data.data.oa_id), oaName: data.data.name || null };
    }
  } catch {
    // OA metadata lookup is best-effort; it must not invalidate a completed refresh.
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

export async function refreshZaloOaToken(
  input: RefreshZaloOaTokenInput,
): Promise<ZaloTokenRefreshResult> {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) {
    return temporaryFailure("Hệ thống chưa cấu hình Zalo OA.", true);
  }

  let initial: ZaloOaConfig | null;
  let initialRows: ZaloOaConfig[];
  let oldRefreshToken: string;
  let fingerprint: string;
  try {
    initial = await readConfig(input);
    if (!initial) return temporaryFailure("Không tìm thấy cấu hình Zalo OA.", false);
    if (!initial.refreshTokenEncrypted) {
      return temporaryFailure("Cấu hình không có refresh token.", false);
    }
    oldRefreshToken = decrypt(initial.refreshTokenEncrypted);
    fingerprint = tokenFingerprint(oldRefreshToken);
    initialRows = await findRowsWithFingerprint(appId, fingerprint);
    if (!initialRows.some((row) => row.id === initial!.id)) initialRows.push(initial);
  } catch {
    return temporaryFailure("Không thể đọc cấu hình refresh token.", true);
  }

  let locks: { release: () => Promise<void> } | null;
  try {
    locks = await acquireRefreshLocks(makeLockNames(appId, initialRows, fingerprint));
  } catch {
    return temporaryFailure("Không thể lấy khóa refresh.", true);
  }
  if (!locks) return temporaryFailure("Đang có request refresh khác; thử lại sau.", true);

  try {
    const current = await readConfig({ configId: initial.id, reason: input.reason });
    if (!current) return temporaryFailure("Cấu hình Zalo OA đã bị xóa.", false);
    if (!current.refreshTokenEncrypted) {
      return temporaryFailure("Cấu hình không có refresh token.", false);
    }

    if (current.refreshTokenEncrypted !== initial.refreshTokenEncrypted) {
      return successFromConfig(current, "already_refreshed");
    }

    const currentRefreshToken = decrypt(current.refreshTokenEncrypted);
    if (tokenFingerprint(currentRefreshToken) !== fingerprint) {
      return successFromConfig(current, "already_refreshed");
    }

    const rows = await findRowsWithFingerprint(appId, fingerprint);
    if (!rows.some((row) => row.id === current.id)) rows.push(current);
    const states = new Set(rows.map((row) => row.refreshState || "ready"));

    if (states.has("pending")) {
      await markUnknown(rows.filter((row) => (row.refreshState || "ready") === "pending"));
      return temporaryFailure("Refresh trước đó dừng giữa chừng; cần kết nối lại OA.", false);
    }
    if (states.has("invalid")) {
      return { status: "invalid_refresh_token", message: "Refresh token cần được kết nối lại." };
    }
    if (states.has("unknown")) {
      return temporaryFailure("Kết quả refresh trước đó không xác định; cần kết nối lại OA.", false);
    }

    if (input.accessTokenUsed && current.accessTokenEncrypted) {
      let currentAccessToken: string;
      try {
        currentAccessToken = decrypt(current.accessTokenEncrypted);
      } catch {
        return temporaryFailure("Không thể đọc access token hiện hành.", false);
      }
      if (currentAccessToken !== input.accessTokenUsed) {
        return successFromConfig(current, "already_refreshed");
      }
    }

    if (
      input.reason === "cron"
      && current.tokenExpiredAt
      && current.tokenExpiredAt.getTime() >= Date.now() + REFRESH_THRESHOLD_MS
    ) {
      return successFromConfig(current, "already_refreshed");
    }

    const pending = await transitionGroup(rows, ["ready"], "pending");
    if (!pending) {
      const latest = await readConfig({ configId: current.id, reason: input.reason });
      if (latest && latest.refreshTokenEncrypted !== current.refreshTokenEncrypted) {
        return successFromConfig(latest, "already_refreshed");
      }
      return temporaryFailure("Cấu hình đã thay đổi trước khi refresh.", false);
    }

    let response: Response;
    let data: any;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFRESH_HTTP_TIMEOUT_MS);
    try {
      response = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          secret_key: appSecret,
        },
        body: new URLSearchParams({
          refresh_token: oldRefreshToken,
          app_id: appId,
          grant_type: "refresh_token",
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      data = JSON.parse(body);
    } catch {
      await markUnknown(rows);
      return temporaryFailure("Không xác định được Zalo đã xử lý refresh hay chưa.", false);
    } finally {
      clearTimeout(timeout);
    }

    const providerError = !response.ok
      || (data?.error !== undefined && Number(data.error) !== 0)
      || typeof data?.access_token !== "string"
      || typeof data?.refresh_token !== "string"
      || !data.refresh_token;
    if (providerError) {
      if (isExplicitInvalidRefreshToken(data)) {
        const marked = await markInvalid(rows);
        if (!marked) {
          const latest = await readConfig({ configId: current.id, reason: input.reason });
          if (latest && latest.refreshTokenEncrypted !== current.refreshTokenEncrypted) {
            return successFromConfig(latest, "already_refreshed");
          }
        }
        return { status: "invalid_refresh_token", message: "Refresh token không hợp lệ; cần kết nối lại OA." };
      }
      await markUnknown(rows);
      return temporaryFailure("Zalo trả về kết quả refresh không xác định; không dùng lại token cũ.", false);
    }

    const expiresInValue = Number(data.expires_in ?? data.expire_in);
    const expiresIn = Number.isFinite(expiresInValue) && expiresInValue > 0 ? expiresInValue : 7200;
    const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);
    const accessTokenEncrypted = encrypt(data.access_token);
    const refreshTokenEncrypted = encrypt(data.refresh_token);

    let discoveredIdentity: { oaId: string; oaName: string | null } | null = null;
    if (rows.some((row) => !row.oaId)) {
      discoveredIdentity = await fetchOaIdentity(data.access_token);
    }

    try {
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const changed = await tx.update(zaloOaConfigs).set({
            accessTokenEncrypted,
            refreshTokenEncrypted,
            tokenExpiredAt,
            isConnected: true,
            refreshState: "ready",
            ...(discoveredIdentity && !row.oaId
              ? { oaId: discoveredIdentity.oaId, oaName: discoveredIdentity.oaName }
              : {}),
            updatedAt: new Date(),
          }).where(and(
            eq(zaloOaConfigs.id, row.id),
            eq(zaloOaConfigs.refreshTokenEncrypted, row.refreshTokenEncrypted!),
            eq(zaloOaConfigs.refreshState, "pending"),
          )).returning({ id: zaloOaConfigs.id });
          if (changed.length !== 1) throw new CompareAndSetConflict();
        }
      });
    } catch (error) {
      if (error instanceof CompareAndSetConflict) {
        const latest = await readConfig({ configId: current.id, reason: input.reason });
        if (latest && latest.refreshTokenEncrypted !== current.refreshTokenEncrypted) {
          return successFromConfig(latest, "already_refreshed");
        }
        return temporaryFailure("Cấu hình đã đổi trong lúc lưu kết quả refresh.", false);
      }
      await markUnknown(rows);
      return temporaryFailure("Zalo đã cấp token nhưng không thể lưu kết quả; cần kết nối lại OA.", false);
    }

    return {
      status: "refreshed",
      accessToken: data.access_token,
      tokenExpiredAt,
    };
  } catch {
    return temporaryFailure("Không thể hoàn tất refresh token.", false);
  } finally {
    await locks.release();
  }
}

async function executeZaloTokenRefresh(): Promise<void> {
  try {
    const all = await db.select().from(zaloOaConfigs).where(
      and(
        isNotNull(zaloOaConfigs.refreshTokenEncrypted),
        isNotNull(zaloOaConfigs.tokenExpiredAt),
      )
    );

    const thresholdTime = new Date(Date.now() + REFRESH_THRESHOLD_MS);
    const toRefresh = all.filter(c =>
      c.tokenExpiredAt
      && c.tokenExpiredAt < thresholdTime
      && (c.refreshState || "ready") === "ready"
    );

    if (toRefresh.length === 0) return;

    const uniqueConfigs = new Map<string, ZaloOaConfig>();
    for (const config of toRefresh) {
      if (!config.refreshTokenEncrypted) continue;
      try {
        const fingerprint = tokenFingerprint(decrypt(config.refreshTokenEncrypted));
        const key = `${config.appId || process.env.ZALO_APP_ID || ""}:${fingerprint}`;
        if (!uniqueConfigs.has(key)) uniqueConfigs.set(key, config);
      } catch {
        console.warn(`[ZaloTokenRefresh] Không thể đọc refresh token cho configId=${config.id}`);
      }
    }

    console.log(`[ZaloTokenRefresh] Cần refresh ${uniqueConfigs.size} token fingerprint(s)...`);
    await Promise.all([...uniqueConfigs.values()].map(async (config) => {
      const result = await refreshZaloOaToken({ configId: config.id, reason: "cron" });
      if (result.status === "temporary_failure") {
        console.warn(`[ZaloTokenRefresh] Refresh tạm dừng cho configId=${config.id}; retrySafe=${result.retrySafe}`);
      } else if (result.status === "invalid_refresh_token") {
        console.warn(`[ZaloTokenRefresh] Refresh token không hợp lệ cho configId=${config.id}`);
      }
    }));
  } catch (err) {
    console.error("[ZaloTokenRefresh] Lỗi cron job:", err);
  }
}

export async function runZaloTokenRefresh(): Promise<void> {
  await withDatabaseMutationPermit(executeZaloTokenRefresh);
}

export function startZaloTokenRefreshCron(): void {
  runZaloTokenRefresh();
  setInterval(runZaloTokenRefresh, 60 * 60 * 1000); // mỗi 1 giờ
  console.log("[ZaloTokenRefresh] Cron job đã khởi động (interval: 1 giờ)");
}

// Khi khởi động: tự động điền oaId cho các config đang thiếu
async function executeHealNullOaIds(): Promise<void> {
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

export async function healNullOaIds(): Promise<void> {
  await withDatabaseMutationPermit(executeHealNullOaIds);
}
