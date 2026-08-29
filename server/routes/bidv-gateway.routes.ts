/**
 * BIDV Gateway Routes
 *
 * Mount trên easyeduv2 thay thế registerBidvWebhookRoutes().
 * Xử lý POST /api/bidv/getbill và POST /api/bidv/paybill theo luồng:
 *   1. Lookup gateway_registry theo service_id
 *   2. isSelfCenter() → gọi handleGetBill/handlePayBill trực tiếp
 *   3. Ngược lại → forward HTTP sang backend trung tâm
 *
 * Admin CRUD /api/admin/bidv-gateway/registry — isSuperAdmin only.
 */

import type { Express } from "express";
import { db } from "../db";
import { gatewayRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  lookupRegistry,
  isSelfCenter,
  forwardRequest,
} from "../services/bidv/bidv-gateway-proxy.service";
import {
  handleGetBill,
  handlePayBill,
} from "../services/bidv/bidv-request-handler.service";

export function registerBidvGatewayRoutes(app: Express) {

  // ─── Webhook: POST /api/bidv/getbill ─────────────────────────────────────
  // Public — BIDV gọi vào, bypass auth đã khai báo trong routes.ts
  app.post("/api/bidv/getbill", async (req, res) => {
    const requestId = `gbw-${Date.now()}`;
    const start = Date.now();
    try {
      // Loop detection: nếu request đã đi qua một gateway khác thì dừng ngay
      if (req.headers["x-gateway-source"]) {
        console.warn(`[BIDV_GW] ${requestId} | getbill | LOOP DETECTED — X-Gateway-Source: ${req.headers["x-gateway-source"]}`);
        return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
      }

      const { service_id, customer_id, checksum } = req.body ?? {};

      if (!service_id) {
        return res.json({ result_code: "001", result_desc: "Thiếu tham số bắt buộc" });
      }

      const registry = await lookupRegistry("bidv", String(service_id));
      if (!registry) {
        console.warn(`[BIDV_GW] ${requestId} | getbill | service_id=${service_id} | registry not found → 006`);
        return res.json({ result_code: "006", result_desc: "Service ID không đúng/ không tồn tại" });
      }

      if (await isSelfCenter(registry.centerId)) {
        // Self-route: trung tâm này chính là instance hiện tại — gọi trực tiếp
        const result = await handleGetBill(
          String(service_id),
          String(customer_id ?? ""),
          String(checksum ?? ""),
        );
        const latency = Date.now() - start;
        console.log(`[BIDV_GW] ${requestId} | getbill | service_id=${service_id} | center=${registry.name} | self | result=${result.result_code} | ${latency}ms`);
        return res.json(result);
      } else {
        // Proxy: forward nguyên request sang backend trung tâm
        const { status, data } = await forwardRequest(
          registry.baseUrl,
          "/api/bidv/getbill",
          "POST",
          req.headers as Record<string, string | string[] | undefined>,
          req.body,
        );
        const latency = Date.now() - start;
        console.log(`[BIDV_GW] ${requestId} | getbill | service_id=${service_id} | center=${registry.name} | proxy=${registry.baseUrl} | status=${status} | ${latency}ms`);
        return res.status(status).json(data);
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      console.error(`[BIDV_GW] ${requestId} | getbill | ERROR | ${latency}ms |`, err?.message ?? err);
      return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
    }
  });

  // ─── Webhook: POST /api/bidv/paybill ─────────────────────────────────────
  // Public — BIDV gọi vào, bypass auth đã khai báo trong routes.ts
  app.post("/api/bidv/paybill", async (req, res) => {
    const requestId = `pbw-${Date.now()}`;
    const start = Date.now();
    try {
      // Loop detection: nếu request đã đi qua một gateway khác thì dừng ngay
      if (req.headers["x-gateway-source"]) {
        console.warn(`[BIDV_GW] ${requestId} | paybill | LOOP DETECTED — X-Gateway-Source: ${req.headers["x-gateway-source"]}`);
        return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
      }

      const {
        service_id, customer_id, checksum,
        bill_id, amount,
        trans_id, trans_date, senderName, senderAccount,
        billCode, transactionId, paymentTime,      // legacy field names (backward compat)
      } = req.body ?? {};

      const effectiveTransId = String(trans_id ?? transactionId ?? "");
      const effectiveBillId  = String(bill_id ?? billCode ?? "");
      const effectiveAmount  = amount;

      if (!service_id) {
        return res.json({ result_code: "001", result_desc: "Thiếu tham số bắt buộc" });
      }

      const registry = await lookupRegistry("bidv", String(service_id));
      if (!registry) {
        console.warn(`[BIDV_GW] ${requestId} | paybill | service_id=${service_id} | registry not found → 006`);
        return res.json({ result_code: "006", result_desc: "Service ID không đúng/ không tồn tại" });
      }

      if (await isSelfCenter(registry.centerId)) {
        // Self-route: gọi trực tiếp handler nghiệp vụ
        const result = await handlePayBill({
          serviceId:     String(service_id),
          customerId:    String(customer_id ?? ""),
          checksum:      String(checksum ?? ""),
          transId:       effectiveTransId,
          amount:        effectiveAmount,
          billId:        effectiveBillId || undefined,
          transDate:     String(trans_date ?? paymentTime ?? ""),
          senderName:    senderName    ? String(senderName)    : undefined,
          senderAccount: senderAccount ? String(senderAccount) : undefined,
        });
        const latency = Date.now() - start;
        console.log(`[BIDV_GW] ${requestId} | paybill | service_id=${service_id} | transId=${effectiveTransId} | center=${registry.name} | self | result=${result.result_code} | ${latency}ms`);
        return res.json(result);
      } else {
        // Proxy: forward nguyên request sang backend trung tâm
        const { status, data } = await forwardRequest(
          registry.baseUrl,
          "/api/bidv/paybill",
          "POST",
          req.headers as Record<string, string | string[] | undefined>,
          req.body,
        );
        const latency = Date.now() - start;
        console.log(`[BIDV_GW] ${requestId} | paybill | service_id=${service_id} | transId=${effectiveTransId} | center=${registry.name} | proxy=${registry.baseUrl} | status=${status} | ${latency}ms`);
        return res.status(status).json(data);
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      console.error(`[BIDV_GW] ${requestId} | paybill | ERROR | ${latency}ms |`, err?.message ?? err);
      return res.json({ result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" });
    }
  });

  // ─── Admin: GET /api/admin/bidv-gateway/registry ─────────────────────────
  app.get("/api/admin/bidv-gateway/registry", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    try {
      const rows = await db
        .select()
        .from(gatewayRegistry)
        .orderBy(gatewayRegistry.provider, gatewayRegistry.routingKey);
      return res.json(rows);
    } catch (err: any) {
      console.error("[BIDV_GW_ADMIN] GET registry error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách registry" });
    }
  });

  // ─── Admin: POST /api/admin/bidv-gateway/registry ────────────────────────
  const registrySchema = z.object({
    provider:   z.string().min(1).max(50),
    routingKey: z.string().min(1).max(100),
    centerId:   z.string().uuid({ message: "center_id bắt buộc và phải là UUID hợp lệ" }),
    name:       z.string().min(1).max(200),
    baseUrl:    z.string().url({ message: "base_url bắt buộc và phải là URL hợp lệ" }).max(500),
    isActive:   z.boolean().optional().default(true),
  });

  app.post("/api/admin/bidv-gateway/registry", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const parsed = registrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    try {
      const [row] = await db
        .insert(gatewayRegistry)
        .values({
          provider:   parsed.data.provider,
          routingKey: parsed.data.routingKey,
          centerId:   parsed.data.centerId ?? null,
          name:       parsed.data.name,
          baseUrl:    parsed.data.baseUrl,
          isActive:   parsed.data.isActive ?? true,
        })
        .returning();
      return res.status(201).json(row);
    } catch (err: any) {
      console.error("[BIDV_GW_ADMIN] POST registry error:", err);
      if (err.code === "23505") return res.status(409).json({ message: "provider + routing_key đã tồn tại" });
      return res.status(500).json({ message: "Lỗi khi tạo registry entry" });
    }
  });

  // ─── Admin: PUT /api/admin/bidv-gateway/registry/:id ─────────────────────
  app.put("/api/admin/bidv-gateway/registry/:id", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const { id } = req.params;
    const parsed = registrySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    try {
      const [row] = await db
        .update(gatewayRegistry)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(gatewayRegistry.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy registry entry" });
      return res.json(row);
    } catch (err: any) {
      console.error("[BIDV_GW_ADMIN] PUT registry error:", err);
      if (err.code === "23505") return res.status(409).json({ message: "provider + routing_key đã tồn tại" });
      return res.status(500).json({ message: "Lỗi khi cập nhật registry entry" });
    }
  });

  // ─── Admin: DELETE /api/admin/bidv-gateway/registry/:id ──────────────────
  app.delete("/api/admin/bidv-gateway/registry/:id", async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin được truy cập" });
    const { id } = req.params;
    try {
      const [row] = await db
        .delete(gatewayRegistry)
        .where(eq(gatewayRegistry.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy registry entry" });
      return res.json({ ok: true, message: "Đã xóa registry entry" });
    } catch (err: any) {
      console.error("[BIDV_GW_ADMIN] DELETE registry error:", err);
      return res.status(500).json({ message: "Lỗi khi xóa registry entry" });
    }
  });
}
