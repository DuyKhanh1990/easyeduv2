import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";

const CLIENT_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
const VERSION_CHECK_INTERVAL_MS = 60_000;
const PENDING_UPDATE_STORAGE_KEY = "easyedu.pending-app-update";

type VersionResponse = {
  version?: string;
};

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(() => {
    if (CLIENT_VERSION === "dev" || typeof window === "undefined") return false;

    try {
      return window.sessionStorage.getItem(PENDING_UPDATE_STORAGE_KEY) === CLIENT_VERSION;
    } catch {
      return false;
    }
  });
  const [minimized, setMinimized] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (CLIENT_VERSION === "dev") return;

    try {
      const response = await fetch(`/api/app-version?check=${Date.now()}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;

      const data = (await response.json()) as VersionResponse;
      if (data.version && data.version !== CLIENT_VERSION) {
        setUpdateAvailable(true);
        try {
          window.sessionStorage.setItem(PENDING_UPDATE_STORAGE_KEY, CLIENT_VERSION);
        } catch {
          // Storage may be unavailable; the in-memory state still keeps the banner visible.
        }
      } else if (data.version === CLIENT_VERSION) {
        try {
          window.sessionStorage.removeItem(PENDING_UPDATE_STORAGE_KEY);
        } catch {
          // Ignore storage cleanup failures.
        }
      }
    } catch {
      // A temporary network failure should not interrupt the user's work.
    }
  }, []);

  useEffect(() => {
    if (CLIENT_VERSION === "dev") return;

    void checkForUpdate();
    const intervalId = window.setInterval(checkForUpdate, VERSION_CHECK_INTERVAL_MS);
    const handleFocus = () => { void checkForUpdate(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForUpdate]);

  if (!updateAvailable) return null;

  const reloadWithLatestVersion = () => {
    window.location.reload();
  };

  const minimizeBanner = () => {
    setMinimized(true);
  };

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9990] max-w-[calc(100vw-2rem)]"
      aria-live="polite"
    >
      {minimized ? (
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-blue-200 bg-white p-1.5 shadow-lg">
          <button
            type="button"
            onClick={reloadWithLatestVersion}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Có bản update mới</span>
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Mở rộng thông báo cập nhật"
            title="Mở rộng"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto w-[min(360px,calc(100vw-2rem))] rounded-xl border border-blue-200 bg-white p-3 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Có bản update mới</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Vui lòng bấm cập nhật để áp dụng.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={reloadWithLatestVersion}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Cập nhật
                </button>
                <button
                  type="button"
                  onClick={minimizeBanner}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Thu nhỏ
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={minimizeBanner}
              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Thu nhỏ thông báo cập nhật"
              title="Thu nhỏ"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}