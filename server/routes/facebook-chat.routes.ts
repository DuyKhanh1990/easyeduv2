/**
 * Facebook Fanpage Chat Integration
 *
 * Luồng:
 * 1. Admin kết nối Page qua UI (nhập Page Access Token + Verify Token)
 * 2. Facebook gọi GET /api/facebook/webhook để xác thực
 * 3. Người dùng nhắn → Facebook POST /api/facebook/webhook
 * 4. Staff reply qua POST /api/facebook/conversations/:id/reply
 *
 * Graph API: https://graph.facebook.com/v19.0
 */
import type { Express } from "express";
import { db } from "../db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID, createHmac } from "crypto";
import { encrypt, decrypt } from "../lib/encryption";
import { sseManager } from "../services/sse-manager";
import {
  facebookPageConfigs,
  facebookConversations,
  facebookMessages,
  facebookPageRoutes,
  centerRegistry,
  students,
} from "@shared/schema";
import { z } from "zod";

const GRAPH_API = "https://graph.facebook.com/v19.0";

// ── OAuth session store (in-memory, expires 10 min) ───────────────────────────
type OAuthPage = { id: string; name: string; picture?: string };
type OAuthSession = { pages: OAuthPage[]; locationId: string; expiresAt: number };
const oauthSessions = new Map<string, OAuthSession>();
const oauthPageTokens = new Map<string, Map<string, string>>(); // sessionId → pageId → token

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthSessions) {
    if (val.expiresAt < now) { oauthSessions.delete(key); oauthPageTokens.delete(key); }
  }
}, 5 * 60 * 1000).unref();

