import type { Request, Response } from "express";
import { resolveUserTenant, resolveCrmUrl, resolveTenantByUrl } from "./tenant.service.js";
import { issueGatewayToken, issueGuestToken, decodeCrmToken, decodeGatewayToken } from "./jwt.service.js";

// ─── Zalo token verification ──────────────────────────────────────────────────

async function verifyZaloToken(
  accessToken: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://graph.zalo.me/v2.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = (await res.json()) as any;
    if (!res.ok || !data.id || data.error) return null;
    return { id: String(data.id), name: data.name ?? "" };
  } catch {
    return null;
  }
}

// ─── Auth proxy: POST /api/mobile/auth/zalo ───────────────────────────────────

export async function proxyZaloAuth(
  req: Request,
  res: Response,
  gatewayPublicUrl: string,
): Promise<void> {
  const { accessToken } = req.body ?? {};
  if (!accessToken || typeof accessToken !== "string") {
    res.status(400).json({ error: "Thiếu accessToken" });
    return;
  }

  // 1. Verify Zalo token → lấy zaloUserId
  const zaloUser = await verifyZaloToken(accessToken);
  if (!zaloUser) {
    res.status(401).json({ error: "Token Zalo không hợp lệ" });
    return;
  }
  const zaloUserId = zaloUser.id;
  console.log(`[GatewayAuth/Zalo] zaloUserId=${zaloUserId}`);

  // 2. Lookup user_tenant_map → tenantId
  const mapping = await resolveUserTenant(zaloUserId);

  if (!mapping) {
    // Chưa có mapping → guest JWT
    console.log(`[GatewayAuth/Zalo] Chưa có tenant mapping cho zaloUserId=${zaloUserId} → guest`);
    const guestToken = issueGuestToken(zaloUserId);
    res.json({
      token: guestToken,
      tenantId: null,
      center: null,
      needsOnboarding: true,
      userType: "guest",
    });
    return;
  }

  const { userId, tenantId } = mapping;

  // 3. Lookup CRM URL
  const crmUrl = await resolveCrmUrl(tenantId);
  if (!crmUrl) {
    console.error(`[GatewayAuth/Zalo] tenantId=${tenantId} không có crmUrl trong center_registry`);
    res.status(503).json({ error: `Tenant "${tenantId}" chưa được cấu hình CRM URL` });
    return;
  }

  // 4. Forward đến CRM để lấy user info + role
  let userType: "student" | "parent" | "staff" = "student";
  try {
    const crmRes = await fetch(`${crmUrl}/api/mobile/auth/zalo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gateway": "easyeduzalo" },
      body: JSON.stringify({ accessToken }),
    });
    const crmData = (await crmRes.json()) as any;

    // Lấy userType từ CRM response
    if (crmData?.userType && ["student", "parent", "staff"].includes(crmData.userType)) {
      userType = crmData.userType;
    }

    // Nếu CRM trả needsOnboarding (Zalo chưa link trong CRM), vẫn issue token với tenantId
    // vì mapping gateway đã biết userId rồi
  } catch (err: any) {
    console.warn(`[GatewayAuth/Zalo] CRM call thất bại (${crmUrl}): ${err.message} — dùng role mặc định`);
  }

  // 5. Issue gateway JWT: { id: userId, tenantId, role }
  const gatewayToken = issueGatewayToken({ id: userId, tenantId, role: userType });

  res.json({
    token: gatewayToken,
    tenantId,
    center: gatewayPublicUrl,
    needsOnboarding: false,
    userType,
  });
}

// ─── Auth proxy: POST /api/mobile/auth/login ─────────────────────────────────
//
// Frontend gửi:  { username, password, center: "https://easyeduv2.easyedu.vn" }
// Gateway tự resolve: center URL → tenantId → crmUrl  (không expose tenantId ra ngoài)
// Backward-compat: vẫn chấp nhận tenantId nếu gửi thẳng (admin/debug)

export async function proxyLoginAuth(
  req: Request,
  res: Response,
  gatewayPublicUrl: string,
): Promise<void> {
  try {
    const { username, password, center, tenantId: legacyTenantId } = req.body ?? {};

    let resolvedTenantId: string;
    let resolvedCrmUrl: string;

    if (center && typeof center === "string") {
      // ── Multi-tenant flow: frontend gửi center URL ─────────────────────────
      const tenant = await resolveTenantByUrl(center);
      if (!tenant) {
        console.warn(`[GatewayAuth/Login] center không tìm thấy trong registry: "${center}"`);
        res.status(401).json({ error: `Trung tâm "${center}" chưa được đăng ký. Liên hệ quản trị viên.` });
        return;
      }
      resolvedTenantId = tenant.tenantId;
      resolvedCrmUrl = tenant.crmUrl;
      console.log(`[GatewayAuth/Login] center="${center}" → tenantId="${resolvedTenantId}" → crmUrl="${resolvedCrmUrl}"`);

    } else if (legacyTenantId && typeof legacyTenantId === "string") {
      // ── Legacy flow: tenantId gửi trực tiếp (backward-compat) ────────────
      const crmUrl = await resolveCrmUrl(legacyTenantId);
      if (!crmUrl) {
        console.warn(`[GatewayAuth/Login] tenantId không tìm thấy: "${legacyTenantId}"`);
        res.status(401).json({ error: `Tenant "${legacyTenantId}" chưa được cấu hình.` });
        return;
      }
      resolvedTenantId = legacyTenantId;
      resolvedCrmUrl = crmUrl.replace(/\/+$/, "");
      console.log(`[GatewayAuth/Login] legacyTenantId="${resolvedTenantId}" → crmUrl="${resolvedCrmUrl}"`);

    } else {
      res.status(400).json({
        error: "Thiếu thông tin trung tâm. Gửi kèm trường 'center' (URL domain của trung tâm).",
      });
      return;
    }

    if (!username || !password) {
      res.status(400).json({ error: "Thiếu username hoặc password" });
      return;
    }

    // 1. Forward đến CRM — chỉ gửi username/password, không leak tenantId
    const crmRes = await fetch(`${resolvedCrmUrl}/api/mobile/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gateway": "easyeduzalo" },
      body: JSON.stringify({ username, password }),
    });

    const crmData = (await crmRes.json()) as any;

    if (!crmRes.ok || !crmData.token) {
      console.warn(`[GatewayAuth/Login] CRM từ chối (${crmRes.status}): tenantId="${resolvedTenantId}" user="${username}"`);
      res.status(crmRes.status).json(crmData);
      return;
    }

    // 2. Decode CRM JWT → lấy userId
    const decoded = decodeCrmToken(crmData.token);
    if (!decoded?.id) {
      console.error(`[GatewayAuth/Login] Không decode được CRM token: tenantId="${resolvedTenantId}"`);
      res.status(500).json({ error: "Gateway không decode được CRM token" });
      return;
    }

    // 3. Xác định role
    let role: "student" | "parent" | "staff" = "student";
    if (crmData.userType === "staff") role = "staff";
    else if (crmData.userType === "parent") role = "parent";

    // 4. Issue gateway JWT: { id: userId, tenantId, role }
    const gatewayToken = issueGatewayToken({ id: decoded.id, tenantId: resolvedTenantId, role });

    console.log(`[GatewayAuth/Login] Thành công: user="${username}" tenantId="${resolvedTenantId}" role="${role}"`);

    res.json({
      ...crmData,
      token: gatewayToken,
      tenantId: resolvedTenantId,
      center: gatewayPublicUrl,
      needsOnboarding: false,
    });

  } catch (err: any) {
    console.error("[GatewayAuth/Login] Lỗi không mong đợi:", err.message);
    res.status(500).json({ error: "Lỗi gateway nội bộ. Vui lòng thử lại." });
  }
}

// ─── Tenant resolution từ JWT (dùng cho proxy middleware) ────────────────────

export function extractTenantFromRequest(req: Request): {
  tenantId: string | null;
  userId: string | null;
} {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return { tenantId: null, userId: null };

  const token = authHeader.slice(7);
  const decoded = decodeGatewayToken(token);
  if (!decoded) return { tenantId: null, userId: null };

  return {
    tenantId: decoded.tenantId ?? null,
    userId: decoded.id ?? null,
  };
}
