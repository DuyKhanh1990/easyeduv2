import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ZaloSSEEvent {
  type: string;
  locationId?: string;
  conversationId?: string;
  oaConfigId?: string;
  [key: string]: unknown;
}

interface UseZaloSSEOptions {
  enabled?: boolean;
}

export function useZaloSSE({ enabled = true }: UseZaloSSEOptions = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/zalo/events", { withCredentials: true });

    const invalidateConvs = (locationId?: string) => {
      if (locationId) {
        qc.invalidateQueries({ queryKey: ["/api/zalo-oa/conversations", locationId] });
      }
    };

    const invalidateMsgs = (conversationId?: string) => {
      if (conversationId) {
        qc.invalidateQueries({ queryKey: ["/api/zalo-oa/messages", conversationId] });
      }
    };

    const handleNewMessage = (e: MessageEvent) => {
      try {
        const data: ZaloSSEEvent = JSON.parse(e.data);
        invalidateMsgs(data.conversationId);
        invalidateConvs(data.locationId);
      } catch {}
    };

    const handleMessageSent = (e: MessageEvent) => {
      try {
        const data: ZaloSSEEvent = JSON.parse(e.data);
        invalidateMsgs(data.conversationId);
        invalidateConvs(data.locationId);
      } catch {}
    };

    const handleConvListEvent = (e: MessageEvent) => {
      try {
        const data: ZaloSSEEvent = JSON.parse(e.data);
        invalidateConvs(data.locationId);
      } catch {}
    };

    es.addEventListener("new_message", handleNewMessage);
    es.addEventListener("message_sent", handleMessageSent);
    es.addEventListener("conversation_created", handleConvListEvent);
    es.addEventListener("conversation_updated", handleConvListEvent);
    es.addEventListener("notification_sent", handleConvListEvent);

    return () => {
      es.close();
    };
  }, [enabled, qc]);
}
