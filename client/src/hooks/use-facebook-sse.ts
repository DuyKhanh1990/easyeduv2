import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface FacebookSSEEvent {
  type: string;
  locationId?: string;
  conversationId?: string;
  pageConfigId?: string;
  [key: string]: unknown;
}

interface UseFacebookSSEOptions {
  enabled?: boolean;
}

export function useFacebookSSE({ enabled = true }: UseFacebookSSEOptions = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/facebook/events", { withCredentials: true });

    const invalidateConvs = (locationId?: string) => {
      qc.invalidateQueries({ queryKey: ["/api/facebook/conversations"] });
      if (locationId) {
        qc.invalidateQueries({ queryKey: ["/api/facebook/conversations", locationId] });
      }
    };

    const invalidateMsgs = (conversationId?: string) => {
      if (conversationId) {
        qc.invalidateQueries({ queryKey: ["/api/facebook/conversations", conversationId, "messages"] });
      }
    };

    const handleNewMessage = (e: MessageEvent) => {
      try {
        const data: FacebookSSEEvent = JSON.parse(e.data);
        invalidateMsgs(data.conversationId);
        invalidateConvs(data.locationId);
      } catch {}
    };

    const handleConvList = (e: MessageEvent) => {
      try {
        const data: FacebookSSEEvent = JSON.parse(e.data);
        invalidateConvs(data.locationId);
      } catch {}
    };

    es.addEventListener("fb_new_message", handleNewMessage);
    es.addEventListener("fb_message_sent", handleNewMessage);
    es.addEventListener("fb_conversation_created", handleConvList);
    es.addEventListener("fb_conversation_updated", handleConvList);

    return () => es.close();
  }, [enabled, qc]);
}
