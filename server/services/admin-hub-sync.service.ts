import { db } from "../db";
import { decrypt, encrypt } from "../lib/encryption";
import {
  adminHubConnections,
  classes,
  roles,
  staff,
  staffAssignments,
  students,
  systemSettings,
  users,
} from "@shared/schema";
import { and, desc, eq, inArray, ne, notExists, sql } from "drizzle-orm";

const CLAIM_TIMEOUT_MS = 20_000;
const SYNC_TIMEOUT_MS = 30_000;
const DEFAULT_SNAPSHOT_PATH = "/api/v1/usage/snapshot";

export type AdminHubMetrics = {
  students: { total: number; active: number };
  parents: { total: number; active: number };
  staff: { active: number; limit: number | null };
  classes: { active: number };
  storage: {
    usedBytes: number;
    limitBytes: number;
    s3UsedBytes: number;
    databaseUsedBytes: number;
  };
};

export type AdminHubSnapshot = {
  schemaVersion: 1;
  source: "easyedu";
  generatedAt: string;
  metrics: AdminHubMetrics;
};

type ClaimResponse = {
  success?: boolean;
  status?: string;
  centerCode?: string;
  domain?: string;
  connectionId?: string;
  connection_id?: string;
  token?: string;
  authToken?: string;
  connectionToken?: string;
  credential?: string;
  message?: string;
  error?: string;
};

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function inferSnapshotUrl(claimUrl: string): string {
  const parsed = new URL(claimUrl);
  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/connections\/claim$/i.test(path)) {
    parsed.pathname = path.replace(/\/connections\/claim$/i, "/usage/snapshot");
    parsed.search = "";
    parsed.hash = "";
    return normalizeUrl(parsed.toString());
  }
  return `${normalizeUrl(parsed.toString())}${DEFAULT_SNAPSHOT_PATH}`;
}

function validateHttpUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${label} không hợp lệ.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} phải bắt đầu bằng http:// hoặc https://.`);
  }
  return normalizeUrl(parsed.toString());
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ response: Response; body: ClaimResponse }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: ClaimResponse = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function responseError(response: Response, body: ClaimResponse): Error {
  return new Error(
    body.message ||
    body.error ||
    `Admin Hub trả về HTTP ${response.status}.`,
  );
}

export async function getAdminHubConnection() {
  const [connection] = await db
    .select({
      id: adminHubConnections.id,
      apiUrl: adminHubConnections.apiUrl,
      snapshotUrl: adminHubConnections.snapshotUrl,
      connectionId: adminHubConnections.connectionId,
      centerCode: adminHubConnections.centerCode,
      isActive: adminHubConnections.isActive,
      lastSyncAt: adminHubConnections.lastSyncAt,
      lastSyncStatus: adminHubConnections.lastSyncStatus,
      lastSyncError: adminHubConnections.lastSyncError,
      updatedAt: adminHubConnections.updatedAt,
    })
    .from(adminHubConnections)
    .where(eq(adminHubConnections.isActive, true))
    .orderBy(desc(adminHubConnections.updatedAt))
    .limit(1);

  return connection ?? null;
}

export async function claimAdminHubConnection(params: {
  apiUrl: string;
  snapshotUrl?: string;
  code: string;
}) {
  const apiUrl = validateHttpUrl(params.apiUrl, "URL API Admin Hub");
  const snapshotUrl = params.snapshotUrl?.trim()
    ? validateHttpUrl(params.snapshotUrl, "URL API nhận snapshot")
    : inferSnapshotUrl(apiUrl);
  const code = params.code.trim();
  if (!code) throw new Error("Mã kết nối không được để trống.");

  const { response, body } = await fetchJson(
    apiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code }),
    },
    CLAIM_TIMEOUT_MS,
  );

  if (!response.ok || body.success === false) {
    throw responseError(response, body);
  }

  const connectionId = body.connectionId || body.connection_id;
  if (!connectionId) {
    throw new Error("Admin Hub phản hồi thành công nhưng thiếu connectionId.");
  }

  const authToken = body.authToken || body.connectionToken || body.token || body.credential;
  await db
    .update(adminHubConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(adminHubConnections.isActive, true));

  const [connection] = await db
    .insert(adminHubConnections)
    .values({
      apiUrl,
      snapshotUrl,
      connectionId,
      centerCode: body.centerCode ?? null,
      authTokenEncrypted: authToken ? encrypt(authToken) : null,
      isActive: true,
      lastSyncStatus: "never",
    })
    .returning({
      id: adminHubConnections.id,
      apiUrl: adminHubConnections.apiUrl,
      snapshotUrl: adminHubConnections.snapshotUrl,
      connectionId: adminHubConnections.connectionId,
      centerCode: adminHubConnections.centerCode,
      isActive: adminHubConnections.isActive,
      lastSyncAt: adminHubConnections.lastSyncAt,
      lastSyncStatus: adminHubConnections.lastSyncStatus,
      lastSyncError: adminHubConnections.lastSyncError,
      updatedAt: adminHubConnections.updatedAt,
    });

  return { connection, adminHubStatus: body.status ?? "connected" };
}

