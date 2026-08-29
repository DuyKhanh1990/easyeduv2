import type { Express } from "express";
import { db } from "../db";
import { systemSettings, bidvLocationConfigs, bidvVirtualAccounts, invoices, invoicePaymentSchedule } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { encrypt, decrypt } from "../services/crypto.service";
import { fetchOAuthToken } from "../services/bidv/bidv.service";
import { validateCertificatePem, validatePrivateKeyPem, validatePrivateKeyUsable } from "../services/bidv/bidv-crypto.service";
import { ensureVirtualAccount, ensureInvoiceVirtualAccount, ensureScheduleVirtualAccount, getVirtualAccountByStudentId } from "../services/bidv/bidv-virtual-account.service";
import { buildBidvQrUrl } from "../services/bidv/bidv-vietqr.service";
import { handleGetBill, handlePayBill } from "../services/bidv/bidv-request-handler.service";

const ENCRYPTED_SYS_KEYS = ["client_secret", "symmetric_key", "private_key"];
const ALL_SYS_KEYS = [
  "environment", "client_id", "client_secret", "symmetric_key",
  "public_cert", "private_key", "timeout", "retry_count", "token_buffer", "notes",
];

const ENCRYPTED_LOC_KEYS = ["merchant_id", "secret_code"];

function sysSetting(key: string) {
  return `bidv.${key}`;
}

async function getSysSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith("bidv.")) {
      const k = row.key.slice(5);
      result[k] = row.value;
    }
  }
  return result;
}

async function upsertSysSetting(key: string, value: string) {
  const fullKey = sysSetting(key);
  await db
    .insert(systemSettings)
    .values({ key: fullKey, value })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
}

function maskSensitive(value: string): string {
  if (!value || value.length < 8) return "****";
  return "****" + value.slice(-4);
}

function decryptAndMask(value: string | undefined): string {
  if (!value) return "";
  try {
    return maskSensitive(decrypt(value));
  } catch {
    return "****";
  }
}

