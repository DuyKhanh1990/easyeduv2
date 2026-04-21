import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileViewer } from "@/components/ui/file-viewer";
import {
  CalendarIcon, Building2, LayoutGrid, User, Users, UserCheck,
  MessageSquare, Send, Trash2, Loader2, MapPin, Pencil,
  Paperclip, Eye, Download, FileText, FileImage, FileVideo,
  FileAudio, FileArchive, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskLevel, TaskComment } from "@shared/schema";

/* ─── helpers ─────────────────────────────────────────────── */
function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
}

function getCondition(task: Task, statusName?: string) {
  if (statusName && /hoàn thành|done|xong/i.test(statusName)) {
    return { label: "Hoàn tất", color: "text-green-600" };
  }
  if (!task.dueDate) return { label: "—", color: "text-muted-foreground" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: "Quá hạn", color: "text-red-600" };
  if (diff === 0) return { label: "Đến hạn", color: "text-orange-500" };
  if (diff <= 3) return { label: "Sắp đến hạn", color: "text-yellow-600" };
  return { label: "Chưa đến hạn", color: "text-blue-600" };
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
];
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getFileIcon(mimetype?: string, name?: string) {
  const m = mimetype || "";
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(n)) return FileImage;
  if (m.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/.test(n)) return FileVideo;
  if (m.startsWith("audio/") || /\.(mp3|wav|ogg|flac)$/.test(n)) return FileAudio;
  if (/zip|rar|7z|tar|gz/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(n)) return FileArchive;
  return FileText;
}

