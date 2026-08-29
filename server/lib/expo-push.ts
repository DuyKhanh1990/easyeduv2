/**
 * Expo Push Notification utility
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  badge?: number;
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

/**
 * Fire a single Expo push request for the given messages (no batching/splitting).
 * Returns one ticket per message, in the same order, or throws on network/HTTP failure.
 */
async function postToExpo(batch: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as unknown;
  const data =
    json != null &&
    typeof json === "object" &&
    "data" in json &&
    Array.isArray((json as any).data)
      ? ((json as any).data as ExpoPushTicket[])
      : null;

  if (!data || data.length !== batch.length) {
    throw new Error(
      `Unexpected upstream response: ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  return data;
}

/**
 * Send push notifications to a list of Expo push tokens.
 * Automatically batches in groups of 100 (Expo limit).
 *
 * Expo rejects an ENTIRE request if it mixes tokens that belong to different
 * Expo projects (e.g. after the app's Expo project/owner was migrated, some
 * users still have old-project tokens registered alongside new ones). When
 * that happens every token in the batch — including otherwise-valid ones —
 * comes back as an error, even though only one token is actually bad.
 * To stop one broken token from blocking everyone else in the same batch,
 * any batch that fails outright (HTTP error, malformed response, or an
 * all-error result) is retried message-by-message so a single bad token
 * can't take down its batch-mates.
 *
 * Returns the combined ticket list from all batches, in the original order.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const tickets: ExpoPushTicket[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    let batchTickets: ExpoPushTicket[];

    try {
      batchTickets = await postToExpo(batch);
    } catch (err: any) {
      console.error(
        `[ExpoPush] Batch ${i / BATCH_SIZE + 1} failed (${err.message}) — retrying per-token to isolate bad tokens`
      );
      batchTickets = [];
      for (const msg of batch) {
        try {
          const [ticket] = await postToExpo([msg]);
          batchTickets.push(ticket);
        } catch (innerErr: any) {
          console.error(`[ExpoPush] Token-level send failed for ${msg.to}:`, innerErr.message);
          batchTickets.push({ status: "error", message: innerErr.message });
        }
      }
    }

    // Even when the batch call "succeeds" HTTP-wise, a project mismatch can
    // still surface as every ticket being an error. Isolate per-token in
    // that case too, so we don't misdiagnose good tokens as bad.
    if (
      batch.length > 1 &&
      batchTickets.every((t) => t.status === "error")
    ) {
      console.warn(
        `[ExpoPush] All ${batch.length} tokens in batch ${i / BATCH_SIZE + 1} errored — retrying per-token to isolate bad tokens`
      );
      const retried: ExpoPushTicket[] = [];
      for (const msg of batch) {
        try {
          const [ticket] = await postToExpo([msg]);
          retried.push(ticket);
        } catch (innerErr: any) {
          retried.push({ status: "error", message: innerErr.message });
        }
      }
      batchTickets = retried;
    }

    tickets.push(...batchTickets);
  }

  return tickets;
}

/**
 * Filter out invalid ("DeviceNotRegistered") tokens from the ticket list.
 * Returns the push_token strings that should be removed from the database.
 */
export function extractInvalidTokens(
  messages: ExpoPushMessage[],
  tickets: ExpoPushTicket[]
): string[] {
  const invalid: string[] = [];
  tickets.forEach((ticket, idx) => {
    if (
      ticket.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered" &&
      messages[idx]
    ) {
      invalid.push(messages[idx].to);
    }
  });
  return invalid;
}
