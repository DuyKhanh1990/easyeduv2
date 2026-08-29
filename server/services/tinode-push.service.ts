/**
 * tinode-push.service.ts
 *
 * Lắng nghe tin nhắn mới từ Tinode (qua admin bot WebSocket) và gửi
 * Expo Push Notification đến các thành viên topic NGOẠI TRỪ người gửi.
 *
 * Hỗ trợ 2 loại topic:
 *   - grp* topic thuộc bảng chat_groups  → thành viên từ chat_group_members (nhóm tùy chỉnh + DM)
 *
 * Luồng hoạt động:
 *   1. startTinodePushListener() được gọi sau khi Tinode admin bot ready
 *   2. Bot subscribe vào tất cả topic hiện có trong DB
 *   3. Khi data packet đến → handleDataPacket() → lookup members → push
 *
 * Gọi subscribeBotToTopic(topicId) mỗi khi tạo topic mới để bot nhận được
 * tin nhắn ngay lập tức mà không cần restart server.
 */

import { db } from "../db";
import {
  users,
  students,
  staff,
  chatGroups,
  chatGroupMembers,
} from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { pushService } from "./push.service";
import { tinodeAdmin } from "../lib/tinode-admin";
import { sendNotification } from "../lib/notification";

// ─── Kiểu dữ liệu data packet từ Tinode ──────────────────────────────────────

interface TinodeDataPacket {
  topic: string;          // topic ID nhận tin (grpXXX, p2pXXX…)
  from: string;           // Tinode UID của người gửi (usrXXXXXX)
  ts: string;             // ISO timestamp
  seq: number;
  content: unknown;       // string hoặc object (Drafty)
}

// ─── Cache topic → loại + UUID tham chiếu ────────────────────────────────────

type TopicKind = "group" | "dm" | "unknown";

interface TopicMeta {
  kind: TopicKind;
  referenceUuid: string | null; // chat_groups.id hoặc classes.id (UUID) — dùng làm referenceId trong notifications
  expiresAt: number;            // timestamp ms — cache tự hết hạn sau TTL
}

// Cache topic → meta. TTL 10 phút để tránh stale entry sau khi nhóm bị xóa.
const TOPIC_META_CACHE_TTL = 10 * 60 * 1000;
const topicMetaCache = new Map<string, TopicMeta>();

async function resolveTopicMeta(topicId: string): Promise<TopicMeta> {
  const cached = topicMetaCache.get(topicId);
  if (cached && Date.now() < cached.expiresAt) return cached;

  const expiresAt = Date.now() + TOPIC_META_CACHE_TTL;

  const [grp] = await db
    .select({ id: chatGroups.id, isDirectMessage: chatGroups.isDirectMessage })
    .from(chatGroups)
    .where(eq(chatGroups.tinodeTopicId, topicId))
    .limit(1);
  if (grp) {
    const kind: TopicKind = grp.isDirectMessage ? "dm" : "group";
    const meta: TopicMeta = { kind, referenceUuid: grp.id, expiresAt };
    topicMetaCache.set(topicId, meta);
    return meta;
  }

  // Cache "unknown" với TTL ngắn hơn (1 phút) — topic có thể vừa được tạo
  // và chưa kịp ghi vào DB khi packet đến sớm.
  const meta: TopicMeta = { kind: "unknown", referenceUuid: null, expiresAt: Date.now() + 60_000 };
  topicMetaCache.set(topicId, meta);
  return meta;
}

/** Compat wrapper — trả về kind từ cache mới */
async function resolveTopicKind(topicId: string): Promise<TopicKind> {
  return (await resolveTopicMeta(topicId)).kind;
}

// ─── Lấy userId của người gửi từ Tinode UID ──────────────────────────────────

async function resolveUserIdFromTinodeUid(tinodeUid: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tinodeUserId, tinodeUid))
    .limit(1);
  return row?.id ?? null;
}

// ─── Lấy tên người gửi ───────────────────────────────────────────────────────

async function resolveSenderName(userId: string): Promise<string> {
  const [staffRow] = await db
    .select({ fullName: staff.fullName })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  if (staffRow) return staffRow.fullName;

  const [studentRow] = await db
    .select({ fullName: students.fullName })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  if (studentRow) return studentRow.fullName;

  return "Ai đó";
}

// ─── Lấy danh sách userId nhận push (theo loại topic) ────────────────────────

async function getMemberUserIds(topicId: string, kind: TopicKind): Promise<string[]> {
  if (kind === "dm" || kind === "group") {
    const [grp] = await db
      .select({ id: chatGroups.id, name: chatGroups.name })
      .from(chatGroups)
      .where(eq(chatGroups.tinodeTopicId, topicId))
      .limit(1);
    if (!grp) return [];

    const rows = await db
      .select({ userId: chatGroupMembers.userId })
      .from(chatGroupMembers)
      .where(eq(chatGroupMembers.groupId, grp.id));
    return rows.map((r) => r.userId);
  }

  return [];
}

