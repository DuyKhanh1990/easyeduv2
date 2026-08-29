import type { Express, Request, Response } from "express";
import { db } from "../db";
import { zaloOaConfigs, zaloOaConversations, zaloOaMessages, studentNotificationChannels, students, centerConfig } from "@shared/schema";
import { eq, desc, and, sql, asc, isNull, or } from "drizzle-orm";
import { decrypt, encrypt } from "../lib/encryption";
import { z } from "zod";
import { getWebhookUrl } from "./zalo-oa.routes";
import multer from "multer";
import { sseManager } from "../services/sse-manager";
import { pushUserMappingToGateway } from "../services/gateway-mapping.service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Circuit-breaker: tránh spam log khi Zalo OA chưa đăng ký User Info API
// Reset tự động sau 6 giờ để thử lại (phòng trường hợp admin đã cấp quyền)
const profileApiState: { unavailable: boolean; since: number } = { unavailable: false, since: 0 };
const PROFILE_API_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 giờ

async function getAccessToken(locationId: string): Promise<string | null> {
  const rows = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId)).limit(1);
  if (!rows.length) {
    console.error(`[ZaloOA] getAccessToken: không tìm thấy config cho locationId=${locationId}`);
    return null;
  }
  if (!rows[0].accessTokenEncrypted) {
    console.error(`[ZaloOA] getAccessToken: accessTokenEncrypted trống trong DB (locationId=${locationId})`);
    return null;
  }
  try {
    const token = decrypt(rows[0].accessTokenEncrypted);
    console.log(`[ZaloOA] getAccessToken: giải mã OK, token dài ${token.length} ký tự (locationId=${locationId})`);
    return token;
  } catch (err: any) {
    console.error(`[ZaloOA] getAccessToken: giải mã THẤT BẠI (locationId=${locationId}): ${err.message}`);
    console.error(`[ZaloOA] getAccessToken: SYSTEM_ENCRYPTION_KEY có=${!!process.env.SYSTEM_ENCRYPTION_KEY}, AI_ENCRYPT_SECRET có=${!!process.env.AI_ENCRYPT_SECRET}`);
    return null;
  }
}

async function refreshAccessToken(locationId: string): Promise<string | null> {
  const rows = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, locationId)).limit(1);
  if (!rows.length) {
    console.error(`[ZaloOA] refreshAccessToken: không tìm thấy config cho locationId=${locationId}`);
    return null;
  }
  if (!rows[0].refreshTokenEncrypted) {
    console.error(`[ZaloOA] refreshAccessToken: không có refresh_token trong DB (locationId=${locationId})`);
    return null;
  }

  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) {
    console.error(`[ZaloOA] refreshAccessToken: thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET (appId=${appId ? 'có' : 'thiếu'}, appSecret=${appSecret ? 'có' : 'thiếu'})`);
    return null;
  }

  console.log(`[ZaloOA] refreshAccessToken: bắt đầu refresh (locationId=${locationId}, appId=${appId.slice(0, 6)}...)`);

  try {
    const refreshToken = decrypt(rows[0].refreshTokenEncrypted);
    console.log(`[ZaloOA] refreshAccessToken: gọi Zalo API với refresh_token dài ${refreshToken.length} ký tự`);

    const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "secret_key": appSecret },
      body: new URLSearchParams({ refresh_token: refreshToken, app_id: appId, grant_type: "refresh_token" }),
    });
    const data = await res.json() as any;
    console.log(`[ZaloOA] refreshAccessToken: Zalo trả về error=${data.error}, có access_token=${!!data.access_token}, message="${data.message || ''}"`);

    if (data.error || !data.access_token) {
      console.error("[ZaloOA] refreshAccessToken thất bại:", JSON.stringify(data));
      return null;
    }
    const accessTokenEncrypted = encrypt(data.access_token);
    const newRefreshTokenEncrypted = data.refresh_token ? encrypt(data.refresh_token) : rows[0].refreshTokenEncrypted;
    const expiresIn = data.expires_in ? parseInt(data.expires_in) : 7200;
    const tokenExpiredAt = new Date(Date.now() + expiresIn * 1000);
    await db.update(zaloOaConfigs).set({
      accessTokenEncrypted,
      refreshTokenEncrypted: newRefreshTokenEncrypted,
      tokenExpiredAt,
      isConnected: true,
      updatedAt: new Date(),
    }).where(eq(zaloOaConfigs.locationId, locationId));
    console.log(`[ZaloOA] Token auto-refreshed thành công (locationId=${locationId}), hết hạn lúc ${tokenExpiredAt.toISOString()}`);
    return data.access_token;
  } catch (err) {
    console.error("[ZaloOA] refreshAccessToken lỗi ngoại lệ:", err);
    return null;
  }
}

async function uploadAttachmentToZalo(
  type: "image" | "file" | "gif",
  buffer: Buffer,
  filename: string,
  mimetype: string,
  token: string,
): Promise<string | null> {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimetype });
  formData.append("file", blob, filename);

  const res = await fetch(`https://openapi.zalo.me/v2.0/oa/upload/${type}`, {
    method: "POST",
    headers: { "access_token": token },
    body: formData,
  });
  const data = await res.json() as any;
  if (data.error !== 0) {
    console.warn(`[ZaloOA] uploadAttachment (${type}): error=${data.error}, msg="${data.message}"`);
    return null;
  }
  // file upload trả về "token", image/gif trả về "attachment_id"
  return (type === "file" ? data.data?.token : data.data?.attachment_id) as string ?? null;
}