function createFbOAuthState(locationId: string): string {
  const payload = Buffer.from(JSON.stringify({ locationId, ts: Date.now() })).toString("base64url");
  const secret = process.env.FACEBOOK_APP_SECRET || process.env.ZALO_GATEWAY_SHARED_SECRET || "fallback";
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyFbOAuthState(state: string): { locationId: string } | null {
  try {
    const dotIdx = state.lastIndexOf(".");
    const payload = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    const secret = process.env.FACEBOOK_APP_SECRET || process.env.ZALO_GATEWAY_SHARED_SECRET || "fallback";
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - data.ts > 15 * 60 * 1000) return null;
    return { locationId: data.locationId };
  } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPageToken(config: { pageAccessTokenEncrypted: string }): Promise<string> {
  return decrypt(config.pageAccessTokenEncrypted);
}

async function fetchUserProfile(psid: string, token: string): Promise<{ name?: string; avatarUrl?: string }> {
  try {
    const res = await fetch(`${GRAPH_API}/${psid}?fields=name,profile_pic&access_token=${token}`);
    if (!res.ok) return {};
    const data: any = await res.json();
    return { name: data.name, avatarUrl: data.profile_pic };
  } catch {
    return {};
  }
}

async function sendTextMessage(psid: string, text: string, token: string): Promise<string | null> {
  const res = await fetch(`${GRAPH_API}/me/messages?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, message: { text } }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Facebook API error");
  return data.message_id ?? null;
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function handleFacebookWebhookEntry(entry: any) {
  const pageId: string = entry.id;
  const messaging: any[] = entry.messaging ?? [];

  // Find config by page_id
  const [config] = await db
    .select()
    .from(facebookPageConfigs)
    .where(eq(facebookPageConfigs.pageId, pageId))
    .limit(1);

  if (!config || !config.isConnected) return;

  const token = await getPageToken(config);

  for (const event of messaging) {
    const senderPsid: string = event.sender?.id;
    if (!senderPsid || senderPsid === pageId) continue; // skip echoes

    const msg = event.message;
    if (!msg) continue;

    // Dedup by mid
    const mid: string | undefined = msg.mid;
    if (mid) {
      const [existing] = await db
        .select({ id: facebookMessages.id })
        .from(facebookMessages)
        .innerJoin(facebookConversations, eq(facebookMessages.conversationId, facebookConversations.id))
        .where(
          and(
            eq(facebookMessages.mid, mid),
            eq(facebookConversations.facebookPageConfigId, config.id),
          )
        )
        .limit(1);
      if (existing) continue;
    }

    // Upsert conversation
    let [conv] = await db
      .select()
      .from(facebookConversations)
      .where(
        and(
          eq(facebookConversations.facebookPageConfigId, config.id),
          eq(facebookConversations.psid, senderPsid),
        )
      )
      .limit(1);

    const isNewConv = !conv;
    const sentAt = event.timestamp ? new Date(event.timestamp) : new Date();

    // Resolve message content
    const text: string | undefined = msg.text;
    const attachments: any[] | undefined = msg.attachments;
    const messageType = attachments?.length ? (attachments[0]?.type ?? "attachment") : "text";
    const preview = text ?? (attachments?.length ? `[${messageType}]` : "");

    if (isNewConv) {
      const profile = await fetchUserProfile(senderPsid, token);
      const [created] = await db
        .insert(facebookConversations)
        .values({
          facebookPageConfigId: config.id,
          locationId: config.locationId,
          psid: senderPsid,
          userName: profile.name ?? null,
          userAvatar: profile.avatarUrl ?? null,
          lastMessage: preview,
          lastMessageAt: sentAt,
          unreadCount: 1,
        })
        .returning();
      conv = created;

      sseManager.emitFacebook({
        type: "fb_conversation_created",
        locationId: config.locationId ?? "",
        pageConfigId: config.id,
        conversationId: conv.id,
      });
    } else {
      await db
        .update(facebookConversations)
        .set({ lastMessage: preview, lastMessageAt: sentAt, unreadCount: (conv.unreadCount ?? 0) + 1, updatedAt: new Date() })
        .where(eq(facebookConversations.id, conv.id));
    }

    // Insert message
    await db.insert(facebookMessages).values({
      conversationId: conv.id,
      mid: mid ?? null,
      direction: "inbound",
      messageType,
      content: text ?? null,
      attachments: attachments ? (attachments as any) : null,
      sentAt,
    });

    sseManager.emitFacebook({
      type: "fb_new_message",
      locationId: config.locationId ?? "",
      pageConfigId: config.id,
      conversationId: conv.id,
    });
  }
}

// ── Gateway routing auto-registration ────────────────────────────────────────

async function autoRegisterFacebookPageRoute(pageId: string): Promise<void> {
  const centerId  = process.env.CENTER_ID || "";
  const centerUrl = process.env.CENTER_PUBLIC_URL || "";
  if (!centerId || !centerUrl) {
    console.warn("[FacebookGW] CENTER_ID hoặc CENTER_PUBLIC_URL chưa được cấu hình — bỏ qua auto-register");
    return;
  }

  // Đảm bảo center hiện tại có trong center_registry
  await db
    .insert(centerRegistry)
    .values({ centerId, centerUrl, isActive: true })
    .onConflictDoUpdate({
      target: centerRegistry.centerId,
      set: { centerUrl, isActive: true, updatedAt: new Date() },
    });

  // Upsert page → center vào routing table
  await db
    .insert(facebookPageRoutes)
    .values({ pageId, centerId, centerUrl, isActive: true })
    .onConflictDoUpdate({
      target: facebookPageRoutes.pageId,
      set: { centerId, centerUrl, isActive: true, updatedAt: new Date() },
    });

  console.log(`[FacebookGW] Auto-registered pageId=${pageId} → center=${centerId}`);
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerFacebookChatRoutes(app: Express): void {
  // ── Webhook verification (Facebook calls this when you set up the webhook)
  app.get("/api/facebook/webhook", (req, res) => {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token) {
      // Check against any registered verify token
      db.select()
        .from(facebookPageConfigs)
        .where(eq(facebookPageConfigs.verifyToken, token as string))
        .limit(1)
        .then(([config]) => {
          if (config) {
            res.status(200).send(challenge as string);
          } else {
            res.sendStatus(403);
          }
        })
        .catch(() => res.sendStatus(500));
    } else {
      res.sendStatus(400);
    }
  });

  // ── Webhook message ingestion (direct from Facebook — legacy / single-center mode)
  app.post("/api/facebook/webhook", (req, res) => {
    // Always respond 200 immediately to avoid Facebook retries
    res.sendStatus(200);

    if (req.body?.object !== "page") return;
    const entries: any[] = req.body.entry ?? [];
    for (const entry of entries) {
      handleFacebookWebhookEntry(entry).catch((err) =>
        console.error("[Facebook] handleWebhookEntry error:", err?.message)
      );
    }
  });

  // ── Gateway → Center inbound (multi-center mode)
  // Facebook App webhook trỏ vào gateway, gateway forward từng entry đến đúng center.
  // Route này xác thực bằng x-gateway-secret thay vì session auth.
  app.post("/api/facebook/incoming", (req, res) => {
    const secret = req.headers["x-gateway-secret"];
    const expectedSecret = process.env.FACEBOOK_GATEWAY_SHARED_SECRET || "";
    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized — invalid gateway secret" });
    }

    res.sendStatus(200);

    if (req.body?.object !== "page") return;
    const entries: any[] = req.body.entry ?? [];
    for (const entry of entries) {
      handleFacebookWebhookEntry(entry).catch((err) =>
        console.error("[Facebook] incoming handleWebhookEntry error:", err?.message)
      );
    }
  });

  // ── Facebook OAuth flow ────────────────────────────────────────────────────

  // Bước 1: Trả về URL OAuth để frontend redirect
  app.get("/api/facebook/oauth/start", (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID || "";
    if (!appId) return res.status(500).json({ message: "FACEBOOK_APP_ID chưa được cấu hình" });
    const locationId = (req.query.locationId as string) || "";
    const state = createFbOAuthState(locationId);
    const callbackUrl = `${process.env.CENTER_PUBLIC_URL || ""}/api/facebook/oauth/callback`;
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=pages_messaging,pages_manage_metadata,pages_show_list,pages_read_engagement&state=${encodeURIComponent(state)}&response_type=code`;
    res.json({ url });
  });

  // Bước 2: Facebook redirect về đây sau khi user authorize
  app.get("/api/facebook/oauth/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/facebook?oauth_error=${encodeURIComponent(error as string)}`);
    if (!code || !state) return res.redirect("/facebook?oauth_error=missing_params");

    const statePayload = verifyFbOAuthState(state as string);
    if (!statePayload) return res.redirect("/facebook?oauth_error=invalid_state");

    try {
      const appId     = process.env.FACEBOOK_APP_ID     || "";
      const appSecret = process.env.FACEBOOK_APP_SECRET || "";
      const callbackUrl = `${process.env.CENTER_PUBLIC_URL || ""}/api/facebook/oauth/callback`;

      // Exchange code → user access token
      const tokenRes  = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(callbackUrl)}&code=${code}`);
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        console.error("[FacebookOAuth] Token exchange failed:", tokenData);
        return res.redirect("/facebook?oauth_error=token_exchange_failed");
      }

      // Lấy danh sách Pages user quản lý (kèm Page Access Token riêng của từng page)
      const pagesRes  = await fetch(`${GRAPH_API}/me/accounts?access_token=${tokenData.access_token}&fields=id,name,access_token,picture.type(large)&limit=50`);
      const pagesData = await pagesRes.json() as any;
      if (!pagesData.data?.length) return res.redirect("/facebook?oauth_error=no_pages");

      // Lưu session tạm (10 phút)
      const sessionId = randomUUID();
      const pages: OAuthPage[] = pagesData.data.map((p: any) => ({
        id: p.id, name: p.name, picture: p.picture?.data?.url,
      }));
      const tokens = new Map<string, string>(pagesData.data.map((p: any) => [p.id, p.access_token]));
      oauthSessions.set(sessionId, { pages, locationId: statePayload.locationId, expiresAt: Date.now() + 10 * 60 * 1000 });
      oauthPageTokens.set(sessionId, tokens);

      res.redirect(`/facebook?oauth_session=${sessionId}`);
    } catch (err: any) {
      console.error("[FacebookOAuth] Callback error:", err?.message);
      res.redirect("/facebook?oauth_error=server_error");
    }
  });

  // Bước 3: Frontend lấy danh sách pages từ session
  app.get("/api/facebook/oauth/pages/:sessionId", (req, res) => {
    const session = oauthSessions.get(req.params.sessionId);
    if (!session || session.expiresAt < Date.now()) {
      oauthSessions.delete(req.params.sessionId);
      oauthPageTokens.delete(req.params.sessionId);
      return res.status(404).json({ message: "Session không tồn tại hoặc đã hết hạn. Vui lòng kết nối lại." });
    }
    res.json({ pages: session.pages, locationId: session.locationId });
  });

  // Bước 4: Center chọn page → tạo config
  app.post("/api/facebook/oauth/connect", async (req, res) => {
    const { sessionId, pageId, locationId: overrideLocationId } = req.body;
    const session = oauthSessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(400).json({ message: "Session đã hết hạn. Vui lòng đăng nhập Facebook lại." });
    }
    const tokens = oauthPageTokens.get(sessionId);
    const pageAccessToken = tokens?.get(pageId);
    if (!pageAccessToken) return res.status(400).json({ message: "Không tìm thấy token cho page này." });

    const page = session.pages.find(p => p.id === pageId);
    const locationId = overrideLocationId || session.locationId || null;

    try {
      const verifyToken = randomUUID().replace(/-/g, "");
      const [config] = await db
        .insert(facebookPageConfigs)
        .values({
          locationId,
          pageId,
          pageName: page?.name ?? null,
          pageAccessTokenEncrypted: encrypt(pageAccessToken),
          verifyToken,
          isConnected: true,
        })
        .returning();

      autoRegisterFacebookPageRoute(pageId).catch(err =>
        console.warn("[FacebookGW] Auto-register failed:", err?.message)
      );

      // Xóa session sau khi dùng
      oauthSessions.delete(sessionId);
      oauthPageTokens.delete(sessionId);

      res.json({ ...config, pageAccessTokenEncrypted: undefined });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Page configs CRUD ──────────────────────────────────────────────────────
  app.get("/api/facebook/configs", async (req, res) => {
    try {
      const rows = await db.select().from(facebookPageConfigs).orderBy(desc(facebookPageConfigs.createdAt));
      const result = rows
        .filter(r => req.isSuperAdmin || req.allowedLocationIds?.includes(r.locationId ?? ""))
        .map(r => ({
          id:          r.id,
          locationId:  r.locationId,
          pageId:      r.pageId,
          pageName:    r.pageName,
          pageAvatar:  r.pageAvatar,
          verifyToken: r.verifyToken,
          isConnected: r.isConnected,
          createdAt:   r.createdAt,
        }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/facebook/configs", async (req, res) => {
    try {
      const { locationId, pageId, pageName, pageAccessToken } = req.body;
      if (!pageId || !pageAccessToken) {
        return res.status(400).json({ message: "pageId và pageAccessToken là bắt buộc" });
      }
      const verifyToken = randomUUID().replace(/-/g, "");
      const [config] = await db
        .insert(facebookPageConfigs)
        .values({
          locationId: locationId ?? null,
          pageId,
          pageName: pageName ?? null,
          pageAccessTokenEncrypted: encrypt(pageAccessToken),
          verifyToken,
          isConnected: true,
        })
        .returning();

      // Tự động đăng ký page vào gateway routing table
      // Khi center ấn kết nối, gateway sẽ biết ngay page này thuộc center nào
      autoRegisterFacebookPageRoute(pageId).catch((err) =>
        console.warn("[FacebookGW] Auto-register page route failed:", err?.message)
      );

      res.json({ ...config, verifyToken, pageAccessTokenEncrypted: undefined });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/facebook/configs/:id", async (req, res) => {
    try {
      const { pageName, pageAccessToken, locationId, isConnected } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (pageName !== undefined)       updates.pageName    = pageName;
      if (locationId !== undefined)     updates.locationId  = locationId;
      if (isConnected !== undefined)    updates.isConnected = isConnected;
      if (pageAccessToken)              updates.pageAccessTokenEncrypted = encrypt(pageAccessToken);
      const [updated] = await db
        .update(facebookPageConfigs)
        .set(updates)
        .where(eq(facebookPageConfigs.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Không tìm thấy config" });
      res.json({ ...updated, pageAccessTokenEncrypted: undefined });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/facebook/configs/:id", async (req, res) => {
    try {
      const [deleted] = await db
        .delete(facebookPageConfigs)
        .where(eq(facebookPageConfigs.id, req.params.id))
        .returning();
      // Deactivate route gateway khi center ngắt kết nối page
      if (deleted?.pageId) {
        db.update(facebookPageRoutes)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(facebookPageRoutes.pageId, deleted.pageId))
          .catch((err) => console.warn("[FacebookGW] Deactivate page route failed:", err?.message));
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Conversations ──────────────────────────────────────────────────────────
  app.get("/api/facebook/conversations", async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const studentId  = req.query.studentId  as string | undefined;

      let query = db
        .select()
        .from(facebookConversations)
        .orderBy(desc(facebookConversations.lastMessageAt))
        .$dynamic();

      if (studentId) {
        query = query.where(eq(facebookConversations.studentId, studentId));
      }

      const rows = await query.limit(100);

      const filtered = rows.filter(r => {
        if (req.isSuperAdmin) return true;
        if (locationId && r.locationId !== locationId) return false;
        return req.allowedLocationIds?.includes(r.locationId ?? "");
      });

      res.json(filtered);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/facebook/conversations/:id/messages", async (req, res) => {
    try {
      const messages = await db
        .select()
        .from(facebookMessages)
        .where(eq(facebookMessages.conversationId, req.params.id))
        .orderBy(facebookMessages.sentAt)
        .limit(200);

      // Mark read
      await db
        .update(facebookConversations)
        .set({ unreadCount: 0 })
        .where(eq(facebookConversations.id, req.params.id));

      res.json(messages);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Reply ──────────────────────────────────────────────────────────────────
  app.post("/api/facebook/conversations/:id/reply", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "Nội dung không được trống" });

      const [conv] = await db
        .select()
        .from(facebookConversations)
        .where(eq(facebookConversations.id, req.params.id))
        .limit(1);
      if (!conv) return res.status(404).json({ message: "Không tìm thấy hội thoại" });

      const [config] = await db
        .select()
        .from(facebookPageConfigs)
        .where(eq(facebookPageConfigs.id, conv.facebookPageConfigId ?? ""))
        .limit(1);
      if (!config) return res.status(404).json({ message: "Không tìm thấy cấu hình page" });

      const token = await getPageToken(config);
      const mid   = await sendTextMessage(conv.psid, text.trim(), token);
      const now   = new Date();

      const [msg] = await db
        .insert(facebookMessages)
        .values({
          conversationId: conv.id,
          mid:         mid ?? null,
          direction:   "outbound",
          messageType: "text",
          content:     text.trim(),
          sentAt:      now,
        })
        .returning();

      await db
        .update(facebookConversations)
        .set({ lastMessage: text.trim(), lastMessageAt: now, updatedAt: now })
        .where(eq(facebookConversations.id, conv.id));

      sseManager.emitFacebook({
        type: "fb_message_sent",
        locationId: config.locationId ?? "",
        pageConfigId: config.id,
        conversationId: conv.id,
      });

      res.json(msg);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET linked student ─────────────────────────────────────────────────────
  app.get("/api/facebook/conversations/:id/linked-student", async (req, res) => {
    try {
      const [conv] = await db
        .select({ studentId: facebookConversations.studentId })
        .from(facebookConversations)
        .where(eq(facebookConversations.id, req.params.id))
        .limit(1);
      if (!conv) return res.status(404).json({ message: "Không tìm thấy hội thoại" });
      if (!conv.studentId) return res.json({ linked: false });

      const [student] = await db
        .select({ id: students.id, code: students.code, fullName: students.fullName, phone: students.phone })
        .from(students)
        .where(eq(students.id, conv.studentId))
        .limit(1);

      if (!student) return res.json({ linked: false });
      return res.json({ linked: true, student });
    } catch (err: any) {
      console.error("[Facebook] GET linked-student error:", err);
      return res.status(500).json({ message: "Lỗi lấy thông tin học viên liên kết" });
    }
  });

  // ── POST link student ──────────────────────────────────────────────────────
  app.post("/api/facebook/conversations/:id/link-student", async (req, res) => {
    try {
      const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.body);

      const [conv] = await db
        .select({ id: facebookConversations.id })
        .from(facebookConversations)
        .where(eq(facebookConversations.id, req.params.id))
        .limit(1);
      if (!conv) return res.status(404).json({ message: "Không tìm thấy hội thoại" });

      await db
        .update(facebookConversations)
        .set({ studentId, updatedAt: new Date() })
        .where(eq(facebookConversations.id, conv.id));

      const [student] = await db
        .select({ id: students.id, code: students.code, fullName: students.fullName, phone: students.phone })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      return res.json({ linked: true, student });
    } catch (err: any) {
      console.error("[Facebook] POST link-student error:", err);
      return res.status(500).json({ message: "Lỗi liên kết học viên" });
    }
  });
}
