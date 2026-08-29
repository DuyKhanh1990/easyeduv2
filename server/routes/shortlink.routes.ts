import type { Express } from "express";
import { resolveShortLink } from "../lib/shortlink";

export function registerShortLinkRoutes(app: Express) {
  app.get("/go/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const targetUrl = await resolveShortLink(code);
      if (!targetUrl) {
        return res.status(404).send("Link không tồn tại hoặc đã hết hạn.");
      }
      res.redirect(302, targetUrl);
    } catch (err) {
      res.status(500).send("Lỗi hệ thống.");
    }
  });
}
