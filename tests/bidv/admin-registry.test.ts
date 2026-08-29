/**
 * Tests: Admin Registry CRUD
 *
 * Scenario 7:
 *   - GET  — liệt kê registry
 *   - POST — tạo entry mới
 *   - PUT  — cập nhật, disable routing
 *   - DELETE — xóa entry
 *   - Non-superadmin → 403
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── vi.hoisted ─────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const returningInsertMock = vi.fn().mockResolvedValue([]);
  const valuesMock          = vi.fn().mockReturnValue({ returning: returningInsertMock });
  const insertMock          = vi.fn().mockReturnValue({ values: valuesMock });

  const returningUpdateMock = vi.fn().mockResolvedValue([]);
  const whereUpdateMock     = vi.fn().mockReturnValue({ returning: returningUpdateMock });
  const setMock             = vi.fn().mockReturnValue({ where: whereUpdateMock });
  const updateMock          = vi.fn().mockReturnValue({ set: setMock });

  const returningDeleteMock = vi.fn().mockResolvedValue([]);
  const whereDeleteMock     = vi.fn().mockReturnValue({ returning: returningDeleteMock });
  const deleteMock          = vi.fn().mockReturnValue({ where: whereDeleteMock });

  // GET /registry: db.select().from().orderBy(col1, col2) — orderBy là bước cuối → Promise
  const orderByMock = vi.fn().mockResolvedValue([]);
  const fromMock    = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const selectMock  = vi.fn().mockReturnValue({ from: fromMock });

  return {
    returningInsertMock, valuesMock, insertMock,
    returningUpdateMock, whereUpdateMock, setMock, updateMock,
    returningDeleteMock, whereDeleteMock, deleteMock,
    orderByMock, fromMock, selectMock,
  };
});

vi.mock("../../server/db", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
  },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock("../../shared/schema", () => ({
  gatewayRegistry: { provider: "provider", routingKey: "routing_key" },
}));

vi.mock("../../server/services/bidv/bidv-gateway-proxy.service", () => ({
  lookupRegistry: vi.fn(),
  isSelfCenter:   vi.fn(),
  forwardRequest: vi.fn(),
}));

vi.mock("../../server/services/bidv/bidv-request-handler.service", () => ({
  handleGetBill: vi.fn(),
  handlePayBill: vi.fn(),
}));

import { registerBidvGatewayRoutes } from "../../server/routes/bidv-gateway.routes";

// ── Fixtures ───────────────────────────────────────────────────────────────────
const SAMPLE_ENTRY = {
  id: "reg-001",
  provider: "bidv",
  routingKey: "SVC001",
  centerId: "6a498bd3-4e23-4821-9354-36217c10b0e3", // valid UUID
  name: "Trung tâm A",
  baseUrl: "https://center-a.example.com",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function buildApp(isSuperAdmin = true) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.isSuperAdmin = isSuperAdmin; next(); });
  registerBidvGatewayRoutes(app);
  return app;
}

function resetChain() {
  const m = mocks;
  m.orderByMock.mockReset().mockResolvedValue([]);
  m.fromMock.mockReset().mockReturnValue({ orderBy: m.orderByMock });
  m.selectMock.mockReset().mockReturnValue({ from: m.fromMock });
  m.returningInsertMock.mockReset().mockResolvedValue([]);
  m.valuesMock.mockReset().mockReturnValue({ returning: m.returningInsertMock });
  m.insertMock.mockReset().mockReturnValue({ values: m.valuesMock });
  m.returningUpdateMock.mockReset().mockResolvedValue([]);
  m.whereUpdateMock.mockReset().mockReturnValue({ returning: m.returningUpdateMock });
  m.setMock.mockReset().mockReturnValue({ where: m.whereUpdateMock });
  m.updateMock.mockReset().mockReturnValue({ set: m.setMock });
  m.returningDeleteMock.mockReset().mockResolvedValue([]);
  m.whereDeleteMock.mockReset().mockReturnValue({ returning: m.returningDeleteMock });
  m.deleteMock.mockReset().mockReturnValue({ where: m.whereDeleteMock });
}

describe("Admin Registry CRUD", () => {
  beforeEach(resetChain);

  // ─────────────────────────────────────────────────────────────────────────
  // GET
  // ─────────────────────────────────────────────────────────────────────────
  it("GET: trả danh sách registry", async () => {
    mocks.orderByMock.mockResolvedValueOnce([SAMPLE_ENTRY]);

    const res = await request(buildApp()).get("/api/admin/bidv-gateway/registry");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe("reg-001");
  });

  it("GET: non-superadmin → 403", async () => {
    const res = await request(buildApp(false)).get("/api/admin/bidv-gateway/registry");
    expect(res.status).toBe(403);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST
  // ─────────────────────────────────────────────────────────────────────────
  it("POST: tạo entry mới → 201", async () => {
    mocks.returningInsertMock.mockResolvedValueOnce([SAMPLE_ENTRY]);

    const res = await request(buildApp())
      .post("/api/admin/bidv-gateway/registry")
      .send({
        provider: "bidv", routingKey: "SVC001",
        centerId: "6a498bd3-4e23-4821-9354-36217c10b0e3",
        name: "Trung tâm A", baseUrl: "https://center-a.example.com",
        isActive: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("reg-001");
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
  });

  it("POST: thiếu trường bắt buộc → 400", async () => {
    const res = await request(buildApp())
      .post("/api/admin/bidv-gateway/registry")
      .send({ provider: "bidv" });

    expect(res.status).toBe(400);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("POST: non-superadmin → 403", async () => {
    const res = await request(buildApp(false))
      .post("/api/admin/bidv-gateway/registry")
      .send({ provider: "bidv", routingKey: "SVC001", name: "X", baseUrl: "https://x.com" });

    expect(res.status).toBe(403);
  });

  it("POST: duplicate (provider+routingKey) → 409", async () => {
    mocks.returningInsertMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" })
    );

    const res = await request(buildApp())
      .post("/api/admin/bidv-gateway/registry")
      .send({ provider: "bidv", routingKey: "SVC001", name: "Dup", baseUrl: "https://dup.example.com" });

    expect(res.status).toBe(409);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT
  // ─────────────────────────────────────────────────────────────────────────
  it("PUT: cập nhật entry → 200", async () => {
    const updated = { ...SAMPLE_ENTRY, name: "Đã đổi tên" };
    mocks.returningUpdateMock.mockResolvedValueOnce([updated]);

    const res = await request(buildApp())
      .put("/api/admin/bidv-gateway/registry/reg-001")
      .send({ name: "Đã đổi tên" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Đã đổi tên");
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
  });

  it("PUT: id không tồn tại → 404", async () => {
    mocks.returningUpdateMock.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .put("/api/admin/bidv-gateway/registry/nonexistent")
      .send({ name: "X" });

    expect(res.status).toBe(404);
  });

  it("PUT: disable routing (isActive=false)", async () => {
    const disabled = { ...SAMPLE_ENTRY, isActive: false };
    mocks.returningUpdateMock.mockResolvedValueOnce([disabled]);

    const res = await request(buildApp())
      .put("/api/admin/bidv-gateway/registry/reg-001")
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────────────────
  it("DELETE: xóa entry → 200 + ok: true", async () => {
    mocks.returningDeleteMock.mockResolvedValueOnce([SAMPLE_ENTRY]);

    const res = await request(buildApp())
      .delete("/api/admin/bidv-gateway/registry/reg-001");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.deleteMock).toHaveBeenCalledTimes(1);
  });

  it("DELETE: id không tồn tại → 404", async () => {
    mocks.returningDeleteMock.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .delete("/api/admin/bidv-gateway/registry/nonexistent");

    expect(res.status).toBe(404);
  });

  it("DELETE: non-superadmin → 403", async () => {
    const res = await request(buildApp(false))
      .delete("/api/admin/bidv-gateway/registry/reg-001");

    expect(res.status).toBe(403);
    expect(mocks.deleteMock).not.toHaveBeenCalled();
  });
});
