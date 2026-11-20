import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getAuthHeaders } from "@/lib/queryClient";

type PushConfigResponse = {
  enabled?: boolean;
  publicKey?: string | null;
};

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function registerWebPush(): Promise<void> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return;
  }

  const configResponse = await fetch("/api/mobile/push/config", {
    credentials: "include",
    headers: getAuthHeaders(),
  });
  if (!configResponse.ok) return;

  const config = (await configResponse.json()) as PushConfigResponse;
  if (!config.enabled || !config.publicKey) return;

  const registration = await navigator.serviceWorker.register("/pwa-sw.js");
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return;

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(config.publicKey),
  });
  const subscriptionJson = subscription.toJSON();

  if (
    !subscriptionJson.endpoint ||
    !subscriptionJson.keys?.p256dh ||
    !subscriptionJson.keys.auth
  ) {
    return;
  }

  await fetch("/api/mobile/push/subscription", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      endpoint: subscriptionJson.endpoint,
      expirationTime: subscriptionJson.expirationTime ?? null,
      keys: subscriptionJson.keys,
    }),
  });
}

export function useWebPush(): void {
  const { data: user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    void registerWebPush().catch((error) => {
      // Push permission/subscription is optional and must not affect app startup.
      console.warn("[WebPush] Browser subscription setup failed:", error);
    });
  }, [user?.id]);
}