// ─── Admin routes: system settings, location config, virtual account, test ────
// Dùng chung cho mọi instance (gateway và trung tâm).
export function registerBidvAdminRoutes(app: Express) {

  // ─── Super Admin: GET system settings ─────────────────────────────────────
  app.get("/api/system-settings/bidv", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    try {
      const raw = await getSysSettings();
      const result: Record<string, any> = {
        environment: raw["environment"] || "UAT",
        clientId: raw["client_id"] || "",
        providerId: raw["provider_id"] || "",
        hasClientSecret: !!raw["client_secret"],
        clientSecretMasked: decryptAndMask(raw["client_secret"]),
        hasSymmetricKey: !!raw["symmetric_key"],
        symmetricKeyMasked: decryptAndMask(raw["symmetric_key"]),
        publicCert: raw["public_cert"] || "",
        bidvResponseCert: raw["bidv_response_cert"] || "",
        hasPrivateKey: !!raw["private_key"],
        privateKeyMasked: decryptAndMask(raw["private_key"]),
        timeout: raw["timeout"] || "30",
        retryCount: raw["retry_count"] || "3",
        tokenBuffer: raw["token_buffer"] || "300",
        notes: raw["notes"] || "",
      };
      return res.json(result);
    } catch (err: any) {
      console.error("[BIDV] GET system settings error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy cấu hình" });
    }
  });

  // Secrets are never returned by the normal settings GET. A Super Admin can
  // explicitly reveal one value after pressing the eye button in the UI.
  app.post("/api/system-settings/bidv/reveal", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const parsed = z.object({
      key: z.enum(["client_secret", "symmetric_key", "private_key"]),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Trường cần xem không hợp lệ" });
    try {
      const raw = await getSysSettings();
      const value = raw[parsed.data.key];
      if (!value) return res.status(404).json({ message: "Chưa có giá trị được lưu" });
      return res.json({ value: decrypt(value) });
    } catch (err: any) {
      console.error("[BIDV] reveal system setting error:", err);
      return res.status(500).json({ message: "Không thể hiển thị giá trị đã lưu" });
    }
  });

  // ─── Super Admin: PUT system settings ─────────────────────────────────────
  app.put("/api/system-settings/bidv", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });

    const schema = z.object({
      environment: z.enum(["UAT", "Production"]).optional(),
      clientId: z.string().optional(),
        providerId: z.string().max(3).optional(),
      clientSecret: z.string().optional(),
      symmetricKey: z.string().optional(),
      publicCert: z.string().optional(),
      bidvResponseCert: z.string().optional(),
      privateKey: z.string().optional(),
      timeout: z.string().optional(),
      retryCount: z.string().optional(),
      tokenBuffer: z.string().optional(),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    const body = parsed.data;

    try {
      const existing = await getSysSettings();

      const toSave: Array<[string, string]> = [];

      if (body.environment !== undefined) toSave.push(["environment", body.environment]);
      if (body.clientId !== undefined) toSave.push(["client_id", body.clientId]);
      if (body.providerId !== undefined) toSave.push(["provider_id", body.providerId]);
      if (body.publicCert !== undefined) toSave.push(["public_cert", body.publicCert]);
      if (body.bidvResponseCert !== undefined) toSave.push(["bidv_response_cert", body.bidvResponseCert]);
      if (body.timeout !== undefined) toSave.push(["timeout", body.timeout]);
      if (body.retryCount !== undefined) toSave.push(["retry_count", body.retryCount]);
      if (body.tokenBuffer !== undefined) toSave.push(["token_buffer", body.tokenBuffer]);
      if (body.notes !== undefined) toSave.push(["notes", body.notes]);

      // Encrypted fields — only update if new value provided
      if (body.clientSecret && body.clientSecret !== "__USE_SAVED__") {
        toSave.push(["client_secret", encrypt(body.clientSecret)]);
      } else if (!body.clientSecret && !existing["client_secret"]) {
        // field absent and no existing — skip
      }

      if (body.symmetricKey && body.symmetricKey !== "__USE_SAVED__") {
        toSave.push(["symmetric_key", encrypt(body.symmetricKey)]);
      }

      if (body.privateKey && body.privateKey !== "__USE_SAVED__") {
        toSave.push(["private_key", encrypt(body.privateKey)]);
      }

      for (const [key, value] of toSave) {
        await upsertSysSetting(key, value);
      }

      return res.json({ ok: true, message: "Đã lưu cấu hình hệ thống BIDV" });
    } catch (err: any) {
      console.error("[BIDV] PUT system settings error:", err);
      return res.status(500).json({ message: `Lỗi khi lưu cấu hình: ${(err as Error)?.message || "Unknown error"}` });
    }
  });

  // ─── Super Admin: Test system connection ─────────────────────────────────
  app.post("/api/bidv/test-system-connection", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });

    const schema = z.object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      environment: z.enum(["UAT", "Production"]).optional(),
      publicCert: z.string().optional(),
      privateKey: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
    const body = parsed.data;

    type CheckStatus = "ok" | "error" | "skip";
    const result: {
      oauth: CheckStatus; certificate: CheckStatus; signature: CheckStatus; apiReachable: CheckStatus;
      messages: Record<string, string>;
    } = {
      oauth: "skip", certificate: "skip", signature: "skip", apiReachable: "skip",
      messages: {},
    };

    try {
      const saved = await getSysSettings();

      // Resolve credentials: prefer form input, fall back to saved (decrypted)
      const clientId = (body.clientId?.trim()) || saved["client_id"] || "";
      let clientSecret = "";
      if (body.clientSecret && body.clientSecret !== "__USE_SAVED__") {
        clientSecret = body.clientSecret;
      } else if (saved["client_secret"]) {
        try { clientSecret = decrypt(saved["client_secret"]); } catch {}
      }

      const environment = body.environment || saved["environment"] as any || "UAT";
      const publicCert = body.publicCert || saved["public_cert"] || "";
      let privateKey = "";
      if (body.privateKey && body.privateKey !== "__USE_SAVED__") {
        privateKey = body.privateKey;
      } else if (saved["private_key"]) {
        try { privateKey = decrypt(saved["private_key"]); } catch {}
      }

      // 1. Check: Certificate format
      if (publicCert) {
        const certCheck = validateCertificatePem(publicCert);
        result.certificate = certCheck.ok ? "ok" : "error";
        if (!certCheck.ok) result.messages.certificate = certCheck.message;
      } else {
        result.certificate = "error";
        result.messages.certificate = "Public Certificate chưa được cung cấp";
      }

      // 2. Check: Private key + signature test
      if (privateKey) {
        const keyFormatCheck = validatePrivateKeyPem(privateKey);
        if (!keyFormatCheck.ok) {
          result.signature = "error";
          result.messages.signature = keyFormatCheck.message;
        } else {
          const keyUsableCheck = validatePrivateKeyUsable(privateKey);
          result.signature = keyUsableCheck.ok ? "ok" : "error";
          if (!keyUsableCheck.ok) result.messages.signature = keyUsableCheck.message;
        }
      } else {
        result.signature = "error";
        result.messages.signature = "Private Key chưa được cung cấp";
      }

      // 3. Check: OAuth (real call to BIDV)
      if (clientId && clientSecret) {
        const oauthResult = await fetchOAuthToken({ clientId, clientSecret, environment, scope: "ewallet" });
        result.oauth = oauthResult.ok ? "ok" : "error";
        if (!oauthResult.ok) result.messages.oauth = oauthResult.error || "Lỗi OAuth";
        // If OAuth works → API is reachable
        result.apiReachable = oauthResult.ok ? "ok" : "error";
        if (!oauthResult.ok) {
          const errLower = (oauthResult.error || "").toLowerCase();
          if (errLower.includes("timeout") || errLower.includes("connect") || errLower.includes("fetch")) {
            result.messages.apiReachable = "Không kết nối được BIDV host";
          } else {
            // Reached server but credential error
            result.apiReachable = "ok";
            result.messages.apiReachable = "API reachable (lỗi credentials)";
          }
        }
      } else {
        result.oauth = "error";
        result.messages.oauth = !clientId ? "Client ID chưa được cung cấp" : "Client Secret chưa được cung cấp";
        result.apiReachable = "skip";
        result.messages.apiReachable = "Cần Client ID và Secret để kiểm tra";
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[BIDV] test-system-connection error:", err);
      return res.status(500).json({ message: "Lỗi khi kiểm tra kết nối" });
    }
  });

  // ─── Location: GET config ─────────────────────────────────────────────────
  app.get("/api/bidv/location-config", async (req, res) => {
    const locationId = req.query.locationId as string;
    if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

    // Super Admin hoặc location admin của location đó
    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(locationId)) {
      return res.status(403).json({ message: "Không có quyền truy cập cơ sở này" });
    }

    try {
      const [cfg] = await db.select().from(bidvLocationConfigs).where(eq(bidvLocationConfigs.locationId, locationId));
      if (!cfg) return res.json(null);

      return res.json({
        id: cfg.id,
        locationId: cfg.locationId,
        serviceId: cfg.serviceId,
        hasMerchantId: !!cfg.merchantId,
        merchantIdMasked: decryptAndMask(cfg.merchantId || undefined),
        hasSecretCode: !!cfg.secretCode,
        secretCodeMasked: decryptAndMask(cfg.secretCode || undefined),
        receiveAccount: cfg.receiveAccount,
        accountName: cfg.accountName,
        vaPrefix: cfg.vaPrefix,
        isEnabled: cfg.isEnabled,
        isQrEnabled: cfg.isQrEnabled,
        autoReconcile: cfg.autoReconcile,
        notes: cfg.notes,
        createdAt: cfg.createdAt,
        updatedAt: cfg.updatedAt,
      });
    } catch (err: any) {
      console.error("[BIDV] GET location config error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy cấu hình" });
    }
  });

  // ─── Location: PUT config ─────────────────────────────────────────────────
  app.put("/api/bidv/location-config", async (req, res) => {
    const schema = z.object({
      locationId: z.string().uuid(),
      serviceId: z.string().max(100).optional(),
      merchantId: z.string().optional(),
      secretCode: z.string().optional(),
      receiveAccount: z.string().max(50).optional(),
      accountName: z.string().max(200).optional(),
      vaPrefix: z.string().max(10).optional(),
      isEnabled: z.boolean().optional(),
      isQrEnabled: z.boolean().optional(),
      autoReconcile: z.boolean().optional(),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    const body = parsed.data;

    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(body.locationId)) {
      return res.status(403).json({ message: "Không có quyền chỉnh sửa cơ sở này" });
    }

    try {
      const [existing] = await db.select().from(bidvLocationConfigs).where(eq(bidvLocationConfigs.locationId, body.locationId));

      let secretCodeToSave: string | undefined = undefined;
      if (body.secretCode && body.secretCode !== "__USE_SAVED__") {
        secretCodeToSave = encrypt(body.secretCode);
      } else if (!existing) {
        secretCodeToSave = undefined;
      }

      let merchantIdToSave: string | undefined = undefined;
      if (body.merchantId !== undefined) {
        merchantIdToSave = body.merchantId ? encrypt(body.merchantId) : "";
      }

      // Use manually supplied vaPrefix; fall back to existing value if not provided
      const vaPrefix = (body.vaPrefix !== undefined)
        ? (body.vaPrefix.trim() ? body.vaPrefix.trim().toUpperCase() : null)
        : (existing?.vaPrefix ?? null);

      const upsertData = {
        locationId: body.locationId,
        serviceId: body.serviceId ?? existing?.serviceId ?? null,
        merchantId: merchantIdToSave ?? existing?.merchantId ?? null,
        secretCode: secretCodeToSave ?? existing?.secretCode ?? null,
        receiveAccount: body.receiveAccount ?? existing?.receiveAccount ?? null,
        accountName: body.accountName ?? existing?.accountName ?? null,
        vaPrefix,
        isEnabled: body.isEnabled ?? existing?.isEnabled ?? false,
        isQrEnabled: body.isQrEnabled ?? existing?.isQrEnabled ?? true,
        autoReconcile: body.autoReconcile ?? existing?.autoReconcile ?? false,
        notes: body.notes ?? existing?.notes ?? null,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(bidvLocationConfigs).set(upsertData).where(eq(bidvLocationConfigs.locationId, body.locationId));
      } else {
        await db.insert(bidvLocationConfigs).values({ ...upsertData, createdAt: new Date() });
      }

      return res.json({ ok: true, message: "Đã lưu cấu hình BIDV cho cơ sở" });
    } catch (err: any) {
      console.error("[BIDV] PUT location config error:", err);
      return res.status(500).json({ message: `Lỗi khi lưu cấu hình: ${(err as Error)?.message || "Unknown error"}` });
    }
  });

  // ─── Location: QR visibility status ─────────────────────────────────────
  // Chỉ điều khiển việc hiển thị QR BIDV trên màn hình hóa đơn,
  // không ảnh hưởng đến VA, webhook, thanh toán hay đối soát.
  app.get("/api/bidv/location-qr-status", async (req, res) => {
    const locationId = req.query.locationId as string;
    if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(locationId)) {
      return res.status(403).json({ message: "Không có quyền truy cập cơ sở này" });
    }

    try {
      const [cfg] = await db
        .select({ isQrEnabled: bidvLocationConfigs.isQrEnabled })
        .from(bidvLocationConfigs)
        .where(eq(bidvLocationConfigs.locationId, locationId));

      // Cấu hình chưa tồn tại hoặc dữ liệu cũ luôn giữ hành vi hiện tại: hiển thị QR.
      return res.json({ isQrEnabled: cfg?.isQrEnabled ?? true });
    } catch (err: any) {
      console.error("[BIDV] GET location QR status error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy trạng thái QR" });
    }
  });

  // ─── GET virtual account info for an invoice (authenticated) ─────────────
  // Nếu có invoiceId → tạo Invoice VA (1 invoice = 1 VA, lazy, 8-digit suffix)
  // Nếu chỉ có studentId → tạo Student VA cũ (backward compat)
  app.get("/api/bidv/virtual-account", async (req, res) => {
    const { invoiceId, scheduleId, studentId: queryStudentId, locationId: queryLocationId } = req.query as Record<string, string>;

    try {
      // ── Schedule VA path (đợt thanh toán) ─────────────────────────────────
      if (scheduleId) {
        const [sched] = await db
          .select({ invoiceId: invoicePaymentSchedule.invoiceId })
          .from(invoicePaymentSchedule)
          .where(eq(invoicePaymentSchedule.id, scheduleId))
          .limit(1);
        if (!sched) return res.status(404).json({ message: "Không tìm thấy đợt thanh toán" });

        const [inv] = await db
          .select({ locationId: invoices.locationId })
          .from(invoices)
          .where(eq(invoices.id, sched.invoiceId))
          .limit(1);

        const locationId = queryLocationId || inv?.locationId;
        if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

        const { vaCode, isNew } = await ensureScheduleVirtualAccount(scheduleId, locationId);

        const [locCfg] = await db
          .select({
            receiveAccount: bidvLocationConfigs.receiveAccount,
            accountName: bidvLocationConfigs.accountName,
            isEnabled: bidvLocationConfigs.isEnabled,
          })
          .from(bidvLocationConfigs)
          .where(eq(bidvLocationConfigs.locationId, locationId))
          .limit(1);

        return res.json({
          vaCode,
          isNew,
          isEnabled: locCfg?.isEnabled ?? false,
          receiveAccount: locCfg?.receiveAccount ?? null,
          accountName: locCfg?.accountName ?? null,
        });
      }

      if (invoiceId) {
        // ── Invoice VA path (mới) ──────────────────────────────────────────
        const [inv] = await db
          .select({ locationId: invoices.locationId })
          .from(invoices)
          .where(eq(invoices.id, invoiceId))
          .limit(1);
        if (!inv) return res.status(404).json({ message: "Không tìm thấy hoá đơn" });

        const locationId = queryLocationId || inv.locationId;
        if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

        const { vaCode, isNew } = await ensureInvoiceVirtualAccount(invoiceId, locationId);

        const [locCfg] = await db
          .select({
            receiveAccount: bidvLocationConfigs.receiveAccount,
            accountName: bidvLocationConfigs.accountName,
            isEnabled: bidvLocationConfigs.isEnabled,
          })
          .from(bidvLocationConfigs)
          .where(eq(bidvLocationConfigs.locationId, locationId))
          .limit(1);

        return res.json({
          vaCode,
          isNew,
          isEnabled: locCfg?.isEnabled ?? false,
          receiveAccount: locCfg?.receiveAccount ?? null,
          accountName: locCfg?.accountName ?? null,
        });
      }

      // ── Student VA path (cũ, backward compat) ───────────────────────────
      const studentId = queryStudentId;
      const locationId = queryLocationId;
      if (!studentId) return res.status(400).json({ message: "Thiếu studentId hoặc invoiceId" });
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const { vaCode, isNew } = await ensureVirtualAccount(studentId, locationId);

      const [locCfg] = await db
        .select({
          receiveAccount: bidvLocationConfigs.receiveAccount,
          accountName: bidvLocationConfigs.accountName,
          isEnabled: bidvLocationConfigs.isEnabled,
        })
        .from(bidvLocationConfigs)
        .where(eq(bidvLocationConfigs.locationId, locationId))
        .limit(1);

      return res.json({
        vaCode,
        isNew,
        isEnabled: locCfg?.isEnabled ?? false,
        receiveAccount: locCfg?.receiveAccount ?? null,
        accountName: locCfg?.accountName ?? null,
      });
    } catch (err: any) {
      console.error("[BIDV] GET virtual-account error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi lấy Virtual Account" });
    }
  });

  app.post("/api/bidv/location-config/reveal", async (req, res) => {
    const parsed = z.object({
      locationId: z.string().uuid(),
      key: z.enum(["merchant_id", "secret_code"]),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(parsed.data.locationId)) {
      return res.status(403).json({ message: "Không có quyền truy cập cơ sở này" });
    }
    try {
      const [cfg] = await db.select().from(bidvLocationConfigs)
        .where(eq(bidvLocationConfigs.locationId, parsed.data.locationId));
      if (!cfg) return res.status(404).json({ message: "Chưa có cấu hình cho cơ sở" });
      const encryptedValue = parsed.data.key === "merchant_id" ? cfg.merchantId : cfg.secretCode;
      if (!encryptedValue) return res.status(404).json({ message: "Chưa có giá trị được lưu" });
      return res.json({ value: decrypt(encryptedValue) });
    } catch (err: any) {
      console.error("[BIDV] reveal location setting error:", err);
      return res.status(500).json({ message: "Không thể hiển thị giá trị đã lưu" });
    }
  });

  // ─── Location: Validate config ────────────────────────────────────────────
  app.post("/api/bidv/test-location-config", async (req, res) => {
    const schema = z.object({
      locationId: z.string().uuid(),
      serviceId: z.string().optional(),
      merchantId: z.string().optional(),
      secretCode: z.string().optional(),
      receiveAccount: z.string().optional(),
      vaPrefix: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
    const body = parsed.data;

    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(body.locationId)) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    try {
      const [saved] = await db.select().from(bidvLocationConfigs).where(eq(bidvLocationConfigs.locationId, body.locationId));

      const serviceId = body.serviceId?.trim() || saved?.serviceId || "";
      const merchantId = body.merchantId?.trim() || (saved?.merchantId ? "SAVED" : "");
      const secretCode = (body.secretCode && body.secretCode !== "__USE_SAVED__") ? body.secretCode : (saved?.secretCode ? "SAVED" : "");
      const receiveAccount = body.receiveAccount?.trim() || saved?.receiveAccount || "";

      const errors: string[] = [];

      if (!serviceId) errors.push("Service ID chưa nhập");
      if (!merchantId) errors.push("Merchant ID chưa nhập");
      if (!secretCode) errors.push("Secret Code chưa nhập");
      if (!receiveAccount) errors.push("Tài khoản nhận tiền chưa nhập");

      if (receiveAccount && !/^\d{6,20}$/.test(receiveAccount.replace(/\s/g, ""))) {
        errors.push("Tài khoản nhận tiền không hợp lệ (chỉ chữ số, 6-20 ký tự)");
      }

      if (errors.length > 0) {
        return res.json({ ok: false, message: errors[0], errors });
      }

      return res.json({ ok: true, message: "✓ Cấu hình hợp lệ — sẵn sàng sử dụng" });
    } catch (err: any) {
      console.error("[BIDV] test-location-config error:", err);
      return res.status(500).json({ message: "Lỗi khi kiểm tra" });
    }
  });

}

// ─── Webhook routes: getbill + paybill ───────────────────────────────────────
// Delegate toàn bộ orchestration sang bidv-request-handler.service.ts.
// Dùng bởi các trung tâm (không phải gateway instance).
export function registerBidvWebhookRoutes(app: Express) {

  // POST /api/bidv/getbill — public, BIDV gọi vào
  app.post("/api/bidv/getbill", async (req, res) => {
    try {
      const { service_id, customer_id, checksum } = req.body ?? {};
      const result = await handleGetBill(
        String(service_id ?? ""),
        String(customer_id ?? ""),
        String(checksum ?? ""),
      );
      return res.json(result);
    } catch (err: any) {
      console.error(`[BIDV_GETBILL] ERROR: unhandled exception — ${err?.message ?? err}`);
      return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
    }
  });

  // POST /api/bidv/paybill — public, BIDV gọi vào
  app.post("/api/bidv/paybill", async (req, res) => {
    try {
      const {
        service_id, customer_id, checksum,
        bill_id, amount,
        trans_id, trans_date, senderName, senderAccount,
        billCode, transactionId, paymentTime,   // legacy field names (backward compat)
      } = req.body ?? {};

      const result = await handlePayBill({
        serviceId:     String(service_id ?? ""),
        customerId:    String(customer_id ?? ""),
        checksum:      String(checksum ?? ""),
        transId:       String(trans_id ?? transactionId ?? ""),
        amount:        amount,
        billId:        String(bill_id ?? billCode ?? "") || undefined,
        transDate:     String(trans_date ?? paymentTime ?? ""),
        senderName:    senderName    ? String(senderName)    : undefined,
        senderAccount: senderAccount ? String(senderAccount) : undefined,
      });
      return res.json(result);
    } catch (err: any) {
      console.error(`[BIDV_PAYBILL] ERROR: unhandled exception — ${err?.message ?? err}`);
      return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
    }
  });
}

// ─── Backward-compat wrapper ──────────────────────────────────────────────────
// Các trung tâm gọi registerBidvRoutes() như hiện tại — không cần thay đổi gì.
export function registerBidvRoutes(app: Express) {
  registerBidvAdminRoutes(app);
  registerBidvWebhookRoutes(app);
}
