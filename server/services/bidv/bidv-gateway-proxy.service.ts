/**
 * BIDV Gateway Proxy Service
 *
 * Chịu trách nhiệm:
 *   1. Lookup gateway_registry theo provider + routing_key (service_id)
 *   2. Xác định self-route: gateway_registry.center_id == center_config.id
 *   3. Forward HTTP request sang backend trung tâm khi không phải self-route
 *
 * isSelfCenter() so sánh bằng UUID (center_config.id), không phụ thuộc domain/URL.
 * cachedCenterId chỉ được set khi đọc DB thành công — lỗi/DB chưa sẵn sàng sẽ retry ở request tiếp theo.
 */

import { db } from "../../db";
import { gatewayRegistry, centerConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import type { Request } from "express";

const GATEWAY_SOURCE = "easyedu-bidv-gateway";
const INTERNAL_TIMESTAMP_HEADER = "x-bidv-gateway-timestamp";
const INTERNAL_SIGNATURE_HEADER = "x-bidv-gateway-signature";
const INTERNAL_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
function getSharedGatewayUrl(): string {
  return process.env.BIDV_SHARED_GATEWAY_URL?.trim() || "https://easyeduv2.easyedu.vn";
}
const ROUTE_REGISTRATION_PATH = "/api/internal/bidv-gateway/registry";

function getGatewaySharedSecret(): string {
  const secret = process.env.BIDV_GATEWAY_SHARED_SECRET;
  if (!secret) {
    throw new Error("BIDV_GATEWAY_SHARED_SECRET is not configured");
  }
  return secret;
}

function gatewayRequestPayload(
  timestamp: string,
  method: string,
  path: string,
  body: unknown,
): string {
  return [timestamp, method.toUpperCase(), path, JSON.stringify(body ?? null)].join("\n");
}

function makeGatewaySignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: unknown,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(gatewayRequestPayload(timestamp, method, path, body))
    .digest("hex");
}

export function createBidvGatewayAuthHeaders(
  method: string,
  path: string,
  body: unknown,
): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    "Content-Type": "application/json",
    "X-Gateway-Source": GATEWAY_SOURCE,
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [INTERNAL_SIGNATURE_HEADER]: makeGatewaySignature(
      getGatewaySharedSecret(),
      timestamp,
      method,
      path,
      body,
    ),
  };
}

export function isTrustedBidvGatewayForward(req: Request): boolean {
  if (req.headers["x-gateway-source"] !== GATEWAY_SOURCE) return false;

  const secret = process.env.BIDV_GATEWAY_SHARED_SECRET;
  const timestamp = req.headers[INTERNAL_TIMESTAMP_HEADER];
  const signature = req.headers[INTERNAL_SIGNATURE_HEADER];
  if (!secret || typeof timestamp !== "string" || typeof signature !== "string") {
    return false;
  }

  const timestampMs = Number(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > INTERNAL_REQUEST_MAX_AGE_MS
  ) {
    return false;
  }

  const expected = makeGatewaySignature(
    secret,
    timestamp,
    req.method,
    req.path,
    req.body,
  );
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(signature, "hex");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function registerBidvRouteWithSharedGateway(
  route: {
    provider: "bidv";
    routingKey: string;
    centerId: string;
    name: string;
    baseUrl: string;
    isActive: true;
  },
): Promise<void> {
  const gatewayUrl = new URL(getSharedGatewayUrl());
  const centerUrl = new URL(route.baseUrl);
  if (gatewayUrl.origin === centerUrl.origin) return;

  const headers = createBidvGatewayAuthHeaders(
    "POST",
    ROUTE_REGISTRATION_PATH,
    route,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `${gatewayUrl.origin}${ROUTE_REGISTRATION_PATH}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(route),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(
        `Gateway route registration failed (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Self-center detection ────────────────────────────────────────────────────
// Chỉ cache khi đọc thành công; không cache null/undefined để retry được khi DB lỗi
let cachedCenterId: string | undefined;

export async function getCurrentCenterId(): Promise<string | null> {
  if (cachedCenterId !== undefined) return cachedCenterId;
  try {
    const [row] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (row?.id) {
      cachedCenterId = row.id;
      return cachedCenterId;
    }
    // DB trả về không có row — KHÔNG cache, retry ở request tiếp theo
    return null;
  } catch {
    // DB lỗi — KHÔNG cache, retry ở request tiếp theo
    return null;
  }
}

export async function isSelfCenter(registryCenterId: string | null | undefined): Promise<boolean> {
  if (!registryCenterId) return false;
  const currentId = await getCurrentCenterId();
  if (!currentId) return false;
  return currentId === registryCenterId;
}

// ─── Registry lookup ──────────────────────────────────────────────────────────
export interface RegistryEntry {
  id: string;
  provider: string;
  routingKey: string;
  centerId: string | null;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

export async function lookupRegistry(
  provider: string,
  routingKey: string,
): Promise<RegistryEntry | null> {
  const [row] = await db
    .select()
    .from(gatewayRegistry)
    .where(
      and(
        eq(gatewayRegistry.provider, provider),
        eq(gatewayRegistry.routingKey, routingKey),
        eq(gatewayRegistry.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ─── HTTP forward ─────────────────────────────────────────────────────────────
// Forward nguyên request body sang backend trung tâm.
// Thêm X-Forwarded-For và X-Gateway-Source.
// Không thay đổi body, không thay đổi checksum.
// Timeout mặc định 30 giây; khi timeout/lỗi mạng throw để caller trả result_code=031.

export interface ForwardResult {
  status: number;
  data: unknown;
}

export async function forwardRequest(
  baseUrl: string,
  path: string,
  method: string,
  incomingHeaders: Record<string, string | string[] | undefined>,
  body: unknown,
  timeoutMs = 30_000,
): Promise<ForwardResult> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;

  const headers = createBidvGatewayAuthHeaders(method, path, body);

  // Forward client IP nếu có
  const xff = incomingHeaders["x-forwarded-for"];
  if (xff) {
    headers["X-Forwarded-For"] = Array.isArray(xff) ? xff.join(", ") : String(xff);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    let data: unknown;
    try { data = await resp.json(); } catch { data = {}; }
    return { status: resp.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}
