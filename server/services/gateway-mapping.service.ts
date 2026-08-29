/**
 * Gateway Mapping Service
 *
 * CRM gọi service này sau khi gắn Zalo với học viên.
 * Push user mapping lên gateway: zaloUserId → userId + tenantId
 *
 * Env vars cần:
 *   GATEWAY_INTERNAL_URL  — URL của gateway (VD: https://easyeduzalo.easyedu.vn)
 *   ZALO_GATEWAY_SHARED_SECRET — shared secret giữa CRM và gateway
 *   GATEWAY_TENANT_ID — tenantId của CRM này trong hệ thống gateway (VD: easyeduv2)
 */

const GATEWAY_INTERNAL_URL =
  process.env.GATEWAY_INTERNAL_URL || process.env.GATEWAY_URL || "";
const GATEWAY_SHARED_SECRET = process.env.ZALO_GATEWAY_SHARED_SECRET || "";
const GATEWAY_TENANT_ID = process.env.GATEWAY_TENANT_ID || "";

/**
 * Push user-tenant mapping lên gateway.
 * Fire-and-forget — không ảnh hưởng luồng chính nếu thất bại.
 */
export async function pushUserMappingToGateway(
  zaloUserId: string,
  userId: string,
): Promise<void> {
  if (!GATEWAY_INTERNAL_URL || !GATEWAY_TENANT_ID) {
    // Chưa cấu hình gateway — bỏ qua, không throw
    return;
  }

  try {
    const res = await fetch(`${GATEWAY_INTERNAL_URL}/api/gateway/internal/map-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-secret": GATEWAY_SHARED_SECRET,
      },
      body: JSON.stringify({
        zaloUserId,
        userId,
        tenantId: GATEWAY_TENANT_ID,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[GatewayMapping] Push mapping thất bại (${res.status}): ${text}`,
      );
    } else {
      console.log(
        `[GatewayMapping] ✓ Pushed mapping: zaloUserId=${zaloUserId} → userId=${userId}, tenant=${GATEWAY_TENANT_ID}`,
      );
    }
  } catch (err: any) {
    // Fire-and-forget — chỉ warn, không throw
    console.warn(`[GatewayMapping] Không thể push mapping:`, err.message);
  }
}
