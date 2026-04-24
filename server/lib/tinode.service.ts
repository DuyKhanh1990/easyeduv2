/**
 * tinode.service.ts
 *
 * EduManage ↔ Tinode integration.
 *
 * - Admin operations (create topic, add/remove member, send system message)
 *   use tinodeAdmin (persistent server-side WebSocket as admin).
 * - User credentials are computed deterministically — no DB storage needed.
 * - Channel / topic type: regular group topic (grp*) created via sub{topic:"new"}.
 *   The returned topic ID is stored in classes.tinode_topic_id.
 *
 * Required env vars:
 *   TINODE_URL              = https://chattinode.example.com
 *   TINODE_API_KEY          = API key generated from Tinode keygen
 *   TINODE_USER_PASS_SECRET = HMAC secret used to derive each user's Tinode password.
 *                             MUST be the same value across every center sharing this Tinode.
 *                             MUST NOT be the same value as TINODE_API_KEY.
 */

import { createHmac } from "crypto";
import { tinodeAdmin } from "./tinode-admin";

const TINODE_URL             = process.env.TINODE_URL?.replace(/\/$/, "") ?? null;
const TINODE_API_KEY         = process.env.TINODE_API_KEY ?? null;
const TINODE_USER_PASS_SECRET = process.env.TINODE_USER_PASS_SECRET ?? null;
const TINODE_LOGIN_VERSION   = parseInt(process.env.TINODE_LOGIN_VERSION ?? "1", 10);

if (TINODE_URL && !TINODE_API_KEY) {
  console.error("[Tinode] TINODE_API_KEY is not set — chat will not work.");
}
if (TINODE_URL && !TINODE_USER_PASS_SECRET) {
  console.error("[Tinode] TINODE_USER_PASS_SECRET is not set — user passwords cannot be derived.");
}

let _msgId = 1;
function nextId(): string { return String(_msgId++); }

export function isTinodeConfigured(): boolean {
  return !!TINODE_URL;
}

// ─── Start persistent admin connection on module load ─────────────────────────

if (TINODE_URL) {
  tinodeAdmin.connect();
}

// ─── Naming helpers ───────────────────────────────────────────────────────────

export function getTinodeLogin(userId: string): string {
  // Tinode login max 32 chars.
  // - version 1 (default, backward-compat): "u_<28-hex>"
  // - version >1: "u<v>_<28-hex>" — bump khi cần "reset" toàn bộ user account
  //   trên Tinode mà không phải đụng MongoDB (mọi login mới được tạo từ đầu
  //   với password mới derive từ TINODE_USER_PASS_SECRET hiện tại).
  const compact = userId.replace(/-/g, "").slice(0, 28);
  if (TINODE_LOGIN_VERSION <= 1) return `u_${compact}`;
  return `u${TINODE_LOGIN_VERSION}_${compact}`;
}

/**
 * Tinode password length cap.
 *
 * Tinode Web v0.25.2 hardcode maxLength=32 trên ô input password.
 * Nếu password >32 chars, browser cắt khi user nhập tay → server nhận hash khác
 * → 401 dù credentials đúng trong DB.
 *
 * Vì vậy MỌI password trên Tinode (bot lẫn user, derive lẫn fixed) PHẢI ≤32 chars.
 * Dùng `derivePassword(seed)` cho mọi password derive trong module này — không
 * inline `createHmac(...).slice(0,32)` ở chỗ khác để tránh quên cắt.
 */
export const TINODE_PASSWORD_MAX_LEN = 32;

/**
 * Derive a Tinode-safe password (≤32 chars) from an arbitrary seed using HMAC-SHA256
 * with TINODE_USER_PASS_SECRET. Used for both real users and any future derived
 * accounts. Bot password is fixed in env (TINODE_BOT_PASS), but it is also
 * validated at startup against TINODE_PASSWORD_MAX_LEN.
 */
