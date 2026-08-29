import type { Express } from "express";
import { db } from "../db";
import {
  locations,
  omicallLocationConfigs,
  staff,
  staffAssignments,
  studentLocations,
  students,
} from "@shared/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { decrypt, encrypt } from "../lib/encryption";
import {
  getOmicallConfig,
  OMICALL_DEFAULT_AUTO_CALL_URL,
  clickToCall,
  fetchOmicallCallHistory,
  testOmicallConnection,
} from "../services/omicall/omicall.service";
const DEFAULT_SERVICE_NAME = "omicall";

const configInputSchema = z.object({
  locationId: z.string().uuid(),
  serviceName: z.string().trim().min(1).max(100).optional(),
  authUser: z.string().trim().max(255).optional(),
  sipRealm: z.string().trim().max(255).optional(),
  authKey: z.string().optional(),
  hotline: z.string().trim().max(50).optional(),
  callHistoryUrl: z.string().trim().optional(),
  autoCallUrl: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, apiKey.length - 4))}${apiKey.slice(-4)}`;
}

function validateUrl(value: string, label: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} phải bắt đầu bằng http:// hoặc https://`);
  }
  return trimmed.replace(/\/+$/, "");
}

function validateOptionalUrl(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value.trim() === "") return value === undefined ? undefined : "";
  return validateUrl(value, label);
}

