import "dotenv/config";
import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { handleOAuthCallback } from "./controllers/auth.controller.js";
import { handleWebhook, handleWebhookVerify, handleFacebookWebhook, handleFacebookWebhookVerify } from "./controllers/webhook.controller.js";
import { handleMapUser } from "./controllers/internal.controller.js";
import {
  listRoutes,
  listCenters,
  registerCenter,
  deactivateCenter,
  listFacebookPageRoutes,
  markFacebookPageRouteActive,
  markFacebookPageRouteInactive,
  markRouteActive,
  markRouteInactive,
  upsertFacebookPageRoute,
} from "./services/routing.service.js";
import { proxyZaloAuth, proxyLoginAuth, extractTenantFromRequest } from "./services/proxy.service.js";
import { resolveCrmUrl } from "./services/tenant.service.js";
// ─── BIDV Gateway (additive) ──────────────────────────────────────────────────
import { ensureBidvSchema } from "./bidv-db.js";
import { bidvRouter } from "./routes/bidv.routes.js";
import {
  upsertRegistry,
  deactivateRegistry,
  listRegistry,
} from "./services/registry.service.js";

const app = express();
const PORT = parseInt(process.env.GATEWAY_PORT || process.env.PORT || "3001", 10);
const ADMIN_SECRET = process.env.GATEWAY_ADMIN_SECRET || process.env.ZALO_GATEWAY_SHARED_SECRET || "";
const INTERNAL_SECRET = process.env.GATEWAY_INTERNAL_SECRET || process.env.ZALO_GATEWAY_SHARED_SECRET || "";

// URL công khai của gateway — trả về trong trường `center` của auth response
const GATEWAY_PUBLIC_URL =
  process.env.GATEWAY_PUBLIC_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

// ─── Middleware bảo vệ admin routes ──────────────────────────────────────────

function requireAdminSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const auth = req.headers["x-admin-secret"] || req.query.secret;
  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

// Middleware bảo vệ internal routes (CRM → Gateway)
function requireInternalSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const secret = req.headers["x-gateway-secret"];
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized — invalid gateway secret" });
  }
  return next();
}

// ─── Public routes ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "zalo-gateway",
    time: new Date().toISOString(),
    gatewayPublicUrl: GATEWAY_PUBLIC_URL,
  });
});

app.get("/zalo/callback", handleOAuthCallback);
app.get("/zalo/webhook", handleWebhookVerify);
app.post("/zalo/webhook", handleWebhook);

app.get("/facebook/webhook", handleFacebookWebhookVerify);
app.post("/facebook/webhook", handleFacebookWebhook);

// ─── Internal routes — CRM push mapping vào gateway ──────────────────────────
// POST /api/gateway/internal/map-user
// Body: { zaloUserId, userId, tenantId }
// Header: x-gateway-secret

app.post("/api/gateway/internal/map-user", requireInternalSecret, handleMapUser);

// ─── Auth endpoints — resolve tenant → forward CRM → issue gateway JWT ────────

// POST /api/mobile/auth/zalo
// Body: { accessToken }  (Zalo access token từ ZMP SDK)
// Flow: verify Zalo → lookup user_tenant_map → forward CRM → issue JWT { id, tenantId, role }
app.post("/api/mobile/auth/zalo", (req, res) => {
  return proxyZaloAuth(req, res, GATEWAY_PUBLIC_URL);
});

// POST /api/mobile/auth/login
// Body: { username, password, tenantId }
// tenantId bắt buộc — Mini App phải gửi kèm (user chọn trung tâm hoặc từ deep link)
app.post("/api/mobile/auth/login", (req, res) => {
  return proxyLoginAuth(req, res, GATEWAY_PUBLIC_URL);
});

// ─── Admin routes (yêu cầu x-admin-secret header) ────────────────────────────

