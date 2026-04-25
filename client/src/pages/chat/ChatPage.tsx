import { useState, useRef, useEffect, useCallback } from "react";
import { FileViewer } from "@/components/ui/file-viewer";
import {
  Search, Send, Users, Hash, Wifi, WifiOff, Loader2,
  MessageCircle, Info, Bell, Plus, X, UserPlus, Trash2, UserRound,
  Smile, Paperclip, FileText, Download, ImageIcon,
  CornerUpLeft, Pencil
} from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTinodeContext, UseTinodeResult } from "@/hooks/use-tinode";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
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

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderContent(content: string | Record<string, any>, isMe: boolean, tinodeUrl?: string | null, onOpenViewer?: (url: string, name: string) => void) {
  if (typeof content === "string") {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }
  if (typeof content === "object" && content !== null) {
    const fmt: any[] = content.fmt ?? [];
    const ent: any[] = content.ent ?? [];

    const imgFmt = fmt.find((f: any) => f.tp === "IM");
    if (imgFmt !== undefined) {
      const entity = ent[imgFmt.key ?? 0];
      const buildImgSrc = (data: any) => {
        if (!data) return null;
        if (data.val) return `data:${data.mime ?? "image/jpeg"};base64,${data.val}`;
        const refOrUrl = data.ref ?? data.url;
        if (!refOrUrl) return null;
        if (refOrUrl.startsWith("/v0/file/s/")) return `/api/chat/file?path=${encodeURIComponent(refOrUrl)}`;
        return refOrUrl.startsWith("http") ? refOrUrl : `${tinodeUrl ?? ""}${refOrUrl}`;
      };
      const src = buildImgSrc(entity?.data);
      if (src) {
        return (
          <img
            src={src}
            alt={entity?.data?.name ?? "ảnh"}
            className="max-w-[280px] max-h-[280px] rounded-xl object-cover cursor-pointer"
            onClick={() => onOpenViewer ? onOpenViewer(src, entity?.data?.name ?? "ảnh") : window.open(src, "_blank")}
            data-testid="chat-image-attachment"
          />
        );
      }
    }

    const exFmt = fmt.find((f: any) => f.tp === "EX");
    if (exFmt !== undefined) {
      const entity = ent[exFmt.key ?? 0];
      if (entity?.data) {
        const { name, mime, val, url, ref, size } = entity.data;
        const resolveHref = (): string | null => {
          const rawRef = url ?? ref ?? null;
          if (rawRef) {
            if (rawRef.startsWith("/v0/file/s/")) return `/api/chat/file?path=${encodeURIComponent(rawRef)}`;
            if (rawRef.startsWith("http")) return rawRef;
            return `${tinodeUrl ?? ""}${rawRef}`;
          }
          if (val) return `data:${mime ?? "application/octet-stream"};base64,${val}`;
          return null;
        };
        const href = resolveHref();

        if (mime?.startsWith("video/") && href) {
          return (
            <div className="rounded-xl overflow-hidden max-w-[320px]" data-testid="chat-video-attachment">
              <video
                src={href}
                controls
                className="w-full max-h-[240px] rounded-xl"
                preload="metadata"
              />
              <p className="text-xs opacity-70 mt-1 truncate px-1">{name}</p>
            </div>
          );
        }

        if (mime?.startsWith("audio/") && href) {
          return (
            <div className="min-w-[220px] max-w-[320px]" data-testid="chat-audio-attachment">
              <p className="text-xs font-medium truncate mb-1">{name}</p>
              <audio src={href} controls className="w-full h-9" preload="metadata" />
            </div>
          );
        }

        const handleDownload = () => {
          if (!href) return;
          const a = document.createElement("a");
          a.href = href;
          a.download = name ?? "file";
          a.click();
        };
        return (
          <div
            className="flex items-center gap-3 cursor-pointer py-1 min-w-[180px]"
            onClick={handleDownload}
            data-testid="chat-file-attachment"
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isMe ? "bg-white/20" : "bg-primary/10"
            )}>
              <FileText className={cn("h-5 w-5", isMe ? "text-white" : "text-primary")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name ?? "Tệp đính kèm"}</p>
              <p className="text-xs opacity-70">{formatFileSize(size)} · Nhấn để tải</p>
            </div>
            <Download className={cn("h-4 w-4 shrink-0 opacity-70", isMe ? "text-white" : "text-muted-foreground")} />
          </div>
        );
      }
    }

    return <span className="whitespace-pre-wrap break-words">{content.txt ?? JSON.stringify(content)}</span>;
  }
  return <span>{String(content ?? "")}</span>;
}

