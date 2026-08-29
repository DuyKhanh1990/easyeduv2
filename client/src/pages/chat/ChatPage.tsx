import { useState, useRef, useEffect, useCallback } from "react";
import { useSearch } from "wouter";
import { FileViewer } from "@/components/ui/file-viewer";
import { useCanDownloadFiles } from "@/hooks/use-can-download-files";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  Search, Send, Users, Hash, Wifi, WifiOff, Loader2,
  MessageCircle, Info, Bell, Plus, X, UserPlus, Trash2, UserRound,
  Smile, Paperclip, FileText, Download, ImageIcon, Eye,
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
import { apiRequest, getAuthToken } from "@/lib/queryClient";

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

// Normalize malformed URLs: mobile may send "https//..." instead of "https://"
function normalizeAttachUrl(raw: string): string {
  return raw.replace(/^(https?):\/([^/])/, "$1://$2");
}

function resolveAttachUrl(rawRef: string | null | undefined, val?: string, mime?: string, tinodeUrl?: string | null): string | null {
  if (rawRef) {
    const normalized = normalizeAttachUrl(rawRef);
    if (normalized.startsWith("/v0/file/s/")) return `/api/chat/file?path=${encodeURIComponent(normalized)}`;
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
    return `${tinodeUrl ?? ""}${normalized}`;
  }
  if (val) return `data:${mime ?? "application/octet-stream"};base64,${val}`;
  return null;
}

