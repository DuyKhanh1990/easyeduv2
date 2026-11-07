import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

const TEST_ROOM_NAME = "easyedu-livekit-connection-test";
const TOKEN_TTL = "10m";

export function registerLiveKitTestRoutes(app: Express) {
  app.post("/api/livekit-test/token", async (req: Request, res: Response) => {
    // This proof-of-connection endpoint must never be available in production.
    if (process.env.NODE_ENV === "production") {
      return res.sendStatus(404);
    }

    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập để thử kết nối." });
    }

    const liveKitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    if (!liveKitUrl || !apiKey || !apiSecret) {
      return res.status(503).json({
        message: "LiveKit chưa được cấu hình. Hãy thêm LIVEKIT_URL, LIVEKIT_API_KEY và LIVEKIT_API_SECRET trong Replit Secrets.",
      });
    }

    try {
      // A unique identity permits the same EasyEdu account to test from two
      // browser profiles without LiveKit replacing the first connection.
      const identity = `test-${userId}-${randomUUID()}`;
      const displayName = `Người thử nghiệm ${identity.slice(-6)}`;
      const accessToken = new AccessToken(apiKey, apiSecret, {
        identity,
        name: displayName,
        ttl: TOKEN_TTL,
      });

      accessToken.addGrant({
        roomJoin: true,
        room: TEST_ROOM_NAME,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await accessToken.toJwt();
      return res.json({
        serverUrl: liveKitUrl,
        token,
        roomName: TEST_ROOM_NAME,
        displayName,
      });
    } catch (error) {
      console.error("[LiveKit test] Token creation failed:", error);
      return res.status(500).json({ message: "Không thể tạo token LiveKit thử nghiệm." });
    }
  });
}
