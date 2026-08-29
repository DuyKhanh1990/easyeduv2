import { db } from "../../db";
import { omicallLocationConfigs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "../../lib/encryption";

export const OMICALL_DEFAULT_AUTO_CALL_URL = "https://public-v1-stg.omicall.com";

export type OmicallConfig = {
  locationId: string;
  serviceName: string;
  authUser: string;
  sipRealm: string;
  authKey: string;
  authKeyDecryptionFailed: boolean;
  hotline: string;
  callHistoryUrl: string;
  autoCallUrl: string;
  isActive: boolean;
};

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getCallHistoryUrls(config: OmicallConfig): string[] {
  return [...new Set([config.callHistoryUrl, config.autoCallUrl].map(normalizeUrl).filter(Boolean))];
}

async function requestCallHistory(
  config: OmicallConfig,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ response: Response; payload: any }> {
  const errors: string[] = [];

  for (const baseUrl of getCallHistoryUrls(config)) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Call Transaction V3 uses the API key directly, not a Bearer token.
          "x-api-key": config.authKey,
        },
        body: JSON.stringify(body),
        signal,
      });
      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`phản hồi không phải JSON (HTTP ${response.status})`);
      }

      if (!response.ok || (payload?.status_code !== undefined && payload.status_code !== 9999)) {
        const message =
          payload?.payload?.message ||
          payload?.payload?.error ||
          payload?.message ||
          payload?.error ||
          `HTTP ${response.status}`;
        throw new Error(message);
      }

      return { response, payload };
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
      errors.push(`${baseUrl}: ${error?.message || "fetch failed"}`);
    }
  }

  throw new Error(`Không thể lấy lịch sử cuộc gọi Omicall. ${errors.join(" | ")}`);
}

export async function getOmicallConfig(locationId: string): Promise<OmicallConfig> {
  const [row] = await db
    .select()
    .from(omicallLocationConfigs)
    .where(eq(omicallLocationConfigs.locationId, locationId))
    .limit(1);

  let authKey = "";
  let authKeyDecryptionFailed = false;
  if (row?.authKeyEncrypted) {
    try {
      authKey = decrypt(row.authKeyEncrypted);
    } catch {
      // The encryption secret can differ after importing or restoring a
      // project. Keep the non-secret settings readable so an admin can
      // replace the key from the settings screen.
      authKeyDecryptionFailed = true;
    }
  }

  return {
    locationId,
    serviceName: row?.serviceName || "omicall",
    authUser: row?.authUser || "",
    sipRealm: row?.sipRealm || "",
    authKey,
    authKeyDecryptionFailed,
    hotline: row?.hotline || "",
    callHistoryUrl: normalizeUrl(row?.callHistoryUrl || ""),
    autoCallUrl: normalizeUrl(row?.autoCallUrl || OMICALL_DEFAULT_AUTO_CALL_URL),
    isActive: row?.isEnabled ?? false,
  };
}

export async function fetchOmicallAccessToken(
  config: OmicallConfig,
  signal?: AbortSignal,
): Promise<string> {
  return fetchOmicallAccessTokenAt(config, config.autoCallUrl, signal);
}

async function fetchOmicallAccessTokenAt(
  config: OmicallConfig,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.authKey) throw new Error("Chưa cấu hình Auth Key/API Key Omicall");
  if (!baseUrl) throw new Error("Chưa cấu hình URL xác thực Omicall");

  const response = await fetch(
    `${normalizeUrl(baseUrl)}/api/auth?apiKey=${encodeURIComponent(config.authKey)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.status_code !== 9999 || !payload?.payload?.access_token) {
    const message = payload?.payload?.message || payload?.message || payload?.error || `Omicall trả HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload.payload.access_token as string;
}

/**
 * Call Transaction tenants may expose the auth endpoint on the tenant CRM
 * host, while click-to-call uses the separate Auto Call host. Try the tenant
 * host first for history, then preserve compatibility with the configured
 * Auto Call host.
 */
export async function fetchOmicallHistoryAccessToken(
  config: OmicallConfig,
  signal?: AbortSignal,
): Promise<string> {
  const urls = [...new Set([config.callHistoryUrl, config.autoCallUrl].filter(Boolean))];
  const errors: string[] = [];

  for (const url of urls) {
    try {
      return await fetchOmicallAccessTokenAt(config, url, signal);
    } catch (error: any) {
      errors.push(`${url}: ${error?.message || "fetch failed"}`);
    }
  }

  throw new Error(`Không thể lấy Access Token Omicall. ${errors.join(" | ")}`);
}

export async function probeOmicallCallHistory(
  config: OmicallConfig,
  signal?: AbortSignal,
): Promise<void> {
  if (!config.callHistoryUrl && !config.autoCallUrl) {
    throw new Error("Chưa cấu hình URL API lịch sử cuộc gọi Omicall");
  }

  const now = Date.now();
  await requestCallHistory(
    config,
    "/api/v3/call-transaction/search?page=1&size=1",
    {
      filter: {
        fromDate: now - 24 * 60 * 60 * 1000,
        toDate: now,
      },
      sort: {
        field: "created_date",
        isAsc: false,
      },
    },
    signal,
  );
}

