import type { Express } from "express";
import { db } from "../db";
import { aiSettings } from "@shared/schema";
import { encrypt, decrypt } from "../utils/crypto";
import { eq } from "drizzle-orm";

export function registerAISettingsRoutes(app: Express) {
  // GET: trả về danh sách providers đã cấu hình (không trả key)
  app.get("/api/ai-settings", async (req, res) => {
    try {
      const settings = await db.select().from(aiSettings);
      const result: Record<string, boolean> = { openai: false, gemini: false };
      for (const s of settings) {
        if (s.isActive) result[s.provider] = true;
      }
      return res.json(result);
    } catch (err: any) {
      console.error("[AI Settings] GET error:", err);
      res.status(500).json({ message: "Lỗi khi lấy cấu hình AI" });
    }
  });

  // POST: lưu/cập nhật key cho 1 provider cụ thể
  app.post("/api/ai-settings", async (req, res) => {
    try {
      const { provider, apiKey } = req.body;
      if (!provider || !["openai", "gemini"].includes(provider)) {
        return res.status(400).json({ message: "provider không hợp lệ" });
      }
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
        return res.status(400).json({ message: "API key không được để trống" });
      }

      const encryptedKey = encrypt(apiKey.trim());
      const existing = await db.select().from(aiSettings).where(eq(aiSettings.provider, provider));

      if (existing.length > 0) {
        await db.update(aiSettings)
          .set({ apiKeyEncrypted: encryptedKey, isActive: true, updatedAt: new Date() })
          .where(eq(aiSettings.provider, provider));
      } else {
        await db.insert(aiSettings).values({ provider, apiKeyEncrypted: encryptedKey, isActive: true });
      }

      return res.json({ message: `Đã lưu API key ${provider === "openai" ? "OpenAI" : "Gemini"} thành công` });
    } catch (err: any) {
      console.error("[AI Settings] POST error:", err);
      res.status(500).json({ message: "Lỗi khi lưu cấu hình AI" });
    }
  });

  // POST test: kiểm tra key hợp lệ (không lưu)
  app.post("/api/ai-settings/test", async (req, res) => {
    try {
      const { provider, apiKey } = req.body;
      if (!provider || !apiKey) {
        return res.status(400).json({ success: false, message: "Thiếu provider hoặc apiKey" });
      }

      if (provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return res.status(400).json({ success: false, message: (data as any)?.error?.message || "API key OpenAI không hợp lệ" });
        }
        return res.json({ success: true, message: "API key OpenAI hợp lệ" });
      }

      if (provider === "gemini") {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return res.status(400).json({ success: false, message: (data as any)?.error?.message || "API key Gemini không hợp lệ" });
        }
        return res.json({ success: true, message: "API key Gemini hợp lệ" });
      }

      return res.status(400).json({ success: false, message: "provider không hợp lệ" });
    } catch (err: any) {
      console.error("[AI Settings] Test error:", err);
      res.status(500).json({ success: false, message: "Không thể kết nối để kiểm tra API key" });
    }
  });

  // DELETE: xóa key của 1 provider cụ thể
  app.delete("/api/ai-settings/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      if (!["openai", "gemini"].includes(provider)) {
        return res.status(400).json({ message: "provider không hợp lệ" });
      }
      await db.delete(aiSettings).where(eq(aiSettings.provider, provider));
      return res.json({ message: `Đã xóa cấu hình ${provider === "openai" ? "OpenAI" : "Gemini"}` });
    } catch (err: any) {
      console.error("[AI Settings] DELETE error:", err);
      res.status(500).json({ message: "Lỗi khi xóa cấu hình AI" });
    }
  });
}

// Dùng trong ai.routes.ts - lấy key giải mã theo provider
export async function getDecryptedApiKey(provider: string): Promise<string | null> {
  try {
    const settings = await db.select().from(aiSettings).where(eq(aiSettings.provider, provider));
    if (settings.length === 0 || !settings[0].isActive) return null;
    return decrypt(settings[0].apiKeyEncrypted);
  } catch {
    return null;
  }
}
