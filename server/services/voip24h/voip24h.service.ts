import { createHash } from "node:crypto";

const VOIP24H_AUTH_URL = "https://api.voip24h.vn/v3/authentication";
const VOIP24H_CALL_HISTORY_URL = "https://api.voip24h.vn/v3/call/history";
const VOIP24H_CALL_RECORDING_URL = "https://api.voip24h.vn/v3/call/recording";
const VOIP24H_EXTENSION_LIST_URL = "https://api.voip24h.vn/v3/extension/list";
const VOIP24H_CALL_DIAL_URL = "https://api.voip24h.vn/v3/call/dial";

function responseFieldNames(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "none";
  const names = Object.keys(value)
    .filter((name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name))
    .slice(0, 20);
  return names.length ? names.join(", ") : "none";
}

export type Voip24hCredentials = {
  apiKey: string;
  apiSecret: string;
  isLonglive: boolean;
};

export type Voip24hAuthResult = {
  token: string;
  createAt: string | null;
  expiresAt: string | null;
  isLonglive: boolean;
};

type CachedToken = {
  fingerprint: string;
  token: string;
  expiresAt: number;
};

export type Voip24hHistoryFilters = {
  dateStart?: string;
  dateEnd?: string;
  status?: string;
  type?: string;
  extension?: string;
  did?: string;
  callid?: string;
  id?: string;
  caller?: string;
  callee?: string;
  offset: number;
  limit: number;
};

export type Voip24hHistoryResult = {
  items: Record<string, unknown>[];
  totalItems: number;
};

export type Voip24hDialResult = {
  callId: string;
  state: string;
  phone: string;
  extension: string;
};

const tokenCache = new Map<string, CachedToken>();
const tokenRequests = new Map<string, { fingerprint: string; promise: Promise<string> }>();

export async function authenticateVoip24h(
  credentials: Voip24hCredentials,
  signal?: AbortSignal,
  options: { omitIsLonglive?: boolean } = {},
): Promise<Voip24hAuthResult> {
  const requestBody: Record<string, string | boolean> = {
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
  };
  if (!options.omitIsLonglive) {
    requestBody.isLonglive = credentials.isLonglive;
  }

  const response = await fetch(VOIP24H_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal,
  });

  const payload = await response.json().catch(() => null) as any;
  const token = typeof payload?.data?.token === "string" ? payload.data.token : "";
  const providerStatus = Number(payload?.status);
  const isSuccessfulProviderStatus = providerStatus === 200 || providerStatus === 1000;
  if (!response.ok || !isSuccessfulProviderStatus || !token) {
    const statusSummary = typeof payload?.status === "number"
      || (typeof payload?.status === "string" && /^\d{1,8}$/.test(payload.status))
      ? String(payload.status)
      : payload?.status == null
        ? "missing"
        : `non-numeric (${typeof payload.status})`;
    const reason = !response.ok
      ? `HTTP ${response.status} is not successful`
      : !isSuccessfulProviderStatus
        ? "provider status is neither 200 nor 1000"
        : "expected string token at data.token is missing";
    throw new Error(
      `VOIP24H authentication response mismatch: ${reason}; `
      + `provider status=${statusSummary}; `
      + `top-level fields=[${responseFieldNames(payload)}]; `
      + `data fields=[${responseFieldNames(payload?.data)}].`,
    );
  }

  return {
    token,
    createAt: typeof payload?.data?.createAt === "string" ? payload.data.createAt : null,
    expiresAt: typeof payload?.data?.expired === "string"
      ? payload.data.expired
      : typeof payload?.data?.expried === "string"
        ? payload.data.expried
        : null,
    isLonglive: typeof payload?.data?.isLongLive === "boolean"
      ? payload.data.isLongLive
      : typeof payload?.data?.isLonglive === "boolean"
        ? payload.data.isLonglive
        : credentials.isLonglive,
  };
}

export async function getVoip24hAccessToken(
  locationId: string,
  credentials: Voip24hCredentials,
  signal?: AbortSignal,
): Promise<string> {
  const fingerprint = createHash("sha256")
    .update(`${credentials.apiKey}\0${credentials.apiSecret}\0${credentials.isLonglive}`)
    .digest("hex");
  const cached = tokenCache.get(locationId);
  if (cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const pending = tokenRequests.get(locationId);
  if (pending?.fingerprint === fingerprint) return pending.promise;

  const promise = authenticateVoip24h(credentials, signal).then((result) => {
    // Provider tokens live for one or seven days. Refresh five minutes early.
    const lifetimeMs = credentials.isLonglive ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    tokenCache.set(locationId, {
      fingerprint,
      token: result.token,
      expiresAt: Date.now() + lifetimeMs - 5 * 60 * 1000,
    });
    return result.token;
  }).finally(() => {
    if (tokenRequests.get(locationId)?.promise === promise) tokenRequests.delete(locationId);
  });
  tokenRequests.set(locationId, { fingerprint, promise });
  return promise;
}

export async function fetchVoip24hCallHistory(
  credentials: Voip24hCredentials,
  locationId: string,
  filters: Voip24hHistoryFilters,
  signal?: AbortSignal,
): Promise<Voip24hHistoryResult> {
  const token = await getVoip24hAccessToken(locationId, credentials, signal);
  const url = new URL(VOIP24H_CALL_HISTORY_URL);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const payload = await response.json().catch(() => null) as any;
  const rawItems = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.items)
        ? payload.items
        : null;
  if (!response.ok || Number(payload?.status) !== 200 || !rawItems) {
    const detail = typeof payload?.message === "string" ? payload.message : "";
    throw new Error(detail || `VOIP24H không tải được lịch sử (HTTP ${response.status}).`);
  }

  const totalItems = Number(payload?.totalData ?? payload?.data?.totalData ?? payload?.pagination?.totalData);
  return {
    items: rawItems.filter((item: unknown) => item && typeof item === "object") as Record<string, unknown>[],
    totalItems: Number.isFinite(totalItems) ? Math.max(0, totalItems) : rawItems.length,
  };
}

