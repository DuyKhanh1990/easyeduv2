import type { Express } from "express";
import { resolveZaloAuth } from "../services/zalo-auth.service";

const INTERNAL_SECRET = process.env.ZALO_INTERNAL_SECRET ?? "";

function requireInternalSecret(req: any, res: any, next: any) {
  const secret = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET) {
    console.error("[InternalZaloAuth] ZALO_INTERNAL_SECRET chưa được cấu hình");
    return res.status(500).json({ error: "Server chưa cấu hình internal secret" });
  }
  if (!secret || secret !== INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function registerInternalZaloAuthRoutes(app: Express) {
  /**
   * POST /api/internal/zalo-auth
   * Dùng bởi server-to-server (protected bằng x-internal-secret header)
   * Body: { zaloAccessToken: string } hoặc { accessToken: string }
   * Response: { token, center, needsOnboarding, studentId?, fullName?, userType? }
   */
  app.post("/api/internal/zalo-auth", requireInternalSecret, async (req, res) => {
    const body = req.body as { zaloAccessToken?: string; accessToken?: string };
    const rawToken = body.accessToken || body.zaloAccessToken;

    if (!rawToken || typeof rawToken !== "string") {
      return res.status(400).json({ error: "Thiếu accessToken hoặc zaloAccessToken" });
    }

    try {
      const result = await resolveZaloAuth(rawToken);
      return res.status(200).json(result);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      const message = status === 401 ? "Token Zalo không hợp lệ" : "Lỗi server nội bộ";
      console.error("[InternalZaloAuth] Lỗi:", err.message);
      return res.status(status).json({ error: message });
    }
  });
}
