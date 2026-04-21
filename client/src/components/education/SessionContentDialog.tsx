import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Loader2, Search, Eye, File, FileImage, FileSpreadsheet, FileType2, FileText, Film, Music, BookOpenCheck } from "lucide-react";
import { FileViewer } from "@/components/ui/file-viewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ExamTakingDialog } from "@/pages/courses/dialogs/ExamTakingDialog";

interface SessionContentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classSessionId: string;
  programId?: string;
  students?: Array<{ id: string; name: string }>;
}

interface SelectedContent {
  id: string;
  dbId?: string;
  title: string;
  type: string;
  description?: string;
  sessionNumber?: string;
}

interface CourseContent {
  id: string;
  programId: string;
  sessionNumber: string;
  title: string;
  type: string;
  content: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

interface CourseProgram {
  id: string;
  name: string;
  courseId: string;
}

interface SessionContentRecord {
  id: string;
  classSessionId: string;
  contentType: string;
  title: string;
  description?: string;
  resourceUrl?: string;
  displayOrder: number;
}

const CONTENT_TYPES = [
  { key: "Bài học", label: "Bài học" },
  { key: "Bài tập về nhà", label: "Bài tập về nhà" },
  { key: "Giáo trình", label: "Giáo trình" },
  { key: "Bài kiểm tra", label: "Bài kiểm tra" },
];

function parseAttachment(att: string): { name: string; url: string | null } {
  if (att.includes("||")) {
    const sepIdx = att.indexOf("||");
    return { name: att.slice(0, sepIdx), url: att.slice(sepIdx + 2) };
  }
  return { name: att, url: null };
}

function getFileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getFileTypeInfo(filename: string): { icon: ReactNode; color: string } {
  const ext = getFileExt(filename);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { icon: <FileImage className="h-5 w-5" />, color: "text-pink-500 bg-pink-50 dark:bg-pink-950/30" };
  if (["xls", "xlsx", "csv"].includes(ext))
    return { icon: <FileSpreadsheet className="h-5 w-5" />, color: "text-green-600 bg-green-50 dark:bg-green-950/30" };
  if (["ppt", "pptx"].includes(ext))
    return { icon: <FileType2 className="h-5 w-5" />, color: "text-orange-500 bg-orange-50 dark:bg-orange-950/30" };
  if (["doc", "docx"].includes(ext))
    return { icon: <FileText className="h-5 w-5" />, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" };
  if (ext === "pdf")
    return { icon: <FileText className="h-5 w-5" />, color: "text-red-500 bg-red-50 dark:bg-red-950/30" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return { icon: <Film className="h-5 w-5" />, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" };
  if (["mp3", "wav", "ogg", "aac"].includes(ext))
    return { icon: <Music className="h-5 w-5" />, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" };
  return { icon: <File className="h-5 w-5" />, color: "text-muted-foreground bg-muted" };
}

function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isVideoUrl(url: string): boolean {
  const ext = getFileExt(url.split("?")[0]);
  return ["mp4", "mov", "avi", "mkv", "webm", "ogg"].includes(ext);
}

function isImageUrl(url: string): boolean {
  const ext = getFileExt(url.split("?")[0]);
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
}

function isUrlString(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/uploads/");
}

function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url}`;
}

function RichContentRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
      {lines.map((line, idx) => {
        if (!line.trim()) return null;
        const isBullet = line.startsWith("• ");
        const rawText = isBullet ? line.slice(2) : line;
        const parts = rawText.split(/(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/g);
        const rendered = parts.map((part, pi) => {
          if (!isUrlString(part)) return <span key={pi}>{part}</span>;
          const ytId = getYoutubeId(part);
          if (ytId) {
            return (
              <div key={pi} className="my-2 rounded-lg overflow-hidden aspect-video max-w-lg">
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}`}
                  className="w-full h-full"
                  allowFullScreen
                  title="YouTube video"
                />
              </div>
            );
          }
          if (isImageUrl(part)) {
            return <img key={pi} src={resolveUrl(part)} alt="" className="my-2 max-h-40 max-w-xs rounded-lg object-contain cursor-pointer border border-border" onClick={() => window.open(resolveUrl(part), "_blank")} />;
          }
          if (isVideoUrl(part)) {
            return <video key={pi} src={resolveUrl(part)} controls className="my-2 max-w-full rounded-lg" />;
          }
          return <a key={pi} href={resolveUrl(part)} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{part}</a>;
        });
        return (
          <div key={idx} className={isBullet ? "flex items-start gap-2" : ""}>
            {isBullet && <span className="mt-0.5 text-primary shrink-0">•</span>}
            <div>{rendered}</div>
          </div>
        );
      })}
    </div>
  );
}

