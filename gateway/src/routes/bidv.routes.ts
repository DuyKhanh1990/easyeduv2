import { Router } from "express";
import { randomUUID } from "node:crypto";
import { lookupBackend } from "../services/registry.service.js";
import { proxyRequest } from "../services/bidv-proxy.service.js";

export const bidvRouter = Router();

const PROVIDER = "bidv";

/**
 * Handler chung cho getbill / paybill:
 *   1. Đọc service_id từ body
 *   2. Tra gateway_registry
 *   3. Proxy sang backend trung tâm
 *   4. Forward nguyên response
 */
async function handleBidvRoute(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const requestId = randomUUID();
  const routeStart = Date.now();

  // BIDV gửi service_id trong body (snake_case hoặc camelCase)
  const service_id: string | undefined =
    req.body?.service_id ?? req.body?.serviceId;

  if (!service_id) {
    console.warn(`[BIDVGateway] ${requestId} thiếu service_id`);
    res.status(200).json({ result_code: "001", result_desc: "Thiếu tham số service_id" });
    return;
  }

  // Tra registry
  const entry = await lookupBackend(PROVIDER, service_id).catch((err) => {
    console.error(`[BIDVGateway] ${requestId} registry lookup error:`, err.message);
    return null;
  });

  if (!entry) {
    console.warn(
      `[BIDVGateway] requestId=${requestId} provider=${PROVIDER} routingKey=${service_id} ` +
        `latency=${Date.now() - routeStart}ms status=NOT_FOUND`,
    );
    res.status(200).json({ result_code: "006", result_desc: "Service ID không đúng/ không tồn tại" });
    return;
  }

  // Proxy
  const result = await proxyRequest(
    req.method,
    req.path,
    req.headers as Record<string, string | string[] | undefined>,
    req.body,
    entry.baseUrl,
    requestId,
  );

  console.log(
    `[BIDVGateway] requestId=${requestId} provider=${PROVIDER} routingKey=${service_id} ` +
      `centerId=${entry.centerId} baseUrl=${entry.baseUrl} ` +
      `latency=${result.latencyMs}ms status=${result.status}`,
  );

  res.status(result.status).json(result.body);
}

// POST /api/bidv/getbill
bidvRouter.post("/getbill", handleBidvRoute);

// POST /api/bidv/paybill
bidvRouter.post("/paybill", handleBidvRoute);
