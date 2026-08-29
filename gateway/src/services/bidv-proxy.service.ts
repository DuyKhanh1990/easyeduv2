import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export interface ProxyResult {
  status: number;
  body: unknown;
  latencyMs: number;
}

// Hop-by-hop headers không được forward
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

/**
 * Forward nguyên request đến backend:
 * - Giữ nguyên method, headers (trừ hop-by-hop), body
 * - Trả nguyên response về
 * - Nếu backend lỗi → HTTP 200, JSON theo chuẩn BIDV (result_code: "031")
 */
export async function proxyRequest(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  backendBaseUrl: string,
  requestId: string,
): Promise<ProxyResult> {
  const start = Date.now();

  // Ghép target URL: baseUrl của backend + path từ request
  const targetUrl = new URL(path, backendBaseUrl);

  const rawBody =
    body !== undefined && method.toUpperCase() !== "GET"
      ? JSON.stringify(body)
      : undefined;

  // Build forward headers
  const forwardHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (v === undefined) continue;
    forwardHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  if (rawBody) {
    forwardHeaders["content-type"] = "application/json";
    forwardHeaders["content-length"] = Buffer.byteLength(rawBody).toString();
  }

  return new Promise<ProxyResult>((resolve) => {
    const parsed = new URL(targetUrl.toString());
    const isHttps = parsed.protocol === "https:";
    const transport: typeof http | typeof https = isHttps ? https : http;
    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : isHttps
        ? 443
        : 80;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port,
      path: parsed.pathname + (parsed.search || ""),
      method: method.toUpperCase(),
      headers: forwardHeaders,
      timeout: 30_000,
    };

    const req = transport.request(options, (proxyRes) => {
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const latencyMs = Date.now() - start;
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { result_code: "031", result_desc: raw || "Có lỗi phát sinh từ hệ thống" };
        }
        resolve({ status: proxyRes.statusCode ?? 200, body: parsed, latencyMs });
      });
    });

    req.on("error", (err) => {
      const latencyMs = Date.now() - start;
      console.error(`[BIDVProxy] ${requestId} backend error: ${err.message}`);
      resolve({
        status: 200,
        body: { result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" },
        latencyMs,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      const latencyMs = Date.now() - start;
      console.error(`[BIDVProxy] ${requestId} backend timeout after ${latencyMs}ms`);
      resolve({
        status: 200,
        body: { result_code: "031", result_desc: "Có lỗi phát sinh từ hệ thống" },
        latencyMs,
      });
    });

    if (rawBody) req.write(rawBody);
    req.end();
  });
}
