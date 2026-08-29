/**
 * tinode-admin.ts
 *
 * Persistent server-side WebSocket connection to Tinode as a dedicated
 * "EduManage system bot" user.
 *
 * Authentication flow (mirrors what the browser does for regular users):
 *   1. hi → hi ctrl (200)
 *   2. login (basic) → if 200: ready; if 401/404: go to step 3
 *   3. acc { user:"new", login:true } → creates + logs in as system bot
 *      → if 409: account exists with different password → STOP retrying.
 *
 * Required env vars:
 *   TINODE_URL          — Tinode server URL (https://chattinode.example.com)
 *   TINODE_API_KEY      — API key generated from Tinode keygen (matches api_key_salt)
 *   TINODE_BOT_USER     — bot login name (must be unique across centers, e.g. "edumanage_bot_v2")
 *   TINODE_BOT_PASS     — bot password (fixed, stored in env, NOT derived)
 *
 * Optional env vars:
 *   TINODE_USER_AGENT       — default "EduManage/1.0"
 *   TINODE_REQUEST_TIMEOUT_MS — default 10000
 *   TINODE_MAX_RETRIES      — default 5
 *   TINODE_RETRY_BACKOFF_MS — default 5000 (exponential backoff base)
 */

import WebSocket from "ws";

const TINODE_URL     = process.env.TINODE_URL?.replace(/\/$/, "") || null;
const TINODE_API_KEY = process.env.TINODE_API_KEY ?? null;
const BOT_LOGIN      = process.env.TINODE_BOT_USER ?? null;
const BOT_PASSWORD   = process.env.TINODE_BOT_PASS ?? null;

// Tinode Web v0.25.2 hardcode maxLength=32 trên ô input password.
// Nếu TINODE_BOT_PASS >32 chars, login từ Tinode Web sẽ luôn 401 (browser cắt
// password khi user nhập tay → hash khác). Fail-fast tại boot để báo sai cấu hình.
if (BOT_PASSWORD && BOT_PASSWORD.length > 32) {
  console.error(
    `[TinodeAdmin WS] TINODE_BOT_PASS is ${BOT_PASSWORD.length} chars (>32). ` +
    `Tinode Web sẽ không login được vì input password bị cắt ở 32 chars. ` +
    `Set TINODE_BOT_PASS ≤32 chars rồi reset hash tương ứng trong Tinode MongoDB.`
  );
}

const USER_AGENT          = process.env.TINODE_USER_AGENT ?? "EduManage/1.0";
const REQUEST_TIMEOUT_MS  = parseInt(process.env.TINODE_REQUEST_TIMEOUT_MS ?? "10000", 10);
// -1 = retry vô hạn (mặc định). Chỉ đặt số cụ thể khi cần giới hạn.
const MAX_RETRIES         = parseInt(process.env.TINODE_MAX_RETRIES ?? "-1", 10);
const RETRY_BACKOFF_MS    = parseInt(process.env.TINODE_RETRY_BACKOFF_MS ?? "5000", 10);
// Backoff tối đa 2 phút để không quá lâu mỗi lần retry
const MAX_BACKOFF_MS      = parseInt(process.env.TINODE_MAX_BACKOFF_MS ?? "120000", 10);
// Tinode server (and most reverse proxies) close idle WebSockets after ~60s.
// Send a keepalive every 15s (conservative margin) to prevent the connection
// from being dropped. 25s is too close to common 30s proxy idle timeouts.
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.TINODE_KEEPALIVE_INTERVAL_MS ?? "15000", 10);

const BOT_SECRET = (BOT_LOGIN && BOT_PASSWORD)
  ? Buffer.from(`${BOT_LOGIN}:${BOT_PASSWORD}`).toString("base64")
  : null;

