import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { locations, systemSettings } from "@shared/schema";
import { decrypt, encrypt } from "../lib/encryption";
import { authenticateVoip24h } from "../services/voip24h/voip24h.service";

const configKey = (locationId: string) => `voip24h:${locationId}`;
const locationIdSchema = z.string().uuid();

const saveConfigSchema = z.object({
  locationId: locationIdSchema,
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  isLonglive: z.boolean().optional(),
});

type SavedVoip24hConfig = {
  apiKey: string;
  apiSecret: string;
  isLonglive: boolean;
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
      return { apiKey: "", apiSecret: "", isLonglive: true, decryptionFailed: true };
    }
    return {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      isLonglive: typeof config.isLonglive === "boolean" ? config.isLonglive : true,
    };
  } catch {
    return { apiKey: "", apiSecret: "", isLonglive: true, decryptionFailed: true };
  }
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
}
