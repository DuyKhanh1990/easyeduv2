import express from "express";
import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  PAYMENT_SCHEDULE_PREVIEW_PATH,
  PaymentSchedulePreviewService,
  type PaymentSchedulePreviewData,
  type PaymentSchedulePreviewGrantInput,
  type PaymentSchedulePreviewRepository,
} from "../server/services/payment-schedule-preview.service";
import { createPaymentSchedulePreviewHandler } from "../server/routes/payment-schedule-preview.routes";

class MemoryTenantDatabase implements PaymentSchedulePreviewRepository {
  readonly grants = new Map<string, PaymentSchedulePreviewGrantInput & { id: string; revokedAt: Date | null }>();
  readonly schedules = new Map<string, PaymentSchedulePreviewData>();
  private sequence = 0;

  constructor(
    readonly centerId: string,
    readonly centerUrl = "https://center.example",
  ) {}

  async getCurrentCenter() {
    return { id: this.centerId, centerUrl: this.centerUrl };
  }

  async canGrantSchedule(paymentScheduleId: string) {
    return this.schedules.has(paymentScheduleId);
  }

  async insertGrant(input: PaymentSchedulePreviewGrantInput) {
    const id = `grant-${++this.sequence}`;
    this.grants.set(input.tokenHash, { ...input, id, revokedAt: null });
    return { id };
  }

  async findValidGrant(tokenHash: string, centerId: string, now: Date) {
    const grant = this.grants.get(tokenHash);
    if (!grant || grant.centerId !== centerId || grant.revokedAt || grant.expiresAt <= now) return null;
    return { paymentScheduleId: grant.paymentScheduleId };
  }

  async getPreviewData(paymentScheduleId: string) {
    return this.schedules.get(paymentScheduleId) ?? null;
  }

  async revokeGrant(grantId: string, centerId: string, revokedAt: Date) {
    const grant = [...this.grants.values()].find((entry) => entry.id === grantId && entry.centerId === centerId);
    if (!grant || grant.revokedAt) return false;
    grant.revokedAt = revokedAt;
    return true;
  }
}

const periodA = {
  invoiceCode: "HD-2026-001",
  periodLabel: "Đợt 1",
  amount: "1500000.00",
  dueDate: "2026-11-01",
  status: "unpaid",
};

function makeApp(service: PaymentSchedulePreviewService) {
  const app = express();
  app.get(PAYMENT_SCHEDULE_PREVIEW_PATH, createPaymentSchedulePreviewHandler(service));
  return app;
}

describe("public payment schedule preview", () => {
  it("returns only the payment period bound to a valid token", async () => {
    const database = new MemoryTenantDatabase("center-a");
    database.schedules.set("period-a", periodA);
    database.schedules.set("period-b", { ...periodA, invoiceCode: "HD-OTHER", periodLabel: "Đợt 2" });
    const service = new PaymentSchedulePreviewService(database);
    const issued = await service.createLink("period-a");
    const tokenHash = createHash("sha256").update(issued.token).digest("hex");
    expect(database.grants.has(tokenHash)).toBe(true);
    expect(database.grants.has(issued.token)).toBe(false);

    const response = await request(makeApp(service))
      .get(PAYMENT_SCHEDULE_PREVIEW_PATH)
      .query({ token: issued.token, paymentScheduleId: "period-b", centerId: "center-b" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(periodA);
    expect(response.body).not.toHaveProperty("paymentScheduleId");
    expect(response.body).not.toHaveProperty("centerId");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("uses the same generic response for a malformed or incorrect token", async () => {
    const database = new MemoryTenantDatabase("center-a");
    const response = await request(makeApp(new PaymentSchedulePreviewService(database)))
      .get(PAYMENT_SCHEDULE_PREVIEW_PATH)
      .query({ token: "A".repeat(43) });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Liên kết không hợp lệ hoặc đã hết hạn." });
  });

  it("rejects an expired token", async () => {
    const database = new MemoryTenantDatabase("center-a");
    database.schedules.set("period-a", periodA);
    let now = new Date("2026-10-01T00:00:00.000Z");
    const service = new PaymentSchedulePreviewService(database, () => now);
    const issued = await service.createLink("period-a", 1_000);
    now = new Date("2026-10-01T00:00:01.000Z");

    const response = await request(makeApp(service))
      .get(PAYMENT_SCHEDULE_PREVIEW_PATH)
      .query({ token: issued.token });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Liên kết không hợp lệ hoặc đã hết hạn." });
  });

  it("rejects a revoked token", async () => {
    const database = new MemoryTenantDatabase("center-a");
    database.schedules.set("period-a", periodA);
    const service = new PaymentSchedulePreviewService(database);
    const issued = await service.createLink("period-a");
    expect(await service.revoke(issued.grantId)).toBe(true);

    const response = await request(makeApp(service))
      .get(PAYMENT_SCHEDULE_PREVIEW_PATH)
      .query({ token: issued.token });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Liên kết không hợp lệ hoặc đã hết hạn." });
  });

  it("does not allow a token from one tenant database to resolve in another", async () => {
    const tenantA = new MemoryTenantDatabase("center-a");
    const tenantB = new MemoryTenantDatabase("center-b");
    tenantA.schedules.set("period-a", periodA);
    tenantB.schedules.set("period-b", { ...periodA, invoiceCode: "HD-B-001" });
    const serviceA = new PaymentSchedulePreviewService(tenantA);
    const serviceB = new PaymentSchedulePreviewService(tenantB);
    const issued = await serviceA.createLink("period-a");

    const response = await request(makeApp(serviceB))
      .get(PAYMENT_SCHEDULE_PREVIEW_PATH)
      .query({ token: issued.token });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Liên kết không hợp lệ hoặc đã hết hạn." });
  });
});
