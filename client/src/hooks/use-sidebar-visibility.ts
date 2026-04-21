import { useState, useCallback, useEffect } from "react";
import { navigation } from "@/lib/sidebar-navigation";

const STORAGE_KEY = "sidebar_visibility";
const SYNC_EVENT = "sidebar-visibility-changed";

function buildDefaultVisibility(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  for (const entry of navigation) {
    if ("module" in entry) {
      defaults[`module:${entry.module}`] = true;
      for (const item of entry.items) {
        defaults[`item:${item.href}`] = true;
        if (item.subTabs) {
          for (const sub of item.subTabs) {
            defaults[`subtab:${item.href}:${sub.value}`] = true;
          }
        }
      }
    }
  }
  return defaults;
}

function loadVisibility(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const defaults = buildDefaultVisibility();
      return { ...defaults, ...parsed };
    }
  } catch {}
  return buildDefaultVisibility();
}

function saveVisibility(v: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function useSidebarVisibility() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadVisibility);

  useEffect(() => {
    const handler = () => setVisibility(loadVisibility());
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
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

  const toggleModule = useCallback((moduleName: string) => {
    setVisibility(prev => {
      const next = { ...prev, [`module:${moduleName}`]: !prev[`module:${moduleName}`] };
      saveVisibility(next);
      return next;
    });
  }, []);

  const toggleItem = useCallback((href: string) => {
    setVisibility(prev => {
      const next = { ...prev, [`item:${href}`]: !prev[`item:${href}`] };
      saveVisibility(next);
      return next;
    });
  }, []);

  const toggleSubTab = useCallback((href: string, tabValue: string) => {
    setVisibility(prev => {
      const key = `subtab:${href}:${tabValue}`;
      const next = { ...prev, [key]: !prev[key] };
      saveVisibility(next);
      return next;
    });
  }, []);

  return {
    visibility,
    isModuleVisible,
    isItemVisible,
    isSubTabVisible,
    toggleModule,
    toggleItem,
    toggleSubTab,
  };
}
