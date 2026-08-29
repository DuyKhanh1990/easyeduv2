import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const TOKEN_KEY = "auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

/**
 * Native fetch calls exist in a number of older screens. Keep those calls
 * authenticated too, instead of requiring every caller to remember to add
 * the JWT header manually.
 */
export function installAuthFetchInterceptor(): void {
  if (typeof window === "undefined") return;

  const globalWindow = window as Window & { __easyeduAuthFetchInstalled?: boolean };
  if (globalWindow.__easyeduAuthFetchInstalled) return;
  globalWindow.__easyeduAuthFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    let isInternalApi = false;
    try {
      const parsedUrl = new URL(requestUrl, window.location.origin);
      isInternalApi =
        parsedUrl.origin === window.location.origin &&
        parsedUrl.pathname.startsWith("/api/");
    } catch {
      isInternalApi = false;
    }

    const parsedUrl = (() => {
      try {
        return new URL(requestUrl, window.location.origin);
      } catch {
        return null;
      }
    })();
    const isPublicApi =
      parsedUrl?.pathname.startsWith("/api/auth/") ||
      parsedUrl?.pathname.startsWith("/api/public/");

    const authHeaders = getAuthHeaders();
    if (!isInternalApi || isPublicApi) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Authorization")) {
      headers.set("Authorization", authHeaders.Authorization);
    }

    const response = await nativeFetch(
      input,
      authHeaders.Authorization ? { ...init, headers } : init,
    );

    if (response.status === 401 && window.location.pathname !== "/login") {
      clearAuthToken();
      window.location.assign("/login");
    }

    return response;
  };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    try {
      const json = JSON.parse(text);
      if (json.message) {
        const err = new Error(json.message) as any;
        if (json.invoiceLocked) err.invoiceLocked = true;
        if (json.invoiceCode) err.invoiceCode = json.invoiceCode;
        if (json.invoiceStatus) err.invoiceStatus = json.invoiceStatus;
        throw err;
      }
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Dữ liệu cấu hình gần như không đổi (locations, departments, CRM config…).
// Query dùng staleTime này sẽ không refetch khi navigate lại trong vòng 5 phút.
export const STATIC_STALE_TIME = 5 * 60_000; // 5 phút

// Default staleTime cho tất cả query động (danh sách lớp, học viên, tài chính…).
// - Component mount lại trong 30s → dùng cache, không fetch (điều hướng nhanh hơn).
// - Sau mutation + invalidateQueries → luôn refetch ngay, bỏ qua staleTime.
// → Data cập nhật tức thì sau mọi thao tác, không cần F5.
export const DEFAULT_STALE_TIME = 30_000; // 30 giây

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      staleTime: DEFAULT_STALE_TIME,
      retry: 1,
      retryDelay: 1500,
    },
    mutations: {
      retry: false,
    },
  },
});
