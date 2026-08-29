import { useState, useCallback, useEffect, useRef } from "react";
import { navigation } from "@/lib/sidebar-navigation";
import { getAuthHeaders } from "@/lib/queryClient";

const STORAGE_KEY = "sidebar_visibility";
const LOCAL_SYNC_EVENT = "sidebar-visibility-changed";
const SERVER_UPDATE_EVENT = "sidebar-visibility-server-update";
const SERVER_URL = "/api/system-settings/sidebar-visibility";

function buildDefaultVisibility(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  for (const entry of navigation) {
    if ("href" in entry) {
      defaults[`item:${entry.href}`] = true;
      if (entry.subTabs) {
        for (const sub of entry.subTabs) {
          defaults[`subtab:${entry.href}:${sub.value}`] = true;
          if (sub.subItems) {
            for (const si of sub.subItems) {
              defaults[`subitem:${entry.href}:${sub.value}:${si.value}`] = true;
            }
          }
        }
      }
    } else if ("module" in entry) {
      defaults[`module:${entry.module}`] = true;
      for (const item of entry.items) {
        defaults[`item:${item.href}`] = true;
        if (item.subTabs) {
          for (const sub of item.subTabs) {
            defaults[`subtab:${item.href}:${sub.value}`] = true;
            if (sub.subItems) {
              for (const si of sub.subItems) {
                defaults[`subitem:${item.href}:${sub.value}:${si.value}`] = true;
              }
            }
          }
        }
      }
    }
  }
  return defaults;
}

function mergeWithDefaults(serverData: Record<string, boolean>): Record<string, boolean> {
  return { ...buildDefaultVisibility(), ...serverData };
}

function loadLocalVisibility(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return mergeWithDefaults(JSON.parse(saved));
    }
  } catch {}
  return buildDefaultVisibility();
}

function saveLocal(v: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(LOCAL_SYNC_EVENT));
}

let _cachedFetch: Promise<Record<string, boolean>> | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000;

function invalidateSidebarCache() {
  _cachedFetch = null;
  _cacheTime = 0;
}

async function fetchServerVisibility(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (_cachedFetch && now - _cacheTime < CACHE_TTL_MS) {
    return _cachedFetch;
  }
  _cacheTime = now;
  _cachedFetch = (async () => {
    try {
      const res = await fetch(SERVER_URL, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) { invalidateSidebarCache(); return {}; }
      return await res.json();
    } catch {
      invalidateSidebarCache();
      return {};
    }
  })();
  return _cachedFetch;
}

async function saveServerVisibility(v: Record<string, boolean>): Promise<void> {
  try {
    await fetch(SERVER_URL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(v),
    });
    invalidateSidebarCache();
  } catch {}
}

export function useSidebarVisibility() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadLocalVisibility);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hasServerData, setHasServerData] = useState(false);

  useEffect(() => {
    fetchServerVisibility().then((serverData) => {
      if (Object.keys(serverData).length > 0) {
        setHasServerData(true);
        const merged = mergeWithDefaults(serverData);
        setVisibility(merged);
        saveLocal(merged);
      }
    });
  }, []);

  useEffect(() => {
    const handleLocalSync = () => setVisibility(loadLocalVisibility());
    window.addEventListener(LOCAL_SYNC_EVENT, handleLocalSync);
    return () => window.removeEventListener(LOCAL_SYNC_EVENT, handleLocalSync);
  }, []);

  useEffect(() => {
    const handleServerUpdate = (e: Event) => {
      const serverData = (e as CustomEvent<Record<string, boolean>>).detail;
      if (serverData && Object.keys(serverData).length > 0) {
        const merged = mergeWithDefaults(serverData);
        setVisibility(merged);
        saveLocal(merged);
      }
    };
    window.addEventListener(SERVER_UPDATE_EVENT, handleServerUpdate);
    return () => window.removeEventListener(SERVER_UPDATE_EVENT, handleServerUpdate);
  }, []);

  const persistVisibility = useCallback((next: Record<string, boolean>) => {
    saveLocal(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveServerVisibility(next);
    }, 500);
  }, []);

  const isModuleVisible = useCallback(
    (moduleName: string) => visibility[`module:${moduleName}`] !== false,
    [visibility]
  );

  const isItemVisible = useCallback(
    (href: string, moduleName?: string) => {
      if (moduleName && visibility[`module:${moduleName}`] === false) return false;
      return visibility[`item:${href}`] !== false;
    },
    [visibility]
  );

  const isSubTabVisible = useCallback(
    (href: string, tabValue: string, moduleName?: string) => {
      if (moduleName && visibility[`module:${moduleName}`] === false) return false;
      if (visibility[`item:${href}`] === false) return false;
      return visibility[`subtab:${href}:${tabValue}`] !== false;
    },
    [visibility]
  );

  const isSubTabItemVisible = useCallback(
    (href: string, tabValue: string, subItemValue: string, moduleName?: string) => {
      if (moduleName && visibility[`module:${moduleName}`] === false) return false;
      if (visibility[`item:${href}`] === false) return false;
      if (visibility[`subtab:${href}:${tabValue}`] === false) return false;
      return visibility[`subitem:${href}:${tabValue}:${subItemValue}`] !== false;
    },
    [visibility]
  );

  const toggleModule = useCallback((moduleName: string) => {
    setVisibility(prev => {
      const next = { ...prev, [`module:${moduleName}`]: !prev[`module:${moduleName}`] };
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  const toggleItem = useCallback((href: string) => {
    setVisibility(prev => {
      const next = { ...prev, [`item:${href}`]: !prev[`item:${href}`] };
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  const toggleSubTab = useCallback((href: string, tabValue: string) => {
    setVisibility(prev => {
      const key = `subtab:${href}:${tabValue}`;
      const next = { ...prev, [key]: !prev[key] };
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  const toggleSubTabItem = useCallback((href: string, tabValue: string, subItemValue: string) => {
    setVisibility(prev => {
      const key = `subitem:${href}:${tabValue}:${subItemValue}`;
      const next = { ...prev, [key]: !prev[key] };
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  return {
    visibility,
    hasServerData,
    isModuleVisible,
    isItemVisible,
    isSubTabVisible,
    isSubTabItemVisible,
    toggleModule,
    toggleItem,
    toggleSubTab,
    toggleSubTabItem,
  };
}