// ─── Lấy tên topic để hiển thị trong notification (chỉ dùng cho group/class) ─

async function resolveTopicName(topicId: string, kind: TopicKind): Promise<string> {
  if (kind === "group") {
    const [grp] = await db
      .select({ name: chatGroups.name })
      .from(chatGroups)
      .where(eq(chatGroups.tinodeTopicId, topicId))
      .limit(1);
    return grp?.name ?? "Nhóm chat";
  }
  return "Chat";
}

// ─── Trích nội dung text từ content (string hoặc Drafty object) ──────────────

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const c = content as any;
    // Drafty format: { txt, fmt, ent }
    // Duyệt entities để hiển thị đúng loại media
    if (Array.isArray(c.ent)) {
      for (const ent of c.ent) {
        switch (ent?.tp) {
          case "IM": return `🖼 ${ent.data?.name ?? "Hình ảnh"}`;
          case "AU": return `🎤 Tin nhắn thoại`;
          case "VD": return `🎥 ${ent.data?.name ?? "Video"}`;
          case "EX": return `📎 ${ent.data?.name ?? "File đính kèm"}`;
        }
      }
    }
    const txt = c.txt;
    // Bỏ qua nếu txt là chuỗi trống hoặc chỉ khoảng trắng (placeholder cho file)
    if (typeof txt === "string" && txt.trim().length > 0) return txt.trim();
  }
  return "Đã gửi một tin nhắn";
}

// ─── Xử lý data packet đến ───────────────────────────────────────────────────

// Theo dõi seq mới nhất đã xử lý theo từng topic để tránh re-push tin nhắn cũ khi bot reconnect.
// Map: topicId → maxSeq đã gửi push. Reset khi server restart (in-memory only).
const seenSeq = new Map<string, number>();

async function handleDataPacket(data: TinodeDataPacket): Promise<void> {
  try {
    const { topic, from, content } = data;

    // Chỉ xử lý group topics (grp*) — bao gồm cả DM (chat 1-1) vì DM giờ cũng là group topic.
    if (!topic?.startsWith("grp")) return;

    // Bỏ qua tin nhắn cũ (seq ≤ đã seen) để tránh gửi push lại khi bot reconnect.
    // Tinode push xuống toàn bộ unread messages khi bot subscribe lại sau disconnect.
    const prevSeq = seenSeq.get(topic) ?? 0;
    if (data.seq <= prevSeq) return;
    seenSeq.set(topic, data.seq);

    // Bảo vệ thứ 2: bỏ qua tin nhắn quá cũ để tránh push lại sau reconnect.
    // Dùng 5 phút thay vì 30s — 30s quá nhạy nếu clock Tinode server chậm hơn
    // app server dù chỉ vài chục giây (toàn bộ real-time message bị drop).
    // seenSeq đã xử lý dedup: filter này chỉ là lớp phòng ngừa thứ 2.
    const msgAge = Date.now() - new Date(data.ts).getTime();
    if (msgAge > 300_000) { // older than 5 minutes → skip
      console.warn(`[TinodePush] Dropped stale packet topic=${topic} seq=${data.seq} age=${Math.round(msgAge / 1000)}s`);
      return;
    }

    if (process.env.NODE_ENV !== "production") console.log(`[TinodePush] data packet: topic=${topic} from=${from} seq=${data.seq}`);

    const { kind, referenceUuid } = await resolveTopicMeta(topic);
    if (kind === "unknown") return; // Topic không thuộc class hay group đã biết

    // Resolve người gửi
    const senderUserId = from ? await resolveUserIdFromTinodeUid(from) : null;

    // Lấy danh sách thành viên, loại bỏ người gửi
    const allMembers = await getMemberUserIds(topic, kind);
    const recipients = senderUserId
      ? allMembers.filter((uid) => uid !== senderUserId)
      : allMembers;

    if (recipients.length === 0) return;

    // Tên người gửi và tên topic
    const [senderName, topicName] = await Promise.all([
      senderUserId ? resolveSenderName(senderUserId) : Promise.resolve("Ai đó"),
      resolveTopicName(topic, kind),
    ]);

    const text = extractText(content);
    const bodyPreview = text.length > 100 ? text.slice(0, 97) + "…" : text;

    // Với DM (chat 1-1): title = tên người gửi, body = nội dung tin nhắn.
    // OS render payload FCM/APNs trực tiếp khi app bị kill — phải resolve đúng tên ngay tại đây.
    // Với group/class: title = tên nhóm/lớp, body = "tên người gửi: nội dung".
    const isDm = kind === "dm";
    const pushTitle = isDm ? `💬 ${senderName}` : `💬 ${topicName}`;
    const pushBody  = isDm ? bodyPreview : `${senderName}: ${bodyPreview}`;
    const referenceType = kind === "dm" ? "dm_chat" : "group_chat";

    // Ghi vào chuông thông báo trong app (bảng notifications) + gửi Expo Push
    // cho từng thành viên. Dùng sendNotification (sendPush:false) để tránh gửi
    // push 2 lần — push vẫn được gửi riêng bên dưới với nội dung/data dành
    // riêng cho chat (khác định dạng data so với sendNotification mặc định).
    //
    // QUAN TRỌNG: notifications.reference_id là UUID — phải dùng referenceUuid
    // (chat_groups.id hoặc classes.id), KHÔNG dùng Tinode topic string.
    await Promise.allSettled(
      recipients.map((userId) =>
        sendNotification({
          userId,
          title: pushTitle,
          content: pushBody,
          category: "chat",
          referenceId: referenceUuid ?? undefined,
          referenceType,
          sendPush: false,
          deeplink: {
            screen: "Chat",
            params: { topicId: topic, referenceType },
          },
        }),
      ),
    );

    // Gửi push đến tất cả thành viên (fire-and-forget cho từng người)
    await Promise.allSettled(
      recipients.map((userId) =>
        pushService.send(userId, {
          title: pushTitle,
          body:  pushBody,
          data: {
            type: "chat",
            referenceId: topic,
            referenceType,
          },
        }),
      ),
    );

    if (process.env.NODE_ENV !== "production") console.log(
      `[TinodePush] topic=${topic} kind=${kind} sender=${senderUserId ?? from} title="${pushTitle}" body="${pushBody.slice(0, 60)}" recipients=${recipients.length}`,
    );
  } catch (err: any) {
    console.error("[TinodePush] handleDataPacket error:", err?.message);
  }
}