app.get("/admin/routes", requireAdminSecret, async (_req, res) => {
  try {
    res.json(await listRoutes());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Facebook Page routing admin ──────────────────────────────────────────────

app.get("/admin/facebook/routes", requireAdminSecret, async (_req, res) => {
  try {
    res.json(await listFacebookPageRoutes());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/facebook/routes", requireAdminSecret, async (req, res) => {
  try {
    const { pageId, centerId } = req.body;
    if (!pageId || !centerId) {
      return res.status(400).json({ error: "pageId và centerId là bắt buộc" });
    }

    const route = await upsertFacebookPageRoute(pageId, centerId);
    console.log(`[Gateway Admin] Facebook Page routed: ${pageId} → ${route.centerId} (${route.centerUrl})`);
    return res.json({ ok: true, route });
  } catch (err: any) {
    const status = err.message?.startsWith("Center ") ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
});

app.patch("/admin/facebook/routes/:pageId/activate", requireAdminSecret, async (req, res) => {
  try {
    const pageId = req.params.pageId as string;
    await markFacebookPageRouteActive(pageId);
    return res.json({ ok: true, pageId, isActive: true });
  } catch (err: any) {
    const status = err.message?.startsWith("Không tìm thấy") || err.message?.startsWith("Center ")
      ? 400
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

app.patch("/admin/facebook/routes/:pageId/deactivate", requireAdminSecret, async (req, res) => {
  try {
    const pageId = req.params.pageId as string;
    await markFacebookPageRouteInactive(pageId);
    return res.json({ ok: true, pageId, isActive: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/admin/centers", requireAdminSecret, async (_req, res) => {
  try {
    res.json(await listCenters());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/centers", requireAdminSecret, async (req, res) => {
  try {
    const { centerId, centerUrl, description } = req.body;
    if (!centerId || !centerUrl) {
      return res.status(400).json({ error: "centerId và centerUrl là bắt buộc" });
    }
    await registerCenter(centerId, centerUrl, description);
    console.log(`[Gateway Admin] Registered center: ${centerId} → ${centerUrl}`);
    return res.json({ ok: true, centerId, centerUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch("/admin/routes/:oaId/activate", requireAdminSecret, async (req, res) => {
  try {
    const oaId = req.params.oaId as string;
    await markRouteActive(oaId);
    return res.json({ ok: true, oaId, isActive: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch("/admin/routes/:oaId/deactivate", requireAdminSecret, async (req, res) => {
  try {
    const oaId = req.params.oaId as string;
    await markRouteInactive(oaId);
    return res.json({ ok: true, oaId, isActive: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/admin/centers/:centerId", requireAdminSecret, async (req, res) => {
  try {
    const centerId = req.params.centerId as string;
    await deactivateCenter(centerId);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── BIDV Routes — đặt TRƯỚC /api catch-all để không bị intercept bởi JWT middleware ──
// POST /api/bidv/getbill  → tra registry → proxy sang backend trung tâm
// POST /api/bidv/paybill  → tra registry → proxy sang backend trung tâm
app.use("/api/bidv", bidvRouter);

// ─── BIDV Admin Routes ────────────────────────────────────────────────────────

app.get("/admin/bidv/registry", requireAdminSecret, async (_req, res) => {
  try {
    const provider = _req.query.provider as string | undefined;
    res.json(await listRegistry(provider));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/bidv/registry", requireAdminSecret, async (req, res) => {
  try {
    const { provider = "bidv", routingKey, centerId, name, baseUrl } = req.body;
    if (!routingKey || !centerId || !baseUrl) {
      return res
        .status(400)
        .json({ error: "routingKey, centerId và baseUrl là bắt buộc" });
    }
    const entry = await upsertRegistry({ provider, routingKey, centerId, name, baseUrl, isActive: true });
    console.log(`[BIDVGateway Admin] Upserted registry: ${provider}/${routingKey} → ${baseUrl}`);
    return res.json({ ok: true, entry });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete(
  "/admin/bidv/registry/:provider/:routingKey",
  requireAdminSecret,
  async (req, res) => {
    try {
      const provider = req.params.provider as string;
      const routingKey = req.params.routingKey as string;
      await deactivateRegistry(provider, routingKey);
      return res.json({ ok: true, provider, routingKey, isActive: false });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ─── API Proxy — multi-tenant routing ────────────────────────────────────────
//
// Mỗi request /api/* đều:
//   1. Decode JWT từ Authorization header → lấy tenantId
//   2. Lookup center_registry → lấy crmUrl
//   3. Forward request IN SUỐT đến CRM (giữ nguyên Authorization header)
//
// CRM validate JWT bình thường (shared secret) — chỉ đọc field `id`.
// KHÔNG hardcode bất kỳ CRM domain nào ở đây.

app.use("/api", async (req, res, next) => {
  // Resolve tenantId từ JWT
  const { tenantId } = extractTenantFromRequest(req);

  if (!tenantId) {
    // Không có token hoặc token không chứa tenantId → 401
    res.status(401).json({
      error: "Unauthorized — không tìm thấy tenantId trong JWT. Vui lòng đăng nhập lại.",
    });
    return;
  }

  // Resolve CRM URL từ tenantId
  const crmUrl = await resolveCrmUrl(tenantId);
  if (!crmUrl) {
    res.status(503).json({
      error: `Tenant "${tenantId}" chưa được cấu hình. Liên hệ admin gateway.`,
    });
    return;
  }

  // Tạo proxy middleware động cho tenantId này
  const proxy = createProxyMiddleware({
    target: crmUrl,
    changeOrigin: true,
    on: {
      error: (err, _req, proxyRes: any) => {
        console.error(`[Gateway Proxy] ${tenantId} → ${crmUrl} error:`, (err as Error).message);
        proxyRes.status(502).json({ error: "Gateway không thể kết nối đến CRM" });
      },
      proxyReq: (_proxyReq, proxyReqObj: any) => {
        console.log(
          `[Gateway Proxy] ${req.method} ${req.path} → ${crmUrl} (tenant=${tenantId})`,
        );
      },
    },
  });

  proxy(req, res, next);
});

// ─── Khởi động ────────────────────────────────────────────────────────────────

// Đảm bảo schema BIDV tồn tại (non-blocking, chạy song song với server)
ensureBidvSchema().catch((err) =>
  console.error("[BIDVGateway] ensureBidvSchema failed:", err.message),
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ZaloGateway] Service running on port ${PORT}`);
  console.log(`[ZaloGateway] Public URL:       ${GATEWAY_PUBLIC_URL}`);
  console.log(`[ZaloGateway] OAuth callback:   GET  /zalo/callback`);
  console.log(`[ZaloGateway] Webhook:          POST /zalo/webhook`);
  console.log(`[ZaloGateway] Health:           GET  /health`);
  console.log(`[ZaloGateway] Auth (Zalo):      POST /api/mobile/auth/zalo`);
  console.log(`[ZaloGateway] Auth (Login):     POST /api/mobile/auth/login`);
  console.log(`[ZaloGateway] Internal map:     POST /api/gateway/internal/map-user`);
  console.log(`[ZaloGateway] API proxy:        /api/* → CRM (per-tenant JWT routing)`);
  console.log(`[ZaloGateway] Admin:            /admin/* (x-admin-secret required)`);
  console.log(`[FacebookGateway] Webhook:      GET/POST /facebook/webhook`);
  console.log(`[FacebookGateway] Routes:       /admin/facebook/routes (x-admin-secret required)`);
  console.log(`[BIDVGateway] GetBill:          POST /api/bidv/getbill`);
  console.log(`[BIDVGateway] PayBill:          POST /api/bidv/paybill`);
  console.log(`[BIDVGateway] Registry admin:   /admin/bidv/registry (x-admin-secret required)`);
});