async function fetchAndUpdateFollowerProfile(
  convId: string,
  followerId: string,
  locationId: string,
): Promise<void> {
  // Circuit-breaker: bỏ qua nếu API đã biết không khả dụng và chưa hết thời gian retry
  if (profileApiState.unavailable && (Date.now() - profileApiState.since) < PROFILE_API_RETRY_INTERVAL_MS) {
    return;
  }

  try {
    const accessToken = await getAccessToken(locationId);
    if (!accessToken) return;

    const res = await fetch(
      `https://openapi.zalo.me/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id: followerId }))}`,
      { headers: { access_token: accessToken } },
    );
    const data = await res.json() as any;
    if (data.error !== 0 || !data.data) {
      if (data.error === -212) {
        // API chưa được đăng ký — đánh dấu circuit-breaker, log một lần duy nhất
        if (!profileApiState.unavailable) {
          console.warn(`[ZaloOA] fetchFollowerProfile: Zalo OA chưa đăng ký quyền User Info API (error=-212). Tắt tự động lấy tên follower. Cấp quyền tại Zalo Developer Portal để kích hoạt lại.`);
          profileApiState.unavailable = true;
          profileApiState.since = Date.now();
        }
      } else {
        console.warn(`[ZaloOA] fetchFollowerProfile: error=${data.error}, message="${data.message}", followerId=${followerId}`);
      }
      return;
    }

    // API hoạt động trở lại — reset circuit-breaker
    if (profileApiState.unavailable) {
      console.log(`[ZaloOA] fetchFollowerProfile: User Info API hoạt động trở lại, reset circuit-breaker.`);
      profileApiState.unavailable = false;
      profileApiState.since = 0;
    }

    const name = (data.data.display_name || data.data.name) as string | undefined;
    const avatar = data.data.avatar as string | undefined;
    if (!name) return;

    await db.update(zaloOaConversations)
      .set({ followerName: name, followerAvatar: avatar || undefined, updatedAt: new Date() })
      .where(eq(zaloOaConversations.id, convId));

    console.log(`[ZaloOA] fetchFollowerProfile: cập nhật tên "${name}" cho followerId=${followerId}`);
  } catch (err: any) {
    console.warn(`[ZaloOA] fetchFollowerProfile: lỗi ngoại lệ (followerId=${followerId}):`, err.message);
  }
}

// Gọi Zalo API để lấy nội dung tin nhắn outbound (user_received_message không có text)
async function fetchAndUpdateOutboundMessageContent(
  msgId: string,
  convId: string,
  followerId: string,
  locationId: string,
): Promise<void> {
  try {
    const accessToken = await getAccessToken(locationId);
    if (!accessToken) return;

    // Lấy tối đa 10 tin nhắn gần nhất trong conversation với follower này
    const data_param = JSON.stringify({ user_id: followerId, offset: 0, count: 10 });
    const res = await fetch(
      `https://openapi.zalo.me/v2.0/oa/conversation?data=${encodeURIComponent(data_param)}`,
      { headers: { access_token: accessToken } },
    );
    const data = await res.json() as any;
    if (data.error !== 0 || !Array.isArray(data.data)) {
      console.warn(`[ZaloOA] fetchOutboundContent: Zalo API error=${data.error} msg="${data.message}" (msgId=${msgId})`);
      return;
    }

    // Tìm đúng tin nhắn theo msgId
    const match = data.data.find((m: any) => m.message_id === msgId);
    const text = match?.message as string | undefined;
    if (!text) {
      console.warn(`[ZaloOA] fetchOutboundContent: không tìm thấy msgId=${msgId} trong ${data.data.length} tin trả về`);
      return;
    }

    // Cập nhật content trong DB và preview trong conversation
    await db.update(zaloOaMessages).set({ content: text }).where(eq(zaloOaMessages.msgId, msgId));
    await db.update(zaloOaConversations).set({ lastMessage: text, updatedAt: new Date() }).where(eq(zaloOaConversations.id, convId));
    console.log(`[ZaloOA] fetchOutboundContent: cập nhật nội dung "${text}" cho msgId=${msgId}`);
  } catch (err: any) {
    console.warn(`[ZaloOA] fetchOutboundContent: lỗi (msgId=${msgId}):`, err.message);
  }
}

async function upsertConversation(
  configId: string,
  locationId: string,
  followerId: string,
  followerName?: string,
  followerAvatar?: string,
  anonymousKey?: string,
): Promise<{ id: string; isNew: boolean }> {
  const isAnon = !!anonymousKey;

  const existing = await db
    .select()
    .from(zaloOaConversations)
    .where(and(eq(zaloOaConversations.zaloOaConfigId, configId), eq(zaloOaConversations.followerId, followerId)))
    .limit(1);

  if (existing.length > 0) {
    // Cập nhật followerName/Avatar nếu webhook cung cấp và DB đang null
    const updates: Record<string, any> = {};
    if (followerName && !existing[0].followerName) updates.followerName = followerName;
    if (followerAvatar && !existing[0].followerAvatar) updates.followerAvatar = followerAvatar;
    if (anonymousKey && !existing[0].anonymousKey) {
      updates.anonymousKey = anonymousKey;
      updates.isAnonymous = true;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(zaloOaConversations)
        .set(updates)
        .where(eq(zaloOaConversations.id, existing[0].id));
    }
    return { id: existing[0].id, isNew: false };
  }

  const [created] = await db
    .insert(zaloOaConversations)
    .values({ zaloOaConfigId: configId, locationId, followerId, followerName, followerAvatar, anonymousKey, isAnonymous: isAnon })
    .returning({ id: zaloOaConversations.id });
  return { id: created.id, isNew: true };
}

