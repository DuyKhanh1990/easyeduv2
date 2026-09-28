import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Fix TIMESTAMP WITHOUT TIMEZONE: pg driver reads these as local strings.
// Append 'Z' so JavaScript Date always treats them as UTC regardless of server locale.
pg.types.setTypeParser(1114, (val: string) => new Date(val + "Z"));

// APP_DATABASE_URL takes priority over DATABASE_URL because Replit injects
// its own internal DATABASE_URL (helium) into the workflow environment,
// which would override the user's secret if we used DATABASE_URL directly.
const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "APP_DATABASE_URL must be set. Please add your database URL as the APP_DATABASE_URL secret.",
  );
}

// Keep each app process within a predictable database connection budget. Requests
// queue in pg Pool under load rather than opening an unbounded number of clients.
// Set APP_DB_POOL_MAX (1-20) to match the shared database budget and replica count.
const requestedPoolMax = Number(process.env.APP_DB_POOL_MAX);
const poolMax = Number.isInteger(requestedPoolMax) && requestedPoolMax >= 1 && requestedPoolMax <= 20
  ? requestedPoolMax
  : 8;

export const pool = new Pool({
  connectionString,
  max: poolMax,
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// ── 1. Pool-level error handler ───────────────────────────────────────────────
// Bắt lỗi từ idle clients (connection dropped bởi server/firewall/NAT).
// Không có handler này, lỗi sẽ bubble lên thành unhandled exception và crash.
pool.on("error", (err: Error) => {
  console.warn("[DB Pool] Idle client error (connection dropped):", err.message);
  // Không throw — pool tự loại bỏ client lỗi và tạo connection mới khi cần.
});

// ── 2. Log pool config at startup ─────────────────────────────────────────────
console.log(
  `[DB Pool] Config: max=${pool.options.max} min=${pool.options.min ?? 0}` +
  ` idleTimeoutMillis=${pool.options.idleTimeoutMillis}` +
  ` connectionTimeoutMillis=${pool.options.connectionTimeoutMillis}` +
  ` keepAlive=${(pool.options as any).keepAlive}`,
);

// ── 3. Monitor pool state every 30 s ─────────────────────────────────────────
setInterval(() => {
  console.log(
    `[DB Pool] active=${pool.totalCount - pool.idleCount}` +
    ` idle=${pool.idleCount}` +
    ` waiting=${pool.waitingCount}` +
    ` total=${pool.totalCount}`,
  );
}, 30_000).unref();

// ── 4. Retry wrapper on pool.connect — exponential backoff ───────────────────
// Khi connection timeout hoặc ECONNRESET, thử lại tối đa 2 lần.
// Áp dụng cho cả Drizzle queries và raw pool.query.
const _originalConnect = pool.connect.bind(pool);
(pool as any).connect = async function (...args: unknown[]) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await (_originalConnect as (...a: unknown[]) => Promise<unknown>)(...args);
    } catch (err: any) {
      const isRetryable =
        err?.message?.includes("Connection terminated") ||
        err?.message?.includes("timeout") ||
        err?.code === "ECONNRESET" ||
        err?.code === "ECONNREFUSED";
      if (isRetryable && attempt < 2) {
        lastErr = err;
        const delay = 200 * Math.pow(2, attempt); // 200 ms → 400 ms
        console.warn(
          `[DB Pool] Retryable error — retry ${attempt + 1}/2 after ${delay}ms: ${err.message}`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

export const db = drizzle(pool, { schema });
