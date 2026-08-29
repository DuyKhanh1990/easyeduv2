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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Gateway-Source": "easyedu-bidv-gateway",
  };

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