// ─── Subscribe bot vào tất cả topic hiện có trong DB ─────────────────────────

async function subscribeToAllKnownTopics(): Promise<void> {
  try {
    const groupTopics = await db
      .select({ topicId: chatGroups.tinodeTopicId })
      .from(chatGroups)
      .where(isNotNull(chatGroups.tinodeTopicId));

    const topicIds = groupTopics.map((r) => r.topicId!);

    if (process.env.NODE_ENV !== "production") console.log(`[TinodePush] Subscribing bot to ${topicIds.length} topic(s)…`);

    // Subscribe tuần tự để tránh flood Tinode server
    for (const topicId of topicIds) {
      await tinodeAdmin.subscribeToTopic(topicId);
      // Nhỏ delay giữa các subscription để không bị Tinode throttle
      await new Promise((r) => setTimeout(r, 50));
    }

    if (process.env.NODE_ENV !== "production") console.log(`[TinodePush] Bot subscribed to ${topicIds.length} topic(s) OK`);
  } catch (err: any) {
    console.error("[TinodePush] subscribeToAllKnownTopics error:", err?.message);
  }
}

// ─── API công khai ─────────────────────────────────────────────────────────────

/** Tránh đăng ký onData nhiều lần nếu startTinodePushListener bị gọi lại */
let listenerStarted = false;

/**
 * Khởi động Tinode push listener.
 * Gọi sau khi Tinode admin bot đã kết nối (sau tinodeAdmin.connect()).
 *
 * - Đăng ký onData handler một lần duy nhất.
 * - Dùng onReady callback để subscribe topics — kể cả sau reconnect,
 *   vì Tinode topic subscription là session-scoped và bị xóa khi WS đứt.
 */
export function startTinodePushListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  // Đăng ký data handler — sẽ nhận packet từ mọi topic bot subscribe
  tinodeAdmin.onData((data: TinodeDataPacket) => {
    void handleDataPacket(data);
  });

  // Subscribe toàn bộ topics mỗi khi bot sẵn sàng (lần đầu + sau mỗi reconnect)
  // → đảm bảo không mất phủ sóng khi WS bị ngắt/kết nối lại
  tinodeAdmin.onReady(() => {
    void subscribeToAllKnownTopics();
  });

  console.log("[TinodePush] Push listener registered (readiness-driven subscription)");
}

/**
 * Subscribe bot vào một topic mới ngay khi tạo.
 * Gọi sau createClassTopic() hoặc createGroupTopic() để bot nhận tin nhắn ngay.
 */
export async function subscribeBotToTopic(topicId: string): Promise<void> {
  topicMetaCache.delete(topicId); // Clear cache để resolve lại
  await tinodeAdmin.subscribeToTopic(topicId);
}

/**
 * Xóa cache cho một topic khi nhóm bị xóa khỏi DB.
 * Tránh trường hợp cache stale còn ghi nhớ nhóm đã xóa → push notification đến sai người.
 */
export function invalidateTopicMetaCache(topicId: string): void {
  topicMetaCache.delete(topicId);
}