interface ContentViewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string | null;
  fallbackContent?: { title: string; type: string; content?: string | null; sessionNumber?: number | null } | null;
}

export function ContentViewDialog({ isOpen, onOpenChange, contentId, fallbackContent }: ContentViewDialogProps) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const { data: allContents = [], isLoading } = useQuery<CourseContent[]>({
    queryKey: ["/api/course-program-contents"],
    enabled: !!contentId && isOpen,
  });

  const foundContent = allContents.find((c) => c.id === contentId);
  const content: CourseContent | undefined = foundContent ?? (fallbackContent && !isLoading ? {
    id: contentId ?? "",
    title: fallbackContent.title,
    type: fallbackContent.type,
    content: (fallbackContent.content ?? "") as string,
    sessionNumber: fallbackContent.sessionNumber != null ? String(fallbackContent.sessionNumber) : "",
    attachments: [] as string[],
    programId: "",
    createdAt: "",
    updatedAt: "",
  } : undefined);

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
        {isLoading || !content ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                  {content.type}
                </Badge>
                {content.sessionNumber != null && (
                  <span className="text-xs text-muted-foreground">Buổi {Number(content.sessionNumber)}</span>
                )}
              </div>
              <DialogTitle className="text-xl font-bold">{content.title}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="bg-muted/30 rounded-xl p-6 min-h-[120px]">
                {content.content ? (
                  <RichContentRenderer text={content.content} />
                ) : (
                  <span className="text-sm text-muted-foreground">Không có nội dung chi tiết</span>
                )}
              </div>

              {content.attachments && content.attachments.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">File đính kèm</p>
                  <div className="grid grid-cols-6 gap-2">
                    {content.attachments.map((att, idx) => {
                      const { name, url } = parseAttachment(att);
                      const { icon, color } = getFileTypeInfo(name);
                      const canView = !!url;
                      return (
                        <div
                          key={idx}
                          title={name}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 px-1.5 py-3 rounded-lg bg-background border border-border transition-colors text-center overflow-hidden",
                            canView ? "cursor-pointer hover:border-primary/50" : "opacity-60"
                          )}
                          onClick={() => {
                            if (canView && url) {
                              setViewerFile({ url, name });
                            }
                          }}
                        >
                          <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg shrink-0", color)}>
                            {icon}
                          </div>
                          <span className="text-[10px] text-foreground w-full truncate leading-snug px-0.5">
                            {name}
                          </span>
                          {canView && (
                            <div className="absolute inset-0 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                              <Eye className="h-5 w-5 text-white" />
                              <span className="text-[10px] text-white font-semibold">Xem</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

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

interface ContentTypeCardProps {
  type: string;
  label: string;
  selectedItems: SelectedContent[];
  onAddClick: () => void;
  onRemoveItem: (itemId: string) => void;
  onViewItem: (item: SelectedContent) => void;
}

interface PersonalContentTableProps {
  students: Array<{ id: string; name: string }>;
  selectedItems: SelectedContent[];
  onAddClick: (studentId: string, contentType: string) => void;
  onRemoveItem: (itemId: string) => void;
}

function PersonalContentTable({
  students,
  selectedItems,
  onAddClick,
  onRemoveItem,
}: PersonalContentTableProps) {
  const getStudentContent = (studentId: string, contentType: string) => {
    return selectedItems.filter(
      (item) =>
        item.type === contentType &&
        (item as any).studentId === studentId
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold text-sm w-12">
                <Checkbox />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-sm">
                Tên học viên
              </th>
              {CONTENT_TYPES.map((type) => (
                <th key={type.key} className="px-4 py-3 text-left font-semibold text-sm">
                  {type.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students && students.length > 0 ? (
              students.map((student) => (
                <tr key={student.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Checkbox data-testid={`checkbox-student-${student.id}`} />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{student.name}</td>
                  {CONTENT_TYPES.map((type) => {
                    const assigned = getStudentContent(student.id, type.key);
                    return (
                      <td key={type.key} className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onAddClick(student.id, type.key)}
                            className="h-6 w-6 p-0"
                            data-testid={`button-add-content-${student.id}-${type.key}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          {assigned.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-1 bg-muted/40 rounded px-1 py-0.5 text-xs max-w-[140px]"
                            >
                              <span className="truncate flex-1">{item.title}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveItem(item.id)}
                                className="h-4 w-4 p-0 shrink-0"
                                data-testid={`button-remove-personal-${item.id}`}
                              >
                                <X className="h-2 w-2" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={CONTENT_TYPES.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  Không có học viên
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContentTypeCard({
  type,
  label,
  selectedItems,
  onAddClick,
  onRemoveItem,
  onViewItem,
}: ContentTypeCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{label}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddClick}
          data-testid={`button-add-${type}`}
          title="Thêm từ thư viện nội dung"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-4">
          {selectedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Chưa chọn nội dung
            </p>
          ) : (
            selectedItems.map((item) => (
              <div
                key={item.dbId || item.id}
                className="p-2 border rounded bg-muted/30 flex items-center gap-2 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {item.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewItem(item)}
                  className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-primary"
                  data-testid={`button-view-${item.dbId || item.id}`}
                  title="Xem nội dung"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveItem(item.dbId || item.id)}
                  className="h-6 w-6 p-0 flex-shrink-0"
                  data-testid={`button-remove-${item.dbId || item.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ContentLibraryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  onSelectItems: (items: SelectedContent[]) => void;
  programId?: string;
  alreadySelectedIds: Set<string>;
}

function ContentLibraryDialog({
  isOpen,
  onOpenChange,
  contentType,
  onSelectItems,
  programId,
  alreadySelectedIds,
}: ContentLibraryDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSearch("");
    }
  }, [isOpen]);

  const { data: allPrograms = [] } = useQuery<CourseProgram[]>({
    queryKey: ["/api/course-programs"],
    enabled: isOpen,
  });

  const { data: allContents = [], isLoading } = useQuery<CourseContent[]>({
    queryKey: ["/api/course-program-contents"],
    enabled: isOpen,
  });

  const filteredContents = useMemo(() => {
    return allContents.filter((c) => {
      const matchType = c.type === contentType;
      const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
      return matchType && matchSearch;
    });
  }, [allContents, contentType, search]);

  const getProgramName = (pid: string) => {
    return allPrograms.find((p) => p.id === pid)?.name || "";
  };

  const handleSelectChange = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleConfirm = () => {
    const selected = filteredContents
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        description: c.content?.substring(0, 100),
        sessionNumber: c.sessionNumber,
      }));
    onSelectItems(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Thư viện nội dung — {contentType}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm nội dung..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-library"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredContents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground flex-1">
            Không có {contentType} nào trong thư viện
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <div className="space-y-2 py-2">
              {filteredContents.map((content) => {
                const alreadyAdded = alreadySelectedIds.has(content.id);
                return (
                  <div
                    key={content.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors flex items-start gap-3 ${
                      alreadyAdded
                        ? "bg-muted/30 opacity-60 cursor-not-allowed"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => !alreadyAdded && handleSelectChange(content.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(content.id) || alreadyAdded}
                      disabled={alreadyAdded}
                      onCheckedChange={() => !alreadyAdded && handleSelectChange(content.id)}
                      className="mt-1"
                      data-testid={`checkbox-content-${content.id}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{content.title}</p>
                        {alreadyAdded && (
                          <Badge variant="secondary" className="text-xs">Đã thêm</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {content.content || "Không có mô tả"}
                      </p>
                      {getProgramName(content.programId) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Chương trình: {getProgramName(content.programId)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-library"
          >
            Huỷ
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            data-testid="button-confirm-library"
          >
            Thêm ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ExamPickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectItems: (items: SelectedContent[]) => void;
  alreadySelectedIds: Set<string>;
}

function ExamPickerDialog({ isOpen, onOpenChange, onSelectItems, alreadySelectedIds }: ExamPickerDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSearch("");
    }
  }, [isOpen]);

  const { data: exams = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/exams"],
    enabled: isOpen,
  });

  const filtered = useMemo(() => {
    if (!search) return exams;
    const q = search.toLowerCase();
    return exams.filter(e =>
      e.name?.toLowerCase().includes(q) || e.code?.toLowerCase().includes(q)
    );
  }, [exams, search]);

  const handleSelectChange = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleConfirm = () => {
    const selected = filtered
      .filter(e => selectedIds.has(e.id))
      .map(e => ({
        id: e.id,
        title: e.name,
        type: "Bài kiểm tra",
        description: [
          e.code ? `Mã: ${e.code}` : null,
          e.timeLimitMinutes ? `${e.timeLimitMinutes} phút` : null,
          e.passingScore ? `Điểm đạt: ${e.passingScore}` : null,
        ].filter(Boolean).join(" · ") || undefined,
      }));
    onSelectItems(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-primary" />
            Chọn bài kiểm tra
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc mã bài kiểm tra..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-exam"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground flex-1">
            Không có bài kiểm tra nào
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <div className="space-y-2 py-2">
                {filtered.map(exam => {
                  const alreadyAdded = alreadySelectedIds.has(exam.id);
                  return (
                    <div
                      key={exam.id}
                      className={cn(
                        "p-3 border rounded-lg cursor-pointer transition-colors flex items-start gap-3",
                        alreadyAdded ? "bg-muted/30 opacity-60 cursor-not-allowed" : "hover:bg-muted/50"
                      )}
                      onClick={() => !alreadyAdded && handleSelectChange(exam.id)}
                    >
                      <Checkbox
                        checked={selectedIds.has(exam.id) || alreadyAdded}
                        disabled={alreadyAdded}
                        onCheckedChange={() => !alreadyAdded && handleSelectChange(exam.id)}
                        className="mt-1"
                        data-testid={`checkbox-exam-${exam.id}`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{exam.name}</p>
                          {exam.code && (
                            <Badge variant="secondary" className="text-xs">{exam.code}</Badge>
                          )}
                          {exam.status === "published" && (
                            <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                              Đã xuất bản
                            </Badge>
                          )}
                          {alreadyAdded && (
                            <Badge variant="secondary" className="text-xs">Đã thêm</Badge>
                          )}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          {exam.timeLimitMinutes && <span>{exam.timeLimitMinutes} phút</span>}
                          {exam.passingScore && <span>Điểm đạt: {exam.passingScore}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-exam-picker">
            Huỷ
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.size === 0} data-testid="button-confirm-exam-picker">
            Thêm ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExamViewerFromId({ examId, open, onClose }: { examId: string; open: boolean; onClose: () => void }) {
  const { data: exams = [], isLoading: examsLoading } = useQuery<any[]>({
    queryKey: ["/api/exams"],
    enabled: open && !!examId,
  });

  const { data: attemptData, isLoading: attemptLoading } = useQuery<{ count: number; maxAttempts: number | null }>({
    queryKey: ["/api/exams", examId, "my-attempt-count"],
    queryFn: async () => {
      const res = await fetch(`/api/exams/${examId}/my-attempt-count`);
      if (!res.ok) return { count: 0, maxAttempts: null };
      return res.json();
    },
    enabled: open && !!examId,
  });

  const exam = exams.find((e: any) => e.id === examId);
  const isLoading = examsLoading || attemptLoading;

  const maxAttempts = attemptData?.maxAttempts ?? null;
  const attemptCount = attemptData?.count ?? 0;
  const exceeded = maxAttempts !== null && maxAttempts > 0 && attemptCount >= maxAttempts;

  if (!open) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Đang tải bài kiểm tra...</DialogTitle></DialogHeader>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (exceeded) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-red-500" />
              {exam?.name ?? "Bài kiểm tra"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <BookOpenCheck className="h-7 w-7 text-red-500" />
            </div>
            <p className="text-base font-semibold text-foreground">Đã vượt quá số lần làm bài</p>
            <p className="text-sm text-muted-foreground">
              Bạn đã làm bài kiểm tra này <strong>{attemptCount}</strong> lần. Số lần làm tối đa là <strong>{maxAttempts}</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="w-full">Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!exam) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Không tìm thấy bài kiểm tra</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ExamTakingDialog
      exam={exam}
      open={open}
      onClose={onClose}
    />
  );
}

interface StudentSession {
  id: string;
  studentId: string;
  student?: { id: string; fullName: string };
  classSessionId: string;
}

export function SessionContentDialog({
  isOpen,
  onOpenChange,
  classSessionId,
  programId,
  students: propStudents,
}: SessionContentDialogProps) {
  const { toast } = useToast();

  const [selectedCommon, setSelectedCommon] = useState<SelectedContent[]>([]);
  const [selectedPersonal, setSelectedPersonal] = useState<SelectedContent[]>([]);
  const [originalCommonDbIds, setOriginalCommonDbIds] = useState<Set<string>>(new Set());
  const [originalPersonalSessionContentIds, setOriginalPersonalSessionContentIds] = useState<Set<string>>(new Set());

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [examPickerForTab, setExamPickerForTab] = useState<"common" | "personal">("common");
  const [selectedContentType, setSelectedContentType] = useState("");
  const [selectedTab, setSelectedTab] = useState<"common" | "personal">("common");
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{ title: string; type: string; content?: string | null } | null>(null);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);

  const handleViewItem = (item: SelectedContent) => {
    if (item.type === "Bài kiểm tra") {
      setViewingExamId(item.id);
      return;
    }
    const isProgramContentId = item.id !== item.dbId;
    if (isProgramContentId) {
      setViewingContentId(item.id);
      setViewingFallbackContent(null);
    } else {
      setViewingContentId(null);
      setViewingFallbackContent({ title: item.title, type: item.type, content: item.description });
    }
  };

  const { data: studentSessions = [] } = useQuery<StudentSession[]>({
    queryKey: ["/api/class-sessions", classSessionId, "student-sessions"],
    enabled: !!classSessionId && isOpen,
  });

  const students = studentSessions.map((ss) => ({
    id: ss.studentId,
    name: ss.student?.fullName || "Không xác định",
  }));

  const { data: existingContents = [], isLoading: isLoadingExisting } = useQuery<SessionContentRecord[]>({
    queryKey: [`/api/class-sessions/${classSessionId}/contents`],
    enabled: !!classSessionId && isOpen,
    staleTime: 0,
  });

  interface PersonalContentRecord {
    studentSessionContentId: string;
    sessionContentId: string;
    studentId: string;
    contentType: string;
    title: string;
    description: string | null;
    resourceUrl: string | null;
  }

  const { data: existingPersonalContents = [], isLoading: isLoadingPersonal } = useQuery<PersonalContentRecord[]>({
    queryKey: [`/api/class-sessions/${classSessionId}/student-contents`],
    enabled: !!classSessionId && isOpen,
    staleTime: 0,
  });

  useEffect(() => {
    if (isOpen && existingContents.length > 0) {
      const loaded: SelectedContent[] = existingContents.map((ec) => ({
        id: ec.resourceUrl || ec.id,
        dbId: ec.id,
        title: ec.title,
        type: ec.contentType,
        description: ec.description,
      }));
      setSelectedCommon(loaded);
      setOriginalCommonDbIds(new Set(loaded.map((l) => l.dbId!).filter(Boolean)));
    } else if (isOpen && existingContents.length === 0 && !isLoadingExisting) {
      setSelectedCommon([]);
      setOriginalCommonDbIds(new Set());
    }
  }, [isOpen, existingContents, isLoadingExisting]);

  useEffect(() => {
    if (isOpen && !isLoadingPersonal) {
      const loaded = existingPersonalContents.map((pc) => ({
        id: pc.resourceUrl || pc.sessionContentId,
        dbId: pc.sessionContentId,
        title: pc.title,
        type: pc.contentType,
        description: pc.description ?? undefined,
        studentId: pc.studentId,
      }));
      setSelectedPersonal(loaded as any[]);
      setOriginalPersonalSessionContentIds(new Set(existingPersonalContents.map((pc) => pc.sessionContentId)));
    }
  }, [isOpen, existingPersonalContents, isLoadingPersonal]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedCommon([]);
      setSelectedPersonal([]);
      setOriginalCommonDbIds(new Set());
      setOriginalPersonalSessionContentIds(new Set());
      setLibraryOpen(false);
      setExamPickerOpen(false);
      setViewingExamId(null);
    }
  }, [isOpen]);

  const isSaving = false;

  const handleSave = async () => {
    try {
      const currentDbIds = new Set(
        selectedCommon.map((c) => c.dbId).filter(Boolean) as string[]
      );

      // Snapshot of content before any changes for batch logging
      const existingBefore = (existingContents || []).map(c => ({ title: c.title, type: c.contentType }));

      const toDelete = Array.from(originalCommonDbIds).filter((id) => !currentDbIds.has(id));
      const deletedItems = (existingContents || [])
        .filter(c => toDelete.includes(c.id))
        .map(c => ({ title: c.title, type: c.contentType }));

      for (const dbId of toDelete) {
        await apiRequest("DELETE", `/api/class-sessions/${classSessionId}/contents/${dbId}?skipLog=true`);
      }

      const toAdd = selectedCommon.filter((c) => !c.dbId);
      for (const content of toAdd) {
        await apiRequest("POST", `/api/class-sessions/${classSessionId}/contents?skipLog=true`, {
          contentType: content.type,
          title: content.title,
          description: content.description,
          resourceUrl: content.id,
        });
      }

      // Fire a single batch log entry for all adds/deletes
      if (toAdd.length > 0 || toDelete.length > 0) {
        apiRequest("POST", `/api/class-sessions/${classSessionId}/log-content-changes`, {
          added: toAdd.map(c => ({ title: c.title, type: c.type })),
          deleted: deletedItems,
          existingBefore,
        }).catch(() => {});
      }

      // Personal content: delete removed items
      const currentPersonalSessionContentIds = new Set(
        selectedPersonal.map((c) => (c as any).dbId).filter(Boolean) as string[]
      );
      const personalToDelete = Array.from(originalPersonalSessionContentIds).filter(
        (id) => !currentPersonalSessionContentIds.has(id)
      );
      for (const dbId of personalToDelete) {
        await apiRequest("DELETE", `/api/class-sessions/${classSessionId}/contents/${dbId}`);
      }

      // Personal content: add new items (those without a dbId)
      const personalToAdd = selectedPersonal.filter((c) => !(c as any).dbId);
      for (const content of personalToAdd) {
        await apiRequest("POST", `/api/class-sessions/${classSessionId}/student-contents`, {
          studentId: (content as any).studentId,
          contentType: content.type,
          title: content.title,
          description: content.description,
          resourceUrl: content.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/class-sessions/${classSessionId}/contents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/class-sessions/${classSessionId}/student-contents`] });

      // Send content notification to students
      const notifyContents = [...toAdd, ...personalToAdd].map((c) => ({
        contentType: c.type,
        title: c.title,
      }));
      if (notifyContents.length > 0) {
        apiRequest("POST", `/api/class-sessions/${classSessionId}/notify-content`, {
          contents: notifyContents,
        }).catch(() => {});
      }

      toast({
        title: "Lưu thành công",
        description: "Nội dung buổi học đã được lưu",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể lưu nội dung buổi học",
        variant: "destructive",
      });
    }
  };

  const handleAddContent = (type: string, tabType: "common" | "personal") => {
    setSelectedContentType(type);
    setSelectedTab(tabType);
    if (type === "Bài kiểm tra") {
      setExamPickerForTab(tabType);
      setExamPickerOpen(true);
    } else {
      setLibraryOpen(true);
    }
  };

  const handleSelectItems = (items: SelectedContent[]) => {
    if (selectedTab === "common") {
      setSelectedCommon((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = items.filter((item) => !existingIds.has(item.id));
        return [...prev, ...newItems];
      });
    } else {
      setSelectedPersonal((prev) => {
        const existingIds = new Set(
          prev
            .filter((p) => (p as any).studentId === currentStudentId)
            .map((p) => p.id)
        );
        const newItems = items
          .filter((item) => !existingIds.has(item.id))
          .map((item) => ({ ...item, studentId: currentStudentId }));
        return [...prev, ...newItems];
      });
    }
  };

  const handleRemoveCommonItem = (itemKey: string) => {
    setSelectedCommon((prev) => prev.filter((item) => (item.dbId || item.id) !== itemKey));
  };

  const handleRemovePersonalItem = (itemKey: string) => {
    setSelectedPersonal((prev) => prev.filter((item) => item.id !== itemKey));
  };

  const getContentsByType = (items: SelectedContent[], type: string) => {
    return items.filter((item) => item.type === type);
  };

  const alreadySelectedCommonIds = useMemo(
    () => new Set(selectedCommon.map((c) => c.id)),
    [selectedCommon]
  );

  const alreadySelectedPersonalIds = useMemo(
    () => new Set(
      selectedPersonal
        .filter((c) => (c as any).studentId === currentStudentId)
        .map((c) => c.id)
    ),
    [selectedPersonal, currentStudentId]
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0 border-b">
            <DialogTitle>Nội dung buổi học</DialogTitle>
          </DialogHeader>

          {isLoadingExisting ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Đang tải nội dung...</span>
            </div>
          ) : (
            <Tabs
              defaultValue="common"
              value={selectedTab}
              onValueChange={(v) => setSelectedTab(v as "common" | "personal")}
              className="flex-1 flex flex-col p-6 overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 mb-6 self-start">
                {(["common", "personal"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={cn(
                      "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                      selectedTab === tab
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-foreground hover:bg-muted/50"
                    )}
                  >
                    {tab === "common" ? "Nội dung chung" : "Nội dung cá nhân"}
                  </button>
                ))}
              </div>

              <TabsContent value="common" className="flex-1 overflow-hidden">
                <div className="grid grid-cols-4 gap-4 h-full">
                  {CONTENT_TYPES.map((contentType) => (
                    <ContentTypeCard
                      key={contentType.key}
                      type={contentType.key}
                      label={contentType.label}
                      selectedItems={getContentsByType(selectedCommon, contentType.key)}
                      onAddClick={() => handleAddContent(contentType.key, "common")}
                      onRemoveItem={handleRemoveCommonItem}
                      onViewItem={handleViewItem}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="personal" className="flex-1 overflow-hidden">
                <PersonalContentTable
                  students={students}
                  selectedItems={selectedPersonal}
                  onAddClick={(studentId, contentType) => {
                    setCurrentStudentId(studentId);
                    setSelectedContentType(contentType);
                    setSelectedTab("personal");
                    if (contentType === "Bài kiểm tra") {
                      setExamPickerForTab("personal");
                      setExamPickerOpen(true);
                    } else {
                      setLibraryOpen(true);
                    }
                  }}
                  onRemoveItem={handleRemovePersonalItem}
                />
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-content-dialog"
            >
              Đóng
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoadingExisting}
              data-testid="button-save-content-dialog"
            >
              Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ContentLibraryDialog
        isOpen={libraryOpen}
        onOpenChange={setLibraryOpen}
        contentType={selectedContentType}
        onSelectItems={handleSelectItems}
        programId={programId}
        alreadySelectedIds={
          selectedTab === "common" ? alreadySelectedCommonIds : alreadySelectedPersonalIds
        }
      />
      <ExamPickerDialog
        isOpen={examPickerOpen}
        onOpenChange={setExamPickerOpen}
        onSelectItems={handleSelectItems}
        alreadySelectedIds={
          examPickerForTab === "common" ? alreadySelectedCommonIds : alreadySelectedPersonalIds
        }
      />
      <ContentViewDialog
        isOpen={!!viewingContentId || !!viewingFallbackContent}
        onOpenChange={(open) => { if (!open) { setViewingContentId(null); setViewingFallbackContent(null); } }}
        contentId={viewingContentId}
        fallbackContent={viewingFallbackContent}
      />
      <ExamViewerFromId
        examId={viewingExamId ?? ""}
        open={!!viewingExamId}
        onClose={() => setViewingExamId(null)}
      />
    </>
  );
}