async function getStorageMetrics(): Promise<AdminHubMetrics["storage"]> {
  const [quotaRow] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "storageQuotaGb"))
    .limit(1);
  const [s3Row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "s3UsedBytes"))
    .limit(1);
  const databaseResult = await db.execute(sql.raw(`
    SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(tablename))), 0)::bigint AS total_bytes
    FROM pg_tables
    WHERE schemaname = 'public'
  `));

  const s3UsedBytes = Number.parseInt(s3Row?.value ?? "0", 10) || 0;
  const databaseUsedBytes = Number((databaseResult as any).rows?.[0]?.total_bytes ?? 0);
  const quotaGb = Number.parseFloat(quotaRow?.value ?? "10") || 10;
  const limitBytes = Math.round(quotaGb * 1024 * 1024 * 1024);

  return {
    usedBytes: s3UsedBytes + databaseUsedBytes,
    limitBytes,
    s3UsedBytes,
    databaseUsedBytes,
  };
}

async function getStaffMetrics(): Promise<AdminHubMetrics["staff"]> {
  const [limitRow] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "staffLimit"))
    .limit(1);
  const activeRows = await db
    .select({ id: staff.id })
    .from(staff)
    .innerJoin(users, eq(staff.userId, users.id))
    .where(
      and(
        eq(staff.status, "Hoạt động"),
        eq(users.isActive, true),
        ne(users.username, "admin"),
        notExists(
          db
            .select({ id: staffAssignments.id })
            .from(staffAssignments)
            .innerJoin(roles, eq(staffAssignments.roleId, roles.id))
            .where(
              and(
                eq(staffAssignments.staffId, staff.id),
                inArray(roles.name, ["Học viên", "Phụ huynh"]),
              ),
            ),
        ),
      ),
    );

  const configuredLimit = limitRow ? Number.parseInt(limitRow.value, 10) : 10;
  return {
    active: activeRows.length,
    limit: Number.isFinite(configuredLimit) ? configuredLimit : 10,
  };
}

export async function buildAdminHubSnapshot(): Promise<AdminHubSnapshot> {
  const [studentRows, [activeClassCount], staffMetrics, storage] = await Promise.all([
    db
      .select({
        type: students.type,
        accountStatus: students.accountStatus,
        count: sql<number>`count(*)`,
      })
      .from(students)
      .groupBy(students.type, students.accountStatus),
    db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.status, "active")),
    getStaffMetrics(),
    getStorageMetrics(),
  ]);

  const countType = (type: string, activeOnly = false) =>
    studentRows
      .filter((row) => row.type === type && (!activeOnly || row.accountStatus === "Hoạt động"))
      .reduce((sum, row) => sum + Number(row.count), 0);

  return {
    schemaVersion: 1,
    source: "easyedu",
    generatedAt: new Date().toISOString(),
    metrics: {
      students: { total: countType("Học viên"), active: countType("Học viên", true) },
      parents: { total: countType("Phụ huynh"), active: countType("Phụ huynh", true) },
      staff: staffMetrics,
      classes: { active: Number(activeClassCount.count) },
      storage,
    },
  };
}

export async function syncAdminHubSnapshot() {
  const connection = await db
    .select()
    .from(adminHubConnections)
    .where(eq(adminHubConnections.isActive, true))
    .orderBy(desc(adminHubConnections.updatedAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!connection) throw new Error("Chưa có kết nối Admin Hub hoạt động.");

  const snapshot = await buildAdminHubSnapshot();
  const payload = {
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
    generatedAt: snapshot.generatedAt,
    connectionId: connection.connectionId,
    centerCode: connection.centerCode,
    tenant: {
      connectionId: connection.connectionId,
      centerCode: connection.centerCode,
    },
    usage: snapshot.metrics,
    metrics: snapshot.metrics,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Admin-Hub-Connection-Id": connection.connectionId,
  };
  if (connection.authTokenEncrypted) {
    headers.Authorization = `Bearer ${decrypt(connection.authTokenEncrypted)}`;
  }

  try {
    const { response, body } = await fetchJson(
      connection.snapshotUrl,
      { method: "POST", headers, body: JSON.stringify(payload) },
      SYNC_TIMEOUT_MS,
    );
    if (!response.ok || body.success === false) throw responseError(response, body);

    await db
      .update(adminHubConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(adminHubConnections.id, connection.id));

    return { connectionId: connection.connectionId, snapshot, response: body };
  } catch (error: any) {
    const message = error?.name === "AbortError"
      ? "Admin Hub không phản hồi trong thời gian cho phép."
      : String(error?.message || error);
    await db
      .update(adminHubConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
        lastSyncError: message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(adminHubConnections.id, connection.id));
    throw new Error(message);
  }
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startAdminHubSyncScheduler(): void {
  if (syncTimer) return;
  const enabled = process.env.ADMIN_HUB_AUTO_SYNC !== "false";
  if (!enabled) {
    console.log("[AdminHub] Auto sync đang tắt bằng ADMIN_HUB_AUTO_SYNC=false");
    return;
  }
  const intervalMinutes = Math.max(
    15,
    Number.parseInt(process.env.ADMIN_HUB_SYNC_INTERVAL_MINUTES || "360", 10) || 360,
  );
  syncTimer = setInterval(() => {
    syncAdminHubSnapshot()
      .then(() => console.log("[AdminHub] Đã đồng bộ snapshot tự động"))
      .catch((error) => {
        if (!String(error?.message || error).includes("Chưa có kết nối")) {
          console.warn("[AdminHub] Auto sync thất bại:", error?.message || error);
        }
      });
  }, intervalMinutes * 60 * 1000);
  syncTimer.unref();
  console.log(`[AdminHub] Auto sync đã khởi động (interval: ${intervalMinutes} phút)`);
}