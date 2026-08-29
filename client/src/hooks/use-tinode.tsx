import { useEffect, useRef, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  isDirectMessage?: boolean;
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
  /** True once the user has successfully authed at least once in this session.
   *  Never resets to false — use it to distinguish "initial loading" (false)
   *  from "reconnecting after a drop" (true but authed=false). */
  hasEverAuthed: boolean;
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
  registerName: (uid: string, name: string) => void;
}

type TinopeMessages = Record<string, TinodeMessage[]>;

export function useTinode(): UseTinodeResult {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  // Latches to true once authenticated — never resets to false.
  // Lets the UI distinguish first-load (false) from reconnecting (true + authed=false).
  const [hasEverAuthed, setHasEverAuthed] = useState(false);
  const [topics, setTopics] = useState<TinodeTopic[]>([]);
  const [messages, setMessages] = useState<TinopeMessages>({});
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [myUid, setMyUid] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const msgIdRef = useRef(1);
  const authedRef = useRef(false);
  // Periodic keepalive timer — Tinode (and reverse proxies) close idle WS
  // connections after ~60s. Sending a tiny payload every 20s keeps the link
  // alive so the chat doesn't show "connecting…" while the user is just idle.
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks last time we received any data from server. Used to detect a
  // "zombie" socket: still readyState=OPEN but no traffic for too long
  // (network change, OS sleep, mobile radio handoff). Force-close → reconnect.
  const lastRxRef = useRef<number>(Date.now());
  const myUidRef = useRef<string | null>(null);
  const credRef = useRef<TinodeCredentials | null>(null);
  const currentTopicRef = useRef<string | null>(null);
  const hiIdRef = useRef<string | null>(null);
  const loginIdRef = useRef<string | null>(null);
  const accIdRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reconnect attempt counter for exponential backoff. Reset to 0 once
  // the new socket reaches the "authed" state.
  const reconnectAttemptRef = useRef<number>(0);
  // Tracks the login that the useEffect last called connect() for.
  // Prevents double-connect when the `connect` callback changes identity
  // between renders while credentials stay the same.
  const lastEffectLoginRef = useRef<string | null>(null);
  const pendingUidFetchRef = useRef<Set<string>>(new Set());
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownUidsRef = useRef<Set<string>>(new Set());
  // Tracks last fetch attempt time per UID (for unresolved UIDs).
  // Prevents bursty repeated calls: minimum 60s between retries for names not found.
  const uidLastAttemptRef = useRef<Record<string, number>>({});
  // Retry counter for stale-topic detection path (sub failed → my-channels → same topicId).
  // Prevents infinite loops when a class group topic can't be re-subscribed.
  const staleRetryCountRef = useRef<Record<string, number>>({});
  const messagesRef = useRef<TinopeMessages>({});
  // Tracks the localStorage key for the current user (updated on connect)
  const readSeqKeyRef = useRef<string>("tinode_read_seqs");
  const topicsSeqKeyRef = useRef<string>("tinode_topics_seq");
  // Tracks the highest seq we've locally acknowledged as read, per topic (persisted in localStorage)
  const readSeqRef = useRef<Record<string, number>>(
    (() => {
      try {
        const stored = localStorage.getItem("tinode_read_seqs");
        return stored ? JSON.parse(stored) : {};
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
  // Tracks the latest serverSeq per topic as reported by Tinode meta.sub or msg.data.
  // Persisted to localStorage (user-specific key) so F5/reconnect starts with correct values
  // instead of 0 — prevents badge flicker and wrong read-seq decisions during the window
  // before meta.sub arrives.
  const topicsSeqRef = useRef<Record<string, number>>(
    (() => { try { const s = localStorage.getItem("tinode_topics_seq"); return s ? JSON.parse(s) : {}; } catch { return {}; } })()
  );
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
  // content is stored so we can retry the pub if Tinode rejects it (e.g. not subscribed yet).
  const pendingPubsByIdRef = useRef<Record<string, { topic: string; head: Record<string, any>; content?: string | Record<string, any> }>>({});
  const localPubHeadsByTopicSeqRef = useRef<Record<string, Record<string, any>>>({});
  // Tracks sub IDs for grp* topics so we can detect stale-topic failures (4xx ctrl on sub)
  // and trigger a backend recreation via my-channels refresh.
  const pendingGroupSubsByIdRef = useRef<Record<string, string>>({}); // subId → topicId
  // Tracks pub retry attempts per topic to prevent infinite retry loops.
  // Cleared on successful pub ack or when the retry fires.
  const pubRetryCountRef = useRef<Record<string, number>>({}); // topic → retryCount
  // Pending retry timers so we can cancel them on unmount/socket close.
  const pubRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Guard: prevents doSubscribeMe from running more than once per WS connection.
  // Reset to false on every WS close/disconnect so reconnects can re-subscribe.
  const doSubscribeMeCalledRef = useRef(false);

  const { data: credentials } = useQuery<TinodeCredentials>({
    queryKey: ["/api/chat/credentials"],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const nextId = useCallback(() => String(msgIdRef.current++), []);

  // Fetch display names from backend for unknown Tinode UIDs
  const scheduleFetchNames = useCallback((uid: string) => {
    if (knownUidsRef.current.has(uid)) return;
    // Throttle retries for UIDs that previously returned no name:
    // wait at least 60s between attempts to avoid bursty repeated calls.
    const lastAttempt = uidLastAttemptRef.current[uid] ?? 0;
    if (Date.now() - lastAttempt < 60_000) return;
    pendingUidFetchRef.current.add(uid);
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(() => {
      const uids = Array.from(pendingUidFetchRef.current);
      if (uids.length === 0) return;
      pendingUidFetchRef.current.clear();
      const now = Date.now();
      uids.forEach((u) => { uidLastAttemptRef.current[u] = now; });
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
          // Chỉ mark "đã biết" cho UID có tên thật — UID không có tên sẽ được retry sau 60s
          // (ví dụ: user chưa mở chat, tinodeUserId chưa được lưu vào DB)
          const resolvedUids = new Set(Object.keys(data.names ?? {}));
          uids.forEach((u) => {
            if (resolvedUids.has(u)) knownUidsRef.current.add(u);
          });
        })
        .catch(() => {
          // On error, don't mark as known — will retry after throttle window
        });
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
    if (pendingTopicsRef.current.has(topic)) return;
    const msgs = messagesRef.current[topic];
    const maxSeq = msgs && msgs.length > 0 ? Math.max(...msgs.map((m) => m.seq)) : 0;
    const saved = Math.max(readSeqRef.current[topic] ?? 0, sessionClearedRef.current[topic] ?? 0);
    if (maxSeq > saved) {
      readSeqRef.current[topic] = maxSeq;
      sessionClearedRef.current[topic] = maxSeq;
      try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
      wsSend({ note: { topic, what: "read", seq: maxSeq } });
    }
  }, [wsSend]);

  // Low-level: attach to a topic's WS stream without treating it as "the user opened
  // this conversation". Used for background/real-time-delivery subscribes (e.g. a P2P
  // peer just came online) where we must attach to receive live `data` packets, but the
  // user has NOT actually looked at the conversation — so unread must NOT be cleared,
  // currentTopic must NOT change, and no note{read} should be sent.
  const subscribeSilent = useCallback((topic: string) => {
    if (!authedRef.current) return;
    const subId = nextId();
    subBaselineSeqRef.current[topic] = topicsSeqRef.current[topic] ?? 0;
    if (topic.startsWith("grp")) {
      pendingGroupSubsByIdRef.current[subId] = topic;
    }
    wsSend({
      sub: {
        id: subId,
        topic,
        get: { what: "desc data sub", data: { limit: 50 } },
      },
    });
    // Still mark as "attached" so we don't re-trigger this auto-subscribe repeatedly,
    // but deliberately do NOT touch currentTopic/unread/read-notes here.
    openedTopicsRef.current.add(topic);
  }, [wsSend, nextId]);

  const subscribe = useCallback((topic: string) => {
    if (!authedRef.current) return;
    const subId = nextId();
    // Snapshot the current highest known seq for this topic before we subscribe.
    // Data messages arriving with seq <= this baseline are "historical" and should not
    // increment the unread badge (meta.sub already counted them in computedUnread).
    subBaselineSeqRef.current[topic] = topicsSeqRef.current[topic] ?? 0;
    // Track group topic subs so we can detect stale-topic failures (4xx ctrl)
    if (topic.startsWith("grp")) {
      pendingGroupSubsByIdRef.current[subId] = topic;
    }
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
        pendingPubsByIdRef.current[id] = { topic, head: interesting, content };
      }
    }
    // Always track content for pub retry on failure (even when no special head)
    if (!pendingPubsByIdRef.current[id]) {
      pendingPubsByIdRef.current[id] = { topic, head: {}, content };
    }
    wsSend({ pub });
  }, [wsSend, nextId]);

  const uploadFile = useCallback(async (file: File): Promise<{ ref: string; size: number; mime: string; name: string } | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAuthToken();
      const res = await fetch("/api/chat/upload-file", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
          }
        }
        readSeqRef.current = stored ? JSON.parse(stored) : {};
      } catch { readSeqRef.current = {}; }
      // Load user-specific topicsSeq cache (persisted so F5 doesn't reset seq to 0)
      const seqKey = `tinode_topics_seq_${login}`;
      topicsSeqKeyRef.current = seqKey;
      try {
        const ss = localStorage.getItem(seqKey);
        topicsSeqRef.current = ss ? JSON.parse(ss) : {};
      } catch { topicsSeqRef.current = {}; }
      // Load user-specific last-content cache
      const contentKey = `tinode_last_content_${login}`;
      lastContentCacheKeyRef.current = contentKey;
      try {
        const cs = localStorage.getItem(contentKey);
        lastContentCacheRef.current = cs ? JSON.parse(cs) : {};
      } catch { lastContentCacheRef.current = {}; }
    }

    // Block if a connection attempt is already in progress
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      return;
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

    // Reset guard so the new socket's login success can call doSubscribeMe.
    // Must happen here (not only in onclose) because force-close paths set
    // onclose = null and bypass the onclose reset above.
    doSubscribeMeCalledRef.current = false;

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
      // Prevent duplicate subscriptions on the same WS connection (e.g. multiple
      // login-success ctrl messages from stale message queues or reconnect races).
      if (doSubscribeMeCalledRef.current) {
        return;
      }
      doSubscribeMeCalledRef.current = true;
      authedRef.current = true;
      setAuthed(true);
      setHasEverAuthed(true);
      // Reset allowlist refs on every (re)connect so stale state from a previous
      // connection can't cause meta.sub to skip topics or allow ghost topics.
      // Tinode's meta.sub handler blocks ALL grp* topics until this is set back to
      // true (by the my-channels .then() below), ensuring we never show unauthorized
      // topics even during reconnect races.
      allowedGroupTopicsLoadedRef.current = false;
      allowedGroupTopicsRef.current = new Set();
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
      // staleTime: 0 ensures every (re)connect fetches fresh data — stale cache with
      // fewer channels would leave topics blocked by the allowlist until a pres event
      // triggers an out-of-band refresh (the original "1 channel shows" bug).
      // Use wsSend (not ws.send) so we always write to the live socket via wsRef.
      queryClient.fetchQuery<{ channels?: { topicId: string; className: string; isCustomGroup?: boolean; isDirectMessage?: boolean; groupId?: string }[] }>({
        queryKey: ["/api/chat/my-channels"],
        queryFn: async () => {
          const token = getAuthToken();
          const r = await fetch("/api/chat/my-channels", {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          return r.json();
        },
        staleTime: 0,
        gcTime: 10 * 60 * 1000,
      })
        .then((data) => {
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
            // Pre-populate topic metadata so the sidebar shows label before Tinode responds.
            // Always MERGE groupId / isCustomGroup / isDirectMessage even if topic already
            // exists (Tinode meta.sub may arrive first and add it without these fields).
            setTopics(prev => {
              const exists = prev.find(t => t.topic === ch.topicId);
              if (exists) {
                // Only update if something meaningful changed to avoid spurious re-renders.
                // Also check name so DM channels always show the OTHER person's name from
                // the backend, even if Tinode's meta.sub arrived first with the wrong name.
                const backendName = ch.isDirectMessage ? ch.className : (exists.name ?? ch.className);
                if (
                  exists.name === backendName &&
                  exists.groupId === ch.groupId &&
                  exists.isCustomGroup === (ch.isCustomGroup ?? false) &&
                  exists.isDirectMessage === (ch.isDirectMessage ?? false)
                ) return prev;
                return prev.map(t =>
                  t.topic === ch.topicId
                    ? { ...t, name: backendName, groupId: ch.groupId, isCustomGroup: ch.isCustomGroup ?? false, isDirectMessage: ch.isDirectMessage ?? false }
                    : t
                );
              }
              return [...prev, {
                topic: ch.topicId,
                name: ch.className,
                unread: 0,
                isCustomGroup: ch.isCustomGroup ?? false,
                isDirectMessage: ch.isDirectMessage ?? false,
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
            // Track so stale-topic 4xx ctrl can trigger recreation
            if (ch.topicId.startsWith("grp")) {
              pendingGroupSubsByIdRef.current[autoSubId] = ch.topicId;
            }
            wsSend({
              sub: {
                id: autoSubId,
                topic: ch.topicId,
                // Explicitly request JRWP so Tinode grants write access from defacs.auth.
                // Without this, some Tinode versions may default to read-only for new subscribers.
                ...(ch.topicId.startsWith("grp") && !ch.isCustomGroup ? { set: { sub: { mode: "JRWP" } } } : {}),
                get: { what: "desc data sub", data: { limit: 50 } },
              },
            });
          }
        })
        .catch(() => {});
    };

    ws.onopen = () => {
      setConnected(true);
      lastRxRef.current = Date.now();
      const hiId = nextId();
      hiIdRef.current = hiId;
      ws.send(JSON.stringify({
        hi: { id: hiId, ver: "0.25", ua: "EduManage/1.0" },
      }));
      // Start keepalive ping. Tinode treats a single "1" character as an
      // application-level no-op (matches the official Tinode JS SDK behavior).
      // Without this, the connection drops after ~60s of idle and the user
      // sees a recurring "Đang kết nối tới máy chủ chat…" banner.
      // 20s interval gives margin even for proxies with ~30s idle timeouts.
      if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          // Already closing/closed — onclose handler will schedule reconnect.
          return;
        }
        // Zombie detection: if we haven't heard anything from the server for
        // a long time even though the socket says OPEN (network change, OS
        // sleep, mobile radio handoff), force-close so onclose triggers a
        // fresh reconnect instead of leaving the user stuck on the banner.
        const sinceRx = Date.now() - lastRxRef.current;
        if (sinceRx > 180_000) {
          console.warn("[Tinode WS] reconnect trigger", {
            source: "zombie-detection",
            sinceLastRxMs: sinceRx,
            time: new Date().toISOString(),
          });
          try { ws.close(); } catch { /* ignore */ }
          return;
        }
        try {
          ws.send("1");
        } catch (err) {
          console.warn("[Tinode WS] Keepalive send failed — force closing", err);
          try { ws.close(); } catch { /* ignore */ }
        }
      }, 20000);
    };

    ws.onclose = (e) => {
      const sinceLastRx = Date.now() - lastRxRef.current;
      console.warn("[Tinode WS] CLOSE", {
        code: e.code,
        reason: e.reason,
        wasClean: e.wasClean,
        time: new Date().toISOString(),
        sinceLastRxMs: sinceLastRx,
      });
      setConnected(false);
      setAuthed(false);
      authedRef.current = false;
      // Allow doSubscribeMe to run again on the next reconnect
      doSubscribeMeCalledRef.current = false;
      if (keepaliveTimerRef.current) {
        clearInterval(keepaliveTimerRef.current);
        keepaliveTimerRef.current = null;
      }
      // Exponential backoff: 1s, 2s, 4s, 8s, capped at 15s.
      // Reset to 0 once a new socket reaches the authed state (in login ctrl handler).
      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (credRef.current) {
          connect(credRef.current);
        }
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("[Tinode WS] ERROR", { event: e, time: new Date().toISOString() });
      setConnected(false);
    };

    ws.onmessage = (event) => {
      // Update last-rx timestamp for ANY frame (including the "0" pong reply
      // some Tinode versions send back to keepalive pings). This is what the
      // zombie-detection logic in the keepalive interval reads from.
      lastRxRef.current = Date.now();
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
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
          }
          // Successful ack: clear retry counter for this topic.
          delete pubRetryCountRef.current[pending.topic];
          delete pendingPubsByIdRef.current[id];
        }

        // pub FAILURE (4xx only, not 5xx) → not subscribed or topic stale.
        // Re-subscribe then retry once. Max 2 retries per topic to avoid infinite loops.
        if (id && code >= 400 && code < 500 && pendingPubsByIdRef.current[id]) {
          const { topic: failedPubTopic, head: failedHead, content: failedContent } = pendingPubsByIdRef.current[id];
          delete pendingPubsByIdRef.current[id];
          const attempts = pubRetryCountRef.current[failedPubTopic] ?? 0;
          if (attempts < 2 && failedContent !== undefined) {
            pubRetryCountRef.current[failedPubTopic] = attempts + 1;
            console.warn(`[TINODE] pub rejected code=${code} topic=${failedPubTopic} attempt=${attempts + 1}/2 — re-subscribing and retrying`);
            const resubId = nextId();
            // NOTE: Do NOT add resubId to pendingGroupSubsByIdRef here.
            // This re-sub is a session refresh for a pub failure, NOT stale-topic detection.
            // Adding it would cause the stale-topic handler to fire if re-sub fails, removing
            // the class group from the sidebar even though the topic still exists in Tinode.
            wsSend({ sub: { id: resubId, topic: failedPubTopic, get: { what: "desc data sub", data: { limit: 50 } } } });
            const timer = setTimeout(() => {
              const retryId = nextId();
              const retryPub: Record<string, any> = { id: retryId, topic: failedPubTopic, noecho: false, content: failedContent };
              if (failedHead && Object.keys(failedHead).length > 0) {
                retryPub.head = { mime: typeof failedContent === "string" ? "text/plain" : "text/x-drafty", ...failedHead };
              }
              // Store retry in pending WITHOUT content — prevents further retries on this message.
              pendingPubsByIdRef.current[retryId] = { topic: failedPubTopic, head: failedHead ?? {} };
              wsSend({ pub: retryPub });
            }, 800);
            pubRetryTimersRef.current.push(timer);
          } else {
            console.warn(`[TINODE] pub permanently failed code=${code} topic=${failedPubTopic} — max retries reached or non-retriable`);
            delete pubRetryCountRef.current[failedPubTopic];
          }
        }

        // sub SUCCESS for a grp* topic → clean up the tracking ref and reset stale retry counter.
        if (id && code >= 200 && code < 300 && pendingGroupSubsByIdRef.current[id]) {
          const successTopic = pendingGroupSubsByIdRef.current[id];
          delete pendingGroupSubsByIdRef.current[id];
          // Reset stale retry counter on success so the budget is available for future genuine failures
          delete staleRetryCountRef.current[successTopic];
        }

        // sub FAILURE (4xx only) for a group topic → stale tinodeTopicId in DB.
        // Force backend to recreate the topic via my-channels refresh, remove stale
        // entry from the sidebar so the user doesn't see a broken channel.
        if (id && code >= 400 && code < 500 && pendingGroupSubsByIdRef.current[id]) {
          const staleTopic = pendingGroupSubsByIdRef.current[id];
          delete pendingGroupSubsByIdRef.current[id];
          // Clean up any pending sub note for this id
          if (pendingSubNotesRef.current[id]) {
            pendingTopicsRef.current.delete(pendingSubNotesRef.current[id].topic);
            delete pendingSubNotesRef.current[id];
          }
          console.warn(`[TINODE] sub failed code=${code} topic=${staleTopic} — forcing my-channels refresh to recreate`);
          // Remove stale topic from sidebar and allowlist
          setTopics(prev => prev.filter(t => t.topic !== staleTopic));
          allowedGroupTopicsRef.current.delete(staleTopic);
          // Guard: max 3 stale-topic retries per topicId to prevent infinite loops
          const prevRetries = staleRetryCountRef.current[staleTopic] ?? 0;
          if (prevRetries >= 3) {
            console.warn(`[TINODE] stale-topic retry limit reached for ${staleTopic} — giving up`);
            return;
          }
          staleRetryCountRef.current[staleTopic] = prevRetries + 1;
          // Ask backend to recreate (verifyAndSetTopicDefacs will detect it's missing → createClassTopic)
          const token = getAuthToken();
          fetch("/api/chat/my-channels", {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then(r => r.json())
            .then((data: { channels?: { topicId: string; className: string; isCustomGroup?: boolean; isDirectMessage?: boolean; groupId?: string }[] }) => {
              if (!Array.isArray(data.channels)) return;
              for (const ch of data.channels) {
                if (!ch.topicId) continue;
                // Skip topics already in the allowlist (already subscribed or re-subscribed)
                if (allowedGroupTopicsRef.current.has(ch.topicId)) continue;
                allowedGroupTopicsRef.current.add(ch.topicId);
                setTopics(prev => {
                  const exists = prev.find(t => t.topic === ch.topicId);
                  if (exists) return prev;
                  return [...prev, { topic: ch.topicId, name: ch.className, unread: 0, isCustomGroup: ch.isCustomGroup ?? false, isDirectMessage: ch.isDirectMessage ?? false, groupId: ch.groupId }];
                });
                const newSubId = nextId();
                subBaselineSeqRef.current[ch.topicId] = topicsSeqRef.current[ch.topicId] ?? 0;
                pendingGroupSubsByIdRef.current[newSubId] = ch.topicId;
                // For class group topics (not custom groups), request JRWP mode explicitly
                // so Tinode grants write access from defacs.auth for new/re-subscribing users.
                const isClassGroup = ch.topicId.startsWith("grp") && !ch.isCustomGroup;
                wsSend({ sub: { id: newSubId, topic: ch.topicId, ...(isClassGroup ? { set: { sub: { mode: "JRWP" } } } : {}), get: { what: "desc data sub", data: { limit: 50 } } } });
  
              }
            })
            .catch(() => {});
        }

        // hi accepted → send login
        if (id === hiIdRef.current && code >= 200 && code < 300) {
          doLogin();
        }

        // login response
        if (id === loginIdRef.current) {
          if (code === 200 || code === 201) {
            // Successfully (re)connected — reset backoff so the next disconnect
            // retries quickly instead of waiting the previous accumulated delay.
            reconnectAttemptRef.current = 0;
            // Extract and register Tinode UID
            const tinodeUid: string | undefined = msg.ctrl.params?.user;
            if (tinodeUid) {
              setMyUid(tinodeUid);
              // Register this UID with backend only if it changed (skip on every reconnect)
              if (myUidRef.current !== tinodeUid) {
                myUidRef.current = tinodeUid;
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
            wsSend({ note: { topic: pendingTopic, what: "read", seq: newRead } });
            const serverSeqNow = topicsSeqRef.current[pendingTopic] ?? 0;
            // Zero badge when:
            //   !exact  → user explicitly opened the channel (always zero)
            //   exact   → page-load restore: only zero if serverSeqNow is known AND localRead covers it.
            //             If serverSeqNow=0 (meta.sub hasn't arrived yet), do NOT zero —
            //             meta.sub will set the correct unread count when it arrives.
            if (!exact || (serverSeqNow > 0 && newRead >= serverSeqNow)) {
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
              // Chỉ xử lý group topics (grp*). P2P topics (usr*) là legacy — DM giờ dùng grp*.
              const isGroup = topicId.startsWith("grp");
              if (!isGroup) continue;
              // Backend authorizes which group topics this user may see.
              // If the allowlist hasn't loaded yet, skip ALL grp topics — they will be
              // populated by my-channels instead. This prevents ghost topics from appearing
              // in the race window before my-channels resolves.
              if (!allowedGroupTopicsLoadedRef.current) continue;
              // Once loaded, only allow topics explicitly authorized by the backend.
              if (!allowedGroupTopicsRef.current.has(topicId)) continue;

              const name: string = s.public?.fn ?? s.public?.name ?? topicId;
              const existing = map.get(topicId);
              // Compute unread using local read-seq so stale server pushes don't restore old counts
              const serverSeq: number = s.seq ?? 0;
              // Always keep topicsSeqRef up to date so subscribe() can send note{read} immediately
              if (serverSeq > 0) {
                topicsSeqRef.current[topicId] = Math.max(topicsSeqRef.current[topicId] ?? 0, serverSeq);
                try { localStorage.setItem(topicsSeqKeyRef.current, JSON.stringify(topicsSeqRef.current)); } catch {}
              }
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
              // Regex nhận biết Tinode UID (u_xxx hoặc u3_xxx, v.v.)
              const isTinodeUid = /^u\d*_[0-9a-f]{8,}$/i.test(name);
              // For DM topics: always use the name from /api/chat/my-channels (existing.name),
              // never let Tinode's raw fn (which is the dmKey UUID pair) override it.
              // DM topics: always use the name from /api/chat/my-channels (other person's name).
              const resolvedName = existing?.isDirectMessage
                ? (existing.name ?? name)
                : (existing?.name ?? name);
              map.set(topicId, {
                topic:           topicId,
                name:            resolvedName,
                unread:          computedUnread,
                lastTs:          s.touched ?? existing?.lastTs,
                lastContent:     existing?.lastContent ?? (cachedContent?.content),
                isCustomGroup:   existing?.isCustomGroup ?? false,
                isDirectMessage: existing?.isDirectMessage ?? false,
                groupId:         existing?.groupId,
              } as any);
            }
            // Persist any updates to localStorage outside the setState callback
            if (localStorageDirty) {
              try { localStorage.setItem(readSeqKeyRef.current, JSON.stringify(readSeqRef.current)); } catch {}
            }
            return Array.from(map.values());
          });

          // Cập nhật userNames từ meta.sub (tên user trong các sub entries)
          const names: Record<string, string> = {};
          for (const s of msg.meta.sub) {
            const fn: string | undefined = s.public?.fn;
            if (s.user && fn && !/^u\d*_[0-9a-f]{8,}$/i.test(fn)) {
              names[s.user] = fn;
            }
          }
          if (Object.keys(names).length > 0) {
            setUserNames((prev) => ({ ...prev, ...names }));
          }
        }

        // Cập nhật tên topic từ meta.desc khi subscribe (chỉ group topics grp*)
        if (msg.meta.desc && msg.meta.topic) {
          const topicId: string = msg.meta.topic;
          if (topicId.startsWith("grp")) {
            const name: string = msg.meta.desc.public?.fn ?? topicId;
            setTopics((prev) => {
              const map = new Map(prev.map((t) => [t.topic, t]));
              const existing = map.get(topicId);
              // DM topics: always keep the name from /api/chat/my-channels (other person's name).
              const displayName = existing?.isDirectMessage ? (existing.name ?? name) : name;
              map.set(topicId, {
                topic:           topicId,
                name:            displayName,
                unread:          existing?.unread ?? 0,
                lastTs:          existing?.lastTs,
                lastContent:     existing?.lastContent,
                isCustomGroup:   existing?.isCustomGroup ?? false,
                isDirectMessage: existing?.isDirectMessage ?? false,
                groupId:         existing?.groupId,
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
        }
        // Track the latest seq so subscribe() can send note{read} immediately when needed
        topicsSeqRef.current[topic] = Math.max(topicsSeqRef.current[topic] ?? 0, seq);
        try { localStorage.setItem(topicsSeqKeyRef.current, JSON.stringify(topicsSeqRef.current)); } catch {}
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
        // Capture prevCachedSeq BEFORE updating the cache — used below to guard setTopics.
        // This prevents historical backfill messages (seq < cached seq) from overwriting
        // the correct "last message" preview that was restored from localStorage on page load.
        const prevCachedSeq: number = (prevCached as any)?.seq ?? 0;
        const shouldUpdatePreview = !prevCached || seq >= prevCachedSeq;
        if (shouldUpdatePreview) {
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
                  // Only update the preview text when this message is genuinely newer than
                  // what is already cached. Historical backfill messages (seq < prevCachedSeq)
                  // must NOT overwrite the correct last-message that was restored from
                  // localStorage on page load — that would show seq=1 instead of the latest.
                  ...(shouldUpdatePreview ? { lastContent: contentText } : {}),
                  unread: topicIsOpen ? 0 : (isNewMessage ? t.unread + 1 : t.unread),
                }
              : t
          )
        );
      }

      // ── pres: presence notification from "me" topic ──────────────────────────
      // Tinode sends pres {topic:"me", what:"msg", src, seq} to user B when user A
      // publishes a message. Without this handler, user B only sees the message
      // after manually opening the chat — they miss real-time delivery entirely.
      if (msg.pres && msg.pres.topic === "me") {
        const { src, what, seq } = msg.pres as { src?: string; what?: string; seq?: number };

        if (what === "msg" && src && typeof seq === "number") {
          // Keep topicsSeqRef current so badge math is accurate
          topicsSeqRef.current[src] = Math.max(topicsSeqRef.current[src] ?? 0, seq);
          try { localStorage.setItem(topicsSeqKeyRef.current, JSON.stringify(topicsSeqRef.current)); } catch {}

          const isOpen = activeWindowsRef.current.has(src) || currentTopicRef.current === src;

          // Bump unread badge for topics not currently in focus and float to top
          if (!isOpen) {
            const nowTs = new Date().toISOString();
            setTopics((prev) => {
              const existing = prev.find((t) => t.topic === src);
              if (existing) {
                return prev.map((t) =>
                  t.topic === src ? { ...t, unread: t.unread + 1, lastTs: nowTs } : t
                );
              }
              // Unknown grp* topic (e.g. someone just added us to a DM/group):
              // Refresh my-channels so the new topic appears in the sidebar.
              // P2P topics (usr*) are legacy — ignore them entirely.
              if (src.startsWith("grp") && !allowedGroupTopicsRef.current.has(src)) {
                const token = typeof (window as any).__getAuthToken === "function"
                  ? (window as any).__getAuthToken()
                  : null;
                fetch("/api/chat/my-channels", {
                  credentials: "include",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                  .then(r => r.json())
                  .then((data: { channels?: { topicId: string; className: string; isCustomGroup?: boolean; isDirectMessage?: boolean; groupId?: string }[] }) => {
                    for (const ch of data.channels ?? []) {
                      if (allowedGroupTopicsRef.current.has(ch.topicId)) continue;
                      allowedGroupTopicsRef.current.add(ch.topicId);
                      setTopics(prev2 => {
                        if (prev2.some(t => t.topic === ch.topicId)) return prev2;
                        return [...prev2, { topic: ch.topicId, name: ch.className, unread: ch.topicId === src ? 1 : 0, isCustomGroup: ch.isCustomGroup ?? false, isDirectMessage: ch.isDirectMessage ?? false, groupId: ch.groupId }];
                      });
                      const newSubId = nextId();
                      wsSend({ sub: { id: newSubId, topic: ch.topicId, get: { what: "desc data sub", data: { limit: 50 } } } });
                    }
                  })
                  .catch(() => {});
              }
              return prev;
            });
          }

        }

        // "on"/"off" = peer came online/offline (no action needed beyond logging)
      }
    };
  }, [nextId, wsSend, setMessagesSynced]);

  useEffect(() => {
    if (!credentials) return;
    credRef.current = credentials;
    // Guard: only call connect() when the login actually changes.
    // If `connect` callback gets a new identity between renders (due to
    // React re-renders) but credentials haven't changed, we skip to avoid
    // opening a second socket while the first is still authenticating.
    if (lastEffectLoginRef.current === credentials.login) {
      return;
    }
    lastEffectLoginRef.current = credentials.login;
    connect(credentials);

    // Recover quickly when the network comes back, when the user returns to
    // the tab (browsers throttle setInterval to once / minute on hidden tabs,
    // so the keepalive may have missed its window), or when the OS wakes up.
    // In any of these cases the socket can be a "zombie" — readyState=OPEN
    // but actually dead. Force-close and let onclose schedule the reconnect.
    const recover = (reason: string) => {
      const ws = wsRef.current;
      if (!ws) {
        if (credRef.current) connect(credRef.current);
        return;
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        // If we know we haven't received traffic recently, the socket is
        // almost certainly dead — kick it so we reconnect immediately.
        // Threshold must be > keepalive interval (20s) to avoid force-closing
        // a healthy connection just because Tinode doesn't pong keepalive pings.
        if (Date.now() - lastRxRef.current > 45_000) {
          console.warn(`[Tinode WS] recover(${reason}) — closing stale socket (no rx > 45s)`);
          // Reset backoff and clear pending retry so we reconnect right away.
          reconnectAttemptRef.current = 0;
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          try { ws.close(); } catch { /* ignore */ }
        }
      } else if (credRef.current) {
        // CLOSING / CLOSED — try a fresh connect now.
        reconnectAttemptRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        connect(credRef.current);
      }
    };

    const onOnline = () => recover("online");
    const onVisible = () => {
      if (document.visibilityState === "visible") recover("visible");
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      // Cancel any pending pub retry timers so we don't fire into a closed socket
      for (const t of pubRetryTimersRef.current) clearTimeout(t);
      pubRetryTimersRef.current = [];
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      // Reset so the next mount/login can call connect() even with the same login
      lastEffectLoginRef.current = null;
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


  // Cho phép caller đăng ký tên hiển thị ngay lập tức (ví dụ: sau khi mở P2P chat)
  const registerName = useCallback((uid: string, name: string) => {
    if (!uid || !name) return;
    setUserNames((prev) => (prev[uid] === name ? prev : { ...prev, [uid]: name }));
  }, []);

  return {
    connected,
    authed,
    hasEverAuthed,
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
    registerName,
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
