import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { getAuthHeaders } from "@/lib/queryClient";
import {
  ImageIcon,
  Send,
  MoreHorizontal,
  X,
  ChevronDown,
  Pin,
  Pencil,
  Trash2,
  Loader2,
  Check,
  MapPin,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Normalize bất kỳ URL ảnh nào về relative proxy URL để browser resolve đúng host.
 * Xử lý 3 dạng:
 *   1. Relative proxy  : /api/media/proxy?url=...  → giữ nguyên
 *   2. Absolute proxy  : https://any-host/api/media/proxy?url=... → chuyển relative
 *   3. Direct S3 URL   : https://s3.xxx/...  → bọc qua proxy
 */
function toProxyUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/media/proxy")) return url;
  const proxyMatch = url.match(/\/api\/media\/proxy\?url=([^&]+)/);
  if (proxyMatch) return `/api/media/proxy?url=${proxyMatch[1]}`;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

/* ─── Types ─────────────────────────────────────────── */
type Category = "all" | "thong-bao" | "su-kien" | "hoat-dong" | "hoc-thuat" | "khuyen-mai";
type Reaction = "👍" | "❤️" | "🎉" | "😮" | "😢" | "👏";

interface Location {
  id: string;
  name: string;
}

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorRole?: string | null;
  category: Exclude<Category, "all">;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  isPinned?: boolean;
  postLocationIds?: string[] | null;
  createdAt: string;
  reactions: Record<Reaction, number>;
  myReaction: Reaction | null;
}

/* ─── Static metadata ───────────────────────────────── */
const CATEGORY_META: Record<
  Exclude<Category, "all">,
  { vi: string; en: string; color: string; bg: string }
