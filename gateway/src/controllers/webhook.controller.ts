import type { Request, Response } from "express";
import { lookupRoute, markRouteInactive, lookupFacebookPageRoute } from "../services/routing.service.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function forwardWithRetry(
  targetUrl: string,
  body: unknown,
  retries = MAX_RETRIES,
): Promise<{ ok: boolean; status?: number }> {
  const secret = process.env.FACEBOOK_GATEWAY_SHARED_SECRET || "";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, status: res.status };
      console.warn(
        `[Gateway Webhook] Attempt ${attempt}/${retries} → ${targetUrl} returned ${res.status}`,
      );
    } catch (err) {
      console.warn(
        `[Gateway Webhook] Attempt ${attempt}/${retries} → ${targetUrl} threw:`,
        err,
      );
    }
    if (attempt < retries) await sleep(RETRY_DELAY_MS * attempt);
  }
  return { ok: false };
}

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  res.json({ ok: true });

  try {
    const body = req.body as any;

    // Zalo v2/v3 event extraction:
    // - Inbound (user → OA): recipient.id = OA ID
    // - Outbound (OA → user, e.g. staff sends from mobile): sender.id = OA ID
    // user_received_message = Zalo gửi khi OA/nhân viên reply qua app mobile → outbound
    const event: string | undefined = body?.event_name;
    const isOutbound = event && (event.startsWith("oa_send") || event === "user_received_message");
    const oaId: string | undefined = isOutbound
      ? (body?.sender?.id || body?.oa_id || body?.app_id)
      : (body?.recipient?.id || body?.oa_id || body?.app_id);

    if (!oaId) {
      console.warn("[Gateway Webhook] Could not extract oa_id from payload. Keys:", Object.keys(body || {}));
      return;
    }

    const route = await lookupRoute(oaId);
    if (!route) {
      console.warn(`[Gateway Webhook] No active route for oa_id=${oaId}`);
      return;
    }

    const targetUrl = `${route.centerUrl}/api/zalo/incoming`;
    const result = await forwardWithRetry(targetUrl, body);

    if (!result.ok) {
      // Chỉ log lỗi, KHÔNG deactivate route — app có thể đang restart tạm thời.
      // Route chỉ bị deactivate thủ công qua admin endpoint hoặc khi disconnect OA.
      console.error(
        `[Gateway Webhook] All retries failed for oa_id=${oaId} → ${targetUrl}. Webhook dropped (route still active).`,
      );
    } else {
      console.log(
        `[Gateway Webhook] Forwarded oa_id=${oaId} → ${targetUrl} (${result.status})`,
      );
    }
  } catch (err) {
    console.error("[Gateway Webhook] Unexpected error:", err);
  }
}

export function handleWebhookVerify(req: Request, res: Response): void {
  const challenge = req.query.challenge as string | undefined;
  if (challenge) {
    res.json({ challenge });
    return;
  }
  res.json({ ok: true });
}

// ── Facebook webhook handlers ─────────────────────────────────────────────────

export async function handleFacebookWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  res.sendStatus(200);

  try {
    const body = req.body as any;
    if (body?.object !== "page") return;

    const entries: any[] = body.entry ?? [];
    for (const entry of entries) {
      const pageId: string | undefined = entry.id;
      if (!pageId) continue;

      const route = await lookupFacebookPageRoute(pageId);
      if (!route) {
        console.warn(`[Facebook Gateway] No active route for pageId=${pageId}`);
        continue;
      }

      // Forward entry individually so each center only gets its own events
      const targetUrl = `${route.centerUrl}/api/facebook/incoming`;
      const result = await forwardWithRetry(targetUrl, { object: "page", entry: [entry] });

      if (!result.ok) {
        console.error(
          `[Facebook Gateway] All retries failed for pageId=${pageId} → ${targetUrl}. Webhook dropped (route still active).`,
        );
      } else {
        console.log(
          `[Facebook Gateway] Forwarded pageId=${pageId} → ${targetUrl} (${result.status})`,
        );
      }
    }
  } catch (err) {
    console.error("[Facebook Gateway] Unexpected error:", err);
  }
}

export function handleFacebookWebhookVerify(req: Request, res: Response): void {
  const mode      = req.query["hub.mode"] as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;

  const expectedToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    res.status(200).send(challenge ?? "");
  } else {
    res.sendStatus(403);
  }
}
