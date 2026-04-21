import { useState, useEffect, useRef, useCallback } from "react";
import { FileViewer } from "@/components/ui/file-viewer";
import { createPortal } from "react-dom";
import {
  MessageCircle, Send, WifiOff, Loader2, Search, X,
  Minus, ChevronDown, UserRound, Users, Plus, ArrowLeft,
  FileText, Download, Paperclip,
} from "lucide-react";
import { SiMessenger } from "react-icons/si";
import { getAuthToken, apiRequest } from "@/lib/queryClient";
import { useTinodeContext, UseTinodeResult } from "@/hooks/use-tinode";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDate(ts: string) {
  try {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hôm nay";
    if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const avatarGradients = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-600",
  "from-orange-400 to-rose-500",
  "from-pink-500 to-fuchsia-600",
  "from-amber-400 to-orange-500",
  "from-sky-500 to-indigo-600",
  "from-rose-500 to-pink-600",
];

function gradientForUser(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return avatarGradients[Math.abs(h) % avatarGradients.length];
}

function TopicAvatar({ name, topicId, size = "sm" }: { name: string; topicId: string; size?: "xs" | "sm" | "md" }) {
  const g = gradientForUser(topicId);
  const sz = size === "xs" ? "w-7 h-7 text-[10px]" : size === "md" ? "w-10 h-10 text-sm" : "w-9 h-9 text-xs";
  return (
    <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0", g, sz)}>
      {getInitials(name)}
    </div>
  );
}

function UserAvatar({ name, uid, size = "sm" }: { name: string; uid: string; size?: "xs" | "sm" }) {
  const g = gradientForUser(uid);
  const sz = size === "xs" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-xs";
  return (
    <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0", g, sz)}>
      {getInitials(name)}
    </div>
  );
}

// ─── Minimized Bubble (floating circle on the right side) ─────────────────────

function MinimizedBubble({
  topicId,
  topicName,
  unread,
  stackIndex,
  onRestore,
  onClose,
}: {
  topicId: string;
  topicName: string;
  unread?: number;
  stackIndex: number;
  onRestore: (topicId: string) => void;
  onClose: (topicId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const bottomOffset = 80 + stackIndex * 68;

  return (
    <div
      className="fixed z-[9998] flex items-center justify-end"
      style={{ bottom: bottomOffset, right: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Slide-out close button on hover */}
      <div
        className={cn(
          "flex items-center transition-all duration-200 overflow-hidden",
          hovered ? "w-8 opacity-100 mr-1" : "w-0 opacity-0"
        )}
      >
        <button
          onClick={() => onClose(topicId)}
          data-testid={`chat-bubble-close-${topicId}`}
          className="w-6 h-6 rounded-full bg-gray-700/80 hover:bg-red-500 flex items-center justify-center transition-colors shadow"
        >
          <X className="h-3 w-3 text-white" />
        </button>
      </div>

      {/* Avatar circle */}
      <div className="relative" style={{ marginRight: hovered ? 8 : 0, transition: "margin 0.2s ease" }}>
        <button
          onClick={() => onRestore(topicId)}
          data-testid={`chat-bubble-restore-${topicId}`}
          className={cn(
            "w-14 h-14 rounded-full shadow-xl border-[3px] border-white dark:border-muted",
            "flex items-center justify-center text-white font-bold text-base",
            "hover:scale-110 active:scale-95 transition-transform focus:outline-none",
            "bg-gradient-to-br",
            gradientForUser(topicId)
          )}
          title={topicName}
        >
          {getInitials(topicName)}
        </button>
        {unread != null && unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow border-2 border-white pointer-events-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Mini content renderer (handles structured Drafty messages) ───────────────

function renderMiniContent(content: any, onOpenViewer?: (url: string, name: string) => void): React.ReactNode {
  if (typeof content === "string") return <span className="break-words">{content}</span>;
  if (typeof content !== "object" || content === null) return <span>{String(content ?? "")}</span>;

  const fmt: any[] = content.fmt ?? [];
  const ent: any[] = content.ent ?? [];

  // Image (IM)
  const imgFmt = fmt.find((f: any) => f.tp === "IM");
  if (imgFmt !== undefined) {
    const data = ent[imgFmt.key ?? 0]?.data;
    if (data) {
      let src: string | null = null;
      if (data.val) src = `data:${data.mime ?? "image/jpeg"};base64,${data.val}`;
      else {
        const ref = data.ref ?? data.url ?? null;
        if (ref) src = ref.startsWith("/v0/file/s/") ? `/api/chat/file?path=${encodeURIComponent(ref)}` : ref.startsWith("http") ? ref : ref;
      }
      if (src) return (
        <img src={src} alt={data.name ?? "ảnh"} className="max-w-[220px] max-h-[160px] rounded-lg object-cover cursor-pointer" onClick={() => onOpenViewer ? onOpenViewer(src!, data.name ?? "ảnh") : window.open(src!, "_blank")} />
      );
    }
  }

  // Attachment (EX)
  const exFmt = fmt.find((f: any) => f.tp === "EX");
  if (exFmt !== undefined) {
    const data = ent[exFmt.key ?? 0]?.data;
    if (data) {
      const { name, mime, val, url, ref } = data;
      const rawRef = url ?? ref ?? null;
      const href = rawRef
        ? (rawRef.startsWith("/v0/file/s/") ? `/api/chat/file?path=${encodeURIComponent(rawRef)}` : rawRef.startsWith("http") ? rawRef : rawRef)
        : (val ? `data:${mime ?? "application/octet-stream"};base64,${val}` : null);

      if (mime?.startsWith("video/") && href) return (
        <div className="rounded-lg overflow-hidden max-w-[260px]">
          <video
            src={href}
            controls
            className="w-full max-h-[180px] rounded-lg"
            preload="metadata"
          />
          <p className="text-[10px] opacity-60 mt-0.5 truncate">{name}</p>
        </div>
      );
      if (mime?.startsWith("audio/") && href) return (
        <div style={{ maxWidth: "210px" }}>
          <p className="text-[11px] font-medium truncate mb-1">{name}</p>
          <audio src={href} controls preload="metadata" style={{ width: "210px", height: "30px" }} />
        </div>
      );
      const handleClick = () => {
        if (!href) return;
        const a = document.createElement("a");
        a.href = href;
        a.download = name ?? "file";
        a.click();
      };
      return (
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleClick}>
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs truncate max-w-[160px]">{name ?? "Tệp đính kèm"}</span>
          <Download className="h-3 w-3 shrink-0 opacity-60" />
        </div>
      );
    }
  }

  // Fallback plain text
  return <span className="break-words">{content.txt ?? ""}</span>;
}

// ─── Chat Window (single conversation popup) ──────────────────────────────────

const WINDOW_WIDTH = 328;
const WINDOW_HEIGHT = 460;
const WINDOW_GAP = 12;

function ChatWindow({
  topicId,
  topicName,
  messages,
  myUid,
  myLogin,
  userNames,
  onSend,
  onClose,
  stackIndex,
  onToggleMinimize,
  onOpenViewer,
}: {
  topicId: string;
  topicName: string;
  messages: any[];
  myUid: string | null;
  myLogin: string | null;
  userNames: Record<string, string>;
  onSend: (topic: string, content: string | Record<string, any>) => void;
  onClose: (topic: string) => void;
  stackIndex: number;
  onToggleMinimize: (topic: string) => void;
  onOpenViewer: (url: string, name: string) => void;
}) {
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, topicId]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const rightOffset = WINDOW_GAP + stackIndex * (WINDOW_WIDTH + WINDOW_GAP);

  function handleSend() {
    if (!input.trim()) return;
    onSend(topicId, input.trim());
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const MAX_SIZE = file.type.startsWith("video/") ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
    const MAX_LABEL = file.type.startsWith("video/") ? "200MB" : "50MB";
    if (file.size > MAX_SIZE) {
      toast({ title: "File quá lớn", description: `Chỉ hỗ trợ tối đa ${MAX_LABEL}`, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const token = getAuthToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/chat/upload-file", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error("Upload thất bại");
      const { ref, mime, name, size } = await res.json();

      const isImage = mime?.startsWith("image/");
      const drafty = isImage
        ? { txt: " ", fmt: [{ at: 0, len: 1, tp: "IM" }], ent: [{ tp: "IM", data: { mime, name, ref, size } }] }
        : { txt: " ", fmt: [{ at: 0, len: 1, tp: "EX" }], ent: [{ tp: "EX", data: { mime, name, ref, size } }] };

      onSend(topicId, drafty);
    } catch {
      toast({ title: "Lỗi upload", description: "Không thể gửi file. Thử lại.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  // Group messages by date
  type Msg = (typeof messages)[0];
  const groups: { date: string; msgs: Msg[] }[] = [];
  let lastDate = "";
  for (const m of messages) {
    const d = formatDate(m.ts);
    if (d !== lastDate) { groups.push({ date: d, msgs: [m] }); lastDate = d; }
    else groups[groups.length - 1].msgs.push(m);
  }

  return (
    <div
      className="fixed z-[9998] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden border border-border/40"
      style={{
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        bottom: 0,
        right: rightOffset,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 shrink-0 cursor-pointer select-none"
        style={{ background: "linear-gradient(135deg, #1877f2 0%, #4f46e5 100%)" }}
      >
        <TopicAvatar name={topicName} topicId={topicId} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{topicName}</p>
          <p className="text-[10px] text-white/70 leading-none mt-0.5">{messages.length} tin nhắn</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={e => { e.stopPropagation(); onToggleMinimize(topicId); }}
            className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            data-testid={`chat-minimize-${topicId}`}
            title="Thu nhỏ"
          >
            <Minus className="h-3.5 w-3.5 text-white" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onClose(topicId); }}
            className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            data-testid={`chat-close-${topicId}`}
            title="Đóng"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Body */}
      <>
          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-white dark:bg-background">
            <div className="px-3 py-3 flex flex-col gap-0.5">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-20" />
                  <p className="text-xs">Hãy nhắn tin đầu tiên!</p>
                </div>
              ) : (
                groups.map(group => {
                  let prevFrom = "";
                  return (
                    <div key={group.date}>
                      <div className="flex items-center gap-2 my-3">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[10px] text-muted-foreground font-medium">{group.date}</span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>

                      {group.msgs.map((msg, idx) => {
                        const isMe = myUid ? msg.from === myUid : msg.from === myLogin;
                        const rawName = userNames[msg.from];
                        const displayName = isMe ? "Bạn"
                          : (rawName && rawName !== msg.from
                            ? rawName
                            : msg.from?.replace(/^usr/, "").slice(0, 8) || "?");


                        const isFirst = msg.from !== prevFrom;
                        prevFrom = msg.from;
                        const nextMsg = group.msgs[idx + 1];
                        const isLast = !nextMsg || nextMsg.from !== msg.from;

                        return (
                          <div
                            key={`${msg.seq}-${msg.ts}`}
                            className={cn(
                              "flex gap-1.5",
                              isMe ? "flex-row-reverse" : "flex-row",
                              isFirst ? "mt-3" : "mt-px"
                            )}
                          >
                            {/* Avatar */}
                            <div className="w-7 shrink-0 flex items-end">
                              {!isMe && isLast
                                ? <UserAvatar name={displayName} uid={msg.from} size="xs" />
                                : <div className="w-6" />
                              }
                            </div>

                            <div className={cn("flex flex-col max-w-[75%]", isMe ? "items-end" : "items-start")}>
                              {!isMe && isFirst && (
                                <span className="text-[10px] font-semibold text-muted-foreground mb-1 ml-1">
                                  {displayName}
                                </span>
                              )}
                              <div className={cn(
                                "px-3 py-2 text-sm leading-relaxed break-words",
                                isMe ? cn(
                                  "text-white",
                                  "bg-[#1877f2]",
                                  isFirst && isLast ? "rounded-[20px] rounded-br-[4px]" :
                                  isFirst ? "rounded-[20px] rounded-br-[4px]" :
                                  isLast ? "rounded-[20px] rounded-tr-[8px] rounded-br-[4px]" :
                                  "rounded-l-[20px] rounded-r-[8px]"
                                ) : cn(
                                  "bg-[#f0f2f5] dark:bg-muted text-foreground",
                                  isFirst && isLast ? "rounded-[20px] rounded-bl-[4px]" :
                                  isFirst ? "rounded-[20px] rounded-bl-[4px]" :
                                  isLast ? "rounded-[20px] rounded-tl-[8px] rounded-bl-[4px]" :
                                  "rounded-r-[20px] rounded-l-[8px]"
                                )
                              )}>
                                {renderMiniContent(msg.content, onOpenViewer)}
                              </div>
                              {isLast && (
                                <span className={cn("text-[10px] text-muted-foreground mt-1", isMe ? "mr-1" : "ml-1")}>
                                  {formatTime(msg.ts)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-border/30 bg-white dark:bg-background shrink-0">
            <div className="flex items-center gap-2 bg-[#f0f2f5] dark:bg-muted rounded-full px-3 py-2 focus-within:ring-2 focus-within:ring-[#1877f2]/30 transition-all">
              <button
                onClick={() => !isUploading && fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid={`chat-attach-${topicId}`}
                title="Đính kèm file"
                className="shrink-0 text-muted-foreground/60 hover:text-[#1877f2] transition-colors"
              >
                {isUploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Paperclip className="h-4 w-4" />
                }
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={handleFileChange}
                data-testid={`chat-file-input-${topicId}`}
              />
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Aa"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                data-testid={`chat-input-${topicId}`}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isUploading}
                data-testid={`chat-send-${topicId}`}
                className={cn(
                  "shrink-0 transition-all",
                  input.trim() && !isUploading ? "text-[#1877f2] hover:opacity-80 active:scale-90" : "text-muted-foreground/30"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
      </>
    </div>
  );
}

// ─── Conversation List Popup ──────────────────────────────────────────────────

interface UserSearchResult {
  userId: string;
  displayName: string;
  role: "staff" | "student";
  tinodeLogin: string;
  tinodeUid: string | null;
}

function ConversationList({
  topics,
  onSelect,
  onOpenP2P,
  onClose,
  connected,
  authed,
}: {
  topics: UseTinodeResult["topics"];
  onSelect: (topicId: string) => void;
  onOpenP2P: (targetUserId: string, displayName: string) => void;
  onClose: () => void;
  connected: boolean;
  authed: boolean;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"groups" | "people">("groups");
  const [view, setView] = useState<"list" | "create-group">("list");
  const [search, setSearch] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingP2P, setOpeningP2P] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create group state
  const [groupName, setGroupName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<UserSearchResult[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([]);
  const [creating, setCreating] = useState(false);
  const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Member search for create group — only re-runs when search text changes
  useEffect(() => {
    if (!memberSearch.trim()) { setMemberResults([]); return; }
    clearTimeout(memberSearchTimer.current!);
    setMemberSearching(true);
    memberSearchTimer.current = setTimeout(async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(memberSearch.trim())}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        // Filter out already-selected members using a ref snapshot to avoid re-triggering
        setSelectedMembers(current => {
          const selectedIds = new Set(current.map(m => m.userId));
          setMemberResults((data.users ?? []).filter((u: UserSearchResult) => !selectedIds.has(u.userId)));
          return current;
        });
      } catch { setMemberResults([]); }
      finally { setMemberSearching(false); }
    }, 300);
    return () => clearTimeout(memberSearchTimer.current!);
  }, [memberSearch]);

  function addMember(user: UserSearchResult) {
    setSelectedMembers(prev => [...prev, user]);
    // Keep search text & results visible — just remove this person from the list
    setMemberResults(prev => prev.filter(u => u.userId !== user.userId));
  }

  function removeMember(userId: string) {
    setSelectedMembers(prev => prev.filter(m => m.userId !== userId));
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || creating) return;
    setCreating(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/chat/groups", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: groupName.trim(),
          memberUserIds: selectedMembers.map(m => m.userId),
        }),
      });
      const data = await res.json();
      if (data.group?.tinodeTopicId) {
        toast({ title: "Đã tạo nhóm", description: `Nhóm "${data.group.name}" đã được tạo.` });
        onSelect(data.group.tinodeTopicId);
        onClose();
      } else {
        toast({ title: "Nhóm đã tạo", description: "Nhóm chat đã được lưu." });
        setView("list");
        setGroupName("");
        setSelectedMembers([]);
      }
    } catch {
      toast({ title: "Lỗi", description: "Không thể tạo nhóm.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  // Group & P2P topics từ conversations đang mở
  const groupTopics = topics
    .filter(t => t.topic !== "me" && !(t as any).isP2P)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (!a.lastTs && !b.lastTs) return 0;
      if (!a.lastTs) return 1;
      if (!b.lastTs) return -1;
      return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
    });

  const p2pTopics = topics
    .filter(t => (t as any).isP2P)
    .sort((a, b) => {
      if (!a.lastTs && !b.lastTs) return 0;
      if (!a.lastTs) return 1;
      if (!b.lastTs) return -1;
      return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
    });

  // Debounced user search
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (tab !== "people") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setUserResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(val.trim())}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setUserResults(data.users ?? []);
      } catch { setUserResults([]); }
      finally { setSearching(false); }
    }, 350);
  }, [tab]);

  // Khi chuyển tab "people", tự động search nếu có từ khóa
  useEffect(() => {
    if (tab === "people" && search.trim()) {
      handleSearchChange(search);
    }
  }, [tab]);

  async function handleOpenP2P(user: UserSearchResult) {
    setOpeningP2P(user.userId);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/chat/p2p/open", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetUserId: user.userId }),
      });
      const data = await res.json();
      const topicId = data.tinodeUid ?? data.tinodeLogin;
      if (topicId) {
        onOpenP2P(topicId, user.displayName);
        onClose();
      }
    } finally {
      setOpeningP2P(null);
    }
  }

  // Unread counts per tab
  const groupUnread = groupTopics.reduce((s, t) => s + (t.unread ?? 0), 0);
  const p2pUnread = p2pTopics.reduce((s, t) => s + (t.unread ?? 0), 0);

  return (
    <div
      className="fixed top-[68px] right-4 z-[9999] w-[320px] bg-white dark:bg-card rounded-2xl shadow-2xl border border-border/30 flex flex-col animate-in slide-in-from-top-2 duration-200 overflow-hidden"
      style={{ maxHeight: "min(520px, calc(100vh - 84px))" }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
        {view === "create-group" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setView("list"); setGroupName(""); setSelectedMembers([]); setMemberSearch(""); }}
              className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h3 className="text-base font-bold text-foreground">Tạo nhóm chat</h3>
          </div>
        ) : (
          <h3 className="text-lg font-bold text-foreground">Chat</h3>
        )}
        <div className="flex items-center gap-1">
          {view === "list" && (
            <div className={cn(
              "w-2 h-2 rounded-full",
              connected && authed ? "bg-emerald-500" : "bg-muted-foreground/40"
            )} />
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors ml-1">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tab switcher — only in list view */}
      {view === "list" && (
        <div className="shrink-0 flex mx-4 mb-2 bg-[#f0f2f5] dark:bg-muted rounded-full p-0.5 gap-0.5">
          <button
            onClick={() => setTab("groups")}
            className={cn(
              "flex-1 relative flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all",
              tab === "groups"
                ? "bg-white dark:bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="chat-tab-groups"
          >
            <Users className="h-3.5 w-3.5" />
            Nhóm
            {groupUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {groupUnread > 99 ? "99+" : groupUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("people")}
            className={cn(
              "flex-1 relative flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all",
              tab === "people"
                ? "bg-white dark:bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="chat-tab-people"
          >
            <UserRound className="h-3.5 w-3.5" />
            Cá nhân
            {p2pUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {p2pUnread > 99 ? "99+" : p2pUnread}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Search input — only in list view */}
      {view === "list" && (
        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder={tab === "groups" ? "Tìm nhóm…" : "Tìm tên học viên, nhân viên…"}
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#f0f2f5] dark:bg-muted rounded-full outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              data-testid="chat-search-input"
            />
          </div>
        </div>
      )}

      {/* ── Create group view ── */}
      {view === "create-group" && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 pb-3 flex flex-col gap-3">
            {/* Group name */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Tên nhóm</p>
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Nhập tên nhóm..."
                autoFocus
                data-testid="create-group-name-input"
                className="w-full px-3 py-2 text-sm bg-[#f0f2f5] dark:bg-muted rounded-xl outline-none focus:ring-2 focus:ring-[#1877f2]/30 transition-all"
              />
            </div>

            {/* Member search */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Thêm thành viên</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Tìm theo tên..."
                  data-testid="create-group-search-input"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-[#f0f2f5] dark:bg-muted rounded-xl outline-none focus:ring-2 focus:ring-[#1877f2]/30 transition-all"
                />
                {memberSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {/* Search results */}
              {memberResults.length > 0 && (
                <div className="mt-1 bg-white dark:bg-card border border-border/40 rounded-xl shadow-md overflow-hidden">
                  {memberResults.slice(0, 5).map(user => (
                    <button
                      key={user.userId}
                      onClick={() => addMember(user)}
                      data-testid={`member-result-${user.userId}`}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f0f2f5] dark:hover:bg-muted transition-colors text-left"
                    >
                      <TopicAvatar name={user.displayName} topicId={user.userId} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{user.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">{user.role === "staff" ? "Nhân viên" : "Học viên"}</p>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-[#1877f2] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected members chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedMembers.map(m => (
                  <div
                    key={m.userId}
                    className="flex items-center gap-1 bg-[#e7f0ff] text-[#1877f2] rounded-full pl-2 pr-1 py-0.5"
                    data-testid={`selected-member-${m.userId}`}
                  >
                    <span className="text-[11px] font-medium">{m.displayName}</span>
                    <button
                      onClick={() => removeMember(m.userId)}
                      className="w-4 h-4 rounded-full hover:bg-[#1877f2]/20 flex items-center justify-center transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create button */}
          <div className="px-4 pb-4 mt-auto">
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || creating}
              data-testid="create-group-submit"
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                groupName.trim() && !creating
                  ? "bg-[#1877f2] text-white hover:bg-[#1464d8] active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {creating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</>
              ) : (
                <><Users className="h-4 w-4" /> Tạo nhóm</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!authed && view === "list" && (
        <div className="flex flex-col items-center justify-center h-32 gap-3 text-muted-foreground">
          {!connected ? (
            <><WifiOff className="h-6 w-6 opacity-30" /><p className="text-xs">Đang kết nối...</p></>
          ) : (
            <><Loader2 className="h-5 w-5 animate-spin text-primary" /><p className="text-xs">Đang xác thực...</p></>
          )}
        </div>
      )}

      {/* ── Tab: Nhóm ── */}
      {authed && tab === "groups" && view === "list" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Create group button */}
          <button
            onClick={() => setView("create-group")}
            data-testid="create-group-button"
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0f2f5] dark:hover:bg-muted/60 transition-colors text-left border-b border-border/20"
          >
            <div className="w-10 h-10 rounded-full bg-[#e7f0ff] flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-[#1877f2]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1877f2]">Tạo nhóm mới</p>
              <p className="text-[11px] text-muted-foreground">Nhóm chat tuỳ chỉnh</p>
            </div>
          </button>

          {groupTopics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 gap-2 text-muted-foreground">
              <MessageCircle className="h-7 w-7 opacity-20" />
              <p className="text-xs">Chưa có nhóm nào</p>
            </div>
          ) : (
            <div className="py-1">
              {groupTopics.map(topic => (
                <button
                  key={topic.topic}
                  onClick={() => { onSelect(topic.topic); onClose(); }}
                  data-testid={`chat-topic-${topic.topic}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0f2f5] dark:hover:bg-muted/60 active:bg-muted/80 transition-colors text-left"
                >
                  <div className="relative shrink-0">
                    <TopicAvatar name={topic.name || topic.topic} topicId={topic.topic} size="md" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("text-sm truncate", topic.unread > 0 ? "font-bold text-foreground" : "font-medium text-foreground")}>
                        {topic.name || topic.topic}
                      </p>
                      {topic.lastTs && (
                        <span className={cn("text-[11px] shrink-0", topic.unread > 0 ? "text-[#1877f2] font-semibold" : "text-muted-foreground")}>
                          {formatTime(topic.lastTs)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-px">
                      <p className={cn("text-xs truncate", topic.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {topic.lastContent ?? "Nhấn để chat"}
                      </p>
                      {topic.unread > 0 && (
                        <span className="w-5 h-5 bg-[#1877f2] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {topic.unread > 9 ? "9+" : topic.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Cá nhân ── */}
      {authed && tab === "people" && view === "list" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Existing P2P conversations */}
          {p2pTopics.length > 0 && (
            <>
              {p2pTopics.map(topic => (
                <button
                  key={topic.topic}
                  onClick={() => { onSelect(topic.topic); onClose(); }}
                  data-testid={`chat-p2p-${topic.topic}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0f2f5] dark:hover:bg-muted/60 active:bg-muted/80 transition-colors text-left"
                >
                  <div className="relative shrink-0">
                    <TopicAvatar name={topic.name || topic.topic} topicId={topic.topic} size="md" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("text-sm truncate flex-1", topic.unread > 0 ? "font-bold" : "font-medium")}>{topic.name || topic.topic}</p>
                      {topic.lastTs && (
                        <span className={cn("text-[11px] shrink-0", topic.unread > 0 ? "text-[#1877f2] font-semibold" : "text-muted-foreground")}>
                          {formatTime(topic.lastTs)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-px">
                      <p className="text-xs text-muted-foreground truncate">{topic.lastContent ?? "Nhấn để chat"}</p>
                      {topic.unread > 0 && (
                        <span className="w-5 h-5 bg-[#1877f2] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {topic.unread > 9 ? "9+" : topic.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {search.trim() && <div className="mx-4 my-1 border-t border-border/30" />}
            </>
          )}

          {/* User search results */}
          {!search.trim() && p2pTopics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground px-4 text-center">
              <UserRound className="h-8 w-8 opacity-20" />
              <p className="text-xs">Nhập tên để tìm và nhắn tin trực tiếp</p>
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center h-16 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-xs">Đang tìm...</p>
            </div>
          ) : search.trim() && userResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-16 gap-2 text-muted-foreground">
              <p className="text-xs">Không tìm thấy kết quả nào</p>
            </div>
          ) : (
            <div className="py-1">
              {userResults.map(user => (
                <button
                  key={user.userId}
                  onClick={() => handleOpenP2P(user)}
                  disabled={openingP2P === user.userId}
                  data-testid={`chat-user-${user.userId}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0f2f5] dark:hover:bg-muted/60 active:bg-muted/80 transition-colors text-left disabled:opacity-60"
                >
                  <div className="relative shrink-0">
                    <TopicAvatar name={user.displayName} topicId={user.userId} size="md" />
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-card",
                      user.role === "staff" ? "bg-blue-500" : "bg-emerald-500"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground">{user.role === "staff" ? "Nhân viên" : "Học viên"}</p>
                  </div>
                  {openingP2P === user.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                  ) : (
                    <SiMessenger className="h-4 w-4 text-[#1877f2] opacity-60 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ChatButton() {
  const [listOpen, setListOpen] = useState(false);
  const [openWindows, setOpenWindows] = useState<string[]>([]);
  const [minimized, setMinimized] = useState<Set<string>>(new Set());
  const [p2pNames, setP2pNames] = useState<Record<string, string>>({});
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const handleOpenViewer = useCallback((url: string, name: string) => setViewerFile({ url, name }), []);

  const {
    connected, authed, myUid, myLogin, topics, messages, currentTopic,
    subscribe, sendMessage, userNames, setActiveWindows, setCurrentTopic,
  } = useTinodeContext();
  const { data: user } = useAuth();

  const totalUnread = topics.reduce((sum, t) => sum + (t.unread ?? 0), 0);

  // Keep the hook's activeWindowsRef in sync with currently OPEN and VISIBLE (not minimized) windows.
  // This lets the data handler auto-mark messages as read only for windows the user can actually see.
  useEffect(() => {
    const visible = openWindows.filter(id => !minimized.has(id));
    setActiveWindows(visible);
  }, [openWindows, minimized, setActiveWindows]);

  function openChat(topicId: string) {
    subscribe(topicId);
    setOpenWindows(prev => {
      if (prev.includes(topicId)) {
        setMinimized(m => { const n = new Set(m); n.delete(topicId); return n; });
        return prev;
      }
      const next = [...prev, topicId];
      return next.slice(-4); // max 4 windows
    });
    setMinimized(m => { const n = new Set(m); n.delete(topicId); return n; });
  }

  function openP2P(topicId: string, displayName: string) {
    if (displayName) {
      setP2pNames(prev => ({ ...prev, [topicId]: displayName }));
    }
    openChat(topicId);
  }

  function closeWindow(topicId: string) {
    setOpenWindows(prev => prev.filter(id => id !== topicId));
    setMinimized(m => { const n = new Set(m); n.delete(topicId); return n; });
    if (currentTopic === topicId) {
      setCurrentTopic(null);
    }
  }

  function toggleMinimize(topicId: string) {
    setMinimized(m => {
      const n = new Set(m);
      if (n.has(topicId)) n.delete(topicId);
      else n.add(topicId);
      return n;
    });
  }

  function handleSend(topicId: string, content: string | Record<string, any>) {
    sendMessage(topicId, content);
  }

  return (
    <>
      {/* Messenger toggle button (in Header) */}
      <button
        onClick={() => setListOpen(v => !v)}
        data-testid="chat-open-button"
        className="relative h-10 w-10 rounded-full hover:scale-105 active:scale-95 transition-transform flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted"
      >
        <SiMessenger className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-sm leading-none">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {createPortal(
        <>
          {/* Conversation list popup */}
          {listOpen && (
            <ConversationList
              topics={topics}
              onSelect={openChat}
              onOpenP2P={openP2P}
              onClose={() => setListOpen(false)}
              connected={connected}
              authed={authed}
            />
          )}

          {/* Floating chat windows (non-minimized only) */}
          {(() => {
            const nonMinimized = openWindows.filter(id => !minimized.has(id));
            const minimizedList = openWindows.filter(id => minimized.has(id));
            return (
              <>
                {nonMinimized.map((topicId, i) => {
                  const topicInfo = topics.find(t => t.topic === topicId);
                  const topicName = p2pNames[topicId] || topicInfo?.name || topicId;
                  const msgs = messages[topicId] ?? [];
                  return (
                    <ChatWindow
                      key={topicId}
                      topicId={topicId}
                      topicName={topicName}
                      messages={msgs}
                      myUid={myUid}
                      myLogin={myLogin}
                      userNames={userNames}
                      onSend={handleSend}
                      onClose={closeWindow}
                      stackIndex={i}
                      onToggleMinimize={toggleMinimize}
                      onOpenViewer={handleOpenViewer}
                    />
                  );
                })}
                {minimizedList.map((topicId, i) => {
                  const topicInfo = topics.find(t => t.topic === topicId);
                  const topicName = p2pNames[topicId] || topicInfo?.name || topicId;
                  return (
                    <MinimizedBubble
                      key={topicId}
                      topicId={topicId}
                      topicName={topicName}
                      unread={topicInfo?.unread}
                      stackIndex={i}
                      onRestore={toggleMinimize}
                      onClose={closeWindow}
                    />
                  );
                })}
              </>
            );
          })()}

          {/* Backdrop to close list */}
          {listOpen && (
            <div
              className="fixed inset-0 z-[9990]"
              onClick={() => setListOpen(false)}
            />
          )}
        </>,
        document.body
      )}
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={true}
      />
    </>
  );
}