export type OmicallCallHistoryFilters = {
  page: number;
  size: number;
  fromDate: number;
  toDate: number;
  keyword?: string;
  direction?: "outbound" | "inbound" | "local";
  isAnswer?: boolean;
};

export type OmicallCallHistoryPage = {
  items: Record<string, unknown>[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export async function fetchOmicallCallHistory(
  config: OmicallConfig,
  filters: OmicallCallHistoryFilters,
  signal?: AbortSignal,
): Promise<OmicallCallHistoryPage> {
  if (!config.callHistoryUrl && !config.autoCallUrl) {
    throw new Error("Chưa cấu hình URL API lịch sử cuộc gọi Omicall");
  }

  const { response, payload } = await requestCallHistory(
    config,
    `/api/v3/call-transaction/search?page=${filters.page}&size=${filters.size}`,
    {
      filter: {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        ...(filters.keyword ? { keyword: filters.keyword } : {}),
        ...(filters.direction ? { directions: [filters.direction] } : {}),
        ...(filters.isAnswer === undefined ? {} : { isAnswer: filters.isAnswer }),
      },
      sort: {
        field: "created_date",
        isAsc: false,
      },
    },
    signal,
  );

  if (response.status === 204) {
    return {
      items: [],
      pageNumber: filters.page,
      pageSize: filters.size,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
    };
  }

  const result = payload?.payload && typeof payload.payload === "object"
    ? payload.payload
    : payload || {};
  const items = Array.isArray(result.items)
    ? result.items.filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  console.log("[Omicall] Call History V3 response:", JSON.stringify({
    status: response.status,
    topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    payloadKeys: payload?.payload && typeof payload.payload === "object" ? Object.keys(payload.payload) : [],
    itemCount: items.length,
    requestedFromDate: filters.fromDate,
    requestedToDate: filters.toDate,
  }));
  const totalItems = Number(payload?.total_items ?? payload?.totalItems ?? result.total_items ?? result.totalItems ?? items.length) || 0;
  const pageSize = Number(payload?.page_size ?? payload?.pageSize ?? result.page_size ?? result.pageSize ?? filters.size) || filters.size;
  const pageNumber = Number(payload?.page_number ?? payload?.pageNumber ?? result.page_number ?? result.pageNumber ?? filters.page) || filters.page;

  return {
    items,
    pageNumber,
    pageSize,
    totalItems,
    totalPages: Number(payload?.total_pages ?? payload?.totalPages ?? result.total_pages ?? result.totalPages ?? Math.ceil(totalItems / pageSize)) || 0,
    hasNext: Boolean(payload?.has_next ?? payload?.hasNext ?? result.has_next ?? result.hasNext ?? pageNumber * pageSize < totalItems),
  };
}

export async function fetchOmicallHotlines(
  config: OmicallConfig,
  accessToken: string,
  extension: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(
    `${normalizeUrl(config.autoCallUrl)}/api/call_center/hotline/list?extension=${encodeURIComponent(extension)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    },
  );

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.status_code !== 9999 || !Array.isArray(payload?.payload)) {
    const message =
      payload?.payload?.message ||
      payload?.message ||
      payload?.error ||
      `Không thể lấy danh sách Hotline của máy lẻ (HTTP ${response.status})`;
    throw new Error(message);
  }

  return payload.payload
    .filter((value: unknown): value is string => typeof value === "string")
    .map((value: string) => value.trim())
    .filter(Boolean);
}

export async function clickToCall(
  config: OmicallConfig,
  extension: string,
  hotline: string,
  phoneNumber: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!config.authKey) throw new Error("Chưa cấu hình Auth Key/API Key Omicall");
  if (!config.autoCallUrl) throw new Error("Chưa cấu hình Auto Call URL Omicall");
  if (!extension) throw new Error("Nhân sự chưa được gán đầu số nội bộ Omicall");
  if (!hotline) throw new Error("Chưa cấu hình Hotline gọi ra Omicall");

  const accessToken = await fetchOmicallAccessToken(config, signal);
  const allowedHotlines = await fetchOmicallHotlines(config, accessToken, extension, signal);
  const normalizePhone = (value: string) => value.replace(/[^\d]/g, "");
  if (
    allowedHotlines.length > 0 &&
    !allowedHotlines.some((value) => normalizePhone(value) === normalizePhone(hotline))
  ) {
    throw new Error(`Hotline ${hotline} không được Omicall cấp phép cho máy lẻ ${extension}`);
  }

  const response = await fetch(`${normalizeUrl(config.autoCallUrl)}/api/click2call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.authKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      extension,
      hotline,
      phone_number: phoneNumber,
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || (payload?.status_code !== undefined && payload.status_code !== 9999)) {
    const message =
      payload?.payload?.message ||
      payload?.payload?.error ||
      payload?.message ||
      payload?.error ||
      `Omicall trả HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function testOmicallConnection(
  config: OmicallConfig,
  signal?: AbortSignal,
): Promise<void> {
  await probeOmicallCallHistory(config, signal);
}