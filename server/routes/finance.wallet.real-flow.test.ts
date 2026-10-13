import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/invoice-notification", () => ({
  resolveInvoiceRecipientUserIds: vi.fn().mockResolvedValue([]),
  sendInvoiceCreatedNotification: vi.fn().mockResolvedValue(undefined),
  sendInvoicePaidNotification: vi.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { registerFinanceRoutes } from "./finance.routes";
import { db, pool } from "../db";
import { invoices, invoicePaymentSchedule } from "@shared/schema";
import { getNetWalletAmountByInvoiceAndCategory, getStudentWalletBalance } from "../storage/wallet.storage";

const TEST_STUDENT_ID = "bacabeda-0b58-48f0-9a62-e8e5ad01725c";
const TEST_ACTOR_ID = "8a1ee99c-2376-4c7d-bb2d-a76954aecfdf";
const TEST_LOCATION_ID = "4a5a0bc9-0f88-4a9b-9fe4-baad057c9601";

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.isSuperAdmin = true;
  req.user = { id: TEST_ACTOR_ID };
  req.roleIds = [];
  req.allowedLocationIds = null;
  next();
});
registerFinanceRoutes(app);

describe("real DB invoice wallet flow verification", () => {
  const createdInvoiceIds: string[] = [];
  let initialBalance = 0;
  let invoiceId = "";
  let scheduleIds: string[] = [];

  beforeAll(async () => {
    initialBalance = await getStudentWalletBalance(TEST_STUDENT_ID, "Học phí");
  });

  afterAll(async () => {
    if (invoiceId) {
      for (const id of scheduleIds) {
        const [schedule] = await db.select().from(invoicePaymentSchedule)
          .where(eq(invoicePaymentSchedule.id, id)).limit(1);
        if (schedule && ["paid", "confirmed"].includes(schedule.status)) {
          await request(app).patch(`/api/finance/invoice-schedules/${id}/status`)
            .send({ status: "unpaid" });
        }
      }
    }
    await pool.end();
  });

  it("creates a test invoice, collects child installments through all paths, then reverses wallet effects", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const created = await request(app).post("/api/finance/invoices").send({
      type: "Thu",
      locationId: TEST_LOCATION_ID,
      studentId: TEST_STUDENT_ID,
      category: "Học phí",
      totalAmount: "100000",
      grandTotal: "100000",
      remainingAmount: "100000",
      status: "unpaid",
      dueDate: today,
      description: "KIỂM THỬ VÍ - invoice child flows",
      note: "TEST DATA - tự động tạo và sẽ hoàn trạng thái sau kiểm tra",
      items: [{
        packageName: "TEST - Học phí",
        unitPrice: "100000",
        quantity: 1,
        subtotal: "100000",
        category: "Học phí",
      }],
      paymentSchedule: [0, 1, 2, 3].map(index => ({
        label: `TEST ĐỢT ${index + 1}`,
        amount: "25000",
        baseAmount: "25000",
        status: index === 0 ? "paid" : "unpaid",
        sortOrder: index,
        paidAt: index === 0 ? new Date().toISOString() : null,
      })),
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    invoiceId = created.body.id;
    createdInvoiceIds.push(invoiceId);
    scheduleIds = created.body.paymentSchedule.map((row: any) => row.id);
    expect(scheduleIds).toHaveLength(4);
    expect(Number(created.body.paidAmount)).toBe(25000);
    expect(Number(await getNetWalletAmountByInvoiceAndCategory(invoiceId, "Học phí"))).toBe(25000);

    const confirmed = await request(app)
      .patch(`/api/finance/invoice-schedules/${scheduleIds[1]}/status`)
      .send({ status: "confirmed" });
    expect(confirmed.status).toBe(200);
    expect(Number(await getNetWalletAmountByInvoiceAndCategory(invoiceId, "Học phí"))).toBe(50000);

    const bulk = await request(app).post("/api/finance/invoices/bulk-collect")
      .send({ scheduleIds: [scheduleIds[2]], paymentMethod: "cash" });
    expect(bulk.status).toBe(200);
    expect(bulk.body.summary?.ok ?? bulk.body.ok ?? 1).toBeGreaterThan(0);
    expect(Number(await getNetWalletAmountByInvoiceAndCategory(invoiceId, "Học phí"))).toBe(75000);

    const parentStatus = await request(app).patch(`/api/finance/invoices/${invoiceId}`)
      .send({ status: "paid" });
    expect(parentStatus.status).toBe(200);
    expect(Number(await getNetWalletAmountByInvoiceAndCategory(invoiceId, "Học phí"))).toBe(75000);

    for (const id of [scheduleIds[2], scheduleIds[1], scheduleIds[0]]) {
      const reversed = await request(app)
        .patch(`/api/finance/invoice-schedules/${id}/status`)
        .send({ status: "unpaid" });
      expect(reversed.status).toBe(200);
    }

    const [parent] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    expect(parent.status).toBe("unpaid");
    expect(Number(parent.paidAmount)).toBe(0);
    expect(Number(await getNetWalletAmountByInvoiceAndCategory(invoiceId, "Học phí"))).toBe(0);
    expect(await getStudentWalletBalance(TEST_STUDENT_ID, "Học phí")).toBe(initialBalance);
  });
});
