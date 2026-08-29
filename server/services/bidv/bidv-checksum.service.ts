/**
 * BIDV Checksum Service
 *
 * GetBill:  Base64(HMAC_SHA256("{secretCode}|{service_id}|{customer_id}"))
 * PayBill:  Base64(HMAC_SHA256("{secretCode}|{trans_id}|{amount}"))
 */

import crypto from "crypto";

export function computeGetBillChecksum(
  secretCode: string,
  serviceId: string,
  customerId: string,
): string {
  const message = `${secretCode}|${serviceId}|${customerId}`;
  return crypto.createHmac("sha256", secretCode).update(message).digest("base64");
}

export function computePayBillChecksum(
  secretCode: string,
  transId: string,
  amount: string | number,
): string {
  const amountStr = String(amount);
  const message = `${secretCode}|${transId}|${amountStr}`;
  return crypto.createHmac("sha256", secretCode).update(message).digest("base64");
}

export function verifyGetBillChecksum(
  secretCode: string,
  serviceId: string,
  customerId: string,
  incomingChecksum: string,
): boolean {
  const expected = computeGetBillChecksum(secretCode, serviceId, customerId);
  return expected === incomingChecksum;
}

export function verifyPayBillChecksum(
  secretCode: string,
  transId: string,
  amount: string | number,
  incomingChecksum: string,
): boolean {
  const expected = computePayBillChecksum(secretCode, transId, amount);
  return expected === incomingChecksum;
}
