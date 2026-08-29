/**
 * Tests: BIDV Gateway Routes
 *
 * Scenarios covered:
 *   1. Self-routing  — handleGetBill/handlePayBill gọi trực tiếp, không HTTP loop
 *   2. Proxy-routing — forwardRequest được gọi, trả nguyên status + body
 *   3. Service ID không tồn tại → result_code "006"
 *   4. Backend timeout → result_code "031"
 *   5. Checksum sai (self) → result_code "004" (từ handleGetBill)
 *
 * Mocking strategy:
 *   - Service modules được mock hoàn toàn — không cần DB thật
 *   - Express app được tạo inline cho mỗi test
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock service modules TRƯỚC KHI import route ───────────────────────────────
vi.mock("../../server/services/bidv/bidv-gateway-proxy.service", () => ({
  lookupRegistry: vi.fn(),
  isSelfCenter:   vi.fn(),
  forwardRequest: vi.fn(),
}));

vi.mock("../../server/services/bidv/bidv-request-handler.service", () => ({
  handleGetBill: vi.fn(),
  handlePayBill: vi.fn(),
}));

// Mock db để registerBidvGatewayRoutes có thể import mà không crash
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../shared/schema", () => ({ gatewayRegistry: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import {
  lookupRegistry,
  isSelfCenter,
  forwardRequest,
} from "../../server/services/bidv/bidv-gateway-proxy.service";
import {
  handleGetBill,
  handlePayBill,
} from "../../server/services/bidv/bidv-request-handler.service";
import { registerBidvGatewayRoutes } from "../../server/routes/bidv-gateway.routes";

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockLookup  = vi.mocked(lookupRegistry);
const mockIsSelf  = vi.mocked(isSelfCenter);
const mockForward = vi.mocked(forwardRequest);
const mockGetBill = vi.mocked(handleGetBill);
const mockPayBill = vi.mocked(handlePayBill);

const ACTIVE_REGISTRY = {
  id: "reg-1",
  provider: "bidv",
  routingKey: "SVC001",
  centerId: "center-uuid-001",
  name: "Trung tâm A",
  baseUrl: "https://center-a.example.com",
  isActive: true,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject isSuperAdmin for admin routes
  app.use((req: any, _res, next) => { req.isSuperAdmin = true; next(); });
  registerBidvGatewayRoutes(app);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("BIDV Gateway Routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Self-routing — GetBill
  // ─────────────────────────────────────────────────────────────────────────
  describe("Scenario 1: Self-routing", () => {
    it("getbill: gọi handleGetBill trực tiếp, không gọi forwardRequest", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockGetBill.mockResolvedValue({ result_code: "000", result_desc: "success" });

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "abc" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("000");
      expect(mockGetBill).toHaveBeenCalledWith("SVC001", "KH001", "abc");
      expect(mockForward).not.toHaveBeenCalled();
    });

    it("paybill: gọi handlePayBill trực tiếp, không gọi forwardRequest", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockPayBill.mockResolvedValue({ result_code: "000", result_desc: "success" });

      const res = await request(buildApp())
        .post("/api/bidv/paybill")
        .send({
          service_id: "SVC001", customer_id: "KH001", checksum: "abc",
          trans_id: "TX001", amount: 500000,
        });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("000");
      expect(mockPayBill).toHaveBeenCalled();
      expect(mockForward).not.toHaveBeenCalled();
    });

    it("paybill: truyền đúng các field vào handlePayBill", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockPayBill.mockResolvedValue({ result_code: "000", result_desc: "success" });

      await request(buildApp())
        .post("/api/bidv/paybill")
        .send({
          service_id: "SVC001", customer_id: "KH002", checksum: "sig",
          trans_id: "TXABC", amount: 1_000_000, bill_id: "HD001",
          trans_date: "20240101", senderName: "Nguyen Van A", senderAccount: "123456",
        });

      const call = mockPayBill.mock.calls[0][0];
      expect(call.serviceId).toBe("SVC001");
      expect(call.customerId).toBe("KH002");
      expect(call.transId).toBe("TXABC");
      expect(call.billId).toBe("HD001");
      expect(call.senderName).toBe("Nguyen Van A");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Proxy-routing
  // ─────────────────────────────────────────────────────────────────────────
  describe("Scenario 2: Proxy-routing", () => {
    it("getbill: gọi forwardRequest, trả nguyên status và body từ backend", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(false);
      mockForward.mockResolvedValue({
        status: 200,
        data: { result_code: "000", result_desc: "success", customer_name: "Nguyen Van B" },
      });

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH002", checksum: "xyz" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("000");
      expect(res.body.customer_name).toBe("Nguyen Van B");
      expect(mockForward).toHaveBeenCalledWith(
        ACTIVE_REGISTRY.baseUrl,
        "/api/bidv/getbill",
        "POST",
        expect.any(Object),
        expect.objectContaining({ service_id: "SVC001" }),
      );
      expect(mockGetBill).not.toHaveBeenCalled();
    });

    it("paybill: forwardRequest trả nguyên HTTP status backend (e.g. 502)", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(false);
      mockForward.mockResolvedValue({
        status: 502,
        data: { result_code: "031", result_desc: "Backend error" },
      });

      const res = await request(buildApp())
        .post("/api/bidv/paybill")
        .send({ service_id: "SVC001", customer_id: "KH002", checksum: "xyz", trans_id: "TX1", amount: 100 });

      expect(res.status).toBe(502);
      expect(res.body.result_code).toBe("031");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Service ID không tồn tại → "006"
  // ─────────────────────────────────────────────────────────────────────────
  describe("Scenario 3: Service ID không tồn tại", () => {
    it("getbill: lookupRegistry trả null → result_code 006", async () => {
      mockLookup.mockResolvedValue(null);

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "UNKNOWN", customer_id: "KH001", checksum: "abc" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("006");
      expect(mockGetBill).not.toHaveBeenCalled();
      expect(mockForward).not.toHaveBeenCalled();
    });

    it("paybill: lookupRegistry trả null → result_code 006", async () => {
      mockLookup.mockResolvedValue(null);

      const res = await request(buildApp())
        .post("/api/bidv/paybill")
        .send({ service_id: "UNKNOWN", customer_id: "KH001", checksum: "abc", trans_id: "TX1", amount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("006");
    });

    it("getbill: thiếu service_id → result_code 001", async () => {
      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ customer_id: "KH001", checksum: "abc" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("001");
      expect(mockLookup).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Backend timeout → "031"
  // ─────────────────────────────────────────────────────────────────────────
  describe("Scenario 4: Backend timeout / down", () => {
    it("getbill: forwardRequest throws AbortError → result_code 031", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(false);
      const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      mockForward.mockRejectedValue(abortErr);

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "abc" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("031");
      expect(res.body.result_desc).toContain("lỗi");
    });

    it("paybill: forwardRequest throws connection error → result_code 031", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(false);
      mockForward.mockRejectedValue(new Error("connect ECONNREFUSED"));

      const res = await request(buildApp())
        .post("/api/bidv/paybill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "abc", trans_id: "TX1", amount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("031");
    });

    it("getbill: handleGetBill throws unexpectedly (self) → result_code 031", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockGetBill.mockRejectedValue(new Error("DB connection lost"));

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "abc" });

      expect(res.status).toBe(200);
      expect(res.body.result_code).toBe("031");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Checksum sai — self và proxy
  // ─────────────────────────────────────────────────────────────────────────
  describe("Scenario 5: Checksum sai", () => {
    it("self-routing getbill: handleGetBill trả result_code 004 khi checksum sai", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockGetBill.mockResolvedValue({ result_code: "004", result_desc: "Checksum không hợp lệ" });

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "BAD_CHECKSUM" });

      expect(res.body.result_code).toBe("004");
    });

    it("proxy-routing getbill: backend trả result_code 004 → gateway trả nguyên", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(false);
      mockForward.mockResolvedValue({
        status: 200,
        data: { result_code: "004", result_desc: "Checksum không hợp lệ" },
      });

      const res = await request(buildApp())
        .post("/api/bidv/getbill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "BAD" });

      expect(res.body.result_code).toBe("004");
    });

    it("self-routing paybill: handlePayBill trả result_code 004 khi checksum sai", async () => {
      mockLookup.mockResolvedValue(ACTIVE_REGISTRY);
      mockIsSelf.mockResolvedValue(true);
      mockPayBill.mockResolvedValue({ result_code: "004", result_desc: "Checksum không hợp lệ" });

      const res = await request(buildApp())
        .post("/api/bidv/paybill")
        .send({ service_id: "SVC001", customer_id: "KH001", checksum: "BAD", trans_id: "TX1", amount: 100 });

      expect(res.body.result_code).toBe("004");
    });
  });
});
