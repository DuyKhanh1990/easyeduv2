/**
 * BIDV Request Handler Service
 *
 * Entry-point dùng chung cho getbill và paybill.
 * Được gọi bởi:
 *   - bidv.routes.ts (registerBidvWebhookRoutes) — trung tâm xử lý trực tiếp
 *   - bidv-gateway.routes.ts — khi gateway phát hiện self-route (center_id == current center)
 *
 * Orchestration flow: resolve location config → verify checksum → business logic
 * Không thay đổi nghiệp vụ, không thay đổi checksum algorithm, không thay đổi response format.
 */

import { db } from "../../db";
import { bidvLocationConfigs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "../crypto.service";
import { verifyGetBillChecksum, verifyPayBillChecksum } from "./bidv-checksum.service";
import { processGetBill, processPayBill } from "./bidv-webhook.service";
import type { GetBillResponse, PayBillResponse } from "./bidv-webhook.service";

// ─── Internal: resolve VA code và config từ service_id ───────────────────────
// Logic này trước đây nằm inline trong bidv.routes.ts (resolveVaCode).
// Được tập trung tại đây để dùng chung.
async function resolveLocationConfig(serviceId: string, customerId: string): Promise<{
  vaCode: string | null;
  locationId: string | null;
  merchantId: string | null;
  secretCode: string | null;
  error?: string;
}> {
  if (!serviceId || !customerId) {
    return { vaCode: null, locationId: null, merchantId: null, secretCode: null, error: "service_id và customer_id là bắt buộc" };
  }

  const [locCfg] = await db
    .select({
      locationId: bidvLocationConfigs.locationId,
      vaPrefix:   bidvLocationConfigs.vaPrefix,
      merchantId: bidvLocationConfigs.merchantId,
      secretCode: bidvLocationConfigs.secretCode,
    })
    .from(bidvLocationConfigs)
    .where(eq(bidvLocationConfigs.serviceId, serviceId))
    .limit(1);

  if (!locCfg) {
    return { vaCode: null, locationId: null, merchantId: null, secretCode: null, error: `Không tìm thấy cấu hình cho service_id: ${serviceId}` };
  }

  let secretCode: string | null = null;
  if (locCfg.secretCode) {
    try { secretCode = decrypt(locCfg.secretCode); } catch { secretCode = null; }
  }

  const prefix = (locCfg.vaPrefix ?? "VA").toUpperCase();
  const vaCode = `${prefix}${customerId}`;

  console.log(`[BIDV] resolve: service_id=${serviceId} customer_id=${customerId} prefix=${prefix} → vaCode=${vaCode}`);

  return { vaCode, locationId: locCfg.locationId, merchantId: locCfg.merchantId, secretCode };
}

// ─── handleGetBill ────────────────────────────────────────────────────────────
// Toàn bộ flow: validate → resolve config → verify checksum → processGetBill
export async function handleGetBill(
  serviceId: string,
  customerId: string,
  checksum: string,
): Promise<GetBillResponse> {
  if (!serviceId || !customerId) {
    return { result_code: "001", result_desc: "Thiếu tham số bắt buộc" };
  }
  if (!checksum) {
    console.warn(`[BIDV_GETBILL] serviceId=${serviceId} customerId=${customerId} → result=001 (thiếu checksum)`);
    return { result_code: "001", result_desc: "Thiếu tham số checksum" };
  }

  console.log(`[BIDV_GETBILL] serviceId=${serviceId} customerId=${customerId}`);

  const resolved = await resolveLocationConfig(serviceId, customerId);
  if (!resolved.vaCode) {
    console.warn(`[BIDV_GETBILL] serviceId=${serviceId} ERROR: ${resolved.error} → resultCode=006`);
    return { result_code: "006", result_desc: "Service ID không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_GETBILL] resolvedVaCode=${resolved.vaCode}`);

  if (!resolved.secretCode) {
    console.warn(`[BIDV_GETBILL] serviceId=${serviceId} ERROR: secretCode chưa cấu hình → resultCode=031`);
    return { result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" };
  }

  const checksumValid = verifyGetBillChecksum(
    resolved.secretCode,
    serviceId,
    customerId,
    checksum,
  );

  if (!checksumValid) {
    console.warn(`[BIDV_GETBILL] serviceId=${serviceId} ERROR: checksum invalid → resultCode=004`);
    return { result_code: "004", result_desc: "Checksum không hợp lệ" };
  }

  console.log(`[BIDV_GETBILL] serviceId=${serviceId} checksum=OK → processGetBill vaCode=${resolved.vaCode}`);

  const result = await processGetBill({
    customerId,
    merchantId: resolved.merchantId ?? undefined,
    vaCode: resolved.vaCode,
  });

  console.log(`[BIDV_GETBILL] serviceId=${serviceId} resultCode=${result.result_code} total_amount=${result.total_amount ?? "-"}`);
  return result;
}

// ─── handlePayBill ────────────────────────────────────────────────────────────
// Toàn bộ flow: validate → resolve config → verify checksum → processPayBill
export interface HandlePayBillParams {
  serviceId: string;
  customerId: string;
  checksum: string;
  transId: string;
  amount: number | string;
  billId?: string;
  transDate?: string;
  senderName?: string;
  senderAccount?: string;
}

export async function handlePayBill(params: HandlePayBillParams): Promise<PayBillResponse> {
  const { serviceId, customerId, checksum, transId, amount, billId, transDate, senderName, senderAccount } = params;

  if (!serviceId || !customerId) {
    return { result_code: "001", result_desc: "Thiếu tham số bắt buộc" };
  }
  if (!transId) {
    return { result_code: "001", result_desc: "Thiếu tham số trans_id" };
  }
  if (amount === undefined || amount === null || amount === "") {
    return { result_code: "001", result_desc: "Thiếu tham số amount" };
  }
  if (!checksum) {
    console.warn(`[BIDV_PAYBILL] serviceId=${serviceId} transId=${transId} → result=001 (thiếu checksum)`);
    return { result_code: "001", result_desc: "Thiếu tham số checksum" };
  }

  console.log(`[BIDV_PAYBILL] transId=${transId} serviceId=${serviceId} customerId=${customerId}`);

  const resolved = await resolveLocationConfig(serviceId, customerId);
  if (!resolved.vaCode) {
    console.warn(`[BIDV_PAYBILL] transId=${transId} serviceId=${serviceId} ERROR: ${resolved.error} → resultCode=006`);
    return { result_code: "006", result_desc: "Service ID không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_PAYBILL] resolvedVaCode=${resolved.vaCode}`);

  if (!resolved.secretCode) {
    console.warn(`[BIDV_PAYBILL] transId=${transId} ERROR: secretCode chưa cấu hình → resultCode=031`);
    return { result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" };
  }

  const checksumValid = verifyPayBillChecksum(
    resolved.secretCode,
    transId,
    String(amount),
    checksum,
  );

  if (!checksumValid) {
    console.warn(`[BIDV_PAYBILL] transId=${transId} ERROR: checksum invalid → resultCode=004`);
    return { result_code: "004", result_desc: "Checksum không hợp lệ" };
  }

  console.log(`[BIDV_PAYBILL] transId=${transId} checksum=OK → processPayBill vaCode=${resolved.vaCode} amount=${amount}`);

  const result = await processPayBill({
    merchantId: resolved.merchantId ?? undefined,
    vaCode: resolved.vaCode,
    billCode: billId || undefined,
    amount: parseFloat(String(amount)),
    transactionId: transId || undefined,
    paymentTime: String(transDate ?? ""),
    senderName: senderName ? String(senderName) : undefined,
    senderAccount: senderAccount ? String(senderAccount) : undefined,
  });

  console.log(`[BIDV_PAYBILL] transId=${transId} serviceId=${serviceId} resultCode=${result.result_code}`);
  return result;
}
