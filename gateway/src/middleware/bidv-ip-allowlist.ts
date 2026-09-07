import type { NextFunction, Request, Response } from "express";

const BIDV_PRODUCTION_IPS = new Set([
  "203.201.56.254",
  "203.201.58.254",
  "203.201.59.254",
  "203.201.59.251",
  "203.201.59.252",
]);

function normalizeIp(ip: string | undefined): string {
  if (!ip) return "";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function requireBidvProductionIp(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (process.env.NODE_ENV !== "production") return next();

  const clientIp = normalizeIp(req.ip || req.socket.remoteAddress);
  if (BIDV_PRODUCTION_IPS.has(clientIp)) return next();

  console.warn(`[BIDV_IP_ALLOWLIST] Rejected request from ${clientIp || "unknown"}`);
  return res.status(403).json({
    result_code: "403",
    result_desc: "Forbidden",
  });
}