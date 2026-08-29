/**
 * tinode-backfill-tenant-tags.ts
 *
 * Backfill `tenant:<CENTER_ID>` tag (và `private.tenantId`) cho tất cả
 * user / topic Tinode đã được tạo TRƯỚC khi rollout multi-tenant tagging.
 *
 * Chạy:
 *   CENTER_ID=easyedu_vn npx tsx script/tinode-backfill-tenant-tags.ts
 *
 * Yêu cầu env (giống production):
 *   TINODE_URL, TINODE_API_KEY, TINODE_BOT_USER, TINODE_BOT_PASS,
 *   TINODE_USER_PASS_SECRET, CENTER_ID, DATABASE_URL
 *
 * Cơ chế:
 *   - Topics (classes.tinode_topic_id + chat_groups.tinode_topic_id):
 *       bot là owner → dùng admin connection set { topic, tags, desc.private }.
 *   - Users (users.tinode_user_id):
 *       chỉ user tự sửa được tags của mình → mở WS riêng, login với
 *       password derive từ TINODE_USER_PASS_SECRET, set tags trên `me`.
 *
 * Idempotent: chạy lại nhiều lần OK. Tag chỉ được set, không xoá tag khác.
 */

import "dotenv/config";
import WebSocket from "ws";
import { isNotNull } from "drizzle-orm";
import { db } from "../server/db";
import { users, classes, chatGroups } from "../shared/schema";
import { tinodeAdmin } from "../server/lib/tinode-admin";
import {
  derivePassword,
  getCenterId,
  getTinodeLogin,
  isTinodeConfigured,
} from "../server/lib/tinode.service";

const CENTER_ID = getCenterId();
const TINODE_URL = process.env.TINODE_URL?.replace(/\/$/, "") ?? "";
const API_KEY    = process.env.TINODE_API_KEY ?? "";

if (!isTinodeConfigured() || !API_KEY) {
  console.error("✗ TINODE_URL / TINODE_API_KEY chưa cấu hình. Abort.");
  process.exit(1);
}
if (!CENTER_ID) {
  console.error(
    "✗ CENTER_ID chưa cấu hình hợp lệ (env hoặc derive từ domain). Abort.\n" +
    "  Set: CENTER_ID=easyedu_vn npx tsx script/tinode-backfill-tenant-tags.ts"
  );
  process.exit(1);
}

const TENANT_TAG = `tenant:${CENTER_ID}`;
console.log(`▶ Backfill tag "${TENANT_TAG}" + private.tenantId="${CENTER_ID}"`);

// ─── Helper: chờ bot ready ───────────────────────────────────────────────────

