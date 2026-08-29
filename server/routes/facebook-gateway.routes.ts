/**
 * Facebook Webhook Gateway
 *
 * Chạy trực tiếp trong main Express app — cùng pattern với BIDV gateway.
 * Nhận webhook từ Facebook, tra bảng facebook_page_routes theo pageId,
 * nếu là self-center thì xử lý tại chỗ, ngược lại forward sang center đúng.
 *
 * Cấu hình:
 *   FACEBOOK_WEBHOOK_VERIFY_TOKEN — nhập vào Facebook Developer Console → Webhooks → Verify Token
 *   FACEBOOK_GATEWAY_SHARED_SECRET — dùng làm x-gateway-secret khi forward FB entries
 *
 * Facebook Developer Console:
 *   Callback URL : https://easyeduv2.easyedu.vn/facebook/webhook
 *   Verify Token : <FACEBOOK_WEBHOOK_VERIFY_TOKEN>
 */
import type { Express } from "express";
import { createHmac } from "crypto";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { facebookPageRoutes, centerRegistry } from "@shared/schema";

function verifyFacebookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const appSecret = process.env.FACEBOOK_APP_SECRET || "";
  if (!appSecret) return true; // Chưa cấu hình → bỏ qua verify (dev mode)
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return signature === expected;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupFacebookRoute(
  pageId: string,
): Promise<{ centerId: string; centerUrl: string } | null> {
  const [route] = await db
    .select()
    .from(facebookPageRoutes)
    .where(eq(facebookPageRoutes.pageId, pageId))
    .limit(1);

  if (!route || !route.isActive) return null;

  // Re-resolve URL từ center_registry để đảm bảo luôn mới nhất
  const [center] = await db
    .select()
    .from(centerRegistry)
    .where(eq(centerRegistry.centerId, route.centerId))
    .limit(1);

  if (!center || !center.isActive) return null;

  return { centerId: center.centerId, centerUrl: center.centerUrl };
}

async function forwardToCenter(
  centerUrl: string,
  body: unknown,
): Promise<{ ok: boolean; status?: number }> {
  const secret = process.env.FACEBOOK_GATEWAY_SHARED_SECRET || "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${centerUrl}/api/facebook/incoming`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, status: res.status };
      console.warn(
        `[FacebookGW] Attempt ${attempt}/${MAX_RETRIES} → ${centerUrl} returned ${res.status}`,
      );
    } catch (err) {
      console.warn(
        `[FacebookGW] Attempt ${attempt}/${MAX_RETRIES} → ${centerUrl} threw:`,
        err,
      );
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
  }
  return { ok: false };
}

function isSelfCenter(centerUrl: string): boolean {
  const selfUrl = process.env.CENTER_PUBLIC_URL || "";
  if (!selfUrl) return false;
  return centerUrl.replace(/\/$/, "") === selfUrl.replace(/\/$/, "");
}

export function registerFacebookGatewayRoutes(app: Express): void {
  // ── Webhook verification (Facebook gọi khi setup)
  app.get("/facebook/webhook", (req, res) => {
    const mode      = req.query["hub.mode"] as string | undefined;
    const token     = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    const expectedToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "";

    if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
      res.status(200).send(challenge ?? "");
    } else {
      res.sendStatus(403);
    }
  });

  // ── Webhook message ingestion (Facebook POST về đây)
  app.post("/facebook/webhook", (req, res) => {
    // Verify chữ ký Facebook (dùng FACEBOOK_APP_SECRET)
    const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyFacebookSignature(rawBody, signature)) {
      console.warn("[FacebookGW] Invalid signature — request rejected");
      return res.sendStatus(403);
    }

    // Trả 200 ngay để Facebook không retry
    res.sendStatus(200);

    if (req.body?.object !== "page") return;

    const entries: any[] = req.body.entry ?? [];

    for (const entry of entries) {
      const pageId: string | undefined = entry.id;
      if (!pageId) continue;

      (async () => {
        try {
          const route = await lookupFacebookRoute(pageId);
          if (!route) {
            console.warn(`[FacebookGW] No active route for pageId=${pageId}`);
            return;
          }

          if (isSelfCenter(route.centerUrl)) {
            // Self-center: import động để tránh circular dependency
            const { handleFacebookWebhookEntry } = await import("./facebook-chat.routes.js");
            await handleFacebookWebhookEntry(entry);
            console.log(`[FacebookGW] pageId=${pageId} → self`);
          } else {
            // Forward sang center khác
            const result = await forwardToCenter(route.centerUrl, {
              object: "page",
              entry: [entry],
            });
            if (result.ok) {
              console.log(`[FacebookGW] pageId=${pageId} → ${route.centerUrl} (${result.status})`);
            } else {
              console.error(`[FacebookGW] All retries failed for pageId=${pageId} → ${route.centerUrl}`);
            }
          }
        } catch (err: any) {
          console.error(`[FacebookGW] Error processing pageId=${pageId}:`, err?.message);
        }
      })();
    }
  });
}