// Helper: khi có nhiều config null, thử gọi Zalo API với từng token để xác định config nào khớp oaId
// Sau khi xác định, tự động gán oaId vào DB (self-healing)
async function probeOaIdFromNullConfigs(
  nullConfigs: (typeof zaloOaConfigs.$inferSelect)[],
  targetOaId: string,
): Promise<(typeof zaloOaConfigs.$inferSelect & { oaId: string }) | null> {
  for (const config of nullConfigs) {
    if (!config.accessTokenEncrypted) continue;
    try {
      const token = decrypt(config.accessTokenEncrypted);
      const res = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
        headers: { "access_token": token },
      });
      const data = await res.json() as any;
      if (data.error === 0 && data.data?.oa_id) {
        const foundOaId: string = String(data.data.oa_id);
        const oaName: string | null = data.data.name || null;
        // Cập nhật oaId (và oaName) vào DB cho tất cả config có token hợp lệ
        await db.update(zaloOaConfigs).set({ oaId: foundOaId, oaName, updatedAt: new Date() }).where(eq(zaloOaConfigs.id, config.id));
        console.log(`[ZaloOA Probe] Config ${config.id} (locationId=${config.locationId}) → oaId=${foundOaId} oaName=${oaName}`);
        if (foundOaId === targetOaId) {
          return { ...config, oaId: foundOaId, oaName };
        }
      } else {
        console.warn(`[ZaloOA Probe] Config ${config.id} (locationId=${config.locationId}) Zalo API error: ${data.error} ${data.message}`);
      }
    } catch (e) {
      console.warn(`[ZaloOA Probe] Config ${config.id} exception:`, e);
    }
  }
  return null;
}

// ─── Auto-map Zalo follower → student_notification_channels ─────────────────
// Gọi bất đồng bộ sau mỗi tin nhắn inbound — không block webhook response
async function tryAutoMapStudent(
  followerId: string,
  locationId: string,
): Promise<void> {
  try {
    // 1. Đã map rồi thì bỏ qua ngay (fast-path)
    const [alreadyMapped] = await db
      .select({ id: studentNotificationChannels.id })
      .from(studentNotificationChannels)
      .where(eq(studentNotificationChannels.zaloUserId, followerId))
      .limit(1);
    if (alreadyMapped) return;

    // 2. Lấy access token
    const accessToken = await getAccessToken(locationId);
    if (!accessToken) return;

    // 3. Gọi Zalo User Detail API lấy profile
    const res = await fetch(
      `https://openapi.zalo.me/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id: followerId }))}`,
      { headers: { access_token: accessToken } },
    );
    const data = await res.json() as any;
    if (data.error !== 0 || !data.data) {
      if (data.error !== -212) {
        console.log(`[ZaloOA AutoMap] User Detail API error=${data.error} followerId=${followerId}`);
      }
      return;
    }

    // 4. Extract phone — Zalo có thể trả về nhiều vị trí khác nhau
    const rawPhone: string | undefined =
      data.data.profile?.phone ||
      data.data.phone ||
      data.data.shared_info?.phone;

    if (!rawPhone) {
      console.log(`[ZaloOA AutoMap] followerId=${followerId}: profile không có phone, bỏ qua`);
      return;
    }

    // 5. Normalize phone về format 0xxx để match DB (students lưu 0xxx)
    const normalize = (p: string): string => {
      const d = p.replace(/\D/g, "");
      if (d.startsWith("84") && d.length >= 11) return "0" + d.slice(2);
      return d.startsWith("0") ? d : d;
    };
    const phone = normalize(rawPhone);

    // 6. Tìm student theo phone hoặc parentPhone
    const [student] = await db
      .select({ id: students.id, userId: students.userId })
      .from(students)
      .where(or(eq(students.phone, phone), eq(students.parentPhone, phone)))
      .limit(1);

    if (!student) {
      console.log(`[ZaloOA AutoMap] followerId=${followerId}: không tìm thấy student với phone=${phone}`);
      return;
    }

    // 7. Lấy centerId
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center) return;

    // 8. UPSERT student_notification_channels
    await db
      .insert(studentNotificationChannels)
      .values({
        studentId: student.id,
        centerId: center.id,
        zaloUserId: followerId,
        isFollowed: true,
        hasInteracted: true,
        preferredChannel: "AUTO",
      })
      .onConflictDoUpdate({
        target: [studentNotificationChannels.studentId, studentNotificationChannels.centerId],
        set: {
          zaloUserId: followerId,
          isFollowed: true,
          hasInteracted: true,
        },
      });

    // 9. Push mapping lên gateway (fire-and-forget)
    if (student.userId) {
      pushUserMappingToGateway(followerId, student.userId).catch(() => {});
    }

    console.log(`[ZaloOA AutoMap] ✓ Mapped followerId=${followerId} → studentId=${student.id} (phone=${phone})`);
  } catch (err: any) {
    console.warn(`[ZaloOA AutoMap] Lỗi followerId=${followerId}:`, err.message);
  }
}