async function waitForBot(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  tinodeAdmin.connect();
  while (!tinodeAdmin.isReady()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Bot chưa ready sau 15s, abort.");
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ─── Topic: dùng bot (owner) ─────────────────────────────────────────────────

async function backfillTopic(topicId: string): Promise<"ok" | "fail"> {
  try {
    // Lấy tags hiện tại để merge (không ghi đè)
    const meta = await tinodeAdmin.send({
      get: {
        id:    tinodeAdmin.nextMsgId(),
        topic: topicId,
        what:  "desc tags",
      },
    });
    const existingTags: string[] = meta?.meta?.tags ?? [];
    if (existingTags.includes(TENANT_TAG)) {
      return "ok"; // đã có
    }
    const newTags = Array.from(new Set([...existingTags, TENANT_TAG]));

    const data = await tinodeAdmin.send({
      set: {
        id:    tinodeAdmin.nextMsgId(),
        topic: topicId,
        desc:  { private: { tenantId: CENTER_ID } },
        tags:  newTags,
      },
    });
    const code = data?.ctrl?.code;
    return (code === 200 || code === 201) ? "ok" : "fail";
  } catch (err: any) {
    console.error(`  ✗ topic ${topicId}: ${err.message}`);
    return "fail";
  }
}

// ─── User: open WS riêng, login as user, set tags trên `me` ──────────────────

function setUserTagsViaWs(userId: string): Promise<"ok" | "fail" | "notfound"> {
  return new Promise((resolve) => {
    const login = getTinodeLogin(userId);
    const pwd   = derivePassword(userId);
    const secret = Buffer.from(`${login}:${pwd}`).toString("base64");

    const wsUrl = TINODE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const ws = new WebSocket(`${wsUrl}/v0/channels?apikey=${API_KEY}`);

    let id = 1;
    const next = () => String(id++);
    const hiId = next();
    const loginId = next();
    const subId = next();
    const getId = next();
    let setId = "";
    let phase: "hi" | "login" | "sub" | "get" | "set" = "hi";
    let existingTags: string[] = [];

    const finish = (r: "ok" | "fail" | "notfound") => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(r);
    };

    const timeout = setTimeout(() => finish("fail"), 10000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        hi: { id: hiId, ver: "0.25", ua: "EduManage-Backfill/1.0" },
      }));
    });

    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.meta?.id === getId) {
        existingTags = msg.meta.tags ?? [];
        return;
      }

      if (!msg.ctrl) return;
      const { id: ctrlId, code } = msg.ctrl;

      if (ctrlId === hiId) {
        if (code >= 200 && code < 300) {
          phase = "login";
          ws.send(JSON.stringify({
            login: { id: loginId, scheme: "basic", secret },
          }));
        } else finish("fail");
        return;
      }

      if (ctrlId === loginId) {
        if (code === 200) {
          phase = "sub";
          ws.send(JSON.stringify({
            sub: { id: subId, topic: "me" },
          }));
        } else if (code === 401 || code === 404) {
          finish("notfound"); // user account không tồn tại trong Tinode
        } else finish("fail");
        return;
      }

      if (ctrlId === subId) {
        if (code === 200 || code === 201) {
          phase = "get";
          ws.send(JSON.stringify({
            get: { id: getId, topic: "me", what: "tags" },
          }));
        } else finish("fail");
        return;
      }

      if (ctrlId === getId) {
        if (code === 200 || code === 204) {
          if (existingTags.includes(TENANT_TAG)) {
            clearTimeout(timeout);
            finish("ok");
            return;
          }
          const newTags = Array.from(new Set([...existingTags, TENANT_TAG]));
          phase = "set";
          setId = next();
          ws.send(JSON.stringify({
            set: { id: setId, topic: "me", tags: newTags },
          }));
        } else finish("fail");
        return;
      }

      if (ctrlId === setId) {
        clearTimeout(timeout);
        finish((code === 200 || code === 201) ? "ok" : "fail");
        return;
      }
    });

    ws.on("error", () => finish("fail"));
    ws.on("close", () => { /* resolved already */ });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await waitForBot();
  console.log("✓ Bot ready");

  // 1) Topics
  const classRows = await db
    .select({ id: classes.tinodeTopicId })
    .from(classes)
    .where(isNotNull(classes.tinodeTopicId));

  const groupRows = await db
    .select({ id: chatGroups.tinodeTopicId })
    .from(chatGroups)
    .where(isNotNull(chatGroups.tinodeTopicId));

  const allTopics = [
    ...classRows.map((r) => r.id!),
    ...groupRows.map((r) => r.id!),
  ];
  console.log(`\n▶ Backfill ${allTopics.length} topic(s)…`);

  let topicOk = 0, topicFail = 0;
  for (const t of allTopics) {
    const r = await backfillTopic(t);
    if (r === "ok") { topicOk++; process.stdout.write("."); }
    else            { topicFail++; process.stdout.write("F"); }
  }
  console.log(`\n  topics: ${topicOk} ok, ${topicFail} fail`);

  // 2) Users
  const userRows = await db
    .select({ id: users.id, tinodeUserId: users.tinodeUserId })
    .from(users)
    .where(isNotNull(users.tinodeUserId));

  console.log(`\n▶ Backfill ${userRows.length} user(s)…`);
  let userOk = 0, userFail = 0, userMiss = 0;
  for (const u of userRows) {
    const r = await setUserTagsViaWs(u.id);
    if (r === "ok")            { userOk++;   process.stdout.write("."); }
    else if (r === "notfound") { userMiss++; process.stdout.write("?"); }
    else                       { userFail++; process.stdout.write("F"); }
  }
  console.log(`\n  users: ${userOk} ok, ${userMiss} not-in-tinode, ${userFail} fail`);

  console.log("\n✓ Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Fatal:", err);
  process.exit(1);
});
