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
 *
 * Any authenticated Tinode user can create grp* topics via sub{topic:"new"}.
 * Topics created by this bot are the group-chat rooms for each EduManage class.
 *
 * Env vars:
 *   TINODE_URL          — required for chat to work
 *   TINODE_SECRET       — used to derive deterministic system-bot password
 *   TINODE_ADMIN_USER   — bot login name (unique per center, default: "edumanage_bot")
 */

import WebSocket from "ws";
import { createHmac } from "crypto";

const TINODE_URL    = process.env.TINODE_URL?.replace(/\/$/, "") || null;
const TINODE_SECRET = process.env.TINODE_SECRET || "edumanage-tinode-secret";
const TINODE_API_KEY = "AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K";

// Deterministic bot credentials — derived from TINODE_SECRET so they survive restarts.
// BOT_LOGIN is read from env var so each center deployment has its own isolated bot account.
const BOT_LOGIN    = process.env.TINODE_ADMIN_USER ?? "edumanage_bot";  // < 32 chars
const BOT_PASSWORD = createHmac("sha256", TINODE_SECRET).update("system-bot").digest("hex");
const BOT_SECRET   = Buffer.from(`${BOT_LOGIN}:${BOT_PASSWORD}`).toString("base64");

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
  private maxRetries = 5; // Max 5 retry attempts
  private retryDelay = 5_000; // Start with 5s, exponential backoff

  private nextId(): string { return String(this.msgId++); }

  /** Starts the persistent admin connection. Idempotent. */
  connect(): void {
    if (!TINODE_URL) return;
    if (this.connecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.connecting = true;
    this.ready      = false;

    const wsUrl = TINODE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const url   = `${wsUrl}/v0/channels?apikey=${TINODE_API_KEY}`;

    console.log("[TinodeAdmin WS] Connecting to", url);
    const ws = new WebSocket(url);
    this.ws  = ws;

    const hiId    = this.nextId();
    const loginId = this.nextId();
    const accId   = this.nextId();

    ws.on("open", () => {
      ws.send(JSON.stringify({
        hi: { id: hiId, ver: "0.25", ua: "EduManage-Bot/1.0" },
      }));
    });

    ws.on("message", (raw: Buffer | string) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg.ctrl) return;

      const { id, code } = msg.ctrl as { id: string; code: number; params?: any };

      // hi → try login
      if (id === hiId && code >= 200 && code < 300) {
        ws.send(JSON.stringify({
          login: { id: loginId, scheme: "basic", secret: BOT_SECRET },
        }));
        return;
      }

      // login response
      if (id === loginId) {
        if (code === 200) {
          this.onReady();
        } else if (code === 401 || code === 404) {
          // Bot account doesn't exist yet — create it
          console.log("[TinodeAdmin WS] Bot user not found, creating account…");
          ws.send(JSON.stringify({
            acc: {
              id:     accId,
              user:   "new",
              scheme: "basic",
              secret: BOT_SECRET,
              login:  true,   // also logs in immediately
              desc: {
                public:  { fn: "EduManage Bot" },
                private: { comment: "EduManage system account" },
              },
            },
          }));
        } else {
          console.error(`[TinodeAdmin WS] Login failed (code ${code})`);
        }
        return;
      }

      // acc response — bot account just created + logged in
      if (id === accId) {
        if (code === 200 || code === 201) {
          this.onReady();
        } else {
          console.error(`[TinodeAdmin WS] Account creation failed (code ${code})`);
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
      for (const [, e] of this.pending) {
        clearTimeout(e.timer);
        e.reject(new Error("TinodeAdmin WS disconnected"));
      }
      this.pending.clear();
      
      if (this.retryCount >= this.maxRetries) {
        console.warn(`[TinodeAdmin WS] Max retries (${this.maxRetries}) reached. Stopping reconnection attempts.`);
        console.warn("[TinodeAdmin WS] Chat functionality will be unavailable. Check TINODE_URL and server status.");
        return;
      }
      
      this.retryCount++;
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
      console.log(`[TinodeAdmin WS] Disconnected — reconnecting in ${delay / 1000}s (attempt ${this.retryCount}/${this.maxRetries})…`);
      setTimeout(() => this.connect(), delay);
    });

    ws.on("error", (err) => {
      console.error("[TinodeAdmin WS] Error:", err.message);
    });
  }

  private onReady(): void {
    this.ready      = true;
    this.connecting = false;
    this.retryCount = 0; // Reset retry counter on successful connection
    console.log("[TinodeAdmin WS] Ready as EduManage Bot");
    this.flushQueue();
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
    }, 10_000);
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
        if (!this.connecting) this.connect();
      }
    });
  }

  nextMsgId(): string { return this.nextId(); }
  isReady(): boolean  { return this.ready; }
}

export const tinodeAdmin = new TinodeAdminWs();