> = {
  "thong-bao":  { vi: "Thông báo",  en: "Announcement", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  "su-kien":    { vi: "Sự kiện",    en: "Event",        color: "text-teal-600",   bg: "bg-teal-50 border-teal-200"   },
  "hoat-dong":  { vi: "Hoạt động",  en: "Activity",     color: "text-blue-600",   bg: "bg-blue-50 border-blue-200"   },
  "hoc-thuat":  { vi: "Học thuật",  en: "Academic",     color: "text-violet-600", bg: "bg-violet-50 border-violet-200"},
  "khuyen-mai": { vi: "Khuyến mãi", en: "Promotion",    color: "text-rose-600",   bg: "bg-rose-50 border-rose-200"   },
};

const REACTIONS: Reaction[] = ["👍", "❤️", "🎉", "😮", "😢", "👏"];
const EMPTY_REACTIONS: Record<Reaction, number> = { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Hôm qua";
  return `${days} ngày trước`;
}

/* ─── API helpers ───────────────────────────────────── */
async function fetchPosts(category?: string): Promise<Post[]> {
  const params = category && category !== "all" ? `?category=${category}` : "";
  const res = await fetch(`/api/news-feed${params}`, { credentials: "include", headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}

async function fetchMyLocations(): Promise<Location[]> {
  const res = await fetch("/api/news-feed/my-locations", { credentials: "include", headers: getAuthHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function createPost(body: {
  content: string;
  category: string;
  imageUrls?: string[];
  locationIds?: string[];
}): Promise<Post> {
  const res = await fetch("/api/news-feed", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create post");
  const data = await res.json();
  // Backend trả { post } hoặc flat object
  return data.post ?? data;
}

async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/news-feed/${id}`, {
    method: "DELETE",
    credentials: "include",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete post");
}

async function reactToPost(postId: string, reaction: Reaction): Promise<{ myReaction: Reaction | null }> {
  const res = await fetch(`/api/news-feed/${postId}/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    credentials: "include",
    body: JSON.stringify({ reaction }),
  });
  if (!res.ok) throw new Error("Failed to react");
  return res.json();
}

async function editPost(
  postId: string,
  body: { content: string; category: string; imageUrls?: string[] }
): Promise<Post> {
  const res = await fetch(`/api/news-feed/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to edit post");
  const updated = await res.json();
  return {
    ...updated,
    reactions: updated.reactions ?? EMPTY_REACTIONS,
    myReaction: updated.myReaction ?? null,
  };
}

async function togglePin(postId: string): Promise<{ isPinned: boolean }> {
  const res = await fetch(`/api/news-feed/${postId}/pin`, {
    method: "PATCH",
    credentials: "include",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to pin");
  return res.json();
}

/* ─── Sub-components ────────────────────────────────── */
function CategoryBadge({ cat }: { cat: Exclude<Category, "all"> }) {
  const m = CATEGORY_META[cat];
  return (
    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", m.color, m.bg)}>
      {m.vi}
    </span>
  );
}

function ReactionBar({
  post,
  onReact,
}: {
  post: Post;
  onReact: (postId: string, r: Reaction) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPicker = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowPicker(true);
  };
  const closePicker = () => {
    hideTimer.current = setTimeout(() => setShowPicker(false), 200);
  };

  const total = Object.values(post.reactions).reduce((a, b) => a + b, 0);
  const top = REACTIONS.filter((r) => post.reactions[r] > 0)
    .sort((a, b) => post.reactions[b] - post.reactions[a])
    .slice(0, 3);

  return (
    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
      <div className="flex items-center gap-1.5">
        {top.length > 0 && (
          <div className="flex -space-x-1">
            {top.map((r) => (
              <span key={r} className="text-base leading-none">{r}</span>
            ))}
          </div>
        )}
        {total > 0 && (
          <span className="text-xs text-gray-400">{total} người</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <div className="relative" onMouseEnter={openPicker} onMouseLeave={closePicker}>
          {showPicker && (
            <div
              className="absolute bottom-full left-0 mb-0 pb-2 z-10"
              onMouseEnter={openPicker}
              onMouseLeave={closePicker}
            >
              <div className="flex items-center gap-1 bg-white rounded-full shadow-lg border border-gray-100 px-2 py-1.5">
                {REACTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { onReact(post.id, r); setShowPicker(false); }}
                    className="text-xl hover:scale-125 transition-transform leading-none"
                    title={r}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => onReact(post.id, "👍")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              post.myReaction
                ? "text-primary bg-primary/8"
                : "text-gray-500 hover:bg-gray-100"
            )}
          >
            <span className="text-base leading-none">{post.myReaction ?? "👍"}</span>
            <span>{post.myReaction ? "Đã thả" : "Thích"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── ImageGrid + Lightbox ──────────────────────────── */
function ImageGrid({ urls: rawUrls }: { urls: string[] }) {
  const urls = rawUrls.map(u => toProxyUrl(u) ?? u);
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (!urls.length) return null;

  const total = urls.length;
  const shown = Math.min(total, 5);

  type Slot = { idx: number; overlay?: boolean; extra?: number };
  let row1: Slot[] = [];
  let row2: Slot[] = [];

  if (total === 1) {
    row1 = [{ idx: 0 }];
  } else if (total === 2) {
    row1 = [{ idx: 0 }, { idx: 1 }];
  } else if (total === 3) {
    row1 = [{ idx: 0 }];
    row2 = [{ idx: 1 }, { idx: 2 }];
  } else if (total === 4) {
    row1 = [{ idx: 0 }, { idx: 1 }];
    row2 = [{ idx: 2 }, { idx: 3 }];
  } else {
    row1 = [{ idx: 0 }, { idx: 1 }];
    row2 = [
      { idx: 2 },
      { idx: 3 },
      { idx: 4, overlay: total > 5, extra: total > 5 ? total - 5 : undefined },
    ];
  }

  const ROW_H = "h-48";

  return (
    <>
      <div className="mx-4 mb-3 rounded-xl overflow-hidden flex flex-col gap-0.5">
        {row1.length > 0 && (
          <div className={cn("flex gap-0.5", total > 1 ? ROW_H : "")}>
            {row1.map((slot) => (
              <div key={slot.idx} className="flex-1 relative overflow-hidden bg-gray-100 cursor-pointer"
                onClick={() => setLightbox(slot.idx)}
              >
                <img
                  src={urls[slot.idx]}
                  alt={`ảnh ${slot.idx + 1}`}
                  className={cn(
                    "w-full object-cover transition-opacity hover:opacity-90",
                    total === 1 ? "max-h-[380px]" : "absolute inset-0 h-full"
                  )}
                />
              </div>
            ))}
          </div>
        )}
        {row2.length > 0 && (
          <div className={cn("flex gap-0.5", ROW_H)}>
            {row2.map((slot) => (
              <div
                key={slot.idx}
                className="flex-1 relative overflow-hidden bg-gray-100 cursor-pointer"
                onClick={() => setLightbox(slot.idx)}
              >
                <img
                  src={urls[slot.idx]}
                  alt={`ảnh ${slot.idx + 1}`}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity hover:opacity-90"
                />
                {slot.overlay && slot.extra !== undefined && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                    <span className="text-white text-2xl font-bold">+{slot.extra}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {urls.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/70 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-10 select-none"
              onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + urls.length) % urls.length); }}
            >‹</button>
          )}
          <img
            src={urls[lightbox]}
            alt="preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {urls.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/70 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-10 select-none"
              onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % urls.length); }}
            >›</button>
          )}
          {urls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/40 px-3 py-1 rounded-full">
              {lightbox + 1} / {urls.length}
            </div>
          )}
          <button
            className="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/70 rounded-full w-9 h-9 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

/* ─── PostCard ──────────────────────────────────────── */
function PostCard({
  post,
  currentUserId,
  canEdit,
  canDelete,
  isSuperAdmin,
  locationMap,
  onReact,
  onDelete,
  onPin,
  onEdit,
}: {
  post: Post;
  currentUserId?: string;
  canEdit: boolean;
  canDelete: boolean;
  isSuperAdmin: boolean;
  locationMap: Record<string, string>;
  onReact: (postId: string, r: Reaction) => void;
  onDelete: (postId: string) => void;
  onPin: (postId: string) => void;
  onEdit: (postId: string, content: string, category: Exclude<Category, "all">, imageUrls: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editCategory, setEditCategory] = useState<Exclude<Category, "all">>(post.category);
  const existingUrls = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  const [editImages, setEditImages] = useState<{ url: string; uploading?: boolean; error?: boolean; localUrl?: string }[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

  const isLong = post.content.length > 300;
  const displayContent = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const isOwner = currentUserId === post.authorId;

  // Có thể sửa: là tác giả + có canEdit, HOẶC superadmin, HOẶC có canEdit (cho phép sửa bài người khác)
  const showEdit = canEdit;
  // Có thể xoá: superadmin, hoặc có canDelete
  const showDelete = canDelete;
  // Có thể ghim: có canEdit
  const showPin = canEdit;

  // Tên cơ sở của bài viết
  const postLocationNames = post.postLocationIds
    ?.map(id => locationMap[id])
    .filter(Boolean)
    .join(", ");

  const startEdit = () => {
    setEditContent(post.content);
    setEditCategory(post.category);
    setEditImages(existingUrls.map((url) => ({ url })));
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (!editContent.trim() || editUploading) return;
    const finalUrls = editImages.filter((img) => !img.uploading && !img.error).map((img) => img.url);
    onEdit(post.id, editContent, editCategory, finalUrls);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(post.content);
    setEditCategory(post.category);
    setEditImages([]);
    setEditing(false);
  };

  const handleEditImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    const placeholders = files.map((f) => ({ url: "", uploading: true, localUrl: URL.createObjectURL(f) }));
    setEditImages((prev) => [...prev, ...placeholders]);
    setEditUploading(true);
    const results = await Promise.allSettled(files.map(uploadToS3));
    setEditImages((prev) => {
      const updated = [...prev];
      let pi = updated.findIndex((img) => img.uploading);
      results.forEach((r) => {
        if (pi === -1) return;
        if (r.status === "fulfilled") {
          updated[pi] = { url: r.value, uploading: false };
        } else {
          updated[pi] = { ...updated[pi], uploading: false, error: true };
        }
        pi = updated.findIndex((img, i) => i > pi && img.uploading);
      });
      return updated;
    });
    setEditUploading(false);
  };

  const hasActions = showEdit || showDelete || showPin;

  return (
    <div id={`post-${post.id}`} className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 ring-2 ring-white shadow-sm">
            <AvatarImage src="" />
            <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-violet-500 text-white font-semibold text-sm">
              {post.authorName.split(" ").pop()?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-gray-900">{post.authorName}</span>
              {editing ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn(
                      "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors",
                      CATEGORY_META[editCategory].color,
                      CATEGORY_META[editCategory].bg
                    )}>
                      {CATEGORY_META[editCategory].vi}
                      <ChevronDown size={10} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    {(Object.entries(CATEGORY_META) as [Exclude<Category, "all">, typeof CATEGORY_META[keyof typeof CATEGORY_META]][]).map(([key, m]) => (
                      <DropdownMenuItem key={key} onClick={() => setEditCategory(key)} className="gap-2 text-sm">
                        <span className={cn("w-2 h-2 rounded-full", m.bg.split(" ")[0].replace("-50", "-400"))} />
                        {m.vi}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <CategoryBadge cat={post.category} />
              )}
              {post.isPinned && !editing && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                  <Pin size={10} /> Đã ghim
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-xs text-gray-400">
                {post.authorRole ?? ""}{post.authorRole ? " · " : ""}{relativeTime(post.createdAt)}
              </p>
              {postLocationNames && (
                <span className="flex items-center gap-0.5 text-[10px] text-indigo-400">
                  <MapPin size={9} /> {postLocationNames}
                </span>
              )}
            </div>
          </div>
        </div>

        {!editing && hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600 rounded-full">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {showPin && (
                <DropdownMenuItem onClick={() => onPin(post.id)} className="gap-2 text-sm">
                  <Pin size={14} /> {post.isPinned ? "Bỏ ghim" : "Ghim bài viết"}
                </DropdownMenuItem>
              )}
              {showEdit && (
                <DropdownMenuItem onClick={startEdit} className="gap-2 text-sm">
                  <Pencil size={14} /> Chỉnh sửa
                </DropdownMenuItem>
              )}
              {showDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(post.id)}
                  className="gap-2 text-sm text-red-500 focus:text-red-500"
                >
                  <Trash2 size={14} /> Xoá bài viết
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* content */}
      <div className="px-4 pb-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="resize-none border-gray-200 bg-gray-50 rounded-xl text-sm focus:bg-white min-h-[100px] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50"
              autoFocus
            />

            <div className="flex flex-wrap gap-2">
              {editImages.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  <img
                    src={img.localUrl ?? img.url}
                    alt=""
                    className={cn("w-full h-full object-cover", img.uploading ? "opacity-50" : "")}
                  />
                  {img.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Loader2 size={16} className="animate-spin text-white" />
                    </div>
                  )}
                  {img.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
                      <span className="text-[10px] text-red-500 font-medium text-center px-1">Lỗi tải</span>
                    </div>
                  )}
                  {!img.uploading && (
                    <button
                      onClick={() => setEditImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => editFileRef.current?.click()}
                disabled={editUploading}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-400 hover:text-indigo-500 flex flex-col items-center justify-center gap-1 transition-colors text-xs disabled:opacity-50"
              >
                <ImageIcon size={18} />
                <span>Thêm ảnh</span>
              </button>
              <input ref={editFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditImageAdd} />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button onClick={handleCancelEdit} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Huỷ
              </button>
              <Button
                onClick={handleSaveEdit}
                disabled={!editContent.trim() || editUploading}
                size="sm"
                className="gap-1.5 rounded-xl px-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs disabled:opacity-40"
              >
                {editUploading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Lưu
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{displayContent}</p>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary font-medium mt-1 hover:underline"
              >
                {expanded ? "Thu gọn" : "Xem thêm"}
              </button>
            )}
          </>
        )}
      </div>

      {!editing && <ImageGrid urls={post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []} />}

      {!editing && (
        <div className="px-4 pb-3">
          <ReactionBar post={post} onReact={onReact} />
        </div>
      )}
    </div>
  );
}

/* ─── Composer ──────────────────────────────────────── */
interface ImagePreview {
  file: File;
  localUrl: string;
  s3Url?: string;
  uploading: boolean;
  error: boolean;
}

async function uploadToS3(file: File): Promise<string> {
  const form = new FormData();
  form.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", credentials: "include", headers: getAuthHeaders(), body: form });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.files[0].url as string;
}

/* ─── LocationSelector ──────────────────────────────── */
function LocationSelector({
  locations,
  selected,
  onChange,
}: {
  locations: Location[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (locations.length <= 1) return null; // chỉ 1 cơ sở → không cần chọn

  const allSelected = selected.length === locations.length;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      // bỏ chọn nhưng không cho chọn 0
      if (selected.length > 1) onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs text-gray-400 flex items-center gap-1">
        <MapPin size={11} /> Cơ sở:
      </span>
      {locations.map(loc => (
        <button
          key={loc.id}
          type="button"
          onClick={() => toggle(loc.id)}
          className={cn(
            "text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors",
            selected.includes(loc.id)
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-500 border-gray-300 hover:border-indigo-400"
          )}
        >
          {loc.name}
        </button>
      ))}
    </div>
  );
}

function Composer({
  user,
  locations,
  onPost,
  isPosting,
}: {
  user: any;
  locations: Location[];
  onPost: (content: string, category: Exclude<Category, "all">, imageUrls: string[], locationIds: string[]) => void;
  isPosting: boolean;
}) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Exclude<Category, "all">>("thong-bao");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [focused, setFocused] = useState(false);
  // Mặc định chọn tất cả cơ sở của user
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(() => locations.map(l => l.id));
  const imgRef = useRef<HTMLInputElement>(null);

  // Khi locations load xong, cập nhật default
  const locIds = locations.map(l => l.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initRef = useRef(false);
  if (!initRef.current && locations.length > 0) {
    initRef.current = true;
    setSelectedLocationIds(locations.map(l => l.id));
  }

  const handleSelectImages = (incoming: FileList | null) => {
    if (!incoming) return;
    const newPreviews: ImagePreview[] = Array.from(incoming).map((file) => ({
      file,
      localUrl: URL.createObjectURL(file),
      uploading: true,
      error: false,
    }));
    setImages((prev) => [...prev, ...newPreviews]);

    newPreviews.forEach((preview) => {
      uploadToS3(preview.file)
        .then((s3Url) => {
          setImages((prev) => prev.map((img) =>
            img.localUrl === preview.localUrl ? { ...img, s3Url, uploading: false } : img
          ));
        })
        .catch(() => {
          setImages((prev) => prev.map((img) =>
            img.localUrl === preview.localUrl ? { ...img, uploading: false, error: true } : img
          ));
        });
    });
  };

  const removeImage = (localUrl: string) => {
    setImages((prev) => prev.filter((img) => img.localUrl !== localUrl));
  };

  const isUploading = images.some((img) => img.uploading);
  const uploadedUrls = images.filter((img) => img.s3Url).map((img) => img.s3Url as string);

  const handlePost = () => {
    if (!content.trim() || isPosting || isUploading) return;
    onPost(content, category, uploadedUrls, selectedLocationIds);
    setContent("");
    setImages((prev) => { prev.forEach((img) => URL.revokeObjectURL(img.localUrl)); return []; });
    setFocused(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4">
      <div className="flex gap-3">
        <Avatar className="w-10 h-10 shrink-0 ring-2 ring-white shadow-sm">
          <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-violet-500 text-white font-semibold text-sm">
            {user?.fullName?.split(" ").pop()?.charAt(0) ?? "U"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 flex flex-col gap-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Đăng thông báo, sự kiện hoặc bài viết mới…"
            className={cn(
              "resize-none border-gray-200 bg-gray-50 rounded-xl text-sm focus:bg-white transition-all focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50",
              focused ? "min-h-[100px]" : "min-h-[44px]"
            )}
            rows={focused ? 4 : 1}
          />

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div key={img.localUrl} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                  <img src={img.localUrl} alt="" className="w-full h-full object-cover" />
                  {img.uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 size={18} className="text-white animate-spin" />
                    </div>
                  )}
                  {img.error && (
                    <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                      <span className="text-white text-[10px] font-medium">Lỗi</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeImage(img.localUrl)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(focused || content) && (
            <div className="flex flex-col gap-2">
              {/* Chọn cơ sở */}
              <LocationSelector
                locations={locations}
                selected={selectedLocationIds}
                onChange={setSelectedLocationIds}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn(
                        "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                        CATEGORY_META[category].color,
                        CATEGORY_META[category].bg
                      )}>
                        {CATEGORY_META[category].vi}
                        <ChevronDown size={11} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      {(Object.entries(CATEGORY_META) as [Exclude<Category, "all">, typeof CATEGORY_META[keyof typeof CATEGORY_META]][]).map(([key, m]) => (
                        <DropdownMenuItem key={key} onClick={() => setCategory(key)} className="gap-2 text-sm">
                          <span className={cn("w-2 h-2 rounded-full", m.bg.split(" ")[0].replace("bg-", "bg-").replace("-50", "-400"))} />
                          {m.vi}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    onClick={() => imgRef.current?.click()}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                    title="Đính kèm ảnh"
                  >
                    <ImageIcon size={16} />
                  </button>
                  <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleSelectImages(e.target.files)} />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFocused(false);
                      setContent("");
                      setImages((prev) => { prev.forEach((img) => URL.revokeObjectURL(img.localUrl)); return []; });
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Huỷ
                  </button>
                  <Button
                    onClick={handlePost}
                    disabled={!content.trim() || isPosting || isUploading}
                    size="sm"
                    className="gap-1.5 rounded-xl px-4 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md shadow-indigo-200 disabled:opacity-40 disabled:shadow-none"
                  >
                    {(isPosting || isUploading) ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {isUploading ? "Đang tải ảnh…" : "Đăng bài"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Pinned Sidebar ────────────────────────────────── */
function PinnedSidebar({
  posts,
  isLoading,
  canPin,
  onPin,
}: {
  posts: Post[];
  isLoading: boolean;
  canPin: boolean;
  onPin: (postId: string) => void;
}) {
  const displayed = posts.slice(0, 3);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pin size={14} className="text-amber-500" />
          <span className="font-semibold text-sm text-gray-800">Bài ghim</span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-14 h-14 rounded-lg bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pin size={14} className="text-amber-500" />
          <span className="font-semibold text-sm text-gray-800">Bài ghim</span>
        </div>
        <p className="text-xs text-gray-400 text-center py-4">Chưa có bài nào được ghim</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Pin size={14} className="text-amber-500" />
        <span className="font-semibold text-sm text-gray-800">Bài ghim</span>
        <span className="ml-auto text-[11px] font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
          {Math.min(posts.length, 3)}
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {displayed.map((post) => {
          const thumb = toProxyUrl(post.imageUrls?.[0] ?? post.imageUrl ?? undefined);
          const cat = CATEGORY_META[post.category];
          const snippet = post.content.replace(/\s+/g, " ").trim();

          return (
            <div
              key={post.id}
              className="flex gap-3 px-3 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => {
                const el = document.getElementById(`post-${post.id}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {thumb ? (
                <img src={thumb} alt="" className="w-[52px] h-[52px] rounded-lg object-cover shrink-0 border border-gray-100" />
              ) : (
                <div className={cn("w-[52px] h-[52px] rounded-lg shrink-0 flex items-center justify-center text-lg border", cat.bg)}>
                  {post.category === "thong-bao" ? "📢" : post.category === "su-kien" ? "📅" : post.category === "hoat-dong" ? "🏃" : post.category === "khuyen-mai" ? "🎁" : "📚"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                  {snippet || "(Không có nội dung)"}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", cat.color, cat.bg)}>
                    {cat.vi}
                  </span>
                  <span className="text-[10px] text-gray-400">{relativeTime(post.createdAt)}</span>
                  {canPin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onPin(post.id); }}
                      title="Bỏ ghim"
                      className="ml-auto flex items-center gap-0.5 text-[10px] text-red-400 hover:text-red-600 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Pin size={9} className="rotate-45" /> Bỏ ghim
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Promo Sidebar ─────────────────────────────────── */
function PromoSidebar({ posts }: { posts: Post[] }) {
  if (posts.length === 0) return null;
  const displayed = posts.slice(0, 6);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm">🎁</span>
        <span className="font-semibold text-sm text-gray-800">Khuyến mãi</span>
        <span className="ml-auto text-[11px] font-medium text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
          {Math.min(posts.length, 6)}
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {displayed.map((post) => {
          const thumb = toProxyUrl(post.imageUrls?.[0] ?? post.imageUrl ?? undefined);
          const snippet = post.content.replace(/\s+/g, " ").trim();

          return (
            <div
              key={post.id}
              className="bg-white hover:bg-rose-50 transition-colors cursor-pointer group"
              onClick={() => {
                const el = document.getElementById(`post-${post.id}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {/* Ảnh full ngang */}
              <div className="w-full aspect-[16/9] overflow-hidden bg-rose-50">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    🎁
                  </div>
                )}
              </div>
              {/* Tiêu đề bên dưới */}
              <p className="text-[12px] font-medium text-gray-700 leading-snug line-clamp-2 px-3 py-2.5 group-hover:text-rose-600 transition-colors">
                {snippet || "(Không có nội dung)"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Birthday Sidebar ──────────────────────────────── */
interface BirthdayPerson {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  avatarUrl?: string | null;
}

function BirthdaySidebar() {
  const { from, to } = (() => {
    const now = new Date();
    const later = new Date(now);
    later.setDate(later.getDate() + 3);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { from: fmt(now), to: fmt(later) };
  })();

  const { data, isLoading } = useQuery<{ students: BirthdayPerson[] }>({
    queryKey: ["birthday-upcoming", from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/students?birthdayFrom=${from}&birthdayTo=${to}&limit=20`,
        { credentials: "include", headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch birthdays");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const people: BirthdayPerson[] = data?.students ?? [];

  if (isLoading) return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🎂</span>
        <div className="h-3.5 bg-gray-100 rounded w-24" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  if (!people.length) return null;

  const today = new Date();
  const getDaysUntil = (dob: string) => {
    const [y, m, d] = dob.split("-").map(Number);
    const next = new Date(today.getFullYear(), m - 1, d);
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    return Math.round((next.getTime() - today.setHours(0,0,0,0)) / 86400000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-base">🎂</span>
        <span className="font-semibold text-sm text-gray-800">Sinh nhật sắp tới</span>
        <span className="ml-auto text-[11px] font-medium text-pink-500 bg-pink-50 px-2 py-0.5 rounded-full">{people.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {people.map((p) => {
          const days = p.dateOfBirth ? getDaysUntil(p.dateOfBirth) : null;
          const initials = p.fullName.split(" ").pop()?.charAt(0) ?? "?";
          return (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={p.avatarUrl ?? ""} />
                <AvatarFallback className="bg-gradient-to-br from-pink-400 to-rose-500 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{p.fullName}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {days === 0 ? "🎉 Hôm nay!" : days === 1 ? "Ngày mai" : `${days} ngày nữa`}
                </p>
              </div>
              {days === 0 && <span className="text-lg shrink-0">🎁</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────── */
export function NewsFeed() {
  const { data: user } = useAuth();
  const { lang: language } = useLanguage();
  const { data: permsData } = useMyPermissions();
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const queryClient = useQueryClient();

  const queryKey = ["news-feed", activeCategory];

  // Tính quyền từ useMyPermissions
  const isSuperAdmin = permsData?.isSuperAdmin ?? false;
  const newsFeedPerms = permsData?.permissions?.["/news-feed"];
  const canView   = isSuperAdmin || newsFeedPerms?.canView   || newsFeedPerms?.canViewAll || false;
  const canCreate = isSuperAdmin || newsFeedPerms?.canCreate || false;
  const canEdit   = isSuperAdmin || newsFeedPerms?.canEdit   || false;
  const canDelete = isSuperAdmin || newsFeedPerms?.canDelete || false;

  // Danh sách cơ sở để hiển thị tên trên bài viết & chọn khi đăng
  const { data: myLocations = [] } = useQuery<Location[]>({
    queryKey: ["/api/news-feed/my-locations"],
    queryFn: fetchMyLocations,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Map locationId → name để hiển thị nhanh
  const locationMap: Record<string, string> = {};
  for (const loc of myLocations) locationMap[loc.id] = loc.name;

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey,
    queryFn: () => fetchPosts(activeCategory),
    enabled: canView,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: (newPost) => {
      queryClient.setQueryData<Post[]>(queryKey, (old = []) => [newPost, ...old]);
      queryClient.invalidateQueries({ queryKey: ["news-feed"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Post[]>(queryKey, (old = []) => old.filter((p) => p.id !== id));
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: Reaction }) =>
      reactToPost(postId, reaction),
    onMutate: async ({ postId, reaction }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Post[]>(queryKey);
      queryClient.setQueryData<Post[]>(queryKey, (old = []) =>
        old.map((p) => {
          if (p.id !== postId) return p;
          const updated = { ...p.reactions };
          if (p.myReaction) updated[p.myReaction] = Math.max(0, updated[p.myReaction] - 1);
          if (p.myReaction !== reaction) {
            updated[reaction] = (updated[reaction] || 0) + 1;
            return { ...p, reactions: updated, myReaction: reaction };
          }
          return { ...p, reactions: updated, myReaction: null };
        })
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const pinMutation = useMutation({
    mutationFn: togglePin,
    onSuccess: (data, postId) => {
      queryClient.setQueryData<Post[]>(queryKey, (old = []) =>
        old.map((p) => p.id === postId ? { ...p, isPinned: data.isPinned } : p)
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ postId, content, category, imageUrls }: { postId: string; content: string; category: string; imageUrls: string[] }) =>
      editPost(postId, { content, category, imageUrls }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Post[]>(queryKey, (old = []) =>
        old.map((p) => p.id === updated.id ? { ...p, ...updated } : p)
      );
    },
  });

  const handlePost = (content: string, category: Exclude<Category, "all">, imageUrls: string[], locationIds: string[]) => {
    createMutation.mutate({ content, category, imageUrls, locationIds });
  };

  const FILTERS: { key: Category; vi: string; en: string }[] = [
    { key: "all",        vi: "Tất cả",     en: "All"        },
    { key: "thong-bao",  vi: "Thông báo",  en: "Announcements" },
    { key: "su-kien",    vi: "Sự kiện",    en: "Events"     },
    { key: "hoat-dong",  vi: "Hoạt động",  en: "Activities" },
    { key: "hoc-thuat",  vi: "Học thuật",  en: "Academic"   },
    { key: "khuyen-mai", vi: "Khuyến mãi", en: "Promotions" },
  ];

  const pinnedPosts = posts.filter((p) => p.isPinned);
  const promoPosts  = posts.filter((p) => p.category === "khuyen-mai");

  // Chưa load permissions xong → tránh flash
  const permsLoaded = permsData !== undefined;

  return (
    <DashboardLayout>
      <div className="sticky top-0 z-20
        -mt-4 md:-mt-6 lg:-mt-8
        -mx-4 md:-mx-6 lg:-mx-8
        px-4 md:px-6 lg:px-8
        pt-4 md:pt-6 lg:pt-8
        pb-3 bg-[#ECEEF4]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-3">
              {/* Composer chỉ hiện khi có quyền canCreate */}
              {canCreate && permsLoaded && (
                <Composer
                  user={user}
                  locations={myLocations}
                  onPost={handlePost}
                  isPosting={createMutation.isPending}
                />
              )}
              {/* Category filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setActiveCategory(f.key)}
                    className={cn(
                      "shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all border",
                      activeCategory === f.key
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                        : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                    )}
                  >
                    {language === "vi" ? f.vi : f.en}
                  </button>
                ))}
              </div>
            </div>
            <div className="hidden lg:block" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Feed column */}
          <div className="space-y-4 pb-8">
            {!canView && permsLoaded ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm">
                <p className="text-3xl mb-2">🔒</p>
                <p className="text-sm">Bạn không có quyền xem bảng tin</p>
              </div>
            ) : isLoading ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-sm">Đang tải bài viết…</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm">Chưa có bài viết nào</p>
              </div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={user?.id}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  isSuperAdmin={isSuperAdmin}
                  locationMap={locationMap}
                  onReact={(postId, r) => reactMutation.mutate({ postId, reaction: r })}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onPin={(id) => pinMutation.mutate(id)}
                  onEdit={(postId, content, category, imageUrls) =>
                    editMutation.mutate({ postId, content, category, imageUrls })
                  }
                />
              ))
            )}
          </div>

          {/* Pinned sidebar */}
          <aside className="hidden lg:block sticky top-[170px] pb-8 space-y-4">
            <PinnedSidebar
              posts={pinnedPosts}
              isLoading={isLoading}
              canPin={canEdit}
              onPin={(id) => pinMutation.mutate(id)}
            />
            <PromoSidebar posts={promoPosts} />
            <BirthdaySidebar />
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