function isImage(mimetype?: string, name?: string) {
  const m = mimetype || "";
  const n = (name || "").toLowerCase();
  return m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(n);
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/* ─── InfoCell ───────────────────────────────────────────── */
function InfoCell({ icon: Icon, label, children }: {
  icon: any; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

/* ─── AvatarStack ────────────────────────────────────────── */
function AvatarStack({ ids, staffMap }: { ids: string[]; staffMap: Map<string, string> }) {
  const names = ids.map(id => staffMap.get(id)).filter(Boolean) as string[];
  if (names.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = names.slice(0, 5);
  const extra = names.length - shown.length;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center -space-x-1.5 flex-wrap gap-y-1">
        {shown.map(n => (
          <Tooltip key={n}>
            <TooltipTrigger asChild>
              <span className={cn(
                "inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white ring-2 ring-background cursor-default",
                avatarColor(n)
              )}>
                {getInitials(n)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{n}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold bg-muted text-muted-foreground ring-2 ring-background">
            +{extra}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ─── Attachments ────────────────────────────────────────── */
interface Attachment { name: string; url?: string; size?: number; type?: string; mimetype?: string }

function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

  if (!attachments.length) return null;

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" /> File đính kèm
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
            {attachments.length}
          </span>
        </h3>

        <div className="space-y-1.5">
          {attachments.map((att, i) => {
            const Icon = getFileIcon(att.mimetype || att.type, att.name);
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors group"
                data-testid={`attachment-item-${i}`}
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{att.name}</p>
                  {att.size && (
                    <p className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {att.url && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setViewerFile({ url: att.url!, name: att.name })}
                            className="p-1 rounded hover:bg-background transition-colors text-muted-foreground hover:text-primary"
                            data-testid={`btn-preview-attachment-${i}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Xem file</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {att.url && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={att.url}
                            download={att.name}
                            className="p-1 rounded hover:bg-background transition-colors text-muted-foreground hover:text-primary"
                            data-testid={`btn-download-attachment-${i}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Tải về</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!att.url && (
                    <span className="text-[10px] text-muted-foreground italic px-1">Chưa có link</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

/* ─── Comment item ───────────────────────────────────────── */
function CommentItem({ comment, onDelete, canDelete }: {
  comment: TaskComment;
  onDelete: (id: string) => void;
  canDelete: boolean;
}) {
  const initials = getInitials(comment.authorName || "?");
  const color = avatarColor(comment.authorName || "?");
  return (
    <div className="flex gap-2.5 group">
      <span className={cn(
        "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white mt-0.5",
        color
      )}>
        {initials}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold">{comment.authorName || "Ẩn danh"}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: vi })}
          </span>
        </div>
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all shrink-0 mt-0.5"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
interface TaskDetailPanelProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  statuses: TaskStatus[];
  levels: TaskLevel[];
  staffMap: Map<string, string>;
  locMap: Map<string, string>;
  deptMap: Map<string, string>;
  canEdit?: boolean;
}

export function TaskDetailPanel({
  task, open, onClose, statuses, levels, staffMap, locMap, deptMap, canEdit = false,
}: TaskDetailPanelProps) {
  const [comment, setComment] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], isLoading: commentsLoading } = useQuery<TaskComment[]>({
    queryKey: ["/api/tasks", task?.id, "comments"],
    queryFn: () => fetch(`/api/tasks/${task!.id}/comments`, { credentials: "include" }).then(r => r.json()),
    enabled: !!task,
  });

  const { data: subjectStudents = [] } = useQuery<{ id: string; fullName: string; type?: string }[]>({
    queryKey: ["/api/students/task-subjects", task?.subjectIds],
    queryFn: async () => {
      if (!task?.subjectIds?.length) return [];
      const res = await fetch(`/api/students?limit=500&minimal=true`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      const all: any[] = Array.isArray(data) ? data : (data?.students ?? data?.data ?? []);
      return all.filter((s: any) => task.subjectIds!.includes(s.id));
    },
    enabled: !!task && (task.subjectIds?.length ?? 0) > 0,
  });

  const addComment = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/tasks/${task!.id}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "comments"] });
      setComment("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      apiRequest("DELETE", `/api/tasks/${task!.id}/comments/${commentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "comments"] }),
  });

  function submitComment() {
    const val = comment.trim();
    if (!val) return;
    addComment.mutate(val);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitComment();
  }

  if (!task) return null;

  const statusObj = statuses.find(s => s.id === task.statusId);
  const levelObj = levels.find(l => l.id === task.levelId);
  const cond = getCondition(task, statusObj?.name);
  const locNames = (task.locationIds || []).map(id => locMap.get(id)).filter(Boolean);
  const attachments: Attachment[] = Array.isArray(task.attachments)
    ? (task.attachments as any[]).filter((a: any) => a && a.name)
    : [];

  return (
    <>
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col overflow-hidden"
        style={{ width: "55vw", maxWidth: "55vw" }}
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-8">
            <SheetTitle className="text-lg font-bold leading-snug flex-1">{task.title}</SheetTitle>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 h-8 text-xs"
                onClick={() => setEditOpen(true)}
                data-testid="button-edit-task"
              >
                <Pencil className="h-3.5 w-3.5" /> Sửa
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Info grid — 3 per row */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <InfoCell icon={MapPin} label="Cơ sở">
              {locNames.length > 0
                ? <span>{(locNames as string[]).join(", ")}</span>
                : <span className="text-muted-foreground">—</span>}
            </InfoCell>

            <InfoCell icon={Building2} label="Phòng ban">
              {task.departmentId
                ? <span>{deptMap.get(task.departmentId) || "—"}</span>
                : <span className="text-muted-foreground">—</span>}
            </InfoCell>

            <InfoCell icon={CalendarIcon} label="Hạn hoàn thành">
              <span>{fmtDate(task.dueDate)}</span>
            </InfoCell>

            <InfoCell icon={LayoutGrid} label="Trạng thái">
              {statusObj ? (
                <Badge
                  style={{ backgroundColor: statusObj.color + "20", color: statusObj.color, borderColor: statusObj.color + "40" }}
                  className="text-xs border font-medium"
                >
                  {statusObj.name}
                </Badge>
              ) : <span className="text-muted-foreground">—</span>}
            </InfoCell>

            <InfoCell icon={LayoutGrid} label="Mức độ">
              {levelObj ? (
                <Badge
                  style={{ backgroundColor: levelObj.color + "20", color: levelObj.color, borderColor: levelObj.color + "40" }}
                  className="text-xs border font-medium"
                >
                  {levelObj.name}
                </Badge>
              ) : <span className="text-muted-foreground">—</span>}
            </InfoCell>

            <InfoCell icon={CalendarIcon} label="Tình trạng">
              <span className={cn("text-sm font-medium", cond.color)}>{cond.label}</span>
            </InfoCell>

            <InfoCell icon={UserCheck} label="Quản lý">
              <AvatarStack ids={task.managerIds || []} staffMap={staffMap} />
            </InfoCell>

            <InfoCell icon={Users} label="Thực hiện">
              <AvatarStack ids={task.assigneeIds || []} staffMap={staffMap} />
            </InfoCell>

            <InfoCell icon={User} label="Tạo bởi">
              <span className="text-muted-foreground text-xs">
                {format(new Date(task.createdAt), "dd/MM/yyyy HH:mm")}
              </span>
            </InfoCell>

            {/* Đối tượng — full width */}
            <div className="col-span-3">
              <InfoCell icon={Target} label="Đối tượng">
                {subjectStudents.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {subjectStudents.map(s => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium"
                        data-testid={`subject-tag-${s.id}`}
                      >
                        {s.fullName}
                        {s.type && <span className="text-blue-400 text-[10px]">({s.type})</span>}
                      </span>
                    ))}
                  </div>
                ) : (task.subjectIds?.length ?? 0) > 0 ? (
                  <span className="text-xs text-muted-foreground italic">Đang tải...</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </InfoCell>
            </div>
          </div>

          <Separator />

          {/* Nội dung */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Nội dung
            </h3>
            {task.content
              ? <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{task.content}</p>
              : <p className="text-sm text-muted-foreground italic">Chưa có nội dung</p>}
          </div>

          {/* File đính kèm */}
          <AttachmentsSection attachments={attachments} />

          <Separator />

          {/* Thảo luận */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Thảo luận
              {comments.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  {comments.length}
                </span>
              )}
            </h3>

            {commentsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> <span className="text-xs">Đang tải...</span>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">Chưa có trao đổi nào. Hãy bắt đầu thảo luận!</p>
            ) : (
              <div className="space-y-4">
                {[...comments].reverse().map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    onDelete={(id) => deleteComment.mutate(id)}
                    canDelete={true}
                  />
                ))}
                <div ref={commentsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Comment input — pinned to bottom */}
        <div className="border-t px-6 py-4 shrink-0 bg-background">
          <div className="flex gap-2 items-end">
            <Textarea
              placeholder="Nhập nội dung trao đổi... (Ctrl+Enter để gửi)"
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="resize-none text-sm flex-1"
              data-testid="input-comment"
            />
            <Button
              size="sm"
              onClick={submitComment}
              disabled={!comment.trim() || addComment.isPending}
              className="h-[60px] px-4"
              data-testid="button-send-comment"
            >
              {addComment.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Ctrl+Enter để gửi nhanh</p>
        </div>
      </SheetContent>
    </Sheet>

    <CreateTaskDialog
      open={editOpen}
      onOpenChange={setEditOpen}
      initialTask={task}
    />
    </>
  );
}