function renderContent(
  content: string | Record<string, any>,
  isMe: boolean,
  tinodeUrl?: string | null,
  onOpenViewer?: (url: string, name: string) => void,
  head?: Record<string, any>,
) {
  if (typeof content === "string") {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }
  if (typeof content === "object" && content !== null) {
    const fmt: any[] = content.fmt ?? [];
    const ent: any[] = content.ent ?? [];

    // ── Resolve entity: prefer fmt pointer, fallback to scanning ent directly ──
    // Mobile sometimes omits `fmt` entirely and only sends `ent`.
    const findEntity = (tp: string) => {
      const fromFmt = fmt.find((f: any) => f.tp === tp || (f.key !== undefined && ent[f.key]?.tp === tp));
      if (fromFmt !== undefined) return ent[fromFmt.key ?? 0];
      return ent.find((e: any) => e.tp === tp);
    };

    // ── Image (IM) ────────────────────────────────────────────────────────────
    const imgEntity = findEntity("IM");
    if (imgEntity) {
      const src = resolveAttachUrl(imgEntity.data?.ref ?? imgEntity.data?.url, imgEntity.data?.val, imgEntity.data?.mime, tinodeUrl);
      if (src) {
        return (
          <img
            src={src}
            alt={imgEntity.data?.name ?? "ảnh"}
            className="max-w-[280px] max-h-[280px] rounded-xl object-cover cursor-pointer"
            onClick={() => onOpenViewer ? onOpenViewer(src, imgEntity.data?.name ?? "ảnh") : window.open(src, "_blank")}
            data-testid="chat-image-attachment"
          />
        );
      }
    }

    // ── File / attachment (EX) ────────────────────────────────────────────────
    // Parse from content.ent first, then fall back to head.attachments (mobile pattern)
    let exEntity = findEntity("EX");

    // Mobile may send file URL only in head.attachments with mime in head.mime,
    // and either omit content.ent or send an ent without ref populated.
    const headUrl: string | undefined = Array.isArray(head?.attachments) ? head.attachments[0] : undefined;
    const headMime: string | undefined = head?.mime;

    // If ent has no usable ref, enrich it from head
    if (exEntity?.data && !exEntity.data.ref && !exEntity.data.url && !exEntity.data.val && headUrl) {
      exEntity = { ...exEntity, data: { ...exEntity.data, ref: headUrl, mime: exEntity.data.mime ?? headMime } };
    }

    // If no ent at all but head.attachments present → synthesise entity from head
    if (!exEntity && headUrl) {
      exEntity = { tp: "EX", data: { ref: headUrl, mime: headMime ?? "application/octet-stream", name: headUrl.split("/").pop() ?? "file", size: undefined } };
    }

    if (exEntity?.data) {
      const { name, mime, val, url, ref, size } = exEntity.data;
      const href = resolveAttachUrl(url ?? ref, val, mime, tinodeUrl);

        // Mobile gửi ảnh dưới dạng EX (không phải IM) — render inline nếu mime là image/*
        if (mime?.startsWith("image/") && href) {
          return (
            <img
              src={href}
              alt={name ?? "ảnh"}
              className="max-w-[280px] max-h-[280px] rounded-xl object-cover cursor-pointer"
              onClick={() => onOpenViewer ? onOpenViewer(href, name ?? "ảnh") : window.open(href, "_blank")}
              data-testid="chat-image-attachment"
            />
          );
        }

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

        // Xác định file có thể xem trực tiếp hay không
        const fileExt = ((name ?? href ?? "").split(".").pop() ?? "").toLowerCase().split("?")[0];
        const previewableExts = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx"];
        const canPreview = previewableExts.includes(fileExt) && !!href && !!onOpenViewer;

        return (
          <div
            className="flex items-center gap-3 cursor-pointer py-1 min-w-[180px]"
            onClick={canPreview ? () => onOpenViewer!(href!, name ?? "Tệp đính kèm") : handleDownload}
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
              <p className="text-xs opacity-70">
                {formatFileSize(size)} · {canPreview ? "Nhấn để xem" : "Nhấn để tải"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canPreview ? (
                <>
                  <Eye className={cn("h-4 w-4 opacity-70", isMe ? "text-white" : "text-muted-foreground")} />
                  <span
                    title="Tải xuống"
                    onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                    className={cn("h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer", isMe ? "text-white" : "text-muted-foreground")}
                  >
                    <Download className="h-4 w-4" />
                  </span>
                </>
              ) : (
                <Download className={cn("h-4 w-4 opacity-70", isMe ? "text-white" : "text-muted-foreground")} />
              )}
            </div>
          </div>
        );
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

type ClassOption = { id: string; name: string; classCode: string };

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

  // ── Core form state ───────────────────────────────────────────────────────
  const [groupName, setGroupName]       = useState("");
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchUser[]>([]);
  const [searching, setSearching]       = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // ── Class selector state ──────────────────────────────────────────────────
  const [selectedClass, setSelectedClass]   = useState<ClassOption | null>(null);
  const [classSearch, setClassSearch]       = useState("");
  const [classResults, setClassResults]     = useState<ClassOption[]>([]);
  const [classSearching, setClassSearching] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [existingGroups, setExistingGroups] = useState<{ id: string; name: string }[]>([]);
  const [loadingClassMembers, setLoadingClassMembers] = useState(false);
  const classSearchTimeoutRef = useRef<NodeJS.Timeout>();

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      setGroupName(""); setSearchQuery(""); setSearchResults([]); setSelectedMembers([]);
      setSelectedClass(null); setClassSearch(""); setClassResults([]);
      setClassDropdownOpen(false); setExistingGroups([]); setLoadingClassMembers(false);
    }
  }, [open]);

  // ── Class search (debounced 200 ms) ──────────────────────────────────────
  useEffect(() => {
    if (!classDropdownOpen) return;
    clearTimeout(classSearchTimeoutRef.current);
    classSearchTimeoutRef.current = setTimeout(async () => {
      setClassSearching(true);
      try {
        const token = getAuthToken();
        const r = await fetch(`/api/chat/classes/search?q=${encodeURIComponent(classSearch)}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await r.json();
        setClassResults(d.classes ?? []);
      } catch {
        setClassResults([]);
      } finally {
        setClassSearching(false);
      }
    }, 200);
    return () => clearTimeout(classSearchTimeoutRef.current);
  }, [classSearch, classDropdownOpen]);

  // ── Select a class: auto-fill name + members + check existing groups ──────
  async function handleClassSelect(cls: ClassOption) {
    setSelectedClass(cls);
    setGroupName(cls.name);
    setClassDropdownOpen(false);
    setLoadingClassMembers(true);
    try {
      const token = getAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const [membersRes, groupsRes] = await Promise.all([
        fetch(`/api/chat/classes/${cls.id}/members`, { credentials: "include", headers }),
        fetch(`/api/chat/classes/${cls.id}/groups`,  { credentials: "include", headers }),
      ]);
      const [membersData, groupsData] = await Promise.all([membersRes.json(), groupsRes.json()]);
      setSelectedMembers(membersData.members ?? []);
      setExistingGroups(groupsData.groups ?? []);
    } catch {
      setSelectedMembers([]); setExistingGroups([]);
    } finally {
      setLoadingClassMembers(false);
    }
  }

  // Clear class but keep current members (per spec)
  function handleClearClass() {
    setSelectedClass(null); setClassSearch(""); setClassResults([]);
    setClassDropdownOpen(false); setExistingGroups([]);
  }

  // ── Member search (debounced 300 ms) ─────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(searchQuery)}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setSelectedMembers(current => {
          const already = new Set(current.map(m => m.userId));
          setSearchResults((data.users ?? []).filter((u: SearchUser) => !already.has(u.userId)));
          return current;
        });
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  // ── Create mutation ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/groups", {
        name: groupName.trim(),
        memberUserIds: selectedMembers.map(m => m.userId),
        classId: selectedClass?.id ?? null,
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
    setSearchResults(prev => prev.filter(u => u.userId !== user.userId));
  }
  function removeMember(userId: string) {
    setSelectedMembers(prev => prev.filter(m => m.userId !== userId));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">Tạo nhóm chat mới</h2>
          </div>
          <button onClick={onClose} data-testid="create-group-close"
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* Lớp học */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Lớp học <span className="normal-case font-normal text-muted-foreground/70">(tuỳ chọn)</span>
            </label>

            {selectedClass ? (
              /* Selected class chip */
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/40 bg-primary/5 text-sm min-w-0">
                  <Hash className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium text-primary truncate">{selectedClass.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-auto">{selectedClass.classCode}</span>
                </div>
                <button onClick={handleClearClass} title="Bỏ chọn lớp"
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors shrink-0">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              /* Class search input */
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={classSearch}
                    onChange={e => setClassSearch(e.target.value)}
                    onFocus={() => setClassDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setClassDropdownOpen(false), 150)}
                    placeholder="Tìm lớp học theo tên..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  {classSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                {classDropdownOpen && classResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-20 max-h-44 overflow-y-auto">
                    {classResults.map(cls => (
                      <button key={cls.id} onMouseDown={() => handleClassSelect(cls)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Hash className="h-3 w-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cls.name}</p>
                          <p className="text-[10px] text-muted-foreground">{cls.classCode}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {classDropdownOpen && !classSearching && classSearch.trim() && classResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg px-4 py-3 z-20">
                    <p className="text-sm text-muted-foreground text-center">Không tìm thấy lớp</p>
                  </div>
                )}
              </div>
            )}

            {/* Warning: class already has groups */}
            {existingGroups.length > 0 && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Lớp này đã có nhóm:{" "}
                  {existingGroups.map((g, i) => (
                    <span key={g.id}><strong>{g.name}</strong>{i < existingGroups.length - 1 ? ", " : ""}</span>
                  ))}
                </p>
              </div>
            )}

            {loadingClassMembers && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang tải danh sách thành viên...
              </div>
            )}
          </div>

          {/* Tên nhóm */}
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

          {/* Thêm thành viên */}
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
            {searchResults.length > 0 && (
              <div className="mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {searchResults.map(user => (
                  <button key={user.userId} onClick={() => addMember(user)}
                    data-testid={`search-result-${user.userId}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left">
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

          {/* Thành viên đã chọn */}
          {selectedMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Thành viên đã chọn ({selectedMembers.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map(member => (
                  <div key={member.userId}
                    className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full pl-2 pr-1 py-1"
                    data-testid={`selected-member-${member.userId}`}>
                    <span className="text-xs font-medium">{member.displayName}</span>
                    <button onClick={() => removeMember(member.userId)}
                      className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center transition-colors">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
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
            )}>
            {createMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</>
              : <><Plus className="h-4 w-4" /> Tạo nhóm</>}
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
        const token = getAuthToken();
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(searchQuery)}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  const sortByTime = (a: UseTinodeResult["topics"][0], b: UseTinodeResult["topics"][0]) => {
    const getTime = (t: UseTinodeResult["topics"][0]) => t.lastTs ? new Date(t.lastTs).getTime() : 0;
    return getTime(b) - getTime(a);
  };

  const allTopics = topics
    .filter(t => t.topic !== "me")
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort(sortByTime);

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
              "text-sm truncate min-w-0",
              isActive ? "text-primary font-semibold" :
              topic.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"
            )}>
              {topic.name || topic.topic}
            </p>
            {topic.lastTs && (
              <span className={cn(
                "text-[10px] shrink-0",
                topic.unread > 0 ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {formatTime(topic.lastTs)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <p className={cn(
              "text-xs truncate min-w-0",
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm cuộc trò chuyện..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-muted/50 rounded-xl outline-none focus:bg-muted/80 transition-colors placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Channel list — flat, all topics */}
      <ScrollArea className="flex-1">
        <div className="py-2 px-2">
          {allTopics.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50">
              <MessageCircle className="h-8 w-8" />
              <p className="text-xs text-center">Chưa có cuộc trò chuyện nào</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {allTopics.map(t => renderTopicItem(t, t.isCustomGroup ?? false))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom action buttons */}
      {!isStudent && (
        <div className="shrink-0 px-3 py-3 border-t border-border/50 flex gap-2">
          <button
            onClick={onCreateGroup}
            data-testid="create-group-button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Tạo nhóm
          </button>
          <button
            onClick={onNewP2P}
            data-testid="new-p2p-button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    const ent: any[] = m.content?.ent ?? [];
    if (fmt.find((f: any) => f.tp === "IM" || (f.key !== undefined && ent[f.key]?.tp === "IM"))) return "[Hình ảnh]";
    if (fmt.find((f: any) => f.tp === "EX" || (f.key !== undefined && ent[f.key]?.tp === "EX"))) return "[Tệp đính kèm]";
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

  async function handleSend() {
    const text = input.trim();
    if (!text && !pendingFile) return;

    if (pendingFile) {
      setIsUploading(true);
      try {
        const uploaded = await onUploadFile(pendingFile);
        if (!uploaded) {
          toast({ title: "Tải file thất bại", description: "Không thể tải file lên, vui lòng thử lại.", variant: "destructive" });
          return;
        }
        const isImage = pendingFile.type.startsWith("image/");
        const drafty: Record<string, any> = isImage
          ? { txt: " ", fmt: [{ at: 0, len: 1, tp: "IM" }], ent: [{ tp: "IM", data: { mime: uploaded.mime, name: uploaded.name, ref: uploaded.ref, size: uploaded.size } }] }
          : { txt: " ", fmt: [{ at: 0, len: 1, tp: "EX" }], ent: [{ tp: "EX", data: { mime: uploaded.mime, name: uploaded.name, ref: uploaded.ref, size: uploaded.size } }] };
        onSend(drafty);
        if (text) onSend(text);
        setPendingFile(null);
        if (pendingFilePreview) { URL.revokeObjectURL(pendingFilePreview); setPendingFilePreview(null); }
        setInput("");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    if (editingMsg) {
      onSend(text, { replace: `:${editingMsg.seq}` });
      setEditingMsg(null);
    } else if (replyingTo && topic) {
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
    if (pendingFile) {
      setPendingFile(null);
      if (pendingFilePreview) { URL.revokeObjectURL(pendingFilePreview); setPendingFilePreview(null); }
    }
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

  function toggleSearch() {
    setShowSearch(p => {
      if (!p) setTimeout(() => searchInputRef.current?.focus(), 50);
      else setSearchQuery("");
      return !p;
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
        const preview = URL.createObjectURL(file);
        setPendingFile(file);
        setPendingFilePreview(preview);
        inputRef.current?.focus();
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const MAX_SIZE = file.type.startsWith("video/") ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
    const MAX_LABEL = file.type.startsWith("video/") ? "200MB" : "50MB";
    if (file.size > MAX_SIZE) {
      toast({ title: "File quá lớn", description: `Chỉ hỗ trợ file tối đa ${MAX_LABEL}`, variant: "destructive" });
      return;
    }

    if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPendingFile(file);
    setPendingFilePreview(preview);
    setTimeout(() => inputRef.current?.focus(), 0);
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

  const searchTrimmed = searchQuery.trim().toLowerCase();
  const matchedSeqs = new Set<number>();
  if (searchTrimmed) {
    for (const msg of messages ?? []) {
      const text = typeof msg.content === "string"
        ? msg.content.toLowerCase()
        : ((msg.content as any)?.txt ?? "").toLowerCase();
      if (text.includes(searchTrimmed)) matchedSeqs.add(msg.seq);
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
          <button
            onClick={toggleSearch}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
              showSearch ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
            title="Tìm kiếm trong cuộc trò chuyện"
          >
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

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-border/50 bg-amber-50/60 dark:bg-amber-900/10 flex items-center gap-2 shrink-0">
          <Search className="h-4 w-4 text-amber-600 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm trong cuộc trò chuyện..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
          {searchTrimmed && (
            <span className="text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full shrink-0">
              {matchedSeqs.size} kết quả
            </span>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(""); }}
            className="w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
                    const isSearchMatch = searchTrimmed ? matchedSeqs.has(msg.seq) : false;
                    const canEdit = isMe && typeof content === "string";

                    return (
                      <div
                        key={`${msg.seq}-${msg.ts}`}
                        className={cn(
                          "group flex gap-3 -mx-2 px-2 py-0.5 rounded-lg transition-colors",
                          isMe ? "flex-row-reverse" : "flex-row",
                          isFirst ? "mt-4" : "mt-0.5",
                          isHighlighted && "bg-primary/5",
                          isSearchMatch && "bg-amber-100/70 dark:bg-amber-900/20 ring-1 ring-amber-300/50"
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
                              className="mb-1 max-w-full text-xs rounded-lg border-l-2 border-primary/60 bg-muted/60 text-muted-foreground pl-2 pr-3 py-1 cursor-pointer hover:bg-muted transition-colors"
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
                              <p className="font-semibold leading-tight text-primary">
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
                              {renderContent(content, isMe, tinodeUrl, onOpenViewer, msg.head)}
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

        {/* Pending file preview */}
        {pendingFile && (
          <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-xl border border-border bg-muted/30">
            {pendingFilePreview
              ? <img src={pendingFilePreview} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{pendingFile.name}</p>
              <p className="text-[11px] text-muted-foreground">{(pendingFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => {
                setPendingFile(null);
                if (pendingFilePreview) { URL.revokeObjectURL(pendingFilePreview); setPendingFilePreview(null); }
              }}
              className="shrink-0 w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Bỏ file"
            >
              <X className="h-4 w-4" />
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
            onPaste={handlePaste}
            placeholder={
              pendingFile
                ? "Thêm chú thích… (tuỳ chọn)"
                : editingMsg
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
            disabled={(!input.trim() && !pendingFile) || isUploading}
            data-testid="chat-send-button"
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0",
              (input.trim() || pendingFile) && !isUploading
                ? "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-sm"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

interface GroupMember {
  userId: string;
  displayName: string;
  role: "staff" | "student";
}

function InfoPanel({
  topic, messages, myUid,
}: {
  topic: UseTinodeResult["topics"][0] | undefined;
  messages: UseTinodeResult["messages"][string];
  myUid: string | null;
}) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // isCustomGroup được lấy từ response /api/chat/topics/:topicId/members để tránh race condition với Tinode WS
  const [isCustomGroupFromApi, setIsCustomGroupFromApi] = useState(false);

  // Quyền Chat
  const { data: myPerms } = useMyPermissions();
  const chatPerms = myPerms?.isSuperAdmin
    ? { canCreate: true, canDelete: true }
    : myPerms?.permissions["/chat"] ?? { canCreate: false, canDelete: false };

  // Trạng thái dialog "Thêm thành viên"
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState<SearchUser[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadMembers = useCallback(() => {
    if (!topic?.topic) { setMembers([]); setIsCustomGroupFromApi(false); return; }
    setLoadingMembers(true);
    const token = getAuthToken();
    fetch(`/api/chat/topics/${encodeURIComponent(topic.topic)}/members`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { members: [] })
      .then(d => {
        setMembers(d.members ?? []);
        // isGroup: true = bất kỳ nhóm nào (custom hoặc lớp học, không phải DM)
        setIsCustomGroupFromApi(d.isGroup === true || d.isCustomGroup === true);
      })
      .catch(() => { setMembers([]); setIsCustomGroupFromApi(false); })
      .finally(() => setLoadingMembers(false));
  }, [topic?.topic]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Tìm kiếm user để thêm (debounced)
  const addSearchRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return; }
    clearTimeout(addSearchRef.current);
    addSearchRef.current = setTimeout(async () => {
      setAddLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(addSearch)}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        const existingIds = new Set(members.map(m => m.userId));
        setAddResults((data.users ?? []).filter((u: SearchUser) => !existingIds.has(u.userId)));
      } catch { setAddResults([]); }
      finally { setAddLoading(false); }
    }, 300);
    return () => clearTimeout(addSearchRef.current);
  }, [addSearch, members]);

  async function handleAddMember(user: SearchUser) {
    if (!topic?.topic) return;
    setAddingId(user.userId);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/chat/topics/${encodeURIComponent(topic.topic)}/members`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ memberUserId: user.userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Lỗi", description: err.message ?? "Không thể thêm thành viên", variant: "destructive" });
      } else {
        toast({ title: "Đã thêm", description: `${user.displayName} đã được thêm vào nhóm.` });
        setAddSearch("");
        setAddResults([]);
        loadMembers();
      }
    } catch {
      toast({ title: "Lỗi", description: "Không thể thêm thành viên", variant: "destructive" });
    } finally { setAddingId(null); }
  }

  async function handleRemoveMember(member: GroupMember) {
    if (!topic?.topic) return;
    setRemovingId(member.userId);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/chat/topics/${encodeURIComponent(topic.topic)}/members/${encodeURIComponent(member.userId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Lỗi", description: err.message ?? "Không thể xoá thành viên", variant: "destructive" });
      } else {
        toast({ title: "Đã xoá", description: `${member.displayName} đã được xoá khỏi nhóm.` });
        loadMembers();
      }
    } catch {
      toast({ title: "Lỗi", description: "Không thể xoá thành viên", variant: "destructive" });
    } finally { setRemovingId(null); }
  }

  if (!topic) {
    return (
      <div className="w-[260px] shrink-0 border-l border-border/50 bg-card/50 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Users className="h-8 w-8 opacity-20" />
        <p className="text-sm">Chọn kênh để xem thông tin</p>
      </div>
    );
  }

  // Dùng isCustomGroupFromApi (từ /api/chat/topics/:topicId/members) thay vì topic.groupId
  // vì topic.groupId bị race condition giữa Tinode WS và /api/chat/my-channels.
  const canManageMembers = isCustomGroupFromApi;

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
              {topic.isDirectMessage ? "Tin nhắn trực tiếp" : topic.isCustomGroup ? "Nhóm chat tuỳ chỉnh" : "Nhóm học tập"}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 bg-muted rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-foreground">{(messages ?? []).length}</p>
              <p className="text-[10px] text-muted-foreground">Tin nhắn</p>
            </div>
            <div className="flex-1 bg-muted rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-foreground">
                {loadingMembers ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : members.length}
              </p>
              <p className="text-[10px] text-muted-foreground">Thành viên</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
              <Users className="h-3.5 w-3.5" />
              {loadingMembers ? "Đang tải..." : `Tất cả thành viên (${members.length})`}
            </div>
            {canManageMembers && chatPerms.canCreate && (
              <button
                onClick={() => setShowAddMember(true)}
                title="Thêm thành viên"
                className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5 text-primary" />
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 pb-4 space-y-1">
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <UserRound className="h-6 w-6 opacity-30" />
                <p className="text-xs">Chưa có thành viên</p>
              </div>
            ) : members.map(member => {
              const isMe = member.userId === myUid;
              const displayName = isMe ? "Bạn" : member.displayName;
              const roleLabel = member.role === "staff" ? "Giáo viên / Nhân viên" : "Học viên";

              return (
                <div key={member.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors group">
                  <Avatar name={member.displayName} uid={member.userId} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    <p className="text-[10px] text-muted-foreground">{isMe ? "Bạn" : roleLabel}</p>
                  </div>
                  {isMe ? (
                    <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">Bạn</span>
                  ) : canManageMembers && chatPerms.canDelete ? (
                    removingId === member.userId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <button
                        onClick={() => handleRemoveMember(member)}
                        title="Xoá thành viên"
                        className="w-6 h-6 rounded-lg hover:bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Dialog thêm thành viên ── */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Thêm thành viên</h2>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{topic.name || topic.topic}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAddMember(false); setAddSearch(""); setAddResults([]); }}
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-border/30 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Tìm nhân viên / học viên..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {addLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : addResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <UserRound className="h-6 w-6 opacity-30" />
                  <p className="text-xs">{addSearch.trim() ? "Không tìm thấy kết quả" : "Nhập tên để tìm kiếm"}</p>
                </div>
              ) : (
                <div className="p-3 space-y-1">
                  {addResults.map(user => (
                    <div key={user.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors">
                      <Avatar name={user.displayName} uid={user.userId} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">{user.role === "staff" ? "Nhân viên" : "Học viên"}</p>
                      </div>
                      <button
                        onClick={() => handleAddMember(user)}
                        disabled={addingId === user.userId}
                        className="h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1 shrink-0 transition-colors"
                      >
                        {addingId === user.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Thêm
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ChatPage() {
  const {
    connected, authed, hasEverAuthed, myUid, myLogin, topics, messages, isStudent,
    currentTopic, subscribe, sendMessage, uploadFile, setCurrentTopic, userNames, registerName,
  } = useTinodeContext();

  const { toast } = useToast();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewP2P, setShowNewP2P] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const canDownload = useCanDownloadFiles();
  const handleOpenViewer = useCallback((url: string, name: string) => setViewerFile({ url, name }), []);

  // Reset currentTopic khi rời trang /chat để badge unread hoạt động đúng.
  // Nếu không reset, currentTopicRef vẫn trỏ vào topic cũ → tin nhắn mới bị
  // coi là "đang xem" → badge không tăng dù user đã chuyển sang trang khác.
  useEffect(() => {
    return () => {
      setCurrentTopic(null);
    };
  }, [setCurrentTopic]);

  // Mở đúng cuộc chat khi điều hướng từ chuông thông báo (?topicId=grp...)
  const search = useSearch();
  const openedFromNotiRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authed) return;
    const topicId = new URLSearchParams(search).get("topicId");
    if (!topicId || openedFromNotiRef.current === topicId) return;
    openedFromNotiRef.current = topicId;
    subscribe(topicId);
  }, [authed, search, subscribe]);

  function handleSelectTopic(topicId: string) {
    subscribe(topicId);
  }

  function handleSend(content: string | Record<string, any>, head?: Record<string, any>) {
    if (!currentTopic) return;
    sendMessage(currentTopic, content, head);
  }

  function handleGroupCreated(topicId: string, groupName: string) {
    setShowCreateGroup(false);
    subscribe(topicId);
  }

  async function handleSelectP2PUser(user: SearchUser) {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/chat/p2p/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ targetUserId: user.userId }),
      });
      const data = await res.json();
      if (data.topicId) {
        // Đăng ký tên ngay để sidebar hiển thị đúng tên trước khi Tinode trả dữ liệu
        if (user.displayName) registerName(data.topicId, user.displayName);
        subscribe(data.topicId);
      } else {
        toast({ title: "Không thể mở chat", description: data.message ?? "Lỗi không xác định.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lỗi kết nối", description: "Không thể mở tin nhắn.", variant: "destructive" });
    }
  }

  const currentTopicInfo = topics.find(t => t.topic === currentTopic);
  const currentMessages = currentTopic ? (messages[currentTopic] ?? []) : [];

  // ── Debounce reconnect banner ────────────────────────────────────────────────
  // Chỉ hiện banner "Đang kết nối lại" sau khi mất kết nối >= 3 giây.
  // Nếu Tinode reconnect trong vòng 3s (trường hợp 1006 do proxy idle timeout),
  // user không thấy gì cả. Không đụng đến `authed` thật — logic re-subscribe,
  // message queue, push noti vẫn chạy với state thật ngay lập tức.
  const [showReconnecting, setShowReconnecting] = useState(false);
  const reconnectBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (hasEverAuthed && !authed) {
      // Bắt đầu đếm — chỉ flip banner sau 3s nếu vẫn chưa authed lại
      reconnectBannerTimerRef.current = setTimeout(() => setShowReconnecting(true), 3000);
    } else {
      // Kết nối lại xong (hoặc chưa từng authed) — cancel timer, ẩn banner ngay
      if (reconnectBannerTimerRef.current) clearTimeout(reconnectBannerTimerRef.current);
      setShowReconnecting(false);
    }
    return () => {
      if (reconnectBannerTimerRef.current) clearTimeout(reconnectBannerTimerRef.current);
    };
  }, [authed, hasEverAuthed]);

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-background min-h-0">
        {/* ─── Tinode (Nội bộ) ─────────────────────────────────────────── */}
        {/* Reconnecting banner — chỉ hiện sau khi mất kết nối >= 3s (debounced) */}
        {showReconnecting && (
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Đang kết nối lại chat... Tin nhắn sẽ tự động đồng bộ khi kết nối được khôi phục.</span>
          </div>
        )}
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* First-time loading: show full-screen spinner until we've ever authed */}
            {!authed && !hasEverAuthed ? (
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
                      <p className="text-sm text-muted-foreground mt-1">Hệ thống sẽ tự động thử lại</p>
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
              /* Show chat UI when authed OR when reconnecting (hasEverAuthed=true).
                 During reconnect the layout stays, only the banner above is visible. */
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
      </div>
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={canDownload}
      />
    </DashboardLayout>
  );
}
