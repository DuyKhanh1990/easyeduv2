/**
 * BIDV Service — Phase 1 scaffold
 * Logic thực tế (OAuth token, JWE/JWS, Virtual Account, QR) sẽ được triển khai ở Phase 2.
 */

export type BidvEnvironment = "UAT" | "Production";

const BIDV_BASE_URLS: Record<BidvEnvironment, string> = {
  UAT: "https://bidv.net:9303/bidvorg/service",
  Production: "https://bidv.net:9303/bidvorg/service", // sẽ cập nhật khi có Production URL
};

const OAUTH_PATH = "/openapi/oauth2/token";
const PAYGATE_BASE = "/open-banking/paygate";

export function getBidvBaseUrl(environment: BidvEnvironment): string {
  return BIDV_BASE_URLS[environment] ?? BIDV_BASE_URLS.UAT;
}

export function getOAuthUrl(environment: BidvEnvironment): string {
  return `${getBidvBaseUrl(environment)}${OAUTH_PATH}`;
}

export function getApiUrl(environment: BidvEnvironment, uriPath: string): string {
  return `${getBidvBaseUrl(environment)}${PAYGATE_BASE}${uriPath}`;
}

/**
 * Phase 2: Gọi BIDV OAuth để lấy access token.
 * Hiện tại dùng trong test-system-connection endpoint.
 */
export async function fetchOAuthToken(params: {
  clientId: string;
  clientSecret: string;
  environment: BidvEnvironment;
  scope?: string;
}): Promise<{ ok: boolean; token?: string; expiresIn?: number; error?: string }> {
  const url = getOAuthUrl(params.environment);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    scope: params.scope ?? "read/ewallet",
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json().catch(() => null);
    if (!data?.access_token) {
      return { ok: false, error: "Phản hồi không chứa access_token" };
    }

    return { ok: true, token: data.access_token, expiresIn: data.expires_in };
  } catch (err: any) {
    if (err?.name === "TimeoutError") return { ok: false, error: "Timeout — không kết nối được BIDV" };
    return { ok: false, error: err?.message || "Lỗi kết nối" };
  }
}

/**
 * Phase 2: Tạo/Sửa/Hủy Virtual Account (TKDD).
 */
export async function createVirtualAccount(_params: unknown): Promise<never> {
  throw new Error("createVirtualAccount: chưa triển khai (Phase 2)");
}

/**
 * Phase 2: Tạo VietQR cho Virtual Account.
 */
export async function generateVietQR(_params: unknown): Promise<never> {
  throw new Error("generateVietQR: chưa triển khai (Phase 2)");
}

/**
 * Phase 2: Kiểm tra trạng thái giao dịch.
 */
export async function inquiryTransaction(_params: unknown): Promise<never> {
  throw new Error("inquiryTransaction: chưa triển khai (Phase 2)");
}

/**
 * Phase 2: Đối soát giao dịch.
 */
export async function reconcile(_params: unknown): Promise<never> {
  throw new Error("reconcile: chưa triển khai (Phase 2)");
}
