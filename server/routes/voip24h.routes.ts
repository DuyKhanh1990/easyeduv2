import type { Express } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { locations, staff, staffAssignments, systemSettings, omicallLocationConfigs } from "@shared/schema";
import { decrypt, encrypt } from "../lib/encryption";
import { storage } from "../storage";
import {
  authenticateVoip24h,
  dialVoip24h,
  fetchVoip24hCallHistory,
  fetchVoip24hExtensionList,
  fetchVoip24hRecordingMetadata,
} from "../services/voip24h/voip24h.service";

const configKey = (locationId: string) => `voip24h:${locationId}`;
const extensionMapKey = (locationId: string) => `voip24h-extension-map:${locationId}`;
const sipPasswordMapKey = (locationId: string) => `voip24h-sip-password-map:${locationId}`;
const locationIdSchema = z.string().uuid();

const saveConfigSchema = z.object({
  locationId: locationIdSchema,
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  isLonglive: z.boolean().optional(),
  sipServerIp: z.string().trim().max(255).optional(),
});
const voipDialSchema = z.object({
  locationId: locationIdSchema,
  phone: z.string().trim().min(6).max(50),
  displayName: z.string().trim().max(255).optional(),
});

type SavedVoip24hConfig = {
  apiKey: string;
  apiSecret: string;
  isLonglive: boolean;
  sipServerIp: string;
  decryptionFailed?: boolean;
};

async function getSavedConfig(locationId: string): Promise<SavedVoip24hConfig | null> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, configKey(locationId)))
    .limit(1);
  if (!row) return null;

  try {
    const config = JSON.parse(decrypt(row.value)) as Partial<SavedVoip24hConfig>;
    if (typeof config.apiKey !== "string" || typeof config.apiSecret !== "string") {
      return { apiKey: "", apiSecret: "", isLonglive: true, sipServerIp: "", decryptionFailed: true };
    }
    return {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      isLonglive: typeof config.isLonglive === "boolean" ? config.isLonglive : true,
      sipServerIp: typeof config.sipServerIp === "string" ? config.sipServerIp.trim() : "",
    };
  } catch {
    return { apiKey: "", apiSecret: "", isLonglive: true, sipServerIp: "", decryptionFailed: true };
  }
}

async function getSavedExtensionMap(locationId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, extensionMapKey(locationId)))
    .limit(1);
  if (!row) return {};
  try {
    const parsed = JSON.parse(decrypt(row.value)) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed || {})
        .filter(([staffId, extension]) => z.string().uuid().safeParse(staffId).success && typeof extension === "string")
        .map(([staffId, extension]) => [staffId, String(extension).trim()]),
    );
  } catch {
    return {};
  }
}

async function getSavedSipPasswordMap(locationId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, sipPasswordMapKey(locationId)))
    .limit(1);
  if (!row) return {};
  try {
    const parsed = JSON.parse(decrypt(row.value)) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed || {})
        .filter(([staffId, password]) => z.string().uuid().safeParse(staffId).success && typeof password === "string")
        .map(([staffId, password]) => [staffId, String(password)]),
    );
  } catch {
    return {};
  }
}

function normalizeDialPhone(value: string): string {
  const stripped = value.replace(/[^\d+]/g, "");
  return stripped.startsWith("+")
    ? `+${stripped.slice(1).replace(/\+/g, "")}`
    : stripped.replace(/\+/g, "");
}