function Avatar({ name, uid, size = "md" }: { name: string; uid: string; size?: "sm" | "md" | "lg" }) {
  const g = gradientForUser(uid);
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  return (
    <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0", g, sz)}>
      {getInitials(name)}
    </div>
  );
}

// ─── Create Group Dialog ───────────────────────────────────────────────────

interface SearchUser {
  userId: string;
  displayName: string;
  role: "staff" | "student";
}

function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (topicId: string, groupName: string) => void;
}) {
  const { toast } = useToast();
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!open) {
      setGroupName("");
      setSearchQuery("");
      setSearchResults([]);
      setSelectedMembers([]);
    }
  }, [open]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(searchQuery)}`, {
          credentials: "include",
        });
        const data = await res.json();
        setSelectedMembers(current => {
          const alreadySelected = new Set(current.map(m => m.userId));
          setSearchResults((data.users ?? []).filter((u: SearchUser) => !alreadySelected.has(u.userId)));
          return current;
        });
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/groups", {
        name: groupName.trim(),
        memberUserIds: selectedMembers.map(m => m.userId),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.group?.tinodeTopicId) {
        onCreated(data.group.tinodeTopicId, data.group.name);
        toast({ title: "Đã tạo nhóm", description: `Nhóm "${data.group.name}" đã được tạo thành công.` });
      } else {
        toast({ title: "Nhóm đã tạo", description: "Nhóm chat đã được lưu nhưng chưa kết nối Tinode." });
        onClose();
      }
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể tạo nhóm. Vui lòng thử lại.", variant: "destructive" });
    },
  });

  function addMember(user: SearchUser) {
    setSelectedMembers(prev => [...prev, user]);
    // Keep search text and results — just remove this person from the dropdown
    setSearchResults(prev => prev.filter(u => u.userId !== user.userId));
  }

  function removeMember(userId: string) {
    setSelectedMembers(prev => prev.filter(m => m.userId !== userId));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">Tạo nhóm chat mới</h2>
          </div>
          <button
            onClick={onClose}
            data-testid="create-group-close"
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Group name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Tên nhóm
            </label>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nhập tên nhóm..."
              data-testid="create-group-name-input"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Member search */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Thêm thành viên
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm theo tên..."
                data-testid="create-group-search-input"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {searchResults.map(user => (
                  <button
                    key={user.userId}
                    onClick={() => addMember(user)}
                    data-testid={`search-result-${user.userId}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0",
                      gradientForUser(user.userId)
                    )}>
                      {getInitials(user.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.displayName}</p>
                      <p className="text-[10px] text-muted-foreground">{user.role === "staff" ? "Nhân viên" : "Học viên"}</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Thành viên đã chọn ({selectedMembers.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map(member => (
                  <div
                    key={member.userId}
                    className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full pl-2 pr-1 py-1"
                    data-testid={`selected-member-${member.userId}`}
                  >
                    <span className="text-xs font-medium">{member.displayName}</span>
                    <button
                      onClick={() => removeMember(member.userId)}
                      className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!groupName.trim() || createMutation.isPending}
            data-testid="create-group-submit"
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
              groupName.trim() && !createMutation.isPending
                ? "bg-primary text-white hover:bg-primary/90 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</>
            ) : (
              <><Plus className="h-4 w-4" /> Tạo nhóm</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New P2P Dialog ────────────────────────────────────────────────────────────

function NewP2PDialog({
  open,
  onClose,
  onSelectUser,
  isStudent,
}: {
  open: boolean;
  onClose: () => void;
  onSelectUser: (user: SearchUser) => void;
  isStudent: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(searchQuery)}`, {
          credentials: "include",
        });
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserRound className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">Nhắn tin mới</h2>
          </div>
          <button
            onClick={onClose}
            data-testid="new-p2p-close"
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5">
          {isStudent && (
            <p className="text-xs text-muted-foreground mb-3 bg-muted/50 rounded-xl px-3 py-2">
              Chỉ có thể nhắn tin với giáo viên trong các lớp đang học.
            </p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isStudent ? "Tìm giáo viên..." : "Tìm theo tên..."}
              autoFocus
              data-testid="new-p2p-search-input"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 bg-card border border-border rounded-xl shadow-sm overflow-hidden max-h-60 overflow-y-auto">
              {searchResults.map(user => (
                <button
                  key={user.userId}
                  onClick={() => { onSelectUser(user); onClose(); }}
                  data-testid={`new-p2p-result-${user.userId}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0",
                    gradientForUser(user.userId)
                  )}>
                    {getInitials(user.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.displayName}</p>
                    <p className="text-[10px] text-muted-foreground">{user.role === "staff" ? "Giáo viên" : "Học viên"}</p>
                  </div>
                  <MessageCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}

          {searchQuery.trim() && !searching && searchResults.length === 0 && (
            <div className="mt-4 text-center text-xs text-muted-foreground py-4">
              Không tìm thấy kết quả phù hợp.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Channel Sidebar ──────────────────────────────────────────────────────────

function ChannelSidebar({
  topics, currentTopic, onSelect, connected, messages, onCreateGroup, isStudent, onNewP2P,
}: {
  topics: UseTinodeResult["topics"];
  currentTopic: string | null;
  onSelect: (t: string) => void;
  connected: boolean;
  messages: UseTinodeResult["messages"];
  onCreateGroup: () => void;
  isStudent: boolean;
  onNewP2P: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"nhom" | "ca-nhan">("nhom");

  const sortByTime = (a: UseTinodeResult["topics"][0], b: UseTinodeResult["topics"][0]) => {
    if (!a.lastTs && !b.lastTs) return 0;
    if (!a.lastTs) return 1;
    if (!b.lastTs) return -1;
    return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
  };

  const classTopic = topics
    .filter(t => t.topic !== "me" && !(t as any).isP2P && !t.isCustomGroup)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort(sortByTime);

  const customGroups = topics
    .filter(t => t.topic !== "me" && t.isCustomGroup)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort(sortByTime);

  const p2pTopics = topics
    .filter(t => (t as any).isP2P)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort(sortByTime);

  const groupUnread = topics
    .filter(t => t.topic !== "me" && !(t as any).isP2P)
    .reduce((s, t) => s + (t.unread ?? 0), 0);

  const p2pUnread = p2pTopics.reduce((s, t) => s + (t.unread ?? 0), 0);

  function renderTopicItem(topic: UseTinodeResult["topics"][0], isCustom = false) {
    const isActive = currentTopic === topic.topic;
    return (
      <button
        key={topic.topic}
        onClick={() => onSelect(topic.topic)}
        data-testid={`chat-topic-${topic.topic}`}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group",
          isActive ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/60"
        )}
      >
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm transition-all",
          isCustom
            ? isActive
              ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-300/30"
              : "bg-gradient-to-br from-emerald-400/80 to-teal-500/90"
            : isActive
              ? "bg-gradient-to-br from-primary to-indigo-600 shadow-primary/30"
              : "bg-gradient-to-br from-primary/70 to-primary/90"
        )}>
          {getInitials(topic.name || topic.topic)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={cn(
              "text-sm truncate",
              isActive ? "text-primary font-semibold" :
              topic.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"
            )}>
              {topic.name || topic.topic}
            </p>
            {topic.lastTs && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatTime(topic.lastTs)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <p className={cn(
              "text-xs truncate",
              topic.unread > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground"
            )}>
              {topic.lastContent ?? "Nhấn để xem chat"}
            </p>
            {topic.unread > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                {topic.unread > 99 ? "99+" : topic.unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="w-[280px] shrink-0 flex flex-col border-r border-border/50 bg-card h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">Tin nhắn</h2>
          <div className={cn(
            "flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full",
            connected ? "text-emerald-600 bg-emerald-50" : "text-muted-foreground bg-muted"
          )}>
            {connected
              ? <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Trực tuyến</>
              : <><WifiOff className="h-3 w-3" /> Offline</>
            }
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted/60 p-0.5 mb-3">
          <button
            onClick={() => setActiveTab("nhom")}
            data-testid="tab-nhom"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              activeTab === "nhom"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Nhóm
            {groupUnread > 0 && (
              <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1">
                {groupUnread > 99 ? "99+" : groupUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("ca-nhan")}
            data-testid="tab-ca-nhan"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              activeTab === "ca-nhan"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <UserRound className="h-3.5 w-3.5" />
            Cá nhân
            {p2pUnread > 0 && (
              <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1">
                {p2pUnread > 99 ? "99+" : p2pUnread}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === "nhom" ? "Tìm nhóm..." : "Tìm cá nhân..."}
            className="w-full pl-8 pr-3 py-2 text-sm bg-muted/50 rounded-xl outline-none focus:bg-muted/80 transition-colors placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Channel list */}
      <ScrollArea className="flex-1">
        <div className="py-2 px-2 space-y-3">
          {activeTab === "nhom" ? (
            <>
              {/* Class channels section */}
              {classTopic.length > 0 && (
                <div>
                  <div className="px-3 pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nhóm lớp học</p>
                  </div>
                  <div className="space-y-0.5">
                    {classTopic.map(t => renderTopicItem(t, false))}
                  </div>
                </div>
              )}

              {/* Custom groups section */}
              <div>
                <div className="px-3 pb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nhóm tuỳ chỉnh</p>
                </div>
                <div className="space-y-0.5">
                  {customGroups.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">Chưa có nhóm tuỳ chỉnh</div>
                  ) : (
                    customGroups.map(t => renderTopicItem(t, true))
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* P2P section */}
              {p2pTopics.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50">
                  <UserRound className="h-8 w-8" />
                  <p className="text-xs text-center">Chưa có tin nhắn cá nhân</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {p2pTopics.map(t => renderTopicItem(t, false))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Bottom action buttons */}
      {activeTab === "nhom" && !isStudent && (
        <div className="shrink-0 px-3 py-3 border-t border-border/50">
          <button
            onClick={onCreateGroup}
            data-testid="create-group-button"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tạo nhóm mới
          </button>
        </div>
      )}
      {activeTab === "ca-nhan" && (
        <div className="shrink-0 px-3 py-3 border-t border-border/50">
          <button
            onClick={onNewP2P}
            data-testid="new-p2p-button"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nhắn tin mới
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Message Window ───────────────────────────────────────────────────────────

function MessageWindow({
  topic, messages, myUid, myLogin, userNames, onSend, onUploadFile, onOpenViewer,
}: {
  topic: UseTinodeResult["topics"][0] | undefined;
  messages: UseTinodeResult["messages"][string];
  myUid: string | null;
  myLogin: string | null;
  userNames: Record<string, string>;
  onSend: (content: string | Record<string, any>, head?: Record<string, any>) => void;
  onUploadFile: (file: File) => Promise<{ ref: string; size: number; mime: string; name: string } | null>;
  onOpenViewer: (url: string, name: string) => void;
}) {
  const { toast } = useToast();
  const { tinodeUrl } = useTinodeContext();
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMsg, setEditingMsg] = useState<UseTinodeResult["messages"][string][0] | null>(null);
  const [replyingTo, setReplyingTo] = useState<UseTinodeResult["messages"][string][0] | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Quick lookup of messages by seq (used to render quoted previews).
  const messagesBySeq = (messages ?? []).reduce<Record<number, typeof messages[0]>>(
    (acc, m) => { acc[m.seq] = m; return acc; },
    {}
  );

  // Preview text for a message (used in reply banner & quoted preview block).
  function previewText(m: { content: string | Record<string, any> } | undefined): string {
    if (!m) return "Tin nhắn không còn tồn tại";
    if (typeof m.content === "string") return m.content;
    if (m.content?.txt) return m.content.txt;
    const fmt: any[] = m.content?.fmt ?? [];
    if (fmt.find((f: any) => f.tp === "IM")) return "[Hình ảnh]";
    if (fmt.find((f: any) => f.tp === "EX")) return "[Tệp đính kèm]";
    return "[Tin nhắn]";
  }

  // Reset edit/reply mode when switching topic.
  useEffect(() => {
    setEditingMsg(null);
    setReplyingTo(null);
    setInput("");
  }, [topic?.topic]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages?.length, topic?.topic]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [topic?.topic]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (editingMsg) {
      // Edit/Replace: send pub with head.replace = ":N" where N is the original seq.
      onSend(text, { replace: `:${editingMsg.seq}` });
      setEditingMsg(null);
    } else if (replyingTo && topic) {
      // Reply: send pub with head.reply = "topicName:seq".
      onSend(text, { reply: `${topic.topic}:${replyingTo.seq}` });
      setReplyingTo(null);
    } else {
      onSend(text);
    }
    setInput("");
  }

  function startEdit(msg: typeof messages[0]) {
    if (typeof msg.content !== "string") {
      toast({ title: "Không thể sửa", description: "Chỉ có thể sửa tin nhắn dạng văn bản.", variant: "destructive" });
      return;
    }
    setReplyingTo(null);
    setEditingMsg(msg);
    setInput(msg.content);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startReply(msg: typeof messages[0]) {
    setEditingMsg(null);
    setReplyingTo(msg);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelComposeMode() {
    if (editingMsg) {
      setEditingMsg(null);
      setInput("");
    }
    if (replyingTo) setReplyingTo(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && (editingMsg || replyingTo)) {
      e.preventDefault();
      cancelComposeMode();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleEmojiSelect(emoji: any) {
    setInput(prev => prev + emoji.native);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const MAX_SIZE = file.type.startsWith("video/") ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
    const MAX_LABEL = file.type.startsWith("video/") ? "200MB" : "50MB";
    if (file.size > MAX_SIZE) {
      toast({ title: "File quá lớn", description: `Chỉ hỗ trợ file tối đa ${MAX_LABEL}`, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await onUploadFile(file);
      if (!uploaded) {
        toast({ title: "Tải file thất bại", description: "Không thể tải file lên, vui lòng thử lại.", variant: "destructive" });
        return;
      }

      const isImage = file.type.startsWith("image/");
      const drafty: Record<string, any> = isImage
        ? {
            txt: " ",
            fmt: [{ at: 0, len: 1, tp: "IM" }],
            ent: [{ tp: "IM", data: { mime: uploaded.mime, name: uploaded.name, ref: uploaded.ref, size: uploaded.size } }],
          }
        : {
            txt: " ",
            fmt: [{ at: 0, len: 1, tp: "EX" }],
            ent: [{ tp: "EX", data: { mime: uploaded.mime, name: uploaded.name, ref: uploaded.ref, size: uploaded.size } }],
          };
      onSend(drafty);
    } finally {
      setIsUploading(false);
    }
  }

  if (!topic) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-muted/10">
        <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center">
          <MessageCircle className="h-10 w-10 text-primary/30" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground text-lg">Chọn một kênh chat</p>
          <p className="text-sm mt-1 text-muted-foreground">Chọn kênh từ danh sách bên trái để bắt đầu chat</p>
        </div>
      </div>
    );
  }

  // Group messages by date and sender
  const groups: { date: string; msgs: typeof messages }[] = [];
  let lastDate = "";
  for (const m of (messages ?? [])) {
    const d = formatDate(m.ts);
    if (d !== lastDate) {
      groups.push({ date: d, msgs: [m] });
      lastDate = d;
    } else {
      groups[groups.length - 1].msgs.push(m);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Chat header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm",
            topic.isCustomGroup
              ? "bg-gradient-to-br from-emerald-500 to-teal-600"
              : "bg-gradient-to-br from-primary to-indigo-600"
          )}>
            {getInitials(topic.name || topic.topic)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base leading-tight">{topic.name || topic.topic}</h3>
              {topic.isCustomGroup && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Nhóm tuỳ chỉnh
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{(messages ?? []).length} tin nhắn</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
            <Search className="h-4 w-4" />
          </button>
          <button className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
            <Bell className="h-4 w-4" />
          </button>
          <button className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 flex flex-col gap-1">
          {(messages ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <MessageCircle className="h-7 w-7 opacity-30" />
              </div>
              <p className="text-sm font-medium">Hãy là người đầu tiên nhắn tin!</p>
            </div>
          ) : (
            groups.map(group => {
              let prevFrom = "";
              return (
                <div key={group.date}>
                  {/* Date divider */}
                  <div className="flex items-center gap-4 my-5">
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {group.date}
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>

                  {group.msgs.map((msg, idx) => {
                    const isMe = myUid ? msg.from === myUid : msg.from === myLogin;
                    const rawName = userNames[msg.from];
                    const displayName = isMe
                      ? "Bạn"
                      : (rawName && rawName !== msg.from
                        ? rawName
                        : msg.from?.replace(/^usr/, "").slice(0, 8) || "Người dùng");

                    const content = msg.content;

                    const isFirst = msg.from !== prevFrom;
                    prevFrom = msg.from;
                    const nextMsg = group.msgs[idx + 1];
                    const isLast = !nextMsg || nextMsg.from !== msg.from;

                    // Reply / edit metadata.
                    const replyRef: string | undefined = msg.head?.reply;
                    const repliedSeq: number | null = (() => {
                      if (typeof replyRef !== "string") return null;
                      const m = /(?::|^)(\d+)$/.exec(replyRef);
                      return m ? parseInt(m[1], 10) : null;
                    })();
                    const repliedMsg = repliedSeq != null ? messagesBySeq[repliedSeq] : undefined;
                    const repliedFromName = repliedMsg
                      ? (repliedMsg.from === myUid || repliedMsg.from === myLogin
                          ? "Bạn"
                          : (userNames[repliedMsg.from] && userNames[repliedMsg.from] !== repliedMsg.from
                              ? userNames[repliedMsg.from]
                              : repliedMsg.from?.replace(/^usr/, "").slice(0, 8) || "Người dùng"))
                      : "";

                    const isEdited = msg.edited === true || typeof msg.head?.replace === "string";
                    const isHighlighted = (editingMsg && editingMsg.seq === msg.seq) || (replyingTo && replyingTo.seq === msg.seq);
                    const canEdit = isMe && typeof content === "string";

                    return (
                      <div
                        key={`${msg.seq}-${msg.ts}`}
                        className={cn(
                          "group flex gap-3 -mx-2 px-2 py-0.5 rounded-lg transition-colors",
                          isMe ? "flex-row-reverse" : "flex-row",
                          isFirst ? "mt-4" : "mt-0.5",
                          isHighlighted && "bg-primary/5"
                        )}
                        data-testid={`chat-message-${msg.seq}`}
                      >
                        {/* Avatar */}
                        <div className="w-10 shrink-0 flex items-end pb-5">
                          {!isMe && isLast ? (
                            <Avatar name={displayName} uid={msg.from} size="sm" />
                          ) : (
                            <div className="w-8" />
                          )}
                        </div>

                        <div className={cn(
                          "flex flex-col max-w-[65%]",
                          isMe ? "items-end" : "items-start"
                        )}>
                          {!isMe && isFirst && (
                            <span className="text-xs font-semibold text-muted-foreground mb-1.5 ml-1">
                              {displayName}
                            </span>
                          )}

                          {/* Quoted reply preview (looked up from local messages by seq) */}
                          {replyRef && (
                            <div
                              className={cn(
                                "mb-1 max-w-full text-xs rounded-lg border-l-2 pl-2 pr-3 py-1 cursor-pointer hover:bg-muted/60 transition-colors",
                                isMe
                                  ? "border-white/50 bg-white/10 text-white/90"
                                  : "border-primary/60 bg-muted/40 text-muted-foreground"
                              )}
                              data-testid={`chat-message-reply-${msg.seq}`}
                              onClick={() => {
                                if (repliedSeq == null) return;
                                const el = document.querySelector(`[data-testid="chat-message-${repliedSeq}"]`);
                                if (el) {
                                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  el.classList.add("ring-2", "ring-primary/40");
                                  setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 1500);
                                }
                              }}
                            >
                              <p className={cn("font-semibold leading-tight", isMe ? "text-white" : "text-primary")}>
                                {repliedFromName || "Tin nhắn"}
                              </p>
                              <p className="line-clamp-2 leading-snug">{previewText(repliedMsg)}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            {/* Hover action buttons (placed before bubble for "me" so they sit on the left) */}
                            <div
                              className={cn(
                                "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                                isMe ? "order-1" : "order-2"
                              )}
                            >
                              <button
                                onClick={() => startReply(msg)}
                                title="Trả lời"
                                data-testid={`button-reply-${msg.seq}`}
                                className="w-7 h-7 rounded-lg bg-white/90 dark:bg-muted shadow-sm border border-border/40 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <CornerUpLeft className="h-3.5 w-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => startEdit(msg)}
                                  title="Sửa tin nhắn"
                                  data-testid={`button-edit-${msg.seq}`}
                                  className="w-7 h-7 rounded-lg bg-white/90 dark:bg-muted shadow-sm border border-border/40 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            <div className={cn(
                              "px-4 py-2.5 text-sm leading-relaxed",
                              isMe ? "order-2" : "order-1",
                              typeof content === "object" && content !== null ? "p-2" : "",
                              isMe
                                ? cn(
                                    "bg-gradient-to-br from-primary to-indigo-600 text-white shadow-sm shadow-primary/20",
                                    isFirst && isLast ? "rounded-2xl rounded-br-sm" :
                                    isFirst ? "rounded-2xl rounded-br-sm" :
                                    isLast ? "rounded-xl rounded-tr-2xl rounded-br-sm" :
                                    "rounded-l-2xl rounded-r-lg"
                                  )
                                : cn(
                                    "bg-white dark:bg-muted shadow-sm border border-border/40 text-foreground",
                                    isFirst && isLast ? "rounded-2xl rounded-bl-sm" :
                                    isFirst ? "rounded-2xl rounded-bl-sm" :
                                    isLast ? "rounded-xl rounded-tl-2xl rounded-bl-sm" :
                                    "rounded-r-2xl rounded-l-lg"
                                  )
                            )}>
                              {renderContent(content, isMe, tinodeUrl, onOpenViewer)}
                              {isEdited && (
                                <span
                                  className={cn(
                                    "ml-1.5 text-[10px] italic",
                                    isMe ? "text-white/70" : "text-muted-foreground"
                                  )}
                                  data-testid={`text-edited-${msg.seq}`}
                                >
                                  (đã sửa)
                                </span>
                              )}
                            </div>
                          </div>

                          {isLast && (
                            <span className={cn(
                              "text-[10px] text-muted-foreground mt-1.5",
                              isMe ? "mr-1" : "ml-1"
                            )}>
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

      {/* Input area */}
      <div className="relative px-6 py-4 border-t border-border/50 bg-card/80 shrink-0">
        {/* Emoji picker popup */}
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="absolute bottom-[80px] left-6 z-50 shadow-2xl rounded-2xl overflow-hidden"
          >
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              locale="vi"
              theme="light"
              previewPosition="none"
              skinTonePosition="none"
            />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.mp4,.mp3,.mov,.webm,.wav,.ogg,.aac"
          onChange={handleFileChange}
          data-testid="chat-file-input"
        />

        {/* Compose mode banner: shows when editing or replying */}
        {(editingMsg || replyingTo) && (
          <div
            className="flex items-start gap-2 mb-2 px-3 py-2 rounded-xl bg-primary/5 border-l-2 border-primary"
            data-testid="compose-mode-banner"
          >
            <div className="shrink-0 mt-0.5 text-primary">
              {editingMsg ? <Pencil className="h-4 w-4" /> : <CornerUpLeft className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary">
                {editingMsg
                  ? "Đang sửa tin nhắn"
                  : `Đang trả lời ${
                      replyingTo && (replyingTo.from === myUid || replyingTo.from === myLogin)
                        ? "chính bạn"
                        : (replyingTo && userNames[replyingTo.from] && userNames[replyingTo.from] !== replyingTo.from
                            ? userNames[replyingTo.from]
                            : (replyingTo?.from?.replace(/^usr/, "").slice(0, 8) || "Người dùng"))
                    }`}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {previewText(editingMsg ?? replyingTo ?? undefined)}
              </p>
            </div>
            <button
              onClick={cancelComposeMode}
              data-testid="button-cancel-compose"
              className="shrink-0 w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Huỷ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 bg-muted/50 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-muted/70 transition-all">
          {/* Emoji button */}
          <button
            onClick={() => setShowEmojiPicker(p => !p)}
            data-testid="chat-emoji-button"
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0",
              showEmojiPicker
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Chọn emoji"
          >
            <Smile className="h-4 w-4" />
          </button>

          {/* Attachment button */}
          <button
            onClick={() => !isUploading && fileInputRef.current?.click()}
            data-testid="chat-attach-button"
            disabled={isUploading}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isUploading ? "Đang tải file..." : "Đính kèm file"}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              editingMsg
                ? "Sửa tin nhắn… (Esc để huỷ)"
                : replyingTo
                ? "Nhập tin trả lời… (Esc để huỷ)"
                : `Nhắn tin đến ${topic.name || topic.topic}...`
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 py-1 min-w-0"
            data-testid="chat-message-input"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim()}
            data-testid="chat-send-button"
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0",
              input.trim()
                ? "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-sm"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

function InfoPanel({
  topic, messages, userNames, myUid,
}: {
  topic: UseTinodeResult["topics"][0] | undefined;
  messages: UseTinodeResult["messages"][string];
  userNames: Record<string, string>;
  myUid: string | null;
}) {
  if (!topic) {
    return (
      <div className="w-[260px] shrink-0 border-l border-border/50 bg-card/50 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Users className="h-8 w-8 opacity-20" />
        <p className="text-sm">Chọn kênh để xem thông tin</p>
      </div>
    );
  }

  const senders = Array.from(
    new Map((messages ?? []).map(m => [m.from, m])).values()
  );

  return (
    <div className="w-[260px] shrink-0 border-l border-border/50 bg-card/50 flex flex-col h-full overflow-hidden">
      <div className="px-5 py-5 border-b border-border/50">
        <div className="flex flex-col items-center text-center gap-3">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md",
            topic.isCustomGroup
              ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-300/20"
              : "bg-gradient-to-br from-primary to-indigo-600 shadow-primary/20"
          )}>
            {getInitials(topic.name || topic.topic)}
          </div>
          <div>
            <h3 className="font-bold text-base">{topic.name || topic.topic}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {topic.isCustomGroup ? "Nhóm chat tuỳ chỉnh" : "Nhóm học tập"}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 bg-muted rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-foreground">{(messages ?? []).length}</p>
              <p className="text-[10px] text-muted-foreground">Tin nhắn</p>
            </div>
            <div className="flex-1 bg-muted rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-foreground">{senders.length}</p>
              <p className="text-[10px] text-muted-foreground">Thành viên</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" />
            Thành viên đã nhắn ({senders.length})
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 pb-4 space-y-1">
            {senders.map(msg => {
              const isMe = msg.from === myUid;
              const rawName = userNames[msg.from];
              const displayName = isMe
                ? "Bạn"
                : (rawName && rawName !== msg.from
                  ? rawName
                  : msg.from?.replace(/^usr/, "").slice(0, 8) || "Người dùng");

              return (
                <div key={msg.from} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="relative">
                    <Avatar name={displayName} uid={msg.from} size="sm" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isMe ? "Bạn" : "Thành viên"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ChatPage() {
  const {
    connected, authed, myUid, myLogin, topics, messages, isStudent,
    currentTopic, subscribe, sendMessage, uploadFile, setCurrentTopic, userNames,
  } = useTinodeContext();

  const { toast } = useToast();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewP2P, setShowNewP2P] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const handleOpenViewer = useCallback((url: string, name: string) => setViewerFile({ url, name }), []);

  function handleSelectTopic(topicId: string) {
    subscribe(topicId);
  }

  function handleSend(content: string | Record<string, any>) {
    if (!currentTopic) return;
    sendMessage(currentTopic, content);
  }

  function handleGroupCreated(topicId: string, groupName: string) {
    setShowCreateGroup(false);
    subscribe(topicId);
  }

  async function handleSelectP2PUser(user: SearchUser) {
    try {
      const res = await fetch("/api/chat/p2p/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: user.userId }),
      });
      const data = await res.json();
      if (data.tinodeUid) {
        subscribe(`usr${data.tinodeUid}`);
      } else if (data.tinodeLogin) {
        subscribe(data.tinodeLogin);
      } else {
        toast({ title: "Không thể mở chat", description: data.message ?? "Lỗi không xác định.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lỗi kết nối", description: "Không thể mở tin nhắn.", variant: "destructive" });
    }
  }

  const currentTopicInfo = topics.find(t => t.topic === currentTopic);
  const currentMessages = currentTopic ? (messages[currentTopic] ?? []) : [];

  return (
    <DashboardLayout fullscreen>
      <div className="flex h-full bg-background">
        {!authed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            {!connected ? (
              <>
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <WifiOff className="h-7 w-7 text-primary/40" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-background rounded-full flex items-center justify-center shadow">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Đang kết nối tới máy chủ chat...</p>
                  <p className="text-sm text-muted-foreground mt-1">Tự động thử lại sau mỗi 5 giây</p>
                </div>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Đang xác thực...</p>
              </>
            )}
          </div>
        ) : (
          <>
            <ChannelSidebar
              topics={topics}
              currentTopic={currentTopic}
              onSelect={handleSelectTopic}
              connected={connected}
              messages={messages}
              onCreateGroup={() => setShowCreateGroup(true)}
              isStudent={isStudent}
              onNewP2P={() => setShowNewP2P(true)}
            />

            <MessageWindow
              topic={currentTopicInfo}
              messages={currentMessages}
              myUid={myUid}
              myLogin={myLogin}
              userNames={userNames}
              onSend={handleSend}
              onUploadFile={uploadFile}
              onOpenViewer={handleOpenViewer}
            />

            <InfoPanel
              topic={currentTopicInfo}
              messages={currentMessages}
              userNames={userNames}
              myUid={myUid}
            />
          </>
        )}

        <CreateGroupDialog
          open={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />

        <NewP2PDialog
          open={showNewP2P}
          onClose={() => setShowNewP2P(false)}
          onSelectUser={handleSelectP2PUser}
          isStudent={isStudent}
        />
      </div>
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={true}
      />
    </DashboardLayout>
  );
}
