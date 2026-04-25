import { useEffect, useRef, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/queryClient";

export interface TinodeMessage {
  seq: number;
  from: string;
  content: string | Record<string, any>;
  ts: string;
  head?: Record<string, any>;
  edited?: boolean;
}

export interface TinodeTopic {
  topic: string;
  name: string;
  unread: number;
  lastTs?: string;
  lastContent?: string;
  isCustomGroup?: boolean;
  groupId?: string;
}

interface TinodeCredentials {
  login: string;
  password: string;
  tinodeUrl: string;
  apiKey: string;
  displayName: string | null;
  isStudent?: boolean;
}

export interface UseTinodeResult {
  connected: boolean;
  authed: boolean;
  myLogin: string | null;
  myUid: string | null;
  isStudent: boolean;
  topics: TinodeTopic[];
  messages: TinopeMessages;
  currentTopic: string | null;
  subscribe: (topic: string) => void;
  sendMessage: (topic: string, content: string | Record<string, any>, head?: Record<string, any>) => void;
  uploadFile: (file: File) => Promise<{ ref: string; size: number; mime: string; name: string } | null>;
  tinodeUrl: string | null;
  apiKey: string;
  setCurrentTopic: (topic: string | null) => void;
  setActiveWindows: (topics: string[]) => void;
  userNames: Record<string, string>;
}

type TinopeMessages = Record<string, TinodeMessage[]>;

export function useTinode(): UseTinodeResult {
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [topics, setTopics] = useState<TinodeTopic[]>([]);
  const [messages, setMessages] = useState<TinopeMessages>({});
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [myUid, setMyUid] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const msgIdRef = useRef(1);
  const authedRef = useRef(false);
  // Periodic keepalive timer — Tinode (and reverse proxies) close idle WS
  // connections after ~60s. Sending a tiny payload every 25s keeps the link
  // alive so the chat doesn't show "connecting…" while the user is just idle.
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myUidRef = useRef<string | null>(null);
  const credRef = useRef<TinodeCredentials | null>(null);
  const currentTopicRef = useRef<string | null>(null);
  const hiIdRef = useRef<string | null>(null);
  const loginIdRef = useRef<string | null>(null);
  const accIdRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUidFetchRef = useRef<Set<string>>(new Set());
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownUidsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<TinopeMessages>({});
  // Tracks the localStorage key for the current user (updated on connect)
  const readSeqKeyRef = useRef<string>("tinode_read_seqs");
  // Tracks the highest seq we've locally acknowledged as read, per topic (persisted in localStorage)
  const readSeqRef = useRef<Record<string, number>>(
    (() => {
      try {
        const stored = localStorage.getItem("tinode_read_seqs");
        const parsed = stored ? JSON.parse(stored) : {};
        console.log("[TINODE DEBUG] readSeqRef init from localStorage:", parsed);
        return parsed;
      } catch { return {}; }
    })()
  );
  // In-memory session tracking: once a topic is read in this session, record the seq so
  // repeated meta.sub pushes from the server cannot restore the badge.
  const sessionClearedRef = useRef<Record<string, number>>({});
  // Tracks every topic the user has deliberately opened this session.
  // Unlike currentTopicRef (only last active), this Set covers ChatButton multi-windows too.
  const openedTopicsRef = useRef<Set<string>>(new Set());
  // Cache of last message content per topic, persisted in localStorage.
  // Used to display lastContent in conversation list without requiring re-subscription.
  const lastContentCacheKeyRef = useRef<string>("tinode_last_content");
  const lastContentCacheRef = useRef<Record<string, { content: string; ts: string }>>(
    (() => {
      try {
        const stored = localStorage.getItem("tinode_last_content");
        return stored ? JSON.parse(stored) : {};
      } catch { return {}; }
    })()
  );
  // Tracks which chat windows are currently OPEN and visible (not minimized).
  // Updated by ChatButton via setOpenWindows. Used in data handler to decide
  // whether to auto-mark-as-read (window open) or show badge (window closed).
  const activeWindowsRef = useRef<Set<string>>(new Set());
  // Tracks the latest serverSeq per topic as reported by Tinode meta.sub or msg.data
  const topicsSeqRef = useRef<Record<string, number>>({});
  // Tracks pending note{read} by subscription ID.
  // After Tinode confirms a subscribe (ctrl code 200/201), we send the note — NOT before,
  // because Tinode rejects notes sent before subscription is established.
  // exact=true: use pendingSeq as-is (restore saved read state, don't advance to serverSeq)
  // exact=false/undefined: take max with topicsSeqRef (mark all current messages as read)
  const pendingSubNotesRef = useRef<Record<string, { topic: string; seq: number; exact?: boolean }>>({});
  // Set of topics that currently have a pending sub note (so markAsRead can skip sending)
  const pendingTopicsRef = useRef<Set<string>>(new Set());
  // Tracks the highest seq seen per topic at the moment we sent the `sub` request.
  // The data handler uses this "baseline" to decide whether an incoming message is
  // historical (already counted by meta.sub) or genuinely new (should increment badge).
  // Historical messages: seq <= baseline → do NOT increment badge (meta.sub already counted them)
  // New messages:        seq >  baseline → DO increment badge
  const subBaselineSeqRef = useRef<Record<string, number>>({});
  // Set of group topic IDs the current user is authorized to see, sourced from
  // /api/chat/my-channels. Tinode's `me` subscription returns ALL topics the user
  // has ever joined (since defacs are permissive), but we must only display the
  // topics the backend authorizes for this user.
  const allowedGroupTopicsRef = useRef<Set<string>>(new Set());
  // Becomes true once /api/chat/my-channels has responded at least once. Until
  // this is true, we permissively allow all group topics through (so initial
  // meta.sub from Tinode isn't dropped before we know the allowlist).
  const allowedGroupTopicsLoadedRef = useRef<boolean>(false);
  // Outbound pub heads we've sent and are waiting on a ctrl ack for.
  // After ack, we re-key by `${topic}:${seq}` so the data echo (which may strip head fields) can be restored.
  const pendingPubsByIdRef = useRef<Record<string, { topic: string; head: Record<string, any> }>>({});
  const localPubHeadsByTopicSeqRef = useRef<Record<string, Record<string, any>>>({});

  const { data: credentials } = useQuery<TinodeCredentials>({
    queryKey: ["/api/chat/credentials"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const nextId = useCallback(() => String(msgIdRef.current++), []);

  // Fetch display names from backend for unknown Tinode UIDs
  const scheduleFetchNames = useCallback((uid: string) => {
    if (knownUidsRef.current.has(uid)) return;
    pendingUidFetchRef.current.add(uid);
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(() => {
      const uids = Array.from(pendingUidFetchRef.current);
      if (uids.length === 0) return;
      pendingUidFetchRef.current.clear();
      uids.forEach((u) => knownUidsRef.current.add(u));
      const token = getAuthToken();
      fetch(`/api/chat/user-names?uids=${encodeURIComponent(uids.join(","))}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data: { names?: Record<string, string> }) => {
          if (data.names && Object.keys(data.names).length > 0) {
            setUserNames((prev) => ({ ...prev, ...data.names }));
          }
        })
        .catch(() => {});
    }, 300);
  }, []);

  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Keep messagesRef in sync so markAsRead can access seq without stale closure
  const setMessagesSynced = useCallback((updater: (prev: TinopeMessages) => TinopeMessages) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Send Tinode note{what:"read"} for a topic so the server clears the unread count
  const markAsRead = useCallback((topic: string) => {
    // Zero badge locally regardless
    setTopics((prev) =>
      prev.map((t) => (t.topic === topic ? { ...t, unread: 0 } : t))
    );
    // If a pending sub note is already registered for this topic, the ctrl handler
    // will send the note after subscription is confirmed — skip here to avoid duplicates
    if (pendingTopicsRef.current.has(topic)) {
      console.log(`[TINODE DEBUG] markAsRead topic=${topic} — skipped, pending ctrl confirm`);
      return;
    }
    const msgs = messagesRef.current[topic];
    const maxSeq = msgs && msgs.length > 0 ? Math.max(...msgs.map((m) => m.seq)) : 0;
    const saved = Math.max(readSeqRef.current[topic] ?? 0, sessionClearedRef.current[topic] ?? 0);
    console.log(`[TINODE DEBUG] markAsRead topic=${topic} maxSeq=${maxSeq} saved=${saved}`);
    if (maxSeq > saved) {
      readSeqRef.current[topic] = maxSeq;
      sessionClearedRef.current[topic] = maxSeq;
      try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
      wsSend({ note: { topic, what: "read", seq: maxSeq } });
    }
  }, [wsSend]);

  const subscribe = useCallback((topic: string) => {
    if (!authedRef.current) return;
    const subId = nextId();
    // Snapshot the current highest known seq for this topic before we subscribe.
    // Data messages arriving with seq <= this baseline are "historical" and should not
    // increment the unread badge (meta.sub already counted them in computedUnread).
    subBaselineSeqRef.current[topic] = topicsSeqRef.current[topic] ?? 0;
    wsSend({
      sub: {
        id: subId,
        topic,
        get: { what: "desc data sub", data: { limit: 50 } },
      },
    });
    currentTopicRef.current = topic;
    setCurrentTopic(topic);
    // Record that the user deliberately opened this topic
    openedTopicsRef.current.add(topic);
    // Zero badge immediately in local state
    setTopics((prev) =>
      prev.map((t) => (t.topic === topic ? { ...t, unread: 0 } : t))
    );
    // Register a pending note{read} to be sent AFTER Tinode confirms the subscribe.
    // Sending note before ctrl confirmation causes: "note to invalid topic - must subscribe first"
    const knownSeq = topicsSeqRef.current[topic] ?? 0;
    // Fix 3: fall back to localStorage value if topicsSeqRef isn't populated yet (e.g. early click)
    const localSeq = readSeqRef.current[topic] ?? 0;
    const pendingSeq = Math.max(knownSeq, localSeq);
    if (pendingSeq > 0) {
      pendingSubNotesRef.current[subId] = { topic, seq: pendingSeq };
      pendingTopicsRef.current.add(topic);
    }
  }, [wsSend, nextId]);

  const sendMessage = useCallback((topic: string, content: string | Record<string, any>, head?: Record<string, any>) => {
    if (!authedRef.current) return;
    if (typeof content === "string" && !content.trim()) return;
    const id = nextId();
    const pub: Record<string, any> = {
      id,
      topic,
      noecho: false,
      content,
    };
    if (head && Object.keys(head).length > 0) {
      // Default mime when callers send a structured head without it.
      pub.head = { mime: typeof content === "string" ? "text/plain" : "text/x-drafty", ...head };
      // Track this pub so we can rebuild head on the data echo (Tinode may strip non-mime fields).
      // We only care about replace/reply right now; mime alone needs no tracking.
      const interesting: Record<string, any> = {};
      for (const k of Object.keys(pub.head)) {
        if (k === "mime") continue;
        interesting[k] = pub.head[k];
      }
      if (Object.keys(interesting).length > 0) {
        pendingPubsByIdRef.current[id] = { topic, head: interesting };
      }
    }
    console.log(`[TINODE DEBUG] sendMessage id=${id} topic=${topic} head=${JSON.stringify(pub.head ?? null)}`);
    wsSend({ pub });
  }, [wsSend, nextId]);

  const uploadFile = useCallback(async (file: File): Promise<{ ref: string; size: number; mime: string; name: string } | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/upload-file", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.ref) return null;
      return { ref: data.ref, size: data.size ?? file.size, mime: data.mime ?? file.type, name: data.name ?? file.name };
    } catch {
      return null;
    }
  }, []);

  const setCurrentTopicSynced = useCallback((topic: string | null) => {
    currentTopicRef.current = topic;
    setCurrentTopic(topic);
    if (topic) {
      openedTopicsRef.current.add(topic);
      setTopics((prev) =>
        prev.map((t) => (t.topic === topic ? { ...t, unread: 0 } : t))
      );
    }
  }, []);

  const connect = useCallback((creds: TinodeCredentials) => {
    const { tinodeUrl, apiKey, login, password, displayName } = creds;
    if (!tinodeUrl) return;

    // Switch to the user-specific localStorage key so data doesn't leak between accounts
    const userKey = `tinode_read_seqs_${login}`;
    if (readSeqKeyRef.current !== userKey) {
      readSeqKeyRef.current = userKey;
      try {
        let stored = localStorage.getItem(userKey);
        // Migrate from old generic key if user-specific key is empty
        if (!stored || stored === '{}') {
          const oldStored = localStorage.getItem("tinode_read_seqs");
          if (oldStored && oldStored !== '{}') {
            stored = oldStored;
            localStorage.setItem(userKey, stored);
            console.log("[TINODE DEBUG] migrated from generic key:", oldStored);
          }
        }
        readSeqRef.current = stored ? JSON.parse(stored) : {};
        console.log("[TINODE DEBUG] loaded readSeq for key", userKey, ":", JSON.stringify(readSeqRef.current));
      } catch { readSeqRef.current = {}; }
      // Load user-specific last-content cache
      const contentKey = `tinode_last_content_${login}`;
      lastContentCacheKeyRef.current = contentKey;
      try {
        const cs = localStorage.getItem(contentKey);
        lastContentCacheRef.current = cs ? JSON.parse(cs) : {};
      } catch { lastContentCacheRef.current = {}; }
    }

    // Don't reconnect if already connected and authenticated with the same account
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      authedRef.current &&
      credRef.current?.login === login
    ) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = tinodeUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsUrl}/v0/channels?apikey=${apiKey}`);
    } catch {
      return;
    }
    wsRef.current = ws;

    const secret = btoa(`${login}:${password}`);

    const doLogin = () => {
      const loginId = nextId();
      loginIdRef.current = loginId;
      ws.send(JSON.stringify({
        login: { id: loginId, scheme: "basic", secret },
      }));
    };

    const doSubscribeMe = () => {
      authedRef.current = true;
      setAuthed(true);
      ws.send(JSON.stringify({
        sub: { id: nextId(), topic: "me", get: { what: "desc sub" } },
      }));
      // Cập nhật profile với tên thật (sửa trường hợp tài khoản tạo lần đầu không có displayName)
      if (displayName) {
        ws.send(JSON.stringify({
          set: {
            id: nextId(),
            topic: "me",
            desc: { public: { fn: displayName } },
          },
        }));
      }
      // After auth, load class channels from server and subscribe to each.
      // Use wsSend (not ws.send) so we always write to the live socket via wsRef.
      const token = getAuthToken();
      fetch("/api/chat/my-channels", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data: { channels?: { topicId: string; className: string; isCustomGroup?: boolean; groupId?: string }[] }) => {
          if (!Array.isArray(data.channels)) return;
          // Build the authorized group topic allowlist from the API response.
          const allowed = new Set<string>();
          for (const ch of data.channels) {
            if (ch.topicId && ch.topicId.startsWith("grp")) allowed.add(ch.topicId);
          }
          allowedGroupTopicsRef.current = allowed;
          allowedGroupTopicsLoadedRef.current = true;
          // Prune any group topics that Tinode's me sub may have already added but
          // which the backend does NOT authorize for this user. Keep all P2P topics.
          setTopics(prev => prev.filter(t => {
            if (!t.topic.startsWith("grp")) return true;
            return allowed.has(t.topic);
          }));
          for (const ch of data.channels) {
            if (!ch.topicId) continue;
            // Pre-populate topic metadata so the sidebar shows label before Tinode responds
            setTopics(prev => {
              const exists = prev.find(t => t.topic === ch.topicId);
              if (exists) return prev;
              return [...prev, {
                topic: ch.topicId,
                name: ch.className,
                unread: 0,
                isCustomGroup: ch.isCustomGroup ?? false,
                groupId: ch.groupId,
              }];
            });
            const autoSubId = nextId();
            // Snapshot the current highest known seq for this topic before we auto-subscribe.
            // Data messages arriving with seq <= this baseline are "historical" (already
            // counted by meta.sub in computedUnread) and must NOT re-increment the badge.
            subBaselineSeqRef.current[ch.topicId] = topicsSeqRef.current[ch.topicId] ?? 0;
            // Only register pending note if localStorage already recorded a read seq for this
            // topic — meaning the user has read it before. This prevents accidentally marking
            // genuinely-unread messages as read on page load.
            // When localStorage is populated (after first correct session), we re-confirm the
            // read state to Tinode so F5 never brings back stale badges.
            const localReadSeq = readSeqRef.current[ch.topicId] ?? 0;
            if (localReadSeq > 0) {
              // exact=true: only re-confirm up to what user previously read, not beyond.
              // This prevents auto-clearing genuinely new unread messages on page load.
              pendingSubNotesRef.current[autoSubId] = { topic: ch.topicId, seq: localReadSeq, exact: true };
              pendingTopicsRef.current.add(ch.topicId);
            }
            wsSend({
              sub: {
                id: autoSubId,
                topic: ch.topicId,
                get: { what: "desc data sub", data: { limit: 50 } },
              },
            });
          }
        })
        .catch(() => {});
    };

    ws.onopen = () => {
      console.log("[Tinode WS] Connected:", ws.url);
      setConnected(true);
      const hiId = nextId();
      hiIdRef.current = hiId;
      ws.send(JSON.stringify({
        hi: { id: hiId, ver: "0.25", ua: "EduManage/1.0" },
      }));
      // Start keepalive ping. Tinode treats a single "1" character as an
      // application-level no-op (matches the official Tinode JS SDK behavior).
      // Without this, the connection drops after ~60s of idle and the user
      // sees a recurring "Đang kết nối tới máy chủ chat…" banner.
      if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send("1"); } catch { /* ignore */ }
        }
      }, 25000);
    };

    ws.onclose = (e) => {
      console.warn("[Tinode WS] Closed — code:", e.code, "reason:", e.reason, "wasClean:", e.wasClean);
      setConnected(false);
      setAuthed(false);
      authedRef.current = false;
      if (keepaliveTimerRef.current) {
        clearInterval(keepaliveTimerRef.current);
        keepaliveTimerRef.current = null;
      }
      retryTimerRef.current = setTimeout(() => {
        if (credRef.current) connect(credRef.current);
      }, 5000);
    };

    ws.onerror = (e) => {
      console.error("[Tinode WS] Error:", e);
      setConnected(false);
    };

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      // Log full payload for `data` packets (we need to inspect head.{replace,reply}); truncate other noisy frames.
      const raw = JSON.stringify(msg);
      console.log("[Tinode WS] Message:", msg.data ? raw : raw.slice(0, 200));

      if (msg.ctrl) {
        const { id, code } = msg.ctrl;

        // pub ack: re-key the pending head we tracked when sending,
        // so that the data echo (which may strip head fields) can be restored.
        if (id && code >= 200 && code < 300 && pendingPubsByIdRef.current[id]) {
          const pending = pendingPubsByIdRef.current[id];
          const ackedSeq: number | undefined = msg.ctrl.params?.seq;
          if (typeof ackedSeq === "number") {
            const key = `${pending.topic}:${ackedSeq}`;
            localPubHeadsByTopicSeqRef.current[key] = pending.head;
            console.log(`[TINODE DEBUG] pub ack id=${id} → ${key} head=${JSON.stringify(pending.head)}`);
          }
          delete pendingPubsByIdRef.current[id];
        }

        // hi accepted → send login
        if (id === hiIdRef.current && code >= 200 && code < 300) {
          doLogin();
        }

        // login response
        if (id === loginIdRef.current) {
          if (code === 200 || code === 201) {
            // Extract and register Tinode UID
            const tinodeUid: string | undefined = msg.ctrl.params?.user;
            if (tinodeUid) {
              myUidRef.current = tinodeUid;
              setMyUid(tinodeUid);
              // Register this UID with our backend so others can look us up by name
              const token = getAuthToken();
              fetch("/api/chat/my-uid", {
                method: "PUT",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ tinodeUid }),
              }).catch(() => {});
            }
            doSubscribeMe();
          } else if (code === 404 || code === 401) {
            // User doesn't exist → create account then login again
            const accId = nextId();
            accIdRef.current = accId;
            ws.send(JSON.stringify({
              acc: {
                id: accId,
                user: "new",
                scheme: "basic",
                secret,
                login: false,
                desc: {
                  public: { fn: displayName || login },
                  private: { comment: "EduManage" },
                },
              },
            }));
          }
        }

        // acc (account create) response → retry login
        if (id === accIdRef.current && (code === 200 || code === 201)) {
          doLogin();
        }

        // Subscription confirmed → now it's safe to send note{read}
        // (Tinode rejects notes on topics that aren't subscribed yet)
        if (id && code >= 200 && code < 300 && pendingSubNotesRef.current[id]) {
          const { topic: pendingTopic, seq: pendingSeq, exact } = pendingSubNotesRef.current[id];
          delete pendingSubNotesRef.current[id];
          pendingTopicsRef.current.delete(pendingTopic);
          // exact=true (auto-subscribe on page load): use pendingSeq exactly so we don't
          //   advance the read pointer beyond what the user actually read last session.
          // exact=false/undefined (user clicked a channel): take max with topicsSeqRef to
          //   mark all currently-loaded messages as read.
          const bestSeq = exact
            ? pendingSeq
            : Math.max(pendingSeq, topicsSeqRef.current[pendingTopic] ?? 0);
          if (bestSeq > 0) {
            const newRead = Math.max(readSeqRef.current[pendingTopic] ?? 0, bestSeq);
            readSeqRef.current[pendingTopic] = newRead;
            sessionClearedRef.current[pendingTopic] = Math.max(sessionClearedRef.current[pendingTopic] ?? 0, newRead);
            try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
            console.log(`[TINODE DEBUG] ctrl confirm: sending note{read} topic=${pendingTopic} seq=${newRead} exact=${!!exact}`);
            wsSend({ note: { topic: pendingTopic, what: "read", seq: newRead } });
            const serverSeqNow = topicsSeqRef.current[pendingTopic] ?? 0;
            if (!exact || newRead >= serverSeqNow) {
              // Zero badge when user explicitly opened the channel, OR when our localRead
              // already covers all known server messages (F5 restore case).
              setTopics((prev) =>
                prev.map((t) => (t.topic === pendingTopic ? { ...t, unread: 0 } : t))
              );
            }
          }
        }
      }

      if (msg.meta) {
        if (msg.meta.sub && Array.isArray(msg.meta.sub)) {
          let localStorageDirty = false;
          setTopics((prev) => {
            const map = new Map(prev.map((t) => [t.topic, t]));
            for (const s of msg.meta.sub) {
              const topicId: string = s.topic ?? "";
              // Xử lý group topics (grp*) và P2P topics (usr*)
              const isGroup = topicId.startsWith("grp");
              const isP2P   = topicId.startsWith("usr");
              if (!isGroup && !isP2P) continue;
              // Backend authorizes which group topics this user may see. If the
              // allowlist has loaded and this group topic is not in it, skip —
              // Tinode lists every topic the user has ever joined, including
              // some they should no longer see.
              if (isGroup && allowedGroupTopicsLoadedRef.current && !allowedGroupTopicsRef.current.has(topicId)) {
                continue;
              }

              const name: string = s.public?.fn ?? s.public?.name ?? topicId;
              const existing = map.get(topicId);
              // Compute unread using local read-seq so stale server pushes don't restore old counts
              const serverSeq: number = s.seq ?? 0;
              // Always keep topicsSeqRef up to date so subscribe() can send note{read} immediately
              if (serverSeq > 0) topicsSeqRef.current[topicId] = Math.max(topicsSeqRef.current[topicId] ?? 0, serverSeq);
              const serverRead: number = s.read ?? 0;
              const localRead: number = readSeqRef.current[topicId] ?? 0;
              const sessionCleared: number = sessionClearedRef.current[topicId] ?? 0;
              // "Currently active" means the user is RIGHT NOW viewing this topic.
              // We intentionally use currentTopicRef (not openedTopicsRef) because
              // openedTopicsRef accumulates ALL ever-visited topics this session.
              // Using openedTopicsRef here would auto-read NEW messages on topics
              // the user has navigated away from, suppressing their badges.
              const isCurrentlyOpen = currentTopicRef.current === topicId;
              // If user is currently viewing this topic, re-confirm read state to Tinode.
              if (isCurrentlyOpen && serverSeq > 0) {
                readSeqRef.current[topicId] = Math.max(localRead, serverSeq);
                sessionClearedRef.current[topicId] = Math.max(sessionCleared, serverSeq);
                localStorageDirty = true;
                wsSend({ note: { topic: topicId, what: "read", seq: serverSeq } });
              }
              // effectiveRead uses all three sources: server, localStorage, and in-session tracking
              const effectiveRead = Math.max(serverRead, readSeqRef.current[topicId] ?? 0, sessionClearedRef.current[topicId] ?? 0);
              // Force badge=0 only when user is actively viewing this topic right now.
              // For topics not currently open, compute unread from effectiveRead.
              // sessionClearedRef (included in effectiveRead) handles the "stale push after
              // user reads" case — so we don't need openedTopicsRef for badge suppression.
              const computedUnread = isCurrentlyOpen ? 0 : Math.max(0, serverSeq - effectiveRead);
              console.log(`[TINODE DEBUG] meta.sub topic=${topicId} serverSeq=${serverSeq} serverRead=${serverRead} localRead=${localRead} effectiveRead=${effectiveRead} computedUnread=${computedUnread} isCurrentlyOpen=${isCurrentlyOpen}`);
              // Mirror server's read state to localStorage so F5 always has correct data.
              // If effectiveRead is higher than what we currently have stored, update it.
              if (effectiveRead > localRead) {
                readSeqRef.current[topicId] = effectiveRead;
                localStorageDirty = true;
              }
              // If we have a local read position higher than what server knows, resend note
              const bestLocalRead = Math.max(localRead, sessionCleared);
              if (bestLocalRead > serverRead && bestLocalRead > 0) {
                wsSend({ note: { topic: topicId, what: "read", seq: bestLocalRead } });
              }
              const cachedContent = lastContentCacheRef.current[topicId];
              map.set(topicId, {
                topic:         topicId,
                name:          isP2P && name && !/^u_[0-9a-f]{8,}$/i.test(name) ? name : (existing?.name ?? name),
                unread:        computedUnread,
                lastTs:        s.touched ?? existing?.lastTs,
                lastContent:   existing?.lastContent ?? (cachedContent?.content),
                isP2P,
                isCustomGroup: existing?.isCustomGroup ?? false,
                groupId:       existing?.groupId,
              } as any);
            }
            // Persist any updates to localStorage outside the setState callback
            if (localStorageDirty) {
              try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
            }
            return Array.from(map.values());
          });

          const names: Record<string, string> = {};
          for (const s of msg.meta.sub) {
            const fn: string | undefined = s.public?.fn;
            if (s.user && fn && !/^u_[0-9a-f]{8,}$/i.test(fn)) {
              names[s.user] = fn;
            }
          }
          if (Object.keys(names).length > 0) {
            setUserNames((prev) => ({ ...prev, ...names }));
          }
        }

        // Cập nhật tên topic từ meta.desc khi subscribe (group hoặc P2P)
        if (msg.meta.desc && msg.meta.topic) {
          const topicId: string = msg.meta.topic;
          const isGroup = topicId.startsWith("grp");
          const isP2P   = topicId.startsWith("usr");
          if (isGroup || isP2P) {
            const name: string = msg.meta.desc.public?.fn ?? topicId;
            setTopics((prev) => {
              const map = new Map(prev.map((t) => [t.topic, t]));
              const existing = map.get(topicId);
              // Cho P2P: chỉ cập nhật name nếu tên mới có nghĩa (không phải login-style)
              const displayName = isP2P && /^u_[0-9a-f]{8,}$/i.test(name)
                ? (existing?.name ?? name)
                : name;
              map.set(topicId, {
                topic:         topicId,
                name:          displayName,
                unread:        existing?.unread ?? 0,
                lastTs:        existing?.lastTs,
                lastContent:   existing?.lastContent,
                isP2P,
                isCustomGroup: existing?.isCustomGroup ?? false,
                groupId:       existing?.groupId,
              } as any);
              return Array.from(map.values());
            });
          }
        }
      }

      if (msg.data) {
        const { topic, from, content, ts, seq } = msg.data;
        // Merge in any locally-saved head we tracked at send time (in case the server's data echo strips fields).
        const localKey = `${topic}:${seq}`;
        const localHead = localPubHeadsByTopicSeqRef.current[localKey];
        const head: Record<string, any> = { ...(msg.data.head ?? {}), ...(localHead ?? {}) };
        if (localHead) {
          delete localPubHeadsByTopicSeqRef.current[localKey];
          console.log(`[TINODE DEBUG] data echo ${localKey}: merged local head=${JSON.stringify(localHead)}`);
        }
        // Track the latest seq so subscribe() can send note{read} immediately when needed
        topicsSeqRef.current[topic] = Math.max(topicsSeqRef.current[topic] ?? 0, seq);
        // Trigger backend name lookup for unknown senders
        if (from && from !== myUidRef.current) {
          scheduleFetchNames(from);
        }

        // Detect "replace" head: ":N" means this message edits the original at seq=N.
        // Tinode delivers the new content as a fresh data packet; we replace in-place.
        // Be permissive about format — accept ":N", "N", or "topicName:N".
        const replaceTarget: number | null = (() => {
          const r = head?.replace;
          if (typeof r !== "string") return null;
          const m = /(?::|^)(\d+)\s*$/.exec(r);
          return m ? parseInt(m[1], 10) : null;
        })();
        if (head?.replace) {
          console.log(`[TINODE DEBUG] data with head.replace=${JSON.stringify(head.replace)} → target seq=${replaceTarget} (incoming seq=${seq})`);
        }
        if (head?.reply) {
          console.log(`[TINODE DEBUG] data with head.reply=${JSON.stringify(head.reply)} (incoming seq=${seq})`);
        }

        setMessagesSynced((prev) => {
          const existing = prev[topic] ?? [];
          if (replaceTarget !== null) {
            // Find the original message and overwrite its content + mark edited.
            const idx = existing.findIndex((m) => m.seq === replaceTarget);
            if (idx === -1) {
              // Original not loaded — drop the replace packet (don't add as new message).
              return prev;
            }
            const updated = [...existing];
            updated[idx] = {
              ...updated[idx],
              content,
              ts,
              head: { ...(updated[idx].head ?? {}), ...(head ?? {}) },
              edited: true,
            };
            return { ...prev, [topic]: updated };
          }
          if (existing.some((m) => m.seq === seq)) return prev;
          return {
            ...prev,
            [topic]: [...existing, { seq, from, content, ts, head }].sort(
              (a, b) => a.seq - b.seq
            ),
          };
        });

        // Suppress preview/badge updates for edits — they shouldn't bump the
        // conversation list to "unread" or change the last-shown content.
        if (replaceTarget !== null) {
          return;
        }

        // Update last-content cache so conversation list shows preview after page reload
        const contentText = typeof content === "string" ? content : "[tin nhắn]";
        const prevCached = lastContentCacheRef.current[topic];
        if (!prevCached || seq >= (prevCached as any).seq) {
          lastContentCacheRef.current[topic] = { content: contentText, ts, seq } as any;
          try { localStorage.setItem(lastContentCacheKeyRef.current, JSON.stringify(lastContentCacheRef.current)); } catch {}
        }

        // "topicIsOpen" = user is ACTIVELY viewing this topic right now:
        //   - currentTopicRef tracks the last subscribed topic (single main window)
        //   - activeWindowsRef tracks all currently OPEN chat windows (updated by ChatButton)
        // We intentionally do NOT use openedTopicsRef (ever-visited set) here because
        // that would auto-read messages for topics the user has navigated away from.
        const topicIsOpen = activeWindowsRef.current.has(topic) || currentTopicRef.current === topic;
        if (topicIsOpen) {
          readSeqRef.current[topic] = Math.max(readSeqRef.current[topic] ?? 0, seq);
          sessionClearedRef.current[topic] = Math.max(sessionClearedRef.current[topic] ?? 0, seq);
          try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
          wsSend({ note: { topic, what: "read", seq } });
        }

        // Only increment the unread badge for messages that are genuinely NEW
        // (arrived after we subscribed). Historical messages loaded on subscription
        // (seq <= subBaseline) are already counted in computedUnread from meta.sub,
        // so incrementing again would cause badge inflation and incorrect counts.
        const subBaseline = subBaselineSeqRef.current[topic] ?? 0;
        const isNewMessage = seq > subBaseline;
        setTopics((prev) =>
          prev.map((t) =>
            t.topic === topic
              ? {
                  ...t,
                  lastTs: ts,
                  lastContent: contentText,
                  unread: topicIsOpen ? 0 : (isNewMessage ? t.unread + 1 : t.unread),
                }
              : t
          )
        );
      }
    };
  }, [nextId, wsSend, setMessagesSynced]);

  useEffect(() => {
    if (!credentials) return;
    credRef.current = credentials;
    connect(credentials);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      authedRef.current = false;
      setConnected(false);
      setAuthed(false);
    };
  }, [credentials, connect]);

  useEffect(() => {
    if (currentTopic) {
      markAsRead(currentTopic);
    }
  }, [currentTopic, markAsRead]);

  // Re-mark as read whenever messages update for the current topic.
  // This handles the case where markAsRead was called before messages loaded (maxSeq was 0),
  // ensuring readSeqRef is saved to localStorage once messages actually arrive.
  useEffect(() => {
    if (!currentTopic) return;
    const msgs = messages[currentTopic];
    if (msgs && msgs.length > 0) {
      const maxSeq = Math.max(...msgs.map((m) => m.seq));
      const saved = Math.max(readSeqRef.current[currentTopic] ?? 0, sessionClearedRef.current[currentTopic] ?? 0);
      if (maxSeq > saved) {
        readSeqRef.current[currentTopic] = maxSeq;
        sessionClearedRef.current[currentTopic] = maxSeq;
        try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
        console.log(`[TINODE DEBUG] messages effect: saved ${currentTopic} seq=${maxSeq}`);
        wsSend({ note: { topic: currentTopic, what: "read", seq: maxSeq } });
        setTopics((prev) =>
          prev.map((t) => (t.topic === currentTopic ? { ...t, unread: 0 } : t))
        );
      }
    }
  }, [currentTopic, messages, wsSend]);

  const setActiveWindows = useCallback((topics: string[]) => {
    activeWindowsRef.current = new Set(topics);
  }, []);

  return {
    connected,
    authed,
    myLogin: credentials?.login ?? null,
    myUid,
    isStudent: credentials?.isStudent ?? false,
    topics,
    messages,
    currentTopic,
    subscribe,
    sendMessage,
    uploadFile,
    setCurrentTopic: setCurrentTopicSynced,
    setActiveWindows,
    userNames,
    tinodeUrl: credRef.current?.tinodeUrl ?? null,
    apiKey: credRef.current?.apiKey ?? "AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K",
  };
}

// ── Shared Context ──────────────────────────────────────────────────────────
// Wrap the app with <TinodeProvider> so ChatPage and ChatButton share a single
// WebSocket connection and a single state — preventing duplicate connections
// and read-state mismatches that caused unread badges to reappear.

const TinodeContext = createContext<UseTinodeResult | null>(null);

export function TinodeProvider({ children }: { children: ReactNode }) {
  const value = useTinode();
  return (
    <TinodeContext.Provider value={value}>
      {children}
    </TinodeContext.Provider>
  );
}

export function useTinodeContext(): UseTinodeResult {
  const ctx = useContext(TinodeContext);
  if (!ctx) throw new Error("useTinodeContext must be used inside TinodeProvider");
  return ctx;
}
