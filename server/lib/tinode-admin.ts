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
const MAX_RETRIES         = parseInt(process.env.TINODE_MAX_RETRIES ?? "5", 10);
const RETRY_BACKOFF_MS    = parseInt(process.env.TINODE_RETRY_BACKOFF_MS ?? "5000", 10);
// Tinode server (and most reverse proxies) close idle WebSockets after ~60s.
// Send a keepalive every 25s to prevent the connection from being dropped.
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.TINODE_KEEPALIVE_INTERVAL_MS ?? "25000", 10);

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

  private nextId(): string { return String(this.msgId++); }

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
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
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
          this.onReady();
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
          this.onReady();
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

    ws.on("close", () => {
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

      if (this.retryCount >= MAX_RETRIES) {
        console.warn(`[TinodeAdmin WS] Max retries (${MAX_RETRIES}) reached. Stopping reconnection attempts.`);
        console.warn("[TinodeAdmin WS] Chat functionality will be unavailable. Check TINODE_URL and server status.");
        return;
      }

      this.retryCount++;
      const delay = RETRY_BACKOFF_MS * Math.pow(2, this.retryCount - 1);
      console.log(`[TinodeAdmin WS] Disconnected — reconnecting in ${delay / 1000}s (attempt ${this.retryCount}/${MAX_RETRIES})…`);
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

  private onReady(): void {
    this.ready      = true;
    this.connecting = false;
    this.retryCount = 0;
    console.log(`[TinodeAdmin WS] Ready as ${BOT_LOGIN}`);
    this.startKeepalive();
    this.flushQueue();
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          // WebSocket-level ping frame; Tinode/proxies will respond with pong
          // and the connection stays alive past idle-timeout windows.
          this.ws.ping();
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
