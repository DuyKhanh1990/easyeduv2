const VOIP24H_AUTH_URL = "https://api.voip24h.vn/v3/authentication";

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

export async function authenticateVoip24h(
  credentials: Voip24hCredentials,
  signal?: AbortSignal,
): Promise<Voip24hAuthResult> {
  const response = await fetch(VOIP24H_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      // The documentation table defines this as a boolean; do not send "true" as a string.
      isLonglive: credentials.isLonglive,
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as any;
  const token = typeof payload?.data?.token === "string" ? payload.data.token : "";
  if (!response.ok || Number(payload?.status) !== 1000 || !token) {
    const detail = typeof payload?.message === "string" ? payload.message : "";
    throw new Error(detail || `VOIP24H không xác thực được (HTTP ${response.status}).`);
  }

  return {
    token,
    createAt: typeof payload?.data?.createAt === "string" ? payload.data.createAt : null,
    expiresAt: typeof payload?.data?.expried === "string"
      ? payload.data.expried
      : typeof payload?.data?.expired === "string"
        ? payload.data.expired
        : null,
    isLonglive: typeof payload?.data?.isLonglive === "boolean"
      ? payload.data.isLonglive
      : credentials.isLonglive,
  };
}
