import type { Express } from "express";
import { db } from "../db";
import { aiSettings } from "@shared/schema";
import { encrypt, decrypt } from "../utils/crypto";
import { eq } from "drizzle-orm";

export function registerAISettingsRoutes(app: Express) {
  const supportedProviders = ["openai", "gemini", "groq"] as const;
  const providerLabel = (provider: string) =>
    provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : "Groq";

  // GET: trả về danh sách providers đã cấu hình (không trả key)
  app.get("/api/ai-settings", async (req, res) => {
    try {
      const settings = await db.select().from(aiSettings);
      // Check custom keys from DB
      const result: Record<string, boolean> = { openai: false, gemini: false, groq: false };
      for (const s of settings) {
        if (s.isActive) result[s.provider] = true;
      }
      // Also mark available if Replit AI Integration env vars are present
      if (!result.openai && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) result.openai = true;
      if (!result.gemini && process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) result.gemini = true;
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
      if (!provider || !supportedProviders.includes(provider)) {
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

      return res.json({ message: `Đã lưu API key ${providerLabel(provider)} thành công` });
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

      if (provider === "groq") {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return res.status(400).json({ success: false, message: (data as any)?.error?.message || "API key Groq không hợp lệ" });
        }
        return res.json({ success: true, message: "API key Groq hợp lệ" });
      }

      return res.status(400).json({ success: false, message: "provider không hợp lệ" });
    } catch (err: any) {
      console.error("[AI Settings] Test error:", err);
      res.status(500).json({ success: false, message: "Không thể kết nối để kiểm tra API key" });
    }
  });

  // GET grading mode config
  app.get("/api/ai-settings/grading-mode", async (req, res) => {
    try {
      const rows = await db.select().from(aiSettings).where(eq(aiSettings.provider, "grading_config"));
      if (rows.length === 0) return res.json({ parallelMode: false, gradingProvider: null });
      try {
        const cfg = JSON.parse(rows[0].apiKeyEncrypted);
        return res.json({ parallelMode: !!cfg.parallelMode, gradingProvider: cfg.gradingProvider || null });
      } catch {
        return res.json({ parallelMode: false, gradingProvider: null });
      }
    } catch (err: any) {
      res.status(500).json({ message: "Lỗi khi lấy cấu hình chấm bài" });
    }
  });

  // PUT grading mode config
  app.put("/api/ai-settings/grading-mode", async (req, res) => {
    try {
      const { parallelMode, gradingProvider } = req.body;
      if (
        gradingProvider !== undefined &&
        gradingProvider !== null &&
        !supportedProviders.includes(gradingProvider)
      ) {
        return res.status(400).json({ message: "AI chấm bài không được hỗ trợ" });
      }
      // Merge với config hiện tại để không mất setting khác khi chỉ update 1 field
      const existing = await db.select().from(aiSettings).where(eq(aiSettings.provider, "grading_config"));
      const current = existing.length > 0 ? (() => { try { return JSON.parse(existing[0].apiKeyEncrypted); } catch { return {}; } })() : {};
      const cfg = JSON.stringify({
        parallelMode: parallelMode !== undefined ? !!parallelMode : !!current.parallelMode,
        gradingProvider: gradingProvider !== undefined ? (gradingProvider || null) : (current.gradingProvider || null),
      });
      if (existing.length > 0) {
        await db.update(aiSettings)
          .set({ apiKeyEncrypted: cfg, isActive: true, updatedAt: new Date() })
          .where(eq(aiSettings.provider, "grading_config"));
      } else {
        await db.insert(aiSettings).values({ provider: "grading_config", apiKeyEncrypted: cfg, isActive: true });
      }
      const saved = JSON.parse(cfg);
      return res.json({ parallelMode: saved.parallelMode, gradingProvider: saved.gradingProvider });
    } catch (err: any) {
      res.status(500).json({ message: "Lỗi khi lưu cấu hình chấm bài" });
    }
  });

  // DELETE: xóa key của 1 provider cụ thể
  app.delete("/api/ai-settings/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      if (!supportedProviders.includes(provider as typeof supportedProviders[number])) {
        return res.status(400).json({ message: "provider không hợp lệ" });
      }
      await db.delete(aiSettings).where(eq(aiSettings.provider, provider));
      return res.json({ message: `Đã xóa cấu hình ${providerLabel(provider)}` });
    } catch (err: any) {
      console.error("[AI Settings] DELETE error:", err);
      res.status(500).json({ message: "Lỗi khi xóa cấu hình AI" });
    }
  });
}

// Dùng trong ai.routes.ts - lấy cài đặt grading mode
export async function getGradingMode(): Promise<{ parallelMode: boolean; gradingProvider: string | null }> {
  try {
    const rows = await db.select().from(aiSettings).where(eq(aiSettings.provider, "grading_config"));
    if (rows.length === 0) return { parallelMode: false, gradingProvider: null };
    const cfg = JSON.parse(rows[0].apiKeyEncrypted);
    return { parallelMode: !!cfg.parallelMode, gradingProvider: cfg.gradingProvider || null };
  } catch {
    return { parallelMode: false, gradingProvider: null };
  }
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
