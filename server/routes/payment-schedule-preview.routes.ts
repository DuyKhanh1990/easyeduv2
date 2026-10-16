import type { Express, Request, Response } from "express";
import {
  PAYMENT_SCHEDULE_PREVIEW_PATH,
  paymentSchedulePreviewService,
  type PaymentSchedulePreviewService,
} from "../services/payment-schedule-preview.service";

export function createPaymentSchedulePreviewHandler(service: PaymentSchedulePreviewService) {
  return async (req: Request, res: Response) => {
    res.set({
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    });
    try {
      const data = await service.resolve(req.query.token);
      if (!data) {
        return res.status(404).json({ message: "Liên kết không hợp lệ hoặc đã hết hạn." });
      }
      return res.json(data);
    } catch (error) {
      console.error("[PaymentSchedulePreview] Request failed:", error);
      return res.status(503).json({ message: "Tạm thời không thể hiển thị thông tin." });
    }
  };
}

export function registerPaymentSchedulePreviewRoutes(app: Express) {
  app.get(
    PAYMENT_SCHEDULE_PREVIEW_PATH,
    createPaymentSchedulePreviewHandler(paymentSchedulePreviewService),
  );
}