function maskCredential(value: string): string {
  if (!value) return "";
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function submittedOrSaved(value: string | undefined, savedValue: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "__USE_SAVED__" ? trimmed : savedValue;
}

async function locationExists(locationId: string): Promise<boolean> {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  return !!location;
}

function normalizeVoipTimestamp(value: unknown): number | null {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const localDateTime = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T00:00:00`
    : normalized;
  const timestamp = Date.parse(hasTimezone ? localDateTime : `${localDateTime}+07:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeVoipHistoryItem(
  item: Record<string, unknown>,
  locationId: string,
  locationName: string,
) {
  const callId = String(item.callid || item.id || "").trim();
  const rawType = String(item.type || "").toLowerCase();
  const direction = rawType.startsWith("in")
    ? "inbound"
    : rawType.startsWith("out")
      ? "outbound"
      : ["local", "internal"].includes(rawType)
        ? "local"
        : rawType || "unknown";
  const rawStatus = String(item.status || "").toLowerCase();
  const answerSeconds = Number(item.billsec || 0) || 0;
  const answered = answerSeconds > 0 || ["answered", "success", "up", "connected"].includes(rawStatus);
  const status = answered
    ? "answered"
    : /miss|cancel|fail|busy|no.?answer|not.?answer|timeout/.test(rawStatus)
      ? "missed"
      : "no-answer";
  const caller = String(item.caller || "");
  const callee = String(item.callee || "");
  const phoneNumber = direction === "inbound" ? caller : callee || caller;
  const startedAt = normalizeVoipTimestamp(item.calldate);
  const duration = Number(item.duration || 0) || 0;

  return {
    id: callId || `${locationId}-${startedAt || phoneNumber}`,
    callId,
    locationId,
    locationName,
    direction,
    status,
    disposition: String(item.status || ""),
    phoneNumber,
    customerName: "",
    agentName: "",
    sipUser: String(direction === "inbound" ? item.callee || item.extension || "" : item.extension || ""),
    sipNumber: String(item.did || ""),
    duration,
    answerSeconds,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    recordingUrl: callId
      ? `/api/call-center/voip24h/recording?locationId=${encodeURIComponent(locationId)}&callId=${encodeURIComponent(callId)}`
      : "",
    price: 0,
  };
}

function allowedMediaUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !(host === "voip24h.vn" || host.endsWith(".voip24h.vn"))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function fetchVoipMedia(url: URL, signal: AbortSignal): Promise<Response> {
  let currentUrl = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(currentUrl, { signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Không thể mở bản ghi âm từ VOIP24H.");
    const redirectedUrl = allowedMediaUrl(new URL(location, currentUrl).toString());
    if (!redirectedUrl) throw new Error("Đường dẫn bản ghi âm VOIP24H không hợp lệ.");
    currentUrl = redirectedUrl;
  }
  throw new Error("Không thể mở bản ghi âm từ VOIP24H.");
}

async function checkCallHistoryPermission(req: any): Promise<boolean> {
  if (req.isSuperAdmin) return true;
  if (!req.user?.id || req.isStudent) return false;
  const permissions = await storage.getEffectivePermissions(
    req.roleIds || [],
    "/#bao-cao/lich-su-cuoc-goi",
  );
  return permissions.canView || permissions.canViewAll;
}

export function registerVoip24hRoutes(app: Express) {
  app.get("/api/call-center/voip24h/config", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const parsedLocationId = locationIdSchema.safeParse(req.query.locationId);
    if (!parsedLocationId.success) return res.status(400).json({ message: "Cơ sở không hợp lệ" });

    try {
      const locationId = parsedLocationId.data;
      const saved = await getSavedConfig(locationId);
      return res.json({
        locationId,
        hasApiKey: !!saved?.apiKey,
        apiKeyMasked: maskCredential(saved?.apiKey || ""),
        hasApiSecret: !!saved?.apiSecret,
        apiSecretMasked: maskCredential(saved?.apiSecret || ""),
        isLonglive: saved?.isLonglive ?? true,
        sipServerIp: saved?.sipServerIp || "",
        decryptionFailed: saved?.decryptionFailed ?? false,
      });
    } catch (error: any) {
      console.error("[VoIP24H] Read config failed:", error?.message || error);
      return res.status(500).json({ message: "Không thể đọc cấu hình VoIP24H" });
    }
  });

  app.put("/api/call-center/voip24h/config", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const parsed = saveConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu cấu hình VoIP24H không hợp lệ" });

    try {
      const body = parsed.data;
      if (!await locationExists(body.locationId)) {
        return res.status(404).json({ message: "Không tìm thấy cơ sở đã chọn" });
      }

      const saved = await getSavedConfig(body.locationId);
      const apiKey = submittedOrSaved(body.apiKey, saved?.apiKey || "");
      const apiSecret = submittedOrSaved(body.apiSecret, saved?.apiSecret || "");
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ message: "Vui lòng nhập API Key và API Secret." });
      }

      const value = encrypt(JSON.stringify({
        apiKey,
        apiSecret,
        isLonglive: body.isLonglive ?? saved?.isLonglive ?? true,
        sipServerIp: body.sipServerIp?.trim() ?? saved?.sipServerIp ?? "",
      }));
      await db.insert(systemSettings)
        .values({ key: configKey(body.locationId), value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: new Date() },
        });

      return res.json({ ok: true, message: "Đã lưu cấu hình xác thực VoIP24H cho cơ sở." });
    } catch (error: any) {
      console.error("[VoIP24H] Save config failed:", error?.message || error);
      return res.status(500).json({ message: "Không thể lưu cấu hình VoIP24H" });
    }
  });

  app.get("/api/call-center/staff-provider-lines", async (req, res) => {
    const parsed = z.object({
      locationIds: z.string().min(1).max(4000),
      staffId: z.string().uuid().optional(),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Danh sách cơ sở không hợp lệ" });

    try {
      const locationIds = [...new Set(parsed.data.locationIds.split(",").filter(Boolean))];
      if (!locationIds.length || locationIds.some((id) => !locationIdSchema.safeParse(id).success)) {
        return res.status(400).json({ message: "Danh sách cơ sở không hợp lệ" });
      }
      const allowedLocationIds = new Set(req.allowedLocationIds || []);
      const scopedLocationIds = req.isSuperAdmin
        ? locationIds
        : locationIds.filter((id) => allowedLocationIds.has(id));
      if (!scopedLocationIds.length) return res.status(403).json({ message: "Bạn không có quyền truy cập các cơ sở đã chọn." });

      if (parsed.data.staffId && !req.isSuperAdmin) {
        const [accessibleAssignment] = await db.select({ id: staffAssignments.id })
          .from(staffAssignments)
          .where(and(
            eq(staffAssignments.staffId, parsed.data.staffId),
            inArray(staffAssignments.locationId, [...allowedLocationIds]),
          ))
          .limit(1);
        if (!accessibleAssignment) return res.status(403).json({ message: "Bạn không có quyền truy cập nhân sự này." });
      }

      const [locationRows, omicallRows] = await Promise.all([
        db.select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(inArray(locations.id, scopedLocationIds)),
        db.select({
          locationId: omicallLocationConfigs.locationId,
          isEnabled: omicallLocationConfigs.isEnabled,
          authUser: omicallLocationConfigs.authUser,
          sipRealm: omicallLocationConfigs.sipRealm,
          authKeyEncrypted: omicallLocationConfigs.authKeyEncrypted,
        })
          .from(omicallLocationConfigs)
          .where(inArray(omicallLocationConfigs.locationId, scopedLocationIds)),
      ]);
      const locationNameById = new Map(locationRows.map((row) => [row.id, row.name]));
      const omicallByLocation = new Map(omicallRows.map((row) => [row.locationId, row]));
      const [voipConfigEntries, extensionMapEntries, sipPasswordMapEntries] = await Promise.all([
        Promise.all(scopedLocationIds.map(async (locationId) => [locationId, await getSavedConfig(locationId)] as const)),
        parsed.data.staffId
          ? Promise.all(scopedLocationIds.map(async (locationId) => [locationId, await getSavedExtensionMap(locationId)] as const))
          : Promise.resolve([] as Array<readonly [string, Record<string, string>]>),
        parsed.data.staffId
          ? Promise.all(scopedLocationIds.map(async (locationId) => [locationId, await getSavedSipPasswordMap(locationId)] as const))
          : Promise.resolve([] as Array<readonly [string, Record<string, string>]>),
      ]);
      const voipConfigByLocation = new Map(voipConfigEntries);
      const extensionMapByLocation = new Map(extensionMapEntries);
      const sipPasswordMapByLocation = new Map(sipPasswordMapEntries);
      const providers: Array<{ locationId: string; locationName: string; provider: "omicall" | "voip24h" }> = [];
      const voip24hExtensions: Record<string, string> = {};
      const voip24hSipPasswordsConfigured: Record<string, boolean> = {};

      for (const locationId of scopedLocationIds) {
        const locationName = locationNameById.get(locationId) || "Cơ sở";
        const omicall = omicallByLocation.get(locationId);
        if (omicall?.isEnabled && omicall.authUser && omicall.sipRealm && omicall.authKeyEncrypted) {
          providers.push({ locationId, locationName, provider: "omicall" });
        }
        const voipConfig = voipConfigByLocation.get(locationId);
        if (voipConfig?.apiKey && voipConfig.apiSecret && !voipConfig.decryptionFailed) {
          providers.push({ locationId, locationName, provider: "voip24h" });
        }
        if (parsed.data.staffId) {
          voip24hExtensions[locationId] = extensionMapByLocation.get(locationId)?.[parsed.data.staffId] || "";
          voip24hSipPasswordsConfigured[locationId] = !!sipPasswordMapByLocation.get(locationId)?.[parsed.data.staffId];
        }
      }

      return res.json({ providers, voip24hExtensions, voip24hSipPasswordsConfigured });
    } catch (error: any) {
      console.error("[Call Center] Read staff provider lines failed:", error?.message || error);
      return res.status(500).json({ message: "Không thể đọc kết nối tổng đài của nhân sự" });
    }
  });

  app.post("/api/call-center/voip24h/extension-list", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được tải máy nhánh" });
    const parsed = locationIdSchema.safeParse(req.body?.locationId);
    if (!parsed.success) return res.status(400).json({ message: "Cơ sở không hợp lệ" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const locationId = parsed.data;
      const config = await getSavedConfig(locationId);
      if (!config?.apiKey || !config.apiSecret || config.decryptionFailed) {
        return res.status(400).json({ message: "Lưu API Key và API Secret trước khi tải danh sách máy nhánh." });
      }
      const extensions = await fetchVoip24hExtensionList({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        isLonglive: config.isLonglive,
      }, locationId, controller.signal);
      return res.json({ extensions });
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "VOIP24H không phản hồi trong 15 giây."
        : error?.message || "Không thể tải danh sách máy nhánh.";
      return res.status(502).json({ message });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post("/api/call-center/voip24h/test-connection", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const parsed = saveConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu kiểm tra VoIP24H không hợp lệ" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const body = parsed.data;
      const saved = await getSavedConfig(body.locationId);
      const apiKey = submittedOrSaved(body.apiKey, saved?.apiKey || "");
      const apiSecret = submittedOrSaved(body.apiSecret, saved?.apiSecret || "");
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ message: "Vui lòng nhập API Key và API Secret trước khi kiểm tra." });
      }

      const result = await authenticateVoip24h({
        apiKey,
        apiSecret,
        isLonglive: body.isLonglive ?? saved?.isLonglive ?? true,
      }, controller.signal);

      // Never return the provider's access token to the browser or write it to logs.
      return res.json({
        ok: true,
        message: "Xác thực VOIP24H thành công.",
        createAt: result.createAt,
        expiresAt: result.expiresAt,
        isLonglive: result.isLonglive,
      });
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "VOIP24H không phản hồi trong 15 giây."
        : error?.message || "Không thể xác thực với VOIP24H.";
      return res.status(502).json({ ok: false, message });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/call-center/voip24h/caller", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
    if (req.isStudent || !req.staffId) {
      return res.json({ available: false, locations: [], defaultLocationId: null });
    }

    try {
      const assignmentRows = await db
        .select({
          staffId: staff.id,
          locationId: staffAssignments.locationId,
          locationName: locations.name,
        })
        .from(staff)
        .innerJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .innerJoin(locations, eq(locations.id, staffAssignments.locationId))
        .where(and(
          eq(staff.userId, userId),
          eq(staff.id, req.staffId),
          eq(staff.status, "Hoạt động"),
        ));
      const uniqueLocations = new Map<string, typeof assignmentRows[number]>();
      assignmentRows
        .filter((row) => req.isSuperAdmin || (req.allowedLocationIds || []).includes(row.locationId))
        .forEach((row) => {
          if (!uniqueLocations.has(row.locationId)) uniqueLocations.set(row.locationId, row);
        });

      const readyLocations = (await Promise.all([...uniqueLocations.values()].map(async (row) => {
        try {
          const [config, mappings] = await Promise.all([
            getSavedConfig(row.locationId),
            getSavedExtensionMap(row.locationId),
          ]);
          const extension = mappings[row.staffId]?.trim();
          if (!config?.apiKey || !config.apiSecret || config.decryptionFailed || !extension) return null;
          return {
            provider: "voip24h" as const,
            locationId: row.locationId,
            locationName: row.locationName,
            extension,
            webRtcReady: Boolean(config.sipServerIp && (await getSavedSipPasswordMap(row.locationId))[row.staffId]),
            ready: true,
          };
        } catch (error: any) {
          console.warn("[VoIP24H] Skipping caller location:", error?.message || error);
          return null;
        }
      }))).filter((row): row is NonNullable<typeof row> => row !== null);

      return res.json({
        available: readyLocations.length > 0,
        locations: readyLocations,
        defaultLocationId: readyLocations[0]?.locationId || null,
      });
    } catch (error: any) {
      console.error("[VoIP24H] Caller lookup failed:", error?.message || error);
      return res.status(500).json({ message: "Không thể xác định máy nhánh VoIP24H của nhân viên." });
    }
  });

  app.post("/api/call-center/voip24h/webrtc-credentials", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
    if (req.isStudent || !req.staffId) {
      return res.status(403).json({ message: "Tài khoản này không được phép sử dụng máy nhánh VoIP24H." });
    }
    const parsed = locationIdSchema.safeParse(req.body?.locationId);
    if (!parsed.success) return res.status(400).json({ message: "Cơ sở không hợp lệ." });
    const locationId = parsed.data;
    if (!req.isSuperAdmin && !(req.allowedLocationIds || []).includes(locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền sử dụng máy nhánh tại cơ sở này." });
    }

    try {
      const [assignment] = await db
        .select({ id: staffAssignments.id })
        .from(staffAssignments)
        .innerJoin(staff, eq(staff.id, staffAssignments.staffId))
        .where(and(
          eq(staffAssignments.staffId, req.staffId),
          eq(staffAssignments.locationId, locationId),
          eq(staff.userId, userId),
          eq(staff.status, "Hoạt động"),
        ))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Bạn chưa được phân công tại cơ sở này." });

      const [config, extensions, sipPasswords] = await Promise.all([
        getSavedConfig(locationId),
        getSavedExtensionMap(locationId),
        getSavedSipPasswordMap(locationId),
      ]);
      const extension = extensions[req.staffId]?.trim() || "";
      const password = sipPasswords[req.staffId] || "";
      if (!config?.apiKey || !config.apiSecret || config.decryptionFailed) {
        return res.status(400).json({ message: "Cơ sở chưa có cấu hình xác thực VoIP24H hợp lệ." });
      }
      if (!config.sipServerIp || !extension || !password) {
        return res.status(400).json({ message: "Cần cấu hình IP máy chủ SIP, số máy lẻ và mật khẩu SIP trước khi kết nối WebRTC." });
      }

      return res.json({ sipServerIp: config.sipServerIp, extension, password });
    } catch (error: any) {
      console.error("[VoIP24H] WebRTC credentials lookup failed:", error?.message || error);
      return res.status(500).json({ message: "Không thể tải thông tin đăng nhập máy nhánh VoIP24H." });
    }
  });

  app.post("/api/call-center/voip24h/dial", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
    if (req.isStudent || !req.staffId) {
      return res.status(403).json({ message: "Tài khoản này không được phép gọi qua VoIP24H." });
    }

    const parsed = voipDialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Thông tin cuộc gọi không hợp lệ." });
    const { locationId } = parsed.data;
    const phone = normalizeDialPhone(parsed.data.phone);
    if (!/^\+?\d{6,20}$/.test(phone)) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ." });
    }
    if (!req.isSuperAdmin && !(req.allowedLocationIds || []).includes(locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền gọi qua cơ sở này." });
    }

    try {
      const [assignment] = await db
        .select({ id: staffAssignments.id })
        .from(staffAssignments)
        .innerJoin(staff, eq(staff.id, staffAssignments.staffId))
        .where(and(
          eq(staffAssignments.staffId, req.staffId),
          eq(staffAssignments.locationId, locationId),
          eq(staff.userId, userId),
          eq(staff.status, "Hoạt động"),
        ))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Bạn chưa được phân công tại cơ sở này." });

      const [config, mappings] = await Promise.all([
        getSavedConfig(locationId),
        getSavedExtensionMap(locationId),
      ]);
      const extension = mappings[req.staffId]?.trim();
      if (!config?.apiKey || !config.apiSecret || config.decryptionFailed) {
        return res.status(400).json({ message: "Cơ sở chưa có cấu hình xác thực VoIP24H hợp lệ." });
      }
      if (!extension) {
        return res.status(400).json({ message: "Nhân viên chưa được gán máy nhánh VoIP24H tại cơ sở này." });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const result = await dialVoip24h({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          isLonglive: config.isLonglive,
        }, locationId, { extension, phone }, controller.signal);
        return res.json({
          ok: true,
          message: "VoIP24H đã nhận yêu cầu gọi. Hãy nghe máy trên softphone hoặc điện thoại dùng máy nhánh này.",
          ...result,
          displayName: parsed.data.displayName || "",
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "VOIP24H không phản hồi trong 20 giây."
        : error?.message || "Không thể khởi tạo cuộc gọi VoIP24H.";
      return res.status(502).json({ message });
    }
  });

  app.get("/api/call-center/voip24h/call-history", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      if (!await checkCallHistoryPermission(req)) {
        return res.status(403).json({ message: "Bạn không có quyền xem lịch sử cuộc gọi" });
      }

      const requestedLocationId = String(req.query.locationId || "all");
      if (
        requestedLocationId !== "all" &&
        !locationIdSchema.safeParse(requestedLocationId).success
      ) {
        return res.status(400).json({ message: "Cơ sở không hợp lệ" });
      }
      if (
        requestedLocationId !== "all" &&
        !req.isSuperAdmin &&
        !(req.allowedLocationIds || []).includes(requestedLocationId)
      ) {
        return res.status(403).json({ message: "Bạn không có quyền xem lịch sử cuộc gọi tại cơ sở này" });
      }

      let locationIds: string[];
      if (requestedLocationId !== "all") {
        locationIds = [requestedLocationId];
      } else if (req.isSuperAdmin) {
        locationIds = [];
      } else {
        locationIds = [...new Set(req.allowedLocationIds || [])];
      }

      const settingRows = await db
        .select({ key: systemSettings.key })
        .from(systemSettings)
        .where(like(systemSettings.key, "voip24h:%"));
      const configuredIds = new Set(
        settingRows
          .map((row) => row.key.startsWith("voip24h:") ? row.key.slice("voip24h:".length) : "")
          .filter((id) => locationIdSchema.safeParse(id).success),
      );
      if (requestedLocationId === "all" && req.isSuperAdmin) {
        locationIds = [...configuredIds];
      } else {
        locationIds = locationIds.filter((id) => configuredIds.has(id));
      }
      if (requestedLocationId !== "all" && locationIds.length === 0) {
        return res.status(404).json({ message: "Cơ sở chưa có cấu hình VoIP24H." });
      }
      const noConfiguredLocations = locationIds.length === 0;

      const locationRows = locationIds.length
        ? await db.select({ id: locations.id, name: locations.name })
            .from(locations)
            .where(inArray(locations.id, locationIds))
        : [];
      const locationNames = new Map(locationRows.map((row) => [row.id, row.name]));

      const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
      const pageSize = Math.max(1, Math.min(200, Number(req.query.size) || 50));
      const offset = (page - 1) * pageSize;
      const dateStart = String(req.query.dateFrom || "").trim();
      const dateEnd = String(req.query.dateTo || "").trim();
      const direction = String(req.query.direction || "");
      const answerFilter = String(req.query.isAnswer || "");
      const search = String(req.query.search || "").trim().slice(0, 100);
      const baseFilters = {
        dateStart: /^\d{4}-\d{2}-\d{2}$/.test(dateStart) ? `${dateStart} 00:00:00` : dateStart || undefined,
        dateEnd: /^\d{4}-\d{2}-\d{2}$/.test(dateEnd) ? `${dateEnd} 23:59:59` : dateEnd || undefined,
        type: ["inbound", "outbound", "local"].includes(direction) ? direction : undefined,
        status: answerFilter === "answered" ? "ANSWERED" : undefined,
        offset,
        limit: pageSize,
      };

      const results = await Promise.allSettled(locationIds.map(async (locationId) => {
        const config = await getSavedConfig(locationId);
        if (!config?.apiKey || !config.apiSecret || config.decryptionFailed) {
          throw new Error("Cơ sở chưa lưu cấu hình xác thực VoIP24H hợp lệ.");
        }

        const searchFilters = !search
          ? [undefined]
          : direction === "inbound"
            ? [{ caller: search }]
            : direction === "outbound"
              ? [{ callee: search }]
              : direction === "local"
                ? [{ extension: search }]
                : [{ caller: search }, { callee: search }, { extension: search }];

        const histories = await Promise.all(searchFilters.map((searchFilter) =>
          fetchVoip24hCallHistory(
            {
              apiKey: config.apiKey,
              apiSecret: config.apiSecret,
              isLonglive: config.isLonglive,
            },
            locationId,
            { ...baseFilters, ...searchFilter },
            controller.signal,
          ),
        ));
        const uniqueItems = new Map<string, Record<string, unknown>>();
        histories.forEach((history) => history.items.forEach((item, index) => {
          const key = String(item.callid || item.id || `${locationId}-${offset}-${index}`);
          uniqueItems.set(key, item);
        }));
        return {
          locationId,
          locationName: locationNames.get(locationId) || "Không xác định",
          items: [...uniqueItems.values()].map((item) => normalizeVoipHistoryItem(item, locationId, locationNames.get(locationId) || "Không xác định")),
          totalItems: Math.max(0, ...histories.map((history) => history.totalItems)),
        };
      }));

      const warnings: string[] = noConfiguredLocations
        ? ["Chưa có cơ sở nào trong phạm vi của bạn được cấu hình VoIP24H."]
        : [];
      const successful = results.flatMap((result, index) => {
        if (result.status === "fulfilled") return [result.value];
        const locationId = locationIds[index];
        warnings.push(`${locationNames.get(locationId) || locationId}: ${result.reason?.message || "Không thể tải lịch sử cuộc gọi"}`);
        return [];
      });
      const items = successful
        .flatMap((result) => result.items)
        .filter((item) => answerFilter !== "missed" || item.status !== "answered")
        .sort((a, b) => (b.startedAt || b.createdAt || 0) - (a.startedAt || a.createdAt || 0))
        .slice(0, pageSize);
      const totalItems = successful.reduce((sum, result) => sum + result.totalItems, 0);
      const totalPages = Math.ceil(totalItems / pageSize);

      return res.json({
        items,
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        warnings,
      });
    } catch (error: any) {
      console.error("[VoIP24H] Call history failed:", error?.message || error);
      const message = error?.name === "AbortError"
        ? "VOIP24H không phản hồi trong 30 giây."
        : error?.message || "Không thể tải lịch sử cuộc gọi VoIP24H.";
      return res.status(502).json({ message });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/call-center/voip24h/recording", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
    const parsedLocationId = locationIdSchema.safeParse(req.query.locationId);
    const callId = String(req.query.callId || "").trim();
    if (!parsedLocationId.success || !callId || callId.length > 200) {
      return res.status(400).json({ message: "Thông tin cuộc gọi không hợp lệ" });
    }

    const locationId = parsedLocationId.data;
    if (!await checkCallHistoryPermission(req)) {
      return res.status(403).json({ message: "Bạn không có quyền nghe ghi âm cuộc gọi" });
    }
    if (!req.isSuperAdmin && !(req.allowedLocationIds || []).includes(locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền xem dữ liệu tại cơ sở này" });
    }

    const config = await getSavedConfig(locationId);
    if (!config?.apiKey || !config.apiSecret || config.decryptionFailed) {
      return res.status(404).json({ message: "Cơ sở chưa có cấu hình VoIP24H hợp lệ." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const media = await fetchVoip24hRecordingMetadata({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        isLonglive: config.isLonglive,
      }, locationId, callId, controller.signal);
      const candidates = [
        media.wav ? { format: "wav" as const, url: allowedMediaUrl(media.wav) } : null,
        media.ogg ? { format: "ogg" as const, url: allowedMediaUrl(media.ogg) } : null,
      ].filter((candidate): candidate is { format: "wav" | "ogg"; url: URL } => !!candidate?.url);
      if (candidates.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy bản ghi âm hợp lệ cho cuộc gọi này." });
      }

      let selectedFormat: "wav" | "ogg" | null = null;
      let upstream: Response | null = null;
      for (const candidate of candidates) {
        const response = await fetchVoipMedia(candidate.url, controller.signal);
        if (response.ok && response.body) {
          selectedFormat = candidate.format;
          upstream = response;
          break;
        }
        await response.body?.cancel().catch(() => undefined);
      }
      if (!upstream || !selectedFormat) {
        return res.status(502).json({ message: "Không thể tải bản ghi âm từ VOIP24H." });
      }
      res.setHeader("Content-Type", selectedFormat === "wav" ? "audio/wav" : "audio/ogg");
      res.setHeader("Content-Disposition", `inline; filename="voip24h-recording.${selectedFormat}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const contentLength = upstream.headers.get("content-length");
      if (contentLength && /^\d+$/.test(contentLength)) res.setHeader("Content-Length", contentLength);
      await pipeline(Readable.fromWeb(upstream.body as any), res);
    } catch (error: any) {
      if (res.headersSent) {
        res.destroy(error);
      } else {
        const message = error?.name === "AbortError"
          ? "Tải ghi âm quá thời gian cho phép."
          : error?.message || "Không thể tải ghi âm VOIP24H.";
        res.status(502).json({ message });
      }
    } finally {
      clearTimeout(timeout);
    }
  });
}
