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

  console.log("[BIDV_DEBUG]", {
    remote: req.socket.remoteAddress,
    ip: req.ip,
    xff: req.headers["x-forwarded-for"],
    xreal: req.headers["x-real-ip"],
  });

  const clientIp = normalizeIp(req.ip || req.socket.remoteAddress);
  if (BIDV_PRODUCTION_IPS.has(clientIp)) return next();

  console.warn(`[BIDV_IP_ALLOWLIST] Rejected request from ${clientIp || "unknown"}`);
  return res.status(403).json({
    result_code: "403",
    result_desc: "Forbidden",
  });
}

/**
 * Temporary GETBILL fallback: an unlisted IP may reach the existing
 * checksum validation, but never bypass it. Requests without a checksum keep
 * the original IP-deny behavior. PAYBILL continues to use the strict IP gate.
 */
export function requireBidvGetBillIpOrChecksum(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (process.env.NODE_ENV !== "production") return next();

  const clientIp = normalizeIp(req.ip || req.socket.remoteAddress);
  if (BIDV_PRODUCTION_IPS.has(clientIp)) return next();

  const checksum = String(req.body?.checksum ?? "").trim();
  if (!checksum) {
    console.warn(
      `[BIDV_IP_ALLOWLIST] GETBILL rejected from ${clientIp || "unknown"} (checksum missing)`,
    );
    return res.status(403).json({
      result_code: "403",
      result_desc: "Forbidden",
    });
  }

  console.warn(
    `[BIDV_IP_ALLOWLIST] GETBILL unlisted source ${clientIp || "unknown"} has checksum; continuing to checksum validation`,
  );
  return next();
}