export async function fetchVoip24hRecordingMetadata(
  credentials: Voip24hCredentials,
  locationId: string,
  callId: string,
  signal?: AbortSignal,
): Promise<{ wav?: string; ogg?: string }> {
  const token = await getVoip24hAccessToken(locationId, credentials, signal);
  const url = new URL(VOIP24H_CALL_RECORDING_URL);
  url.searchParams.set("callId", callId);

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const payload = await response.json().catch(() => null) as any;
  const media = payload?.data?.media;
  if (!response.ok || Number(payload?.status) !== 200 || !media || typeof media !== "object") {
    const detail = typeof payload?.message === "string" ? payload.message : "";
    throw new Error(detail || "VOIP24H không có bản ghi âm cho cuộc gọi này.");
  }
  return {
    wav: typeof media.wav === "string" ? media.wav : undefined,
    ogg: typeof media.ogg === "string" ? media.ogg : undefined,
  };
}

export async function fetchVoip24hExtensionList(
  credentials: Voip24hCredentials,
  locationId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const token = await getVoip24hAccessToken(locationId, credentials, signal);
  const response = await fetch(VOIP24H_EXTENSION_LIST_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const payload = await response.json().catch(() => null) as any;
  const rawItems = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.extensions)
      ? payload.data.extensions
      : [];
  if (!response.ok || Number(payload?.status) !== 200) {
    const detail = typeof payload?.message === "string" ? payload.message : "";
    throw new Error(detail || `VOIP24H không tải được danh sách máy nhánh (HTTP ${response.status}).`);
  }
  const extensions: string[] = rawItems.map((item: unknown) => {
    if (typeof item === "string" || typeof item === "number") return String(item).trim();
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return String(record.extension || record.ext || "").trim();
    }
    return "";
  }).filter((extension: string) => extension.length > 0);
  return [...new Set<string>(extensions)];
}

export async function dialVoip24h(
  credentials: Voip24hCredentials,
  locationId: string,
  input: { extension: string; phone: string },
  signal?: AbortSignal,
): Promise<Voip24hDialResult> {
  const token = await getVoip24hAccessToken(locationId, credentials, signal);
  const body = new URLSearchParams({
    extension: input.extension,
    phone: input.phone,
  });
  const response = await fetch(VOIP24H_CALL_DIAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });
  const payload = await response.json().catch(() => null) as any;
  const operation = payload?.data;
  const call = operation?.data;
  const callId = String(call?.callid ?? "").trim();
  const state = String(call?.state ?? "").trim();
  const outerStatus = payload?.status == null ? "missing" : String(payload.status);
  const operationStatus = operation?.status == null ? "missing" : String(operation.status);
  const providerMessage = typeof operation?.message === "string"
      ? operation.message
      : typeof payload?.message === "string"
        ? payload.message
        : "";
  const statusSummary = `HTTP ${response.status}; status=${outerStatus}; data.status=${operationStatus}`;
  const statusAccepted = response.ok &&
    Number(payload?.status) === 200 &&
    Number(operation?.status) === 1000 &&
    !/^(error|failed)$/i.test(providerMessage.trim());
  if (!statusAccepted) {
    const detail = providerMessage && !/^(success|ok|error|failed)$/i.test(providerMessage.trim())
      ? `: ${providerMessage.trim()}`
      : "";
    throw new Error(`VoIP24H từ chối lệnh gọi${detail} (${statusSummary}).`);
  }
  if (!call || typeof call !== "object" || Array.isArray(call) || !callId || !state) {
    const callFields = call && typeof call === "object" && !Array.isArray(call)
      ? Object.keys(call).slice(0, 12).join(", ") || "none"
      : "none";
    throw new Error(`VOIP24H chưa xác nhận cuộc gọi: phản hồi thiếu mã cuộc gọi hoặc trạng thái (${statusSummary}; data fields=[${callFields}]).`);
  }
  return {
    callId,
    state,
    phone: String(call.phone || input.phone),
    extension: String(call.extension || input.extension),
  };
}