export function derivePassword(seed: string): string {
  if (!TINODE_USER_PASS_SECRET) {
    throw new Error("TINODE_USER_PASS_SECRET is not configured");
  }
  const pwd = createHmac("sha256", TINODE_USER_PASS_SECRET)
    .update(seed)
    .digest("hex")
    .slice(0, TINODE_PASSWORD_MAX_LEN);
  // Defensive runtime assert — must never exceed 32 chars or Tinode Web login
  // sẽ 401 vì browser cắt mật khẩu khi nhập tay.
  if (pwd.length > TINODE_PASSWORD_MAX_LEN) {
    throw new Error(
      `[Tinode] derivePassword produced ${pwd.length} chars (>${TINODE_PASSWORD_MAX_LEN}). This is a bug.`
    );
  }
  return pwd;
}

function getTinodePassword(userId: string): string {
  return derivePassword(userId);
}

// ─── Tạo / đảm bảo tồn tại group topic cho lớp học ──────────────────────────

/**
 * Tạo group topic mới cho lớp học nếu chưa có.
 * Trả về topic ID (grpXXXXX) hoặc null nếu thất bại.
 */
export async function createClassTopic(
  className: string,
  locationId: string,
  classId: string
): Promise<string | null> {
  if (!TINODE_URL) return null;

  const data = await tinodeAdmin.send({
    sub: {
      id:    tinodeAdmin.nextMsgId(),
      topic: "new",
      set: {
        desc: {
          public:  { fn: className, note: `EduManage class — ${classId}` },
          private: { locationId, classId },
        },
        defacs: { auth: "JRWP", anon: "N" },
        sub: { mode: "JRWPASDO" },
      },
    },
  });

  const code    = data?.ctrl?.code;
  const topicId = data?.ctrl?.topic ?? data?.ctrl?.params?.topic ?? null;

  if ((code === 200 || code === 201) && topicId) {
    console.log(`[Tinode] Topic created for class ${className}: ${topicId}`);
    return topicId;
  }

  console.error(`[Tinode] createClassTopic failed (code ${code}):`, JSON.stringify(data));
  return null;
}

// ─── Tạo group topic tuỳ chỉnh (không gắn với lớp học) ─────────────────────

/**
 * Tạo group topic mới cho nhóm chat tuỳ chỉnh.
 * Trả về topic ID (grpXXXXX) hoặc null nếu thất bại.
 */
export async function createGroupTopic(
  groupName: string,
  groupId: string
): Promise<string | null> {
  if (!TINODE_URL) return null;

  const data = await tinodeAdmin.send({
    sub: {
      id:    tinodeAdmin.nextMsgId(),
      topic: "new",
      set: {
        desc: {
          public:  { fn: groupName, note: `EduManage custom group — ${groupId}` },
          private: { groupId },
        },
        defacs: { auth: "JRWP", anon: "N" },
        sub: { mode: "JRWPASDO" },
      },
    },
  });

  const code    = data?.ctrl?.code;
  const topicId = data?.ctrl?.topic ?? data?.ctrl?.params?.topic ?? null;

  if ((code === 200 || code === 201) && topicId) {
    console.log(`[Tinode] Custom group topic created "${groupName}": ${topicId}`);
    return topicId;
  }

  console.error(`[Tinode] createGroupTopic failed (code ${code}):`, JSON.stringify(data));
  return null;
}

// ─── Cập nhật defacs cho topic hiện có (cho phép authenticated users join) ────

export async function ensureTopicDefacs(topicId: string): Promise<void> {
  if (!TINODE_URL) return;
  try {
    await tinodeAdmin.send({
      set: {
        id:    tinodeAdmin.nextMsgId(),
        topic: topicId,
        desc:  { defacs: { auth: "JRWP", anon: "N" } },
      },
    });
  } catch {
    // Non-critical — ignore errors
  }
}

// ─── Thêm thành viên vào topic ────────────────────────────────────────────────

export async function addMemberToTopic(
  topicId: string,
  tinodeUserId: string
): Promise<boolean> {
  if (!TINODE_URL) return false;

  const data = await tinodeAdmin.send({
    sub: {
      id:    tinodeAdmin.nextMsgId(),
      topic: topicId,
      user:  tinodeUserId,
      set:   { sub: { mode: "JRWP" } },
    },
  });

  const code = data?.ctrl?.code;
  const ok   = code === 200 || code === 201;
  if (ok) console.log(`[Tinode] Added ${tinodeUserId} → ${topicId}`);
  else    console.warn(`[Tinode] addMember failed (code ${code}):`, JSON.stringify(data));
  return ok;
}

