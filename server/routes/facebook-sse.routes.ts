import type { Express } from "express";
import { randomUUID } from "crypto";
import { sseManager } from "../services/sse-manager";

export function registerFacebookSSERoutes(app: Express): void {
  app.get("/api/facebook/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(":connected\n\n");

    const clientId = randomUUID();

    sseManager.add({
      id: clientId,
      userId: req.user!.id,
      isSuperAdmin: req.isSuperAdmin ?? false,
      allowedLocationIds: req.allowedLocationIds ?? [],
      res,
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(":heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        sseManager.remove(clientId);
      }
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseManager.remove(clientId);
    });
  });
}