export function registerZaloOAChatRoutes(app: Express) {
  // ─── Webhook verify handler (dùng chung cho cả 2 path) ──────────────────────
  const webhookVerifyHandler = (req: Request, res: Response) => {
    const challenge = req.query.challenge as string;
    if (challenge) return res.json({ challenge });
    return res.json({ ok: true });
  };

  // /api/zalo-oa/webhook — direct mode
  app.get("/api/zalo-oa/webhook", webhookVerifyHandler);
  // /zalo/webhook — production gateway URL alias (easyeduv2.easyedu.vn/zalo/webhook)
  app.get("/zalo/webhook", webhookVerifyHandler);

  // ─── Webhook nhận tin nhắn (POST) — handler dùng chung cho cả 2 path ────────
  const webhookPostHandler = async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const event = body?.event_name as string | undefined;

      // Log raw webhook để debug (chỉ khi không có event → payload lạ)
      if (!event) {
        console.warn("[ZaloOA Webhook] Nhận payload không có event_name. Keys:", Object.keys(body || {}));
        return res.json({ ok: true });
      }

      // user_received_message = Zalo gửi khi OA/nhân viên reply qua app mobile → outbound
      const isInbound = event.startsWith("user_send");
      const isOutbound = event.startsWith("oa_send") || event === "user_received_message";
      const isAnonymous = event.startsWith("anon_send") || event.startsWith("anon_");

      if (!isInbound && !isOutbound && !isAnonymous) return res.json({ ok: true });

      // Inbound/Anon: sender=follower|anon, recipient=OA
      // Outbound (oa_send_* hoặc user_received_message): sender=OA, recipient=follower
      // Zalo v2: oa_id hoặc recipient.id | Zalo v3: app_id ở top-level
      const oaId = (isOutbound
        ? (body?.sender?.id || body?.oa_id || body?.app_id)
        : (body?.recipient?.id || body?.oa_id || body?.app_id)) as string | undefined;
      if (!oaId) {
        console.warn(`[ZaloOA Webhook] Không tìm được oaId từ payload. event=${event}, keys=${Object.keys(body || {}).join(",")}`);
        return res.json({ ok: true });
      }

      // ORDER BY created_at ASC để luôn chọn config cũ nhất (ổn định, tránh ambiguous khi nhiều config cùng oaId)
      let configs = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.oaId, oaId)).orderBy(asc(zaloOaConfigs.createdAt)).limit(1);
      if (!configs.length) {
        // Fallback: tìm config có oaId=null (trường hợp OAuth xong nhưng chưa lưu được oaId)
        const nullConfigs = await db.select().from(zaloOaConfigs).where(isNull(zaloOaConfigs.oaId)).orderBy(asc(zaloOaConfigs.createdAt));
        if (nullConfigs.length === 1) {
          console.log(`[ZaloOA Webhook] Auto-heal: gán oaId=${oaId} cho config id=${nullConfigs[0].id}`);
          await db.update(zaloOaConfigs).set({ oaId, updatedAt: new Date() }).where(eq(zaloOaConfigs.id, nullConfigs[0].id));
          configs = [{ ...nullConfigs[0], oaId }];
        } else if (nullConfigs.length > 1) {
          // Nhiều config null: thử gọi Zalo API với từng token để xác định config nào khớp oaId
          console.log(`[ZaloOA Webhook] ${nullConfigs.length} null configs, thử probe Zalo API để xác định oaId=${oaId}...`);
          const matched = await probeOaIdFromNullConfigs(nullConfigs, oaId);
          if (matched) {
            configs = [matched];
          } else {
            console.warn(`[ZaloOA Webhook] Không xác định được config cho oaId=${oaId} sau khi probe.`);
            return res.json({ ok: true });
          }
        } else {
          console.warn(`[ZaloOA Webhook] Không tìm thấy config nào cho oaId=${oaId}.`);
          return res.json({ ok: true });
        }
      }

      const config = configs[0];
      // Với ẩn danh: sender.id là anonymous_id (dùng làm followerId tạm thời), anonymous_key dùng để reply
      const followerId = (isOutbound ? body?.recipient?.id : body?.sender?.id) as string;
      const followerName = (isOutbound ? body?.recipient?.display_name : body?.sender?.display_name) as string | undefined;
      const followerAvatar = (isOutbound ? body?.recipient?.avatar : body?.sender?.avatar) as string | undefined;
      const anonymousKey = isAnonymous ? (body?.sender?.anonymous_key || body?.anonymous_key) as string | undefined : undefined;
      const msgId = body?.message?.msg_id as string | undefined;
      const msgText = body?.message?.text as string | undefined;
      const attachments = body?.message?.attachments as any[] | undefined;
      const direction = (isInbound || isAnonymous) ? "inbound" : "outbound";

      console.log(`[ZaloOA Webhook] event=${event}, direction=${direction}, oaId=${oaId}, locationId=${config.locationId}, followerId=${followerId}, anon=${isAnonymous}, msgId=${msgId}`);

      if (!followerId) return res.json({ ok: true });

      const { id: convId, isNew: isNewConv } = await upsertConversation(
        config.id,
        config.locationId!,
        followerId,
        followerName,
        followerAvatar,
        anonymousKey,
      );

      // Auto-map follower → student (bất đồng bộ, không block response)
      if (isInbound && !isAnonymous) {
        tryAutoMapStudent(followerId, config.locationId!).catch(() => {});
      }

      const messageType = (event.includes("audio") ? "audio" : event.includes("image") ? "image" : event.includes("file") ? "file" : event.includes("sticker") ? "sticker" : event.includes("gif") ? "gif" : "text");
      const sentAt = body?.timestamp ? new Date(parseInt(body.timestamp)) : new Date();

      // Idempotency: SELECT sớm để thoát nhanh (fast-path)
      if (msgId) {
        const existing = await db.select({ id: zaloOaMessages.id }).from(zaloOaMessages).where(eq(zaloOaMessages.msgId, msgId)).limit(1);
        if (existing.length > 0) return res.json({ ok: true });
      }

      // INSERT với DB-level safety: UNIQUE index trên msg_id bắt race condition
      let inserted = true;
      try {
        await db.insert(zaloOaMessages).values({
          conversationId: convId,
          msgId,
          direction,
          messageType,
          content: msgText,
          attachments: attachments ? attachments : null,
          sentAt,
        });
      } catch (err: any) {
        if (err.code === "23505") { inserted = false; } // unique_violation → duplicate
        else throw err;
      }
      if (!inserted) return res.json({ ok: true });

      // Cập nhật conversation chỉ khi tin nhắn thực sự được insert
      const preview = msgText || (attachments?.length ? `[${messageType}]` : (isOutbound ? "[Tin nhắn đã gửi]" : ""));
      await db.update(zaloOaConversations)
        .set({
          followerName: followerName || undefined,
          followerAvatar: followerAvatar || undefined,
          lastMessage: preview,
          lastMessageAt: sentAt,
          // Chỉ tăng unread khi tin đến từ học viên, không tăng khi nhân viên tự reply
          ...(isInbound ? { unreadCount: sql`${zaloOaConversations.unreadCount} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(zaloOaConversations.id, convId));

      // Nếu webhook không cung cấp tên, tự động lấy profile từ Zalo API (bất đồng bộ)
      if (!followerName && isInbound) {
        fetchAndUpdateFollowerProfile(convId, followerId, config.locationId!).catch(() => {});
      }

      // user_received_message không có text → async fetch nội dung từ Zalo conversation API
      // Sau khi fetch xong, fire thêm SSE để frontend tự refresh mà không cần click
      if (isOutbound && !msgText && msgId && event === "user_received_message") {
        fetchAndUpdateOutboundMessageContent(msgId, convId, followerId, config.locationId!)
          .then(() => {
            sseManager.emit({ type: "message_sent", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
          })
          .catch(() => {});
      }

      console.log(`[ZaloOA Webhook] Lưu thành công: convId=${convId}, followerId=${followerId}, direction=${direction}`);
      if (isNewConv) {
        sseManager.emit({ type: "conversation_created", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
      }
      sseManager.emit({ type: direction === "outbound" ? "message_sent" : "new_message", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA Webhook] error:", err);
      return res.json({ ok: true }); // Luôn trả 200 để Zalo không retry
    }
  };

  // Đăng ký cả 2 path — direct mode và production gateway alias
  app.post("/api/zalo-oa/webhook", webhookPostHandler);
  app.post("/zalo/webhook", webhookPostHandler);

  // ─── POST /api/zalo/incoming — Gateway forwards webhook events here ─────────
  app.post("/api/zalo/incoming", async (req, res) => {
    try {
      const expectedSecret = process.env.ZALO_GATEWAY_SHARED_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ message: "Gateway mode not active (ZALO_GATEWAY_SHARED_SECRET not set)" });
      }
      const authHeader = req.headers["x-gateway-secret"];
      if (authHeader !== expectedSecret) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const body = req.body as any;
      const event = body?.event_name as string | undefined;
      if (!event) {
        console.warn("[ZaloOA Incoming] Payload không có event_name. Keys:", Object.keys(body || {}));
        return res.json({ ok: true });
      }

      // user_received_message = Zalo gửi khi OA/nhân viên reply qua app mobile → outbound
      const isInbound = event.startsWith("user_send");
      const isOutbound = event.startsWith("oa_send") || event === "user_received_message";
      const isAnonymous = event.startsWith("anon_send") || event.startsWith("anon_");

      if (!isInbound && !isOutbound && !isAnonymous) return res.json({ ok: true });

      // Inbound/Anon: sender=follower|anon, recipient=OA
      // Outbound (oa_send_* hoặc user_received_message): sender=OA, recipient=follower
      // Zalo v2: oa_id hoặc recipient.id | Zalo v3: app_id ở top-level
      const oaId = (isOutbound
        ? (body?.sender?.id || body?.oa_id || body?.app_id)
        : (body?.recipient?.id || body?.oa_id || body?.app_id)) as string | undefined;
      if (!oaId) {
        console.warn(`[ZaloOA Incoming] Không tìm được oaId. event=${event}, keys=${Object.keys(body || {}).join(",")}`);
        return res.json({ ok: true });
      }

      // ORDER BY created_at ASC để luôn chọn config cũ nhất (ổn định)
      let configs = await db.select().from(zaloOaConfigs).where(eq(zaloOaConfigs.oaId, oaId)).orderBy(asc(zaloOaConfigs.createdAt)).limit(1);
      if (!configs.length) {
        // Fallback: tìm config có oaId=null (self-healing)
        const nullConfigs = await db.select().from(zaloOaConfigs).where(isNull(zaloOaConfigs.oaId)).orderBy(asc(zaloOaConfigs.createdAt));
        if (nullConfigs.length === 1) {
          console.log(`[ZaloOA Incoming] Auto-heal: gán oaId=${oaId} cho config id=${nullConfigs[0].id}`);
          await db.update(zaloOaConfigs).set({ oaId, updatedAt: new Date() }).where(eq(zaloOaConfigs.id, nullConfigs[0].id));
          configs = [{ ...nullConfigs[0], oaId }];
        } else if (nullConfigs.length > 1) {
          // Nhiều config null: thử gọi Zalo API với từng token để xác định config nào khớp oaId
          console.log(`[ZaloOA Incoming] ${nullConfigs.length} null configs, thử probe Zalo API để xác định oaId=${oaId}...`);
          const matched = await probeOaIdFromNullConfigs(nullConfigs, oaId);
          if (matched) {
            configs = [matched];
          } else {
            console.warn(`[ZaloOA Incoming] Không xác định được config cho oaId=${oaId} sau khi probe.`);
            return res.json({ ok: true });
          }
        } else {
          console.warn(`[ZaloOA Incoming] Không tìm thấy config nào cho oaId=${oaId}.`);
          return res.json({ ok: true });
        }
      }

      const config = configs[0];
      const followerId = (isOutbound ? body?.recipient?.id : body?.sender?.id) as string;
      const followerName = (isOutbound ? body?.recipient?.display_name : body?.sender?.display_name) as string | undefined;
      const followerAvatar = (isOutbound ? body?.recipient?.avatar : body?.sender?.avatar) as string | undefined;
      const anonymousKey = isAnonymous ? (body?.sender?.anonymous_key || body?.anonymous_key) as string | undefined : undefined;
      const msgId = body?.message?.msg_id as string | undefined;
      const msgText = body?.message?.text as string | undefined;
      const attachments = body?.message?.attachments as any[] | undefined;
      const direction = (isInbound || isAnonymous) ? "inbound" : "outbound";

      console.log(`[ZaloOA Incoming] event=${event}, direction=${direction}, oaId=${oaId}, locationId=${config.locationId}, followerId=${followerId}, anon=${isAnonymous}, msgId=${msgId}`);

      if (!followerId) return res.json({ ok: true });

      const { id: convId, isNew: isNewConv } = await upsertConversation(
        config.id,
        config.locationId!,
        followerId,
        followerName,
        followerAvatar,
        anonymousKey,
      );

      // Auto-map follower → student (bất đồng bộ, không block response)
      if (isInbound && !isAnonymous) {
        tryAutoMapStudent(followerId, config.locationId!).catch(() => {});
      }

      const messageType = (event.includes("audio") ? "audio" : event.includes("image") ? "image" : event.includes("file") ? "file" : event.includes("sticker") ? "sticker" : event.includes("gif") ? "gif" : "text");
      const sentAt = body?.timestamp ? new Date(parseInt(body.timestamp)) : new Date();

      // Idempotency: SELECT sớm để thoát nhanh (fast-path)
      if (msgId) {
        const existing = await db.select({ id: zaloOaMessages.id }).from(zaloOaMessages).where(eq(zaloOaMessages.msgId, msgId)).limit(1);
        if (existing.length > 0) return res.json({ ok: true });
      }

      // INSERT với DB-level safety: UNIQUE index trên msg_id bắt race condition
      let inserted = true;
      try {
        await db.insert(zaloOaMessages).values({
          conversationId: convId,
          msgId,
          direction,
          messageType,
          content: msgText,
          attachments: attachments ? attachments : null,
          sentAt,
        });
      } catch (err: any) {
        if (err.code === "23505") { inserted = false; } // unique_violation → duplicate
        else throw err;
      }
      if (!inserted) return res.json({ ok: true });

      const preview = msgText || (attachments?.length ? `[${messageType}]` : (isOutbound ? "[Tin nhắn đã gửi]" : ""));
      await db.update(zaloOaConversations)
        .set({
          followerName: followerName || undefined,
          followerAvatar: followerAvatar || undefined,
          lastMessage: preview,
          lastMessageAt: sentAt,
          // Chỉ tăng unread khi tin đến từ học viên, không tăng khi nhân viên tự reply
          ...(isInbound ? { unreadCount: sql`${zaloOaConversations.unreadCount} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(zaloOaConversations.id, convId));

      // Nếu webhook không cung cấp tên, tự động lấy profile từ Zalo API (bất đồng bộ)
      if (!followerName && isInbound) {
        fetchAndUpdateFollowerProfile(convId, followerId, config.locationId!).catch(() => {});
      }

      // user_received_message không có text → async fetch nội dung từ Zalo conversation API
      // Sau khi fetch xong, fire thêm SSE để frontend tự refresh mà không cần click
      if (isOutbound && !msgText && msgId && event === "user_received_message") {
        fetchAndUpdateOutboundMessageContent(msgId, convId, followerId, config.locationId!)
          .then(() => {
            sseManager.emit({ type: "message_sent", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
          })
          .catch(() => {});
      }

      console.log(`[ZaloOA Incoming] Lưu thành công: convId=${convId}, followerId=${followerId}, direction=${direction}`);
      if (isNewConv) {
        sseManager.emit({ type: "conversation_created", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
      }
      sseManager.emit({ type: direction === "outbound" ? "message_sent" : "new_message", locationId: config.locationId!, oaConfigId: config.id, conversationId: convId });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA Incoming] error:", err);
      return res.json({ ok: true });
    }
  });

  // ─── GET /api/zalo-oa/conversations/:id/linked-student ─────────────────────
  app.get("/api/zalo-oa/conversations/:id/linked-student", async (req, res) => {
    try {
      const { id } = req.params;
      const convRows = await db.select().from(zaloOaConversations).where(eq(zaloOaConversations.id, id)).limit(1);
      if (!convRows.length) return res.status(404).json({ message: "Không tìm thấy hội thoại" });
      const { followerId } = convRows[0];

      const rows = await db
        .select({
          id: students.id,
          code: students.code,
          fullName: students.fullName,
          phone: students.phone,
        })
        .from(studentNotificationChannels)
        .innerJoin(students, eq(studentNotificationChannels.studentId, students.id))
        .where(eq(studentNotificationChannels.zaloUserId, followerId))
        .limit(1);

      if (!rows.length) return res.json({ linked: false });
      return res.json({ linked: true, student: rows[0] });
    } catch (err: any) {
      console.error("[ZaloOA] GET linked-student error:", err);
      return res.status(500).json({ message: "Lỗi lấy thông tin học viên liên kết" });
    }
  });

  // ─── POST /api/zalo-oa/conversations/:id/link-student ──────────────────────
  app.post("/api/zalo-oa/conversations/:id/link-student", async (req, res) => {
    try {
      const { id } = req.params;
      const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.body);

      const convRows = await db.select().from(zaloOaConversations).where(eq(zaloOaConversations.id, id)).limit(1);
      if (!convRows.length) return res.status(404).json({ message: "Không tìm thấy hội thoại" });
      const { followerId } = convRows[0];

      const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
      if (!center) return res.status(500).json({ message: "Không tìm thấy center" });

      await db
        .insert(studentNotificationChannels)
        .values({
          studentId,
          centerId: center.id,
          zaloUserId: followerId,
          isFollowed: true,
          hasInteracted: true,
          preferredChannel: "AUTO",
        })
        .onConflictDoUpdate({
          target: [studentNotificationChannels.studentId, studentNotificationChannels.centerId],
          set: { zaloUserId: followerId, isFollowed: true, hasInteracted: true },
        });

      const [student] = await db
        .select({ id: students.id, code: students.code, fullName: students.fullName, phone: students.phone, userId: students.userId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      // Push mapping lên gateway (fire-and-forget)
      if (student?.userId) {
        pushUserMappingToGateway(followerId, student.userId).catch(() => {});
      }

      return res.json({ linked: true, student });
    } catch (err: any) {
      console.error("[ZaloOA] POST link-student error:", err);
      return res.status(500).json({ message: "Lỗi liên kết học viên" });
    }
  });

  // ─── GET /api/zalo-oa/conversations?locationId=xxx ─────────────────────────
  app.get("/api/zalo-oa/conversations", async (req, res) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ message: "Thiếu locationId" });

      const rows = await db
        .select()
        .from(zaloOaConversations)
        .where(eq(zaloOaConversations.locationId, locationId as string))
        .orderBy(desc(zaloOaConversations.lastMessageAt));

      return res.json(rows);
    } catch (err: any) {
      console.error("[ZaloOA] GET conversations error:", err);
      return res.status(500).json({ message: "Lỗi lấy danh sách hội thoại" });
    }
  });

  // ─── GET /api/zalo-oa/conversations/:id/messages ───────────────────────────
  app.get("/api/zalo-oa/conversations/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await db
        .select()
        .from(zaloOaMessages)
        .where(eq(zaloOaMessages.conversationId, id))
        .orderBy(zaloOaMessages.sentAt);

      // Đánh dấu đã đọc + lấy conversation để kiểm tra followerName
      const convRows = await db
        .select()
        .from(zaloOaConversations)
        .where(eq(zaloOaConversations.id, id))
        .limit(1);

      if (convRows.length > 0) {
        const conv = convRows[0];
        await db.update(zaloOaConversations).set({ unreadCount: 0 }).where(eq(zaloOaConversations.id, id));

        // Nếu chưa có tên, tự động fetch profile từ Zalo API (bất đồng bộ)
        if (!conv.followerName && conv.locationId) {
          fetchAndUpdateFollowerProfile(id, conv.followerId, conv.locationId).catch(() => {});
        }
      }

      return res.json(messages);
    } catch (err: any) {
      console.error("[ZaloOA] GET messages error:", err);
      return res.status(500).json({ message: "Lỗi lấy tin nhắn" });
    }
  });

  // ─── POST /api/zalo-oa/conversations/:id/reply — gửi tin nhắn ──────────────
  app.post("/api/zalo-oa/conversations/:id/reply", async (req, res) => {
    try {
      const { id } = req.params;
      const { message } = z.object({ message: z.string().min(1) }).parse(req.body);

      const convRows = await db.select().from(zaloOaConversations).where(eq(zaloOaConversations.id, id)).limit(1);
      if (!convRows.length) return res.status(404).json({ message: "Không tìm thấy hội thoại" });

      const conv = convRows[0];
      let accessToken = await getAccessToken(conv.locationId!);
      if (!accessToken) return res.status(400).json({ message: "Chưa có access token hợp lệ cho cơ sở này" });

      // Tự động chọn API: ẩn danh dùng /message/anonymous, người follow dùng /message/cs
      const buildBody = (anonKey?: string | null) => anonKey
        ? { recipient: { anonymous_key: anonKey }, message: { text: message } }
        : { recipient: { user_id: conv.followerId }, message: { text: message } };

      const apiPath = conv.isAnonymous && conv.anonymousKey ? "anonymous" : "cs";

      const sendMessage = async (token: string) => fetch(`https://openapi.zalo.me/v3.0/oa/message/${apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": token },
        body: JSON.stringify(buildBody(conv.isAnonymous ? conv.anonymousKey : null)),
      });

      let zaloRes = await sendMessage(accessToken);
      let zaloData = await zaloRes.json() as any;
      console.log(`[ZaloOA] reply lần 1: error=${zaloData.error}, message="${zaloData.message || ''}", followerId=${conv.followerId}`);

      // Nếu token hết hạn (-155, -216, 216), tự động refresh và thử lại
      if (zaloData.error === -155 || zaloData.error === -216 || zaloData.error === 216) {
        console.log(`[ZaloOA] Token expired (error=${zaloData.error}), attempting auto-refresh for locationId=${conv.locationId}`);
        const newToken = await refreshAccessToken(conv.locationId!);
        if (newToken) {
          zaloRes = await sendMessage(newToken);
          zaloData = await zaloRes.json() as any;
          console.log(`[ZaloOA] reply lần 2 (sau refresh): error=${zaloData.error}, message="${zaloData.message || ''}"`);
        } else {
          return res.status(400).json({ message: "Token hết hạn và không thể làm mới tự động. Vui lòng kết nối lại Zalo OA." });
        }
      }

      if (zaloData.error !== 0) {
        console.error(`[ZaloOA] reply thất bại cuối cùng: error=${zaloData.error}, message="${zaloData.message}", data=${JSON.stringify(zaloData)}`);
        return res.status(400).json({ message: zaloData.message || "Gửi tin nhắn Zalo thất bại" });
      }

      // Lưu tin nhắn outbound vào DB
      const [saved] = await db.insert(zaloOaMessages).values({
        conversationId: id,
        msgId: zaloData.data?.message_id,
        direction: "outbound",
        messageType: "text",
        content: message,
        sentAt: new Date(),
      }).returning();

      await db.update(zaloOaConversations)
        .set({ lastMessage: message, lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(zaloOaConversations.id, id));

      sseManager.emit({ type: "message_sent", locationId: conv.locationId!, oaConfigId: conv.zaloOaConfigId, conversationId: id });
      return res.json(saved);
    } catch (err: any) {
      console.error("[ZaloOA] reply error:", err);
      return res.status(500).json({ message: err.message || "Lỗi gửi tin nhắn" });
    }
  });

  // ─── POST /api/zalo-oa/conversations/:id/send-attachment — gửi ảnh/file/gif ──
  app.post("/api/zalo-oa/conversations/:id/send-attachment", upload.single("file"), async (req, res) => {
    try {
      const { id } = req.params;
      const type = (req.body.type || "image") as "image" | "file" | "gif";
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Không có file" });

      const convRows = await db.select().from(zaloOaConversations).where(eq(zaloOaConversations.id, id)).limit(1);
      if (!convRows.length) return res.status(404).json({ message: "Không tìm thấy hội thoại" });
      const conv = convRows[0];

      let accessToken = await getAccessToken(conv.locationId!);
      if (!accessToken) return res.status(400).json({ message: "Chưa có access token hợp lệ" });

      // Upload file lên Zalo
      let attachmentId = await uploadAttachmentToZalo(type, file.buffer, file.originalname, file.mimetype, accessToken);

      // Nếu upload thất bại → thử refresh token rồi upload lại
      if (!attachmentId) {
        const newToken = await refreshAccessToken(conv.locationId!);
        if (newToken) {
          accessToken = newToken;
          attachmentId = await uploadAttachmentToZalo(type, file.buffer, file.originalname, file.mimetype, newToken);
        }
      }

      if (!attachmentId) return res.status(400).json({ message: "Upload file lên Zalo thất bại" });

      // Xây payload đúng chuẩn Zalo v3 theo từng loại file
      const buildAttachmentMessage = () => {
        if (type === "file") {
          // File: { type: "file", payload: { token } }
          return { attachment: { type: "file", payload: { token: attachmentId } } };
        }
        // Image / GIF: { type: "template", payload: { template_type: "media", elements: [...] } }
        return {
          attachment: {
            type: "template",
            payload: {
              template_type: "media",
              elements: [{ media_type: type === "gif" ? "gif" : "image", attachment_id: attachmentId }],
            },
          },
        };
      };

      // Gửi tin nhắn với attachment
      const zaloRes = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": accessToken },
        body: JSON.stringify({
          recipient: { user_id: conv.followerId },
          message: buildAttachmentMessage(),
        }),
      });
      const zaloData = await zaloRes.json() as any;
      console.log(`[ZaloOA] send-attachment: type=${type}, error=${zaloData.error}, msg="${zaloData.message || ''}"`);

      if (zaloData.error !== 0) {
        return res.status(400).json({ message: zaloData.message || "Gửi file Zalo thất bại" });
      }

      const preview = type === "image" ? "[ảnh]" : type === "gif" ? "[gif]" : `[file: ${file.originalname}]`;
      const [saved] = await db.insert(zaloOaMessages).values({
        conversationId: id,
        msgId: zaloData.data?.message_id,
        direction: "outbound",
        messageType: type,
        content: type === "file" ? file.originalname : null,
        attachments: [{ payload: { attachment_id: attachmentId, name: file.originalname, url: null } }],
        sentAt: new Date(),
      }).returning();

      await db.update(zaloOaConversations)
        .set({ lastMessage: preview, lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(zaloOaConversations.id, id));

      sseManager.emit({ type: "message_sent", locationId: conv.locationId!, oaConfigId: conv.zaloOaConfigId, conversationId: id });
      return res.json(saved);
    } catch (err: any) {
      console.error("[ZaloOA] send-attachment error:", err);
      return res.status(500).json({ message: err.message || "Lỗi gửi file" });
    }
  });

  // ─── POST /api/zalo-oa/conversations/:id/react — thả cảm xúc vào tin nhắn ──
  app.post("/api/zalo-oa/conversations/:id/react", async (req, res) => {
    try {
      const { id } = req.params;
      const { message_id, react_icon } = z.object({ message_id: z.string(), react_icon: z.string() }).parse(req.body);

      const convRows = await db.select().from(zaloOaConversations).where(eq(zaloOaConversations.id, id)).limit(1);
      if (!convRows.length) return res.status(404).json({ message: "Không tìm thấy hội thoại" });
      const conv = convRows[0];

      let accessToken = await getAccessToken(conv.locationId!);
      if (!accessToken) return res.status(400).json({ message: "Chưa có access token" });

      const zaloRes = await fetch("https://openapi.zalo.me/v3.0/oa/message/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": accessToken },
        body: JSON.stringify({ message_id, react_icon }),
      });
      const data = await zaloRes.json() as any;
      if (data.error !== 0) {
        return res.status(400).json({ message: data.message || "React thất bại" });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZaloOA] react error:", err);
      return res.status(500).json({ message: err.message || "Lỗi react tin nhắn" });
    }
  });

  // ─── GET /api/zalo-oa/webhook-info — lấy thông tin webhook URL ─────────────
  app.get("/api/zalo-oa/webhook-info", (req, res) => {
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
    const base = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;
    const webhookUrl = getWebhookUrl(req); // ưu tiên ZALO_WEBHOOK_URL env var
    const isCustom = Boolean(process.env.ZALO_WEBHOOK_URL);
    return res.json({
      webhookUrl,
      callbackUrl: `${base}/api/zalo-oa/callback`,
      isCustom, // true nếu dùng ZALO_WEBHOOK_URL env var
    });
  });
}
