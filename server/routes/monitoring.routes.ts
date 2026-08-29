import type { Express } from "express";
import { jwtAuthMiddleware } from "../auth";
import { getRecentErrors, getErrorStats } from "../lib/monitoring";
import { sendSystemMessage } from "../lib/tinode.service";
import { tinodeAdmin } from "../lib/tinode-admin";

export function registerMonitoringRoutes(app: Express) {
  // ─── POST /api/admin/tinode-push-test ──────────────────────────────────────
  // Endpoint chẩn đoán: bot gửi 1 tin vào topic → Tinode echo → dataHandler log
  // curl -X POST http://localhost:5000/api/admin/tinode-push-test \
  //      -H "Content-Type: application/json" \
  //      -d '{"topicId":"grpXXX","text":"test"}'
  app.post("/api/admin/tinode-push-test", async (req, res) => {
    const { topicId, text = "🔔 push test" } = req.body ?? {};
    if (!topicId) return res.status(400).json({ error: "topicId required" });
    const botReady = tinodeAdmin.isReady();
    console.log(`[PushTest] botReady=${botReady} → sending to topic ${topicId}`);
    const ok = await sendSystemMessage(topicId, text);
    return res.json({ botReady, sent: ok, topicId, text });
  });

  // POST /api/admin/expo-push-test — gửi thẳng Expo push đến userId, log ticket
  // curl -X POST http://localhost:5000/api/admin/expo-push-test \
  //      -H "Content-Type: application/json" \
  //      -d '{"userId":"73b372a6-...","title":"test","body":"hello"}'
  app.post("/api/admin/expo-push-test", async (req, res) => {
    const { userId, title = "🔔 test", body = "Direct push test" } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const { db } = await import("../db");
    const { pushTokens } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const { sendExpoPushNotifications } = await import("../lib/expo-push");

    const tokenRows = await db
      .select({ pushToken: pushTokens.pushToken, expoProjectId: pushTokens.expoProjectId })
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)));

    if (tokenRows.length === 0) {
      return res.json({ error: "No active push tokens for this user" });
    }

    const messages = tokenRows.map((r) => ({
      to: r.pushToken,
      title,
      body,
      sound: "default" as const,
      priority: "high" as const,
      channelId: "default",
      data: { type: "test" },
    }));

    console.log(`[ExpoPushTest] Sending to ${messages.length} token(s) for user ${userId}`);
    messages.forEach((m, i) => console.log(`  [${i}] token=${m.to.slice(0, 40)}...`));

    const tickets = await sendExpoPushNotifications(messages);
    const result = tickets.map((t, i) => ({
      token: messages[i].to.slice(0, 40) + "...",
      status: t.status,
      id: t.id,
      message: t.message,
      error: t.details?.error,
    }));
    console.log("[ExpoPushTest] tickets:", JSON.stringify(result));
    return res.json({ tokens: tokenRows.length, tickets: result });
  });

  app.get("/api/admin/errors", jwtAuthMiddleware, (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);
    const level = req.query.level as string | undefined;

    let events = getRecentErrors(limit);
    if (level === "error" || level === "warn") {
      events = events.filter(e => e.level === level);
    }

    return res.json({
      events,
      stats: getErrorStats(),
    });
  });
}