// ─── Xóa thành viên khỏi topic ───────────────────────────────────────────────

export async function removeMemberFromTopic(
  topicId: string,
  tinodeUserId: string
): Promise<boolean> {
  if (!TINODE_URL) return false;

  const data = await tinodeAdmin.send({
    leave: {
      id:    tinodeAdmin.nextMsgId(),
      topic: topicId,
      user:  tinodeUserId,
    },
  });

  const code = data?.ctrl?.code;
  const ok   = code === 200;
  if (ok) console.log(`[Tinode] Removed ${tinodeUserId} from ${topicId}`);
  else    console.warn(`[Tinode] removeMember failed (code ${code}):`, JSON.stringify(data));
  return ok;
}

// ─── Gửi tin nhắn hệ thống vào topic ─────────────────────────────────────────

export async function sendSystemMessage(
  topicId: string,
  text: string
): Promise<boolean> {
  if (!TINODE_URL) return false;

  const data = await tinodeAdmin.send({
    pub: {
      id:      tinodeAdmin.nextMsgId(),
      topic:   topicId,
      content: text,
      head:    { mime: "text/plain" },
    },
  });

  const code = data?.ctrl?.code;
  const ok   = code === 202;
  if (ok) console.log(`[Tinode] System message sent to ${topicId}`);
  else    console.warn(`[Tinode] sendSystemMessage failed (code ${code}):`, JSON.stringify(data));
  return ok;
}

// ─── Đảm bảo user tồn tại trong Tinode (tạo tài khoản nếu chưa có) ──────────

/**
 * Tạo tài khoản Tinode cho user (nếu chưa có) thông qua admin bot.
 * Trả về { tinodeLogin, tinodeUid } — tinodeUid có thể null nếu tài khoản đã tồn tại.
 * Dùng để cho phép P2P chat với user chưa từng đăng nhập chat.
 */
export async function ensureUserInTinode(userId: string): Promise<{
  tinodeLogin: string;
  tinodeUid: string | null;
}> {
  const tinodeLogin = getTinodeLogin(userId);
  if (!TINODE_URL) return { tinodeLogin, tinodeUid: null };

  const password = getTinodePassword(userId);
  const secret   = Buffer.from(`${tinodeLogin}:${password}`).toString("base64");

  try {
    const data = await tinodeAdmin.send({
      acc: {
        id:     tinodeAdmin.nextMsgId(),
        user:   "new",
        scheme: "basic",
        secret,
        login:  false,
        desc: {
          public:  { fn: tinodeLogin },
          private: { comment: "EduManage auto-registered" },
        },
        tags: [tinodeLogin],
      },
    });

    const code = data?.ctrl?.code;
    if (code === 200 || code === 201) {
      const tinodeUid: string | null = data.ctrl.params?.user ?? null;
      console.log(`[Tinode] ensureUserInTinode: created ${tinodeLogin} → uid ${tinodeUid}`);
      return { tinodeLogin, tinodeUid };
    }
    // 409 = already exists — UID unknown from this path; caller should use DB
    console.log(`[Tinode] ensureUserInTinode: ${tinodeLogin} already exists (code ${code})`);
    return { tinodeLogin, tinodeUid: null };
  } catch (err: any) {
    console.error("[Tinode] ensureUserInTinode error:", err.message);
    return { tinodeLogin, tinodeUid: null };
  }
}

// ─── Trả về credentials cho frontend kết nối trực tiếp ──────────────────────

export function getUserCredentials(userId: string): {
  login: string;
  password: string;
  tinodeUrl: string | null;
  apiKey: string | null;
} {
  return {
    login:     getTinodeLogin(userId),
    password:  getTinodePassword(userId),
    tinodeUrl: TINODE_URL,
    apiKey:    TINODE_API_KEY,
  };
}

// ─── Kiểm tra kết nối ────────────────────────────────────────────────────────

export async function pingTinode(): Promise<boolean> {
  if (!TINODE_URL || !TINODE_API_KEY) return false;
  try {
    const res = await fetch(`${TINODE_URL}/v0/status`, {
      headers: { "X-Tinode-APIKey": TINODE_API_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}