type PendingEntry = {
  resolve: (v: any) => void;
  reject:  (e: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
};

class TinodeAdminWs {
  private ws: WebSocket | null = null;
  private msgId = 1000;
  private pending    = new Map<string, PendingEntry>();
  private queue: Array<{ msg: any; resolve: (v: any) => void; reject: (e: Error) => void }> = [];
  private ready      = false;
  private connecting = false;
  private retryCount = 0;
  private giveUpForever = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Callbacks nhận data packet (tin nhắn thực) từ các topic bot đã subscribe */
  private dataHandlers: Array<(data: any) => void> = [];

  /** Callbacks được gọi mỗi khi bot chuyển sang trạng thái ready (kể cả sau reconnect) */
  private readyCallbacks: Array<() => void> = [];

  private nextId(): string { return String(this.msgId++); }

  /**
   * Đăng ký callback nhận data packet khi có tin nhắn mới trong topic bot đang nghe.
   * Dùng bởi tinode-push.service để gửi push notification.
   */
  onData(handler: (data: any) => void): void {
    this.dataHandlers.push(handler);
  }

  /**
   * Đăng ký callback được gọi MỖI KHI bot vào trạng thái ready — cả lần đầu lẫn sau reconnect.
   * Dùng để tái subscribe topics sau khi WS reconnect (topic subscription là session-scoped).
   *
   * Nếu bot đã ready tại thời điểm gọi (race condition hiếm), callback được gọi ngay lập tức
   * để tránh bỏ lỡ lần đầu tiên.
   */
  onReady(callback: () => void): void {
    this.readyCallbacks.push(callback);
    // Gọi ngay nếu bot đã ready — tránh race condition khi startTinodePushListener()
    // được gọi sau khi bot đã hoàn tất handshake (thường không xảy ra nhưng phòng ngừa).
    if (this.ready) {
      try { callback(); } catch (e: any) {
        console.error("[TinodeAdmin WS] onReady immediate callback error:", e?.message);
      }
    }
  }

  /**
   * Subscribe bot vào một topic để nhận data packets (tin nhắn mới).
   * Gọi sau khi tạo topic mới hoặc khi khởi động để đăng ký các topic đã có.
   * Fire-and-forget — lỗi không ảnh hưởng caller.
   */
  async subscribeToTopic(topicId: string): Promise<void> {
    try {
      const resp = await this.send({
        sub: {
          id: this.nextId(),
          topic: topicId,
          // get.what="data" với data.limit=0: chỉ subscribe để nhận future data packets,
          // KHÔNG để Tinode push historical/unread messages về bot.
          // Tinode protocol: options cho "data" phải nằm trong key "data" của get,
          // KHÔNG phải top-level của get — sai tầng → Tinode dùng default limit (~24 msg)
          // → flood → Tinode rate-limit → close 1006 ngay sau subscribe.
          get: { what: "data", data: { limit: 0 } },
        },
      });
      const code: number = resp?.ctrl?.code ?? 0;
      if (code >= 400) {
        console.warn(`[TinodeAdmin WS] subscribeToTopic(${topicId}) rejected by Tinode: code=${code} text="${resp?.ctrl?.text ?? ""}"`);
      }
    } catch (err: any) {
      // Non-critical — bot có thể không có quyền hoặc topic không tồn tại
      console.warn(`[TinodeAdmin WS] subscribeToTopic(${topicId}) failed:`, err?.message);
    }
  }

  /** Starts the persistent admin connection. Idempotent. */
  connect(): void {
    if (this.giveUpForever) return;
    if (!TINODE_URL) {
      console.warn("[TinodeAdmin WS] TINODE_URL is not set — chat disabled.");
      return;
    }
    if (!TINODE_API_KEY) {
      console.error("[TinodeAdmin WS] TINODE_API_KEY is not set — chat disabled.");
      return;
    }
    if (!BOT_SECRET) {
      console.error("[TinodeAdmin WS] TINODE_BOT_USER and TINODE_BOT_PASS are required — chat disabled.");
      return;
    }
    if (this.connecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.connecting = true;
    this.ready      = false;

    const wsUrl = TINODE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const url   = `${wsUrl}/v0/channels?apikey=${TINODE_API_KEY}`;

    console.log("[TinodeAdmin WS] Connecting as bot:", BOT_LOGIN);
    const ws = new WebSocket(url);
    this.ws  = ws;

    const hiId    = this.nextId();
    const loginId = this.nextId();
    const accId   = this.nextId();

    ws.on("open", () => {
      ws.send(JSON.stringify({
        hi: { id: hiId, ver: "0.25", ua: USER_AGENT },
      }));
    });

    ws.on("message", (raw: Buffer | string) => {
      const str = raw.toString();

      // Tinode server heartbeat: gửi "0" mỗi ~25s, client phải echo lại "0" để giữ session.
      // Nếu không reply, Tinode close kết nối sau vài lần miss (code 1006).
      if (str === "0") {
        try { ws.send("0"); } catch { /* ignore */ }
        return;
      }

      let msg: any;
      try { msg = JSON.parse(str); } catch { return; }

      // Phân phối data packet (tin nhắn thực) đến push handlers — trước khi filter ctrl
      if (msg.data) {
        this.dataHandlers.forEach((h) => {
          try { h(msg.data); } catch (e: any) {
            console.error("[TinodeAdmin WS] dataHandler error:", e?.message);
          }
        });
        return;
      }

      if (!msg.ctrl) return;

      const { id, code, text } = msg.ctrl as { id: string; code: number; text?: string; params?: any };

      // hi → try login
      if (id === hiId) {
        if (code >= 200 && code < 300) {
          ws.send(JSON.stringify({
            login: { id: loginId, scheme: "basic", secret: BOT_SECRET },
          }));
        } else {
          console.error(`[TinodeAdmin WS] Handshake failed (code ${code} ${text ?? ""}). Check TINODE_API_KEY matches Tinode api_key_salt.`);
          this.giveUp("invalid api key or handshake rejected");
        }
        return;
      }

      // login response
      if (id === loginId) {
        if (code === 200) {
          this.handleReady();
        } else if (code === 401 || code === 404) {
          // Bot account may not exist yet — try to create it.
          // If it already exists with a different password, acc will return 409.
          console.log(`[TinodeAdmin WS] Login returned ${code}. Attempting to create bot account "${BOT_LOGIN}"…`);
          ws.send(JSON.stringify({
            acc: {
              id:     accId,
              user:   "new",
              scheme: "basic",
              secret: BOT_SECRET,
              login:  true,
              desc: {
                public:  { fn: "EduManage Bot" },
                private: { comment: "EduManage system account" },
              },
            },
          }));
        } else {
          console.error(`[TinodeAdmin WS] Login failed (code ${code} ${text ?? ""}).`);
          this.giveUp("login rejected");
        }
        return;
      }

      // acc response — bot account just created + logged in
      if (id === accId) {
        if (code === 200 || code === 201) {
          this.handleReady();
        } else if (code === 409) {
          console.error("[TinodeAdmin WS] ===========================================");
          console.error(`[TinodeAdmin WS] Bot account "${BOT_LOGIN}" already exists in Tinode MongoDB`);
          console.error(`[TinodeAdmin WS] but the password DOES NOT match TINODE_BOT_PASS.`);
          console.error("[TinodeAdmin WS] ");
          console.error("[TinodeAdmin WS] Fix:");
          console.error("[TinodeAdmin WS]   Option 1 (recommended): change TINODE_BOT_USER to a new unique value");
          console.error("[TinodeAdmin WS]                            (e.g. add a _v3 suffix) and restart.");
          console.error("[TinodeAdmin WS]   Option 2: reset password for this user inside Tinode MongoDB.");
          console.error("[TinodeAdmin WS] ===========================================");
          this.giveUp("bot password mismatch");
        } else {
          console.error(`[TinodeAdmin WS] Account creation failed (code ${code} ${text ?? ""}).`);
          this.giveUp("account creation failed");
        }
        return;
      }

      // Resolve pending command
      const entry = this.pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.resolve(msg);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[TinodeAdmin WS] close event: code=${code} reason=${reason?.toString?.() || ""}`);
      this.ready     = false;
      this.connecting = false;
      this.ws        = null;
      this.stopKeepalive();
      for (const [, e] of this.pending) {
        clearTimeout(e.timer);
        e.reject(new Error("TinodeAdmin WS disconnected"));
      }
      this.pending.clear();

      if (this.giveUpForever) return;

      if (MAX_RETRIES >= 0 && this.retryCount >= MAX_RETRIES) {
        console.warn(`[TinodeAdmin WS] Max retries (${MAX_RETRIES}) reached. Stopping reconnection attempts.`);
        console.warn("[TinodeAdmin WS] Chat functionality will be unavailable. Check TINODE_URL and server status.");
        return;
      }

      this.retryCount++;
      const rawDelay = RETRY_BACKOFF_MS * Math.pow(2, Math.min(this.retryCount - 1, 8));
      const delay = Math.min(rawDelay, MAX_BACKOFF_MS);
      const attemptLabel = MAX_RETRIES < 0 ? `attempt ${this.retryCount}/∞` : `attempt ${this.retryCount}/${MAX_RETRIES}`;
      console.log(`[TinodeAdmin WS] Disconnected — reconnecting in ${delay / 1000}s (${attemptLabel})…`);
      setTimeout(() => this.connect(), delay);
    });

    ws.on("error", (err) => {
      console.error("[TinodeAdmin WS] Error:", err.message);
    });
  }

  private giveUp(reason: string): void {
    this.giveUpForever = true;
    console.warn(`[TinodeAdmin WS] Giving up reconnection — reason: ${reason}.`);
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  private handleReady(): void {
    this.ready      = true;
    this.connecting = false;
    this.retryCount = 0;
    console.log(`[TinodeAdmin WS] Ready as ${BOT_LOGIN}`);
    // Gọi tất cả onReady callbacks — kể cả sau reconnect để restore subscriptions
    this.readyCallbacks.forEach((cb) => {
      try { cb(); } catch (e: any) {
        console.error("[TinodeAdmin WS] onReady callback error:", e?.message);
      }
    });
    // Subscribe to "me" topic immediately after login.
    // Tinode closes idle sessions that never subscribe to anything.
    // This single subscribe keeps the session alive and the server treats
    // the bot as an active client, not an idle connection to be pruned.
    try {
      this.ws?.send(JSON.stringify({
        sub: { id: String(this.msgId++), topic: "me", get: { what: "desc" } },
      }));
    } catch { /* ignore — keepalive pings will also help */ }
    this.startKeepalive();
    this.flushQueue();
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          // Gửi Tinode application-level get thay vì WS ping frame.
          // WS ping không được tính là traffic bởi nhiều proxy (nginx/traefik)
          // nên proxy vẫn timeout và kill connection dù bot đang "alive".
          // Một get {me} thực sự là data frame, reset idle timer của cả proxy lẫn Tinode.
          this.ws.send(JSON.stringify({
            get: { id: String(this.msgId++), topic: "me", what: "desc" },
          }));
        } catch {
          // ignore — close handler will reconnect
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.ready && this.ws?.readyState === WebSocket.OPEN) {
      const item = this.queue.shift()!;
      this.doSend(item.msg, item.resolve, item.reject);
    }
  }

  private doSend(msg: any, resolve: (v: any) => void, reject: (e: Error) => void): void {
    const key   = msg[Object.keys(msg)[0]]?.id as string;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      reject(new Error(`TinodeAdmin command timeout (id=${key})`));
    }, REQUEST_TIMEOUT_MS);
    this.pending.set(key, { resolve, reject, timer });
    this.ws!.send(JSON.stringify(msg));
  }

  /** Send a Tinode command and await its ctrl response. Queues if not yet ready. */
  send(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
        this.doSend(msg, resolve, reject);
      } else {
        this.queue.push({ msg, resolve, reject });
        if (!this.connecting && !this.giveUpForever) this.connect();
      }
    });
  }

  nextMsgId(): string { return this.nextId(); }
  isReady(): boolean  { return this.ready; }
}

export const tinodeAdmin = new TinodeAdminWs();
