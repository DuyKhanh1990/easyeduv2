import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import {
  centerConfig,
  invoicePaymentSchedule,
  invoices,
  paymentSchedulePreviewGrants,
} from "@shared/schema";
import { db } from "../db";

export const PAYMENT_SCHEDULE_PREVIEW_PATH = "/api/public/payment-schedule-preview";
export const PAYMENT_SCHEDULE_PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PaymentSchedulePreviewData = {
  invoiceCode: string | null;
  periodLabel: string;
  amount: string;
  dueDate: string | null;
  status: string;
};

export type PaymentSchedulePreviewGrantInput = {
  centerId: string;
  paymentScheduleId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PaymentSchedulePreviewGrantRecord = PaymentSchedulePreviewGrantInput & {
  id: string;
  revokedAt: Date | null;
};

export interface PaymentSchedulePreviewRepository {
  getCurrentCenter(): Promise<{ id: string; centerUrl: string } | null>;
  canGrantSchedule(paymentScheduleId: string): Promise<boolean>;
  insertGrant(input: PaymentSchedulePreviewGrantInput): Promise<{ id: string }>;
  findValidGrant(tokenHash: string, centerId: string, now: Date): Promise<{ paymentScheduleId: string } | null>;
  getPreviewData(paymentScheduleId: string): Promise<PaymentSchedulePreviewData | null>;
  revokeGrant(grantId: string, centerId: string, revokedAt: Date): Promise<boolean>;
}

export class PaymentSchedulePreviewService {
  constructor(
    private readonly repository: PaymentSchedulePreviewRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createLink(paymentScheduleId: string, ttlMs = PAYMENT_SCHEDULE_PREVIEW_TTL_MS) {
    const center = await this.repository.getCurrentCenter();
    if (!center) throw new Error("PREVIEW_CENTER_UNAVAILABLE");
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("PREVIEW_TTL_INVALID");

    let baseUrl: URL;
    try {
      baseUrl = new URL(center.centerUrl);
    } catch {
      throw new Error("PREVIEW_CENTER_URL_UNAVAILABLE");
    }
    const localHttp = baseUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(baseUrl.hostname);
    if ((baseUrl.protocol !== "https:" && !localHttp) || baseUrl.username || baseUrl.password) {
      throw new Error("PREVIEW_CENTER_URL_UNAVAILABLE");
    }
    if (!(await this.repository.canGrantSchedule(paymentScheduleId))) {
      throw new Error("PREVIEW_SCHEDULE_NOT_FOUND");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(this.now().getTime() + ttlMs);
    const grant = await this.repository.insertGrant({
      centerId: center.id,
      paymentScheduleId,
      tokenHash,
      expiresAt,
    });

    const url = new URL(PAYMENT_SCHEDULE_PREVIEW_PATH, baseUrl);
    url.searchParams.set("token", token);
    return { grantId: grant.id, token, url: url.toString(), expiresAt };
  }

  async resolve(token: unknown): Promise<PaymentSchedulePreviewData | null> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const center = await this.repository.getCurrentCenter();
    if (!center) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const grant = await this.repository.findValidGrant(tokenHash, center.id, this.now());
    if (!grant) return null;
    return this.repository.getPreviewData(grant.paymentScheduleId);
  }

  async revoke(grantId: string): Promise<boolean> {
    const center = await this.repository.getCurrentCenter();
    if (!center) return false;
    return this.repository.revokeGrant(grantId, center.id, this.now());
  }
}

const paymentSchedulePreviewRepository: PaymentSchedulePreviewRepository = {
  async getCurrentCenter() {
    const [center] = await db
      .select({ id: centerConfig.id, centerUrl: centerConfig.centerUrl })
      .from(centerConfig)
      .where(eq(centerConfig.singletonKey, "default"))
      .limit(1);
    return center ?? null;
  },
  async canGrantSchedule(paymentScheduleId) {
    const [row] = await db
      .select({ id: invoicePaymentSchedule.id })
      .from(invoicePaymentSchedule)
      .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
      .where(and(
        eq(invoicePaymentSchedule.id, paymentScheduleId),
        eq(invoices.type, "Thu"),
        isNotNull(invoices.studentId),
      ))
      .limit(1);
    return Boolean(row);
  },
  async insertGrant(input) {
    const [row] = await db.insert(paymentSchedulePreviewGrants).values(input).returning({
      id: paymentSchedulePreviewGrants.id,
    });
    if (!row) throw new Error("PREVIEW_GRANT_CREATE_FAILED");
    return row;
  },
  async findValidGrant(tokenHash, centerId, now) {
    const [grant] = await db
      .select({ paymentScheduleId: paymentSchedulePreviewGrants.paymentScheduleId })
      .from(paymentSchedulePreviewGrants)
      .where(and(
        eq(paymentSchedulePreviewGrants.tokenHash, tokenHash),
        eq(paymentSchedulePreviewGrants.centerId, centerId),
        isNull(paymentSchedulePreviewGrants.revokedAt),
        gt(paymentSchedulePreviewGrants.expiresAt, now),
      ))
      .limit(1);
    return grant ?? null;
  },
  async getPreviewData(paymentScheduleId) {
    const [row] = await db
      .select({
        invoiceCode: invoices.code,
        periodLabel: invoicePaymentSchedule.label,
        amount: invoicePaymentSchedule.amount,
        dueDate: invoicePaymentSchedule.dueDate,
        status: invoicePaymentSchedule.status,
      })
      .from(invoicePaymentSchedule)
      .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
      .where(and(
        eq(invoicePaymentSchedule.id, paymentScheduleId),
        eq(invoices.type, "Thu"),
        isNotNull(invoices.studentId),
      ))
      .limit(1);
    return row ? {
      invoiceCode: row.invoiceCode,
      periodLabel: row.periodLabel,
      amount: String(row.amount),
      dueDate: row.dueDate,
      status: row.status,
    } : null;
  },
  async revokeGrant(grantId, centerId, revokedAt) {
    const [row] = await db
      .update(paymentSchedulePreviewGrants)
      .set({ revokedAt })
      .where(and(
        eq(paymentSchedulePreviewGrants.id, grantId),
        eq(paymentSchedulePreviewGrants.centerId, centerId),
        isNull(paymentSchedulePreviewGrants.revokedAt),
      ))
      .returning({ id: paymentSchedulePreviewGrants.id });
    return Boolean(row);
  },
};

export const paymentSchedulePreviewService = new PaymentSchedulePreviewService(paymentSchedulePreviewRepository);