function parseHistoryDate(value: unknown, endOfDay = false): number | null {
  if (!value) return null;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(text);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeHistoryTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function normalizeOmicallHistoryItem(
  item: Record<string, unknown>,
  locationId: string,
  locationName: string,
) {
  const customer = item.customer && typeof item.customer === "object"
    ? item.customer as Record<string, unknown>
    : {};
  const creator = item.create_by && typeof item.create_by === "object"
    ? item.create_by as Record<string, unknown>
    : {};
  const firstUser = Array.isArray(item.user) && item.user[0] && typeof item.user[0] === "object"
    ? item.user[0] as Record<string, unknown>
    : {};
  const answerSeconds = Number(item.answer_sec ?? item.bill_sec ?? 0) || 0;
  const disposition = String(item.disposition || item.state || "").toLowerCase();
  const answered = Boolean(
    item.time_answer_start ||
    answerSeconds > 0 ||
    disposition === "answered" ||
    disposition === "connected",
  );
  const status = answered
    ? "answered"
    : disposition.includes("cancel") || disposition.includes("miss") || disposition.includes("fail")
      ? "missed"
      : "no-answer";

  return {
    id: String(
      item.transaction_id ||
      item.call_uuid ||
      `${locationId}-${item.created_date || item.phone_number || item.destination_number || "call"}`,
    ),
    locationId,
    locationName,
    direction: String(item.direction || "unknown"),
    status,
    disposition: String(item.disposition || item.hangup_cause || ""),
    phoneNumber: String(item.phone_number || item.destination_number || item.to_number || item.from_number || ""),
    customerName: String(customer.full_name || customer.name || ""),
    agentName: String(creator.name || firstUser.full_name || item.sip_user || ""),
    sipUser: String(item.sip_user || ""),
    sipNumber: String(item.sip_number || item.source_number || item.hotline || ""),
    duration: Number(item.duration ?? item.bill_sec ?? 0) || 0,
    answerSeconds,
    startedAt: normalizeHistoryTimestamp(item.time_start_call || item.time_ringing_start || item.created_date),
    endedAt: normalizeHistoryTimestamp(item.time_end_call),
    createdAt: normalizeHistoryTimestamp(item.created_date),
    recordingUrl: String(item.recording_file_url || item.recording_file || ""),
    price: Number(item.call_out_price || 0) || 0,
  };
}

function normalizePhone(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function normalizeExtension(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

/**
 * Resolve display names from Easy Edu's own Customers and Staff data.
 * Omicall remains the source for call events only; its customer/create_by
 * labels are intentionally not used as the authoritative names here.
 */
async function enrichHistoryNames(
  items: Array<ReturnType<typeof normalizeOmicallHistoryItem>>,
) {
  const phoneKeys = [...new Set(items.map((item) => normalizePhone(item.phoneNumber)).filter(Boolean))];
  const extensionKeys = [...new Set(items.map((item) => normalizeExtension(item.sipUser)).filter(Boolean))];

  const [customerRows, staffRows] = await Promise.all([
    phoneKeys.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: students.id,
            fullName: students.fullName,
            phone: students.phone,
            parentPhone: students.parentPhone,
            parentPhone2: students.parentPhone2,
            parentPhone3: students.parentPhone3,
            locationId: studentLocations.locationId,
          })
          .from(students)
          .leftJoin(studentLocations, eq(studentLocations.studentId, students.id))
          .where(or(
            sql`regexp_replace(coalesce(${students.phone}, ''), '[^0-9]', '', 'g') in (${sql.join(phoneKeys.map((value) => sql`${value}`), sql`, `)})`,
            sql`regexp_replace(coalesce(${students.parentPhone}, ''), '[^0-9]', '', 'g') in (${sql.join(phoneKeys.map((value) => sql`${value}`), sql`, `)})`,
            sql`regexp_replace(coalesce(${students.parentPhone2}, ''), '[^0-9]', '', 'g') in (${sql.join(phoneKeys.map((value) => sql`${value}`), sql`, `)})`,
            sql`regexp_replace(coalesce(${students.parentPhone3}, ''), '[^0-9]', '', 'g') in (${sql.join(phoneKeys.map((value) => sql`${value}`), sql`, `)})`,
          )),
    extensionKeys.length === 0
      ? Promise.resolve([])
      : db
          .select({
            fullName: staff.fullName,
            extension: staffAssignments.omicallExtension,
            locationId: staffAssignments.locationId,
          })
          .from(staffAssignments)
          .innerJoin(staff, eq(staff.id, staffAssignments.staffId))
          .where(sql`lower(trim(${staffAssignments.omicallExtension})) in (${sql.join(extensionKeys.map((value) => sql`${value}`), sql`, `)})`),
  ]);

  const customerByPhoneAndLocation = new Map<string, string>();
  const customerByPhone = new Map<string, string>();
  for (const row of customerRows) {
    const phones = [row.phone, row.parentPhone, row.parentPhone2, row.parentPhone3]
      .map(normalizePhone)
      .filter(Boolean);
    for (const phone of phones) {
      if (!customerByPhone.has(phone)) customerByPhone.set(phone, row.fullName);
      if (row.locationId) {
        const key = `${row.locationId}:${phone}`;
        if (!customerByPhoneAndLocation.has(key)) customerByPhoneAndLocation.set(key, row.fullName);
      }
    }
  }

  const staffByExtensionAndLocation = new Map<string, string>();
  const staffByExtension = new Map<string, string>();
  for (const row of staffRows) {
    const extension = normalizeExtension(row.extension);
    if (!extension) continue;
    if (!staffByExtension.has(extension)) staffByExtension.set(extension, row.fullName);
    if (row.locationId) {
      const key = `${row.locationId}:${extension}`;
      if (!staffByExtensionAndLocation.has(key)) staffByExtensionAndLocation.set(key, row.fullName);
    }
  }

  return items.map((item) => {
    const phone = normalizePhone(item.phoneNumber);
    const extension = normalizeExtension(item.sipUser);
    return {
      ...item,
      customerName: customerByPhoneAndLocation.get(`${item.locationId}:${phone}`)
        || customerByPhone.get(phone)
        || "",
      agentName: staffByExtensionAndLocation.get(`${item.locationId}:${extension}`)
        || staffByExtension.get(extension)
        || "",
    };
  });
}

async function upsertConfig(values: {
  locationId: string;
  serviceName: string;
  authUser: string;
  sipRealm: string;
  authKeyEncrypted: string | null;
  hotline: string;
  callHistoryUrl: string;
  autoCallUrl: string;
  isEnabled: boolean;
}) {
  await db
    .insert(omicallLocationConfigs)
    .values(values)
    .onConflictDoUpdate({
      target: omicallLocationConfigs.locationId,
      set: {
        serviceName: values.serviceName,
        authUser: values.authUser,
        sipRealm: values.sipRealm,
        authKeyEncrypted: values.authKeyEncrypted,
        hotline: values.hotline,
        callHistoryUrl: values.callHistoryUrl,
        autoCallUrl: values.autoCallUrl,
        isEnabled: values.isEnabled,
        updatedAt: new Date(),
      },
    });
}

export function registerOmicallRoutes(app: Express) {
  app.get("/api/call-center/omicall/config", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });

    const locationId = String(req.query.locationId || "");
    if (!z.string().uuid().safeParse(locationId).success) {
      return res.status(400).json({ message: "Thiếu hoặc sai locationId" });
    }

    try {
      const [row, config] = await Promise.all([
        db
          .select({
            authKeyEncrypted: omicallLocationConfigs.authKeyEncrypted,
          })
          .from(omicallLocationConfigs)
          .where(eq(omicallLocationConfigs.locationId, locationId))
          .limit(1),
        getOmicallConfig(locationId),
      ]);

      return res.json({
        provider: "omicall",
        locationId,
        serviceName: config.serviceName,
        authUser: config.authUser,
        sipRealm: config.sipRealm,
        hotline: config.hotline,
        callHistoryUrl: config.callHistoryUrl,
        autoCallUrl: config.autoCallUrl || OMICALL_DEFAULT_AUTO_CALL_URL,
        hasAuthKey: Boolean(row[0]?.authKeyEncrypted),
        authKeyMasked: maskApiKey(config.authKey),
        authKeyDecryptionFailed: config.authKeyDecryptionFailed,
        isActive: config.isActive,
      });
    } catch (error: any) {
      console.error("[Omicall] GET config error:", error);
      return res.status(500).json({ message: error?.message || "Không thể đọc cấu hình Omicall" });
    }
  });

  app.put("/api/call-center/omicall/config", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });

    const parsed = configInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dữ liệu cấu hình Omicall không hợp lệ" });
    }

    try {
      const body = parsed.data;
      const [existing] = await db
        .select()
        .from(omicallLocationConfigs)
        .where(eq(omicallLocationConfigs.locationId, body.locationId))
        .limit(1);

      const callHistoryUrl = body.callHistoryUrl !== undefined
        ? validateOptionalUrl(body.callHistoryUrl, "Call History URL") || ""
        : existing?.callHistoryUrl || "";
      const autoCallUrl = body.autoCallUrl !== undefined
        ? validateOptionalUrl(body.autoCallUrl, "Auto Call URL") || ""
        : existing?.autoCallUrl || OMICALL_DEFAULT_AUTO_CALL_URL;
      const hotline = body.hotline !== undefined
        ? body.hotline.trim()
        : existing?.hotline || "";
      const authKeyEncrypted = body.authKey && body.authKey !== "__USE_SAVED__"
        ? encrypt(body.authKey.trim())
        : existing?.authKeyEncrypted || null;

      await upsertConfig({
        locationId: body.locationId,
        serviceName: body.serviceName || existing?.serviceName || DEFAULT_SERVICE_NAME,
        authUser: body.authUser !== undefined ? body.authUser.trim() : existing?.authUser || "",
        sipRealm: body.sipRealm !== undefined ? body.sipRealm.trim() : existing?.sipRealm || "",
        authKeyEncrypted,
        hotline,
        callHistoryUrl,
        autoCallUrl,
        isEnabled: body.isActive ?? existing?.isEnabled ?? false,
      });

      return res.json({ ok: true, message: "Đã lưu cấu hình Omicall cho cơ sở" });
    } catch (error: any) {
      console.error("[Omicall] PUT config error:", error);
      return res.status(400).json({ message: error?.message || "Không thể lưu cấu hình Omicall" });
    }
  });

  app.post("/api/call-center/omicall/test-connection", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });

    const parsed = configInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu kiểm tra không hợp lệ" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const body = parsed.data;
      const saved = await getOmicallConfig(body.locationId);
      const config = {
        ...saved,
        serviceName: body.serviceName || saved.serviceName,
        authUser: body.authUser !== undefined ? body.authUser.trim() : saved.authUser,
        sipRealm: body.sipRealm !== undefined ? body.sipRealm.trim() : saved.sipRealm,
        authKey: body.authKey && body.authKey !== "__USE_SAVED__" ? body.authKey.trim() : saved.authKey,
        hotline: body.hotline !== undefined ? body.hotline.trim() : saved.hotline,
        callHistoryUrl: body.callHistoryUrl !== undefined
          ? validateOptionalUrl(body.callHistoryUrl, "Call History URL") || ""
          : saved.callHistoryUrl,
        autoCallUrl: body.autoCallUrl !== undefined
          ? validateOptionalUrl(body.autoCallUrl, "Auto Call URL") || ""
          : saved.autoCallUrl,
      };

      await testOmicallConnection(config, controller.signal);
      return res.json({
        ok: true,
        message: "Kết nối Omicall thành công: API Key hợp lệ và Call History V3 đã phản hồi.",
      });
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "Omicall không phản hồi trong 15 giây"
        : error?.message || "Không thể kết nối Omicall";
      return res.status(502).json({ ok: false, message });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/call-center/omicall/call-history", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });

    const requestedLocationId = String(req.query.locationId || "all");
    if (
      requestedLocationId !== "all" &&
      !z.string().uuid().safeParse(requestedLocationId).success
    ) {
      return res.status(400).json({ message: "Sai locationId" });
    }
    if (
      requestedLocationId !== "all" &&
      !req.isSuperAdmin &&
      !(req.allowedLocationIds || []).includes(requestedLocationId)
    ) {
      return res.status(403).json({ message: "Bạn không có quyền xem lịch sử cuộc gọi tại cơ sở này" });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const fromDate = parseHistoryDate(req.query.dateFrom, false) ?? defaultFrom;
    const toDate = parseHistoryDate(req.query.dateTo, true) ?? defaultTo;
    if (fromDate > toDate) {
      return res.status(400).json({ message: "Khoảng thời gian không hợp lệ" });
    }
    if (toDate - fromDate > 93 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Omicall chỉ cho phép tra cứu tối đa 3 tháng mỗi lần" });
    }

    const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
    const size = Math.max(1, Math.min(50, Number(req.query.size) || 50));
    const direction = String(req.query.direction || "");
    const isAnswerParam = String(req.query.isAnswer || "");
    const keyword = String(req.query.search || "").trim();
    const isAnswer = isAnswerParam === "answered"
      ? true
      : isAnswerParam === "missed"
        ? false
        : undefined;

    try {
      let locationIds: string[];
      if (requestedLocationId !== "all") {
        locationIds = [requestedLocationId];
      } else if (req.isSuperAdmin) {
        const configured = await db
          .select({ locationId: omicallLocationConfigs.locationId })
          .from(omicallLocationConfigs)
          .where(eq(omicallLocationConfigs.isEnabled, true));
        locationIds = configured.map((row) => row.locationId);
      } else {
        locationIds = [...new Set(req.allowedLocationIds || [])];
      }

      if (locationIds.length === 0) {
        return res.json({
          items: [],
          page,
          pageSize: size,
          totalItems: 0,
          totalPages: 0,
          hasNext: false,
          warnings: [],
        });
      }

      const locationRows = await db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(inArray(locations.id, locationIds));
      const locationNames = new Map(locationRows.map((row) => [row.id, row.name]));

      const results = await Promise.allSettled(locationIds.map(async (locationId) => {
        const config = await getOmicallConfig(locationId);
        if (!config.isActive || !config.authKey || (!config.autoCallUrl && !config.callHistoryUrl)) {
          throw new Error("Cơ sở chưa cấu hình đầy đủ Call History Omicall");
        }
        const history = await fetchOmicallCallHistory(config, {
          page,
          size,
          fromDate,
          toDate,
          keyword: keyword.length >= 3 ? keyword : undefined,
          direction: ["outbound", "inbound", "local"].includes(direction)
            ? direction as "outbound" | "inbound" | "local"
            : undefined,
          isAnswer,
        });
        return {
          locationId,
          locationName: locationNames.get(locationId) || "Không xác định",
          history,
        };
      }));

      const warnings: string[] = [];
      const successful = results.flatMap((result, index) => {
        if (result.status === "fulfilled") return [result.value];
        const locationId = locationIds[index];
        const locationName = locationNames.get(locationId) || locationId;
        warnings.push(`${locationName}: ${result.reason?.message || "Không thể tải lịch sử cuộc gọi"}`);
        return [];
      });

      const rawItems = successful
        .flatMap(({ locationId, locationName, history }) =>
          history.items.map((item) => normalizeOmicallHistoryItem(item, locationId, locationName)),
        )
        .sort((a, b) => (b.startedAt || b.createdAt || 0) - (a.startedAt || a.createdAt || 0));
      const items = await enrichHistoryNames(rawItems);
      const totalItems = successful.reduce((sum, value) => sum + value.history.totalItems, 0);
      const totalPages = Math.ceil(totalItems / size);

      return res.json({
        items,
        page,
        pageSize: size,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        warnings,
      });
    } catch (error: any) {
      console.error("[Omicall] Call history error:", error);
      return res.status(502).json({
        message: error?.message || "Không thể tải lịch sử cuộc gọi Omicall",
      });
    }
  });

  app.get("/api/call-center/omicall/phone-owner", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });

    const phone = String(req.query.phone || "").replace(/\D/g, "");
    if (phone.length < 9) return res.json({ customers: [], staff: [] });

    try {
      const [customerRows, staffRows] = await Promise.all([
        db
          .select({
            id: students.id,
            fullName: students.fullName,
            code: students.code,
            phone: students.phone,
            locationId: studentLocations.locationId,
          })
          .from(students)
          .leftJoin(studentLocations, eq(studentLocations.studentId, students.id))
          .where(or(
            sql`regexp_replace(coalesce(${students.phone}, ''), '[^0-9]', '', 'g') = ${phone}`,
            sql`regexp_replace(coalesce(${students.parentPhone}, ''), '[^0-9]', '', 'g') = ${phone}`,
            sql`regexp_replace(coalesce(${students.parentPhone2}, ''), '[^0-9]', '', 'g') = ${phone}`,
            sql`regexp_replace(coalesce(${students.parentPhone3}, ''), '[^0-9]', '', 'g') = ${phone}`,
          ))
          .limit(20),
        db
          .select({
            id: staff.id,
            fullName: staff.fullName,
            code: staff.code,
            phone: staff.phone,
            locationId: staffAssignments.locationId,
            extension: staffAssignments.omicallExtension,
          })
          .from(staff)
          .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
          .where(sql`regexp_replace(coalesce(${staff.phone}, ''), '[^0-9]', '', 'g') = ${phone}`)
          .limit(20),
      ]);

      return res.json({
        customers: customerRows.map((row) => ({
          id: row.id,
          name: row.fullName,
          code: row.code,
          phone: row.phone,
          locationId: row.locationId,
        })),
        staff: staffRows.map((row) => ({
          id: row.id,
          name: row.fullName,
          code: row.code,
          phone: row.phone,
          locationId: row.locationId,
          extension: row.extension,
        })),
      });
    } catch (error: any) {
      console.error("[Omicall] Phone owner lookup error:", error);
      return res.status(500).json({ message: "Không thể tra cứu số điện thoại" });
    }
  });

  app.get("/api/call-center/omicall/caller", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });

    try {
      const rows = await db
        .select({
          staffId: staff.id,
          locationId: staffAssignments.locationId,
          locationName: locations.name,
          extension: staffAssignments.omicallExtension,
          passwordEncrypted: staffAssignments.omicallPasswordEncrypted,
        })
        .from(staff)
        .innerJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .innerJoin(locations, eq(locations.id, staffAssignments.locationId))
        .where(eq(staff.userId, userId));

      const uniqueRows = rows.filter((row, index, all) =>
        all.findIndex((candidate) => candidate.locationId === row.locationId) === index,
      );
      const callerLocations = (await Promise.all(
        uniqueRows
          .filter((row) => Boolean(row.extension?.trim()))
          .map(async (row) => {
            try {
              const config = await getOmicallConfig(row.locationId);
              return {
                locationId: row.locationId,
                locationName: row.locationName,
                extension: row.extension || "",
                hotline: config.hotline,
                ready: Boolean(
                  config.isActive &&
                  config.authKey &&
                  config.autoCallUrl &&
                  config.hotline &&
                  config.sipRealm &&
                  row.extension &&
                  row.passwordEncrypted,
                ),
              };
            } catch (error: any) {
              // A broken config at one location must not hide valid callers
              // at another location assigned to the same staff member.
              console.warn(
                `[Omicall] Skipping caller location ${row.locationId}:`,
                error?.message || error,
              );
              return null;
            }
          }),
      )).filter((row): row is NonNullable<typeof row> => row !== null);
      const readyLocations = callerLocations.filter((row) => row.ready);

      return res.json({
        available: readyLocations.length > 0,
        locations: readyLocations,
        defaultLocationId: readyLocations[0]?.locationId || null,
      });
    } catch (error: any) {
      console.error("[Omicall] Caller lookup error:", error);
      return res.status(500).json({ message: error?.message || "Không thể đọc cấu hình gọi Omicall" });
    }
  });

  app.get("/api/call-center/omicall/sdk-credentials", async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });

    const locationId = String(req.query.locationId || "");
    if (!z.string().uuid().safeParse(locationId).success) {
      return res.status(400).json({ message: "Thiếu hoặc sai locationId" });
    }
    if (!req.isSuperAdmin && !(req.allowedLocationIds || []).includes(locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền dùng Omicall tại cơ sở này" });
    }

    try {
      const [assignment] = await db
        .select({
          extension: staffAssignments.omicallExtension,
          passwordEncrypted: staffAssignments.omicallPasswordEncrypted,
        })
        .from(staff)
        .innerJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .where(and(
          eq(staff.userId, userId),
          eq(staffAssignments.locationId, locationId),
        ))
        .limit(1);

      if (!assignment?.extension) {
        return res.status(400).json({ message: "Nhân sự chưa được cấu hình máy lẻ Omicall tại cơ sở này" });
      }
      if (!assignment.passwordEncrypted) {
        return res.status(400).json({ message: "Chưa lưu mật khẩu máy lẻ Omicall cho nhân sự này" });
      }

      const config = await getOmicallConfig(locationId);
      if (!config.isActive) return res.status(400).json({ message: "Omicall chưa được bật cho cơ sở này" });
      if (!config.sipRealm) return res.status(400).json({ message: "Chưa cấu hình SIP Realm/Domain Omicall cho cơ sở này" });
      if (!config.hotline) return res.status(400).json({ message: "Chưa cấu hình Hotline gọi ra cho cơ sở này" });

      let sipPassword: string;
      try {
        sipPassword = decrypt(assignment.passwordEncrypted);
      } catch {
        return res.status(400).json({ message: "Mật khẩu máy lẻ Omicall đã lưu không thể giải mã" });
      }

      return res.json({
        locationId,
        sipRealm: config.sipRealm,
        sipUser: assignment.extension.trim(),
        sipPassword,
        sipNumber: config.hotline,
      });
    } catch (error: any) {
      console.error("[Omicall] SDK credentials error:", error);
      return res.status(500).json({ message: error?.message || "Không thể chuẩn bị Web SDK Omicall" });
    }
  });

  app.post("/api/call-center/omicall/click-to-call", async (req, res) => {
    const parsed = z.object({
      locationId: z.string().uuid(),
      phoneNumber: z.string().trim().min(3).max(50),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Số điện thoại hoặc cơ sở không hợp lệ" });

    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
    if (!req.isSuperAdmin && !(req.allowedLocationIds || []).includes(parsed.data.locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền gọi từ cơ sở này" });
    }

    const phoneNumber = parsed.data.phoneNumber.replace(/[^\d+]/g, "");
    if (!/^\+?\d{7,15}$/.test(phoneNumber)) {
      return res.status(400).json({ message: "Số điện thoại phải có từ 7 đến 15 chữ số" });
    }

    try {
      const [assignment] = await db
        .select({
          extension: staffAssignments.omicallExtension,
        })
        .from(staff)
        .innerJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .where(and(
          eq(staff.userId, userId),
          eq(staffAssignments.locationId, parsed.data.locationId),
        ))
        .limit(1);

      if (!assignment?.extension) {
        return res.status(400).json({ message: "Nhân sự chưa được nhập đầu số nội bộ Omicall tại cơ sở này" });
      }

      const config = await getOmicallConfig(parsed.data.locationId);
      if (!config.isActive) return res.status(400).json({ message: "Omicall chưa được bật cho cơ sở này" });
      if (!config.hotline) return res.status(400).json({ message: "Chưa cấu hình Hotline gọi ra cho cơ sở này" });

      await clickToCall(config, assignment.extension, config.hotline, phoneNumber);
      return res.json({ ok: true, message: `Đã yêu cầu Omicall gọi ${phoneNumber}` });
    } catch (error: any) {
      console.error("[Omicall] Click-to-call error:", error);
      return res.status(error?.name === "AbortError" ? 504 : 502).json({
        message: error?.name === "AbortError" ? "Omicall không phản hồi" : error?.message || "Không thể thực hiện cuộc gọi",
      });
    }
  });
}