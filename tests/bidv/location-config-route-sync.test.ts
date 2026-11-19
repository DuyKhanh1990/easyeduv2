import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];

  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const result = selectResults.shift() ?? [];
        return {
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(result),
          })),
          limit: vi.fn().mockResolvedValue(result),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve(undefined);
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(() => {
          updates.push({ table, values });
          return Promise.resolve(undefined);
        }),
      })),
    })),
  };

  return {
    selectResults,
    inserts,
    updates,
    tx,
    db: {
      transaction: vi.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../server/db", () => ({ db: mocks.db }));
vi.mock("../../server/services/crypto.service", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value,
}));
vi.mock("../../server/services/bidv/bidv.service", () => ({ fetchOAuthToken: vi.fn() }));
vi.mock("../../server/services/bidv/bidv-crypto.service", () => ({
  validateCertificatePem: vi.fn(),
  validatePrivateKeyPem: vi.fn(),
  validatePrivateKeyUsable: vi.fn(),
}));
vi.mock("../../server/services/bidv/bidv-virtual-account.service", () => ({
  ensureVirtualAccount: vi.fn(),
  ensureInvoiceVirtualAccount: vi.fn(),
  ensureScheduleVirtualAccount: vi.fn(),
  getVirtualAccountByStudentId: vi.fn(),
}));
vi.mock("../../server/services/bidv/bidv-vietqr.service", () => ({ buildBidvQrUrl: vi.fn() }));
vi.mock("../../server/services/bidv/bidv-request-handler.service", () => ({
  handleGetBill: vi.fn(),
  handlePayBill: vi.fn(),
}));

import { registerBidvAdminRoutes } from "../../server/routes/bidv.routes";
import { gatewayRegistry } from "@shared/schema";

const LOCATION_ID = "c92b2ff4-9398-4e2a-8f78-a81e767b7202";
const CENTER_ID = "6a498bd3-4e23-4821-9354-36217c10b0e3";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isSuperAdmin = true;
    req.allowedLocationIds = [];
    next();
  });
  registerBidvAdminRoutes(app);
  return app;
}

function queueRouteCreationResults(existingRoute: unknown[] = [], existingConfig: unknown[] = []) {
  mocks.selectResults.push(
    existingConfig,
    [{ id: CENTER_ID, centerUrl: "https://easyeduv2.easyedu.vn/" }],
    [{ name: "Minh Khai" }],
    existingRoute,
  );
}

describe("BIDV location config route synchronization", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.selectResults.length = 0;
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.db.transaction.mockClear();
    mocks.tx.select.mockClear();
    mocks.tx.insert.mockClear();
    mocks.tx.update.mockClear();
  });

  it("creates the service route and location config atomically", async () => {
    queueRouteCreationResults();

    const response = await request(buildApp())
      .put("/api/bidv/location-config")
      .send({
        locationId: LOCATION_ID,
        serviceId: " ee0005 ",
        vaPrefix: "96510817",
      });

    expect(response.status).toBe(200);
    expect(mocks.inserts).toHaveLength(2);
    expect(mocks.inserts[0].table).toBe(gatewayRegistry);
    expect(mocks.inserts[0].values).toMatchObject({
      provider: "bidv",
      routingKey: "EE0005",
      centerId: CENTER_ID,
      name: "Minh Khai (EE0005)",
      baseUrl: "https://easyeduv2.easyedu.vn",
      isActive: true,
    });
    expect(mocks.inserts[1].values).toMatchObject({
      locationId: LOCATION_ID,
      serviceId: "EE0005",
      vaPrefix: "96510817",
    });
  });

  it("updates an existing route for the same center", async () => {
    queueRouteCreationResults([{
      id: "route-ee0005",
      provider: "bidv",
      routingKey: "EE0005",
      centerId: CENTER_ID,
      name: "Existing Center Route",
      baseUrl: "https://old.example.com",
      isActive: false,
    }], [{
      locationId: LOCATION_ID,
      serviceId: "EE0005",
      isEnabled: true,
      isQrEnabled: true,
    }]);

    const response = await request(buildApp())
      .put("/api/bidv/location-config")
      .send({ locationId: LOCATION_ID, serviceId: "EE0005" });

    expect(response.status).toBe(200);
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates[0].values).toMatchObject({
      routingKey: "EE0005",
      centerId: CENTER_ID,
      name: "Existing Center Route",
      baseUrl: "https://easyeduv2.easyedu.vn",
      isActive: true,
    });
  });

  it("registers the saved route with the shared gateway", async () => {
    vi.stubEnv("BIDV_SHARED_GATEWAY_URL", "https://gateway.example.test");
    vi.stubEnv("BIDV_GATEWAY_SHARED_SECRET", "test-only-shared-secret");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    queueRouteCreationResults();

    const response = await request(buildApp())
      .put("/api/bidv/location-config")
      .send({
        locationId: LOCATION_ID,
        serviceId: "EE0005",
        vaPrefix: "96510817",
      });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.test/api/internal/bidv-gateway/registry");
    expect(JSON.parse(String(options.body))).toMatchObject({
      provider: "bidv",
      routingKey: "EE0005",
      centerId: CENTER_ID,
      baseUrl: "https://easyeduv2.easyedu.vn",
      isActive: true,
    });
    expect((options.headers as Record<string, string>)["X-Gateway-Source"])
      .toBe("easyedu-bidv-gateway");
    expect((options.headers as Record<string, string>)["x-bidv-gateway-signature"])
      .toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not overwrite a service route owned by another center", async () => {
    queueRouteCreationResults([{
      id: "route-ee0005",
      provider: "bidv",
      routingKey: "EE0005",
      centerId: "a2cb1a28-23f0-4f57-9ab7-2331705eff01",
      name: "Another Center",
      baseUrl: "https://other.example.com",
      isActive: true,
    }]);

    const response = await request(buildApp())
      .put("/api/bidv/location-config")
      .send({ locationId: LOCATION_ID, serviceId: "EE0005" });

    expect(response.status).toBe(409);
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.updates).toHaveLength(0);
  });
});
