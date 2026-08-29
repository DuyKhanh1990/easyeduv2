import { useState, useRef } from "react";
import { FileViewer } from "@/components/ui/file-viewer";
import { FileAttachmentInput, type AttachedFile } from "@/components/ui/file-attachment-input";
import { useCanDownloadFiles } from "@/hooks/use-can-download-files";
import {
  X, Send, FileText, Eye, CheckCircle2, Loader2,
  Image, FileSpreadsheet, FileVideo, FileAudio, FileType2, File, Star,
  ImageIcon, Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssignmentRow } from "@/types/my-assignments";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { RichEditor } from "@/components/ui/rich-editor";
import { RichContentRenderer } from "@/components/ui/rich-content-renderer";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Chủ Nhật", 1: "Thứ Hai", 2: "Thứ Ba", 3: "Thứ Tư",
  4: "Thứ Năm", 5: "Thứ Sáu", 6: "Thứ Bảy",
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function shortName(name: string, maxLen = 20) {
  if (name.length <= maxLen) return name;
  const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")) : "";
  return name.substring(0, maxLen - ext.length - 1) + "…" + ext;
}

function getFileName(url: string) {
  return decodeURIComponent(url.split("/").pop() || url);
}

function getExt(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.substring(dot + 1).toLowerCase();
}

type FileCategory = "image" | "pdf" | "word" | "excel" | "ppt" | "video" | "audio" | "other";

function getCategory(name: string): FileCategory {
  const ext = getExt(name);
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return "other";
}

const CATEGORY_STYLE: Record<FileCategory, { bg: string; icon: React.ReactNode }> = {
  image:  { bg: "bg-purple-100 dark:bg-purple-900/30",  icon: <Image        className="w-5 h-5 text-purple-600 dark:text-purple-400" /> },
  pdf:    { bg: "bg-red-100 dark:bg-red-900/30",        icon: <FileText     className="w-5 h-5 text-red-600 dark:text-red-400" /> },
  word:   { bg: "bg-blue-100 dark:bg-blue-900/30",      icon: <FileType2    className="w-5 h-5 text-blue-600 dark:text-blue-400" /> },
  excel:  { bg: "bg-green-100 dark:bg-green-900/30",    icon: <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" /> },
  ppt:    { bg: "bg-orange-100 dark:bg-orange-900/30",  icon: <FileText     className="w-5 h-5 text-orange-600 dark:text-orange-400" /> },
  video:  { bg: "bg-pink-100 dark:bg-pink-900/30",      icon: <FileVideo    className="w-5 h-5 text-pink-600 dark:text-pink-400" /> },
  audio:  { bg: "bg-yellow-100 dark:bg-yellow-900/30",  icon: <FileAudio    className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /> },
  other:  { bg: "bg-muted",                             icon: <File         className="w-5 h-5 text-muted-foreground" /> },
};

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

interface Props {
  row: AssignmentRow;
  open: boolean;
  viewOnly?: boolean;
  isStaff?: boolean;
  onClose: () => void;
  onGraded?: () => void;
}

export function AssignmentSubmitDialog({ row, open, viewOnly = false, isStaff = false, onClose, onGraded }: Props) {
  const { toast } = useToast();
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const canDownload = useCanDownloadFiles();
  const [submissionText, setSubmissionText] = useState(row.submissionContent ?? "");
  const [attachments, setAttachments] = useState<AttachedFile[]>(
    (row.submissionAttachments ?? []).map((item: any) => {
      if (typeof item === "string") {
        return { name: decodeURIComponent(item.split("/").pop() || item), url: item };
      }
      // handle legacy object format {name, url} stored in DB
      const url: string = item.url || item;
      const name: string = item.name && !item.name.startsWith("http")
        ? item.name
        : decodeURIComponent(url.split("/").pop() || url);
      return { name, url };
    })
  );
  const imgInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkPreview, setLinkPreview] = useState<string | null>(null);


  const [gradeScore, setGradeScore] = useState(row.score ?? "");
  const [gradeComment, setGradeComment] = useState(row.comment ?? "");

  const isAlreadySubmitted = row.submissionStatus === "submitted";
  const isPastDue = !!(row.dueDate && new Date() > new Date(row.dueDate) && row.itemType === "BTVN");

  const uploadFilesApi = async (files: File[]): Promise<{ name: string; url: string }[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData, headers: getAuthHeaders(), credentials: "include" });
    if (!res.ok) throw new Error("Tải file thất bại");
    const data = await res.json();
    return data.files as { name: string; url: string }[];
  };

  const submitHomework = useMutation({
    mutationFn: async (payload: { homeworkId: string; submissionContent: string; submissionAttachments: string[] }) => {
      await apiRequest("POST", "/api/my-space/assignments/student/submit", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/student"] });
      toast({ title: "Nộp bài thành công", description: "Bài tập của bạn đã được gửi đi." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể nộp bài.", variant: "destructive" });
    },
  });

  const gradeHomework = useMutation({
    mutationFn: async (payload: { studentSessionContentId: string; score: string; gradingComment: string }) => {
      await apiRequest("POST", "/api/my-space/assignments/staff/grade", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/student"] });
      toast({ title: "Chấm bài thành công", description: "Điểm và nhận xét đã được lưu." });
      onGraded?.();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể chấm bài.", variant: "destructive" });
    },
  });

  const handleImagePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setIsUploading(true);
    try {
      const results = await uploadFilesApi([file]);
      const imgUrl = results[0].url;
      const current = submissionText;
      const newText = current + (current ? "\n" : "") + imgUrl;
      setSubmissionText(newText);
      setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const results = await uploadFilesApi(files);
      const urls = results.map((f) => f.url).join("\n");
      const current = submissionText;
      setSubmissionText(current + (current ? "\n" : "") + urls);
      setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleInsertLink = () => {
    const url = linkValue.trim();
    if (!url) return;
    const current = submissionText;
    setSubmissionText(current + (current ? "\n" : "") + url);
    setLinkValue("");
    setLinkPreview(null);
    setLinkInputVisible(false);
    setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
  };

  const handleLinkChange = (val: string) => {
    setLinkValue(val);
    if (isImageUrl(val)) {
      setLinkPreview(`image:${val}`);
    } else if (val.startsWith("http")) {
      setLinkPreview(`link:${val}`);
    } else {
      setLinkPreview(null);
    }
  };

  const handleSubmit = async () => {
    submitHomework.mutate({
      homeworkId: row.homeworkId,
      submissionContent: submissionText,
      submissionAttachments: attachments.map((a) => a.url),
    });
  };


  const handleGrade = () => {
    if (!row.studentSessionContentId) {
      toast({ title: "Lỗi", description: "Không tìm thấy bài nộp để chấm.", variant: "destructive" });
      return;
    }
    gradeHomework.mutate({
      studentSessionContentId: row.studentSessionContentId,
      score: gradeScore,
      gradingComment: gradeComment,
    });
  };

  const isPending = isUploading || submitHomework.isPending;
  const submissionHasContent = submissionText.replace(/<[^>]*>/g, "").trim().length > 0;
  const canSubmit = !isPending && (submissionHasContent || attachments.length > 0);
  const canGrade = !gradeHomework.isPending && (!!gradeScore.trim() || !!gradeComment);

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex bg-background" data-testid="dialog-assignment-submit">

      {/* ── LEFT HALF — Assignment content ── */}
      <div className="w-1/2 flex flex-col border-r border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base text-foreground leading-tight">{row.homeworkTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.className} &middot; {WEEKDAY_LABELS[row.weekday]}, {formatDate(row.sessionDate)}
                {row.sessionIndex != null && ` · Buổi ${row.sessionIndex}`}
                {isStaff && row.studentName && ` · ${row.studentName}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
            data-testid="button-close-assignment-dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status badge */}
          <div>
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
              isAlreadySubmitted
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            )}>
              {isAlreadySubmitted && <CheckCircle2 className="w-3.5 h-3.5" />}
              {isAlreadySubmitted ? "Đã nộp" : "Chưa nộp"}
            </span>
          </div>

          {/* Description */}
          {row.homeworkDescription && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Nội dung bài tập</h3>
              <RichContentRenderer text={row.homeworkDescription} />
            </div>
          )}

          {/* Homework file attachments */}
          {row.homeworkAttachments && row.homeworkAttachments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Tài liệu đính kèm</h3>
              <div className="grid grid-cols-3 gap-3">
                {row.homeworkAttachments.map((att, i) => {
                  const cat = getCategory(att.name);
                  const style = CATEGORY_STYLE[cat];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setViewerFile({ url: att.url, name: att.name })}
                      className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-border overflow-hidden transition-colors group text-center"
                      data-testid={`link-homework-attachment-${i}`}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center rounded-xl">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      </div>
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
                        {style.icon}
                      </div>
                      <span className="text-xs text-foreground leading-tight break-all line-clamp-2">
                        {att.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!row.homeworkDescription && (!row.homeworkAttachments || row.homeworkAttachments.length === 0) && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Không có mô tả bài tập.
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT HALF — Submission / Grading ── */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div>
            <h3 className="font-semibold text-base text-foreground">
              {isStaff ? "Bài đã nộp" : viewOnly ? "Bài đã nộp" : isAlreadySubmitted ? "Bài đã nộp" : "Nộp bài tập"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStaff
                ? "Xem bài làm và chấm điểm cho học viên."
                : viewOnly
                  ? "Xem lại bài làm đã nộp."
                  : isAlreadySubmitted
                    ? "Bạn có thể nộp lại để cập nhật bài làm."
                    : "Nhập nội dung bài làm và đính kèm file (nếu có)."}
            </p>
          </div>

          {/* Grade button for staff */}
          {isStaff && row.studentSessionContentId && (
            <button
              onClick={handleGrade}
              disabled={!canGrade}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                canGrade
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              data-testid="button-grade-homework"
            >
              {gradeHomework.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
              {gradeHomework.isPending ? "Đang lưu..." : "Chấm bài"}
            </button>
          )}

          {/* Submit button for students */}
          {!viewOnly && !isStaff && !isPastDue && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              data-testid="button-submit-homework"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isPending ? "Đang nộp..." : isAlreadySubmitted ? "Nộp lại" : "Nộp bài"}
            </button>
          )}
        </div>

        {/* Staff view: submission + grading form */}
        {isStaff ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {row.submissionContent && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Nội dung bài làm</h4>
                <SubmissionContentDisplay content={row.submissionContent} />
              </div>
            )}

            {row.submissionAttachments && row.submissionAttachments.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">File đính kèm của học viên</h4>
                <AttachmentGrid urls={row.submissionAttachments} testIdPrefix="staff" />
              </div>
            )}

            {!row.submissionContent && (!row.submissionAttachments || row.submissionAttachments.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                Học viên chưa nộp bài.
              </div>
            )}

            {/* Grading section */}
            <div className="border-t border-border pt-5 space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500" />
                Chấm bài
              </h4>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Điểm</label>
                <input
                  type="text"
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  placeholder="Nhập điểm (vd: 8, 9.5, A+...)"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-grade-score"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Nhận xét bài làm</label>
                <RichEditor
                  value={gradeComment}
                  onChange={setGradeComment}
                  placeholder="Nhập nhận xét, hoặc paste ảnh trực tiếp vào đây..."
                  data-testid="textarea-grade-comment"
                />
              </div>
            </div>
          </div>
        ) : isPastDue ? (
          /* Past deadline — read-only view with notice */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <span className="text-red-500 dark:text-red-400 mt-0.5 text-base">⏰</span>
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                Đã quá thời gian hạn nộp bài — không thể nộp hoặc nộp lại nữa.
              </p>
            </div>
            {row.submissionContent && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Nội dung bài làm</h4>
                <SubmissionContentDisplay content={row.submissionContent} />
              </div>
            )}
            {row.submissionAttachments && row.submissionAttachments.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">File đính kèm</h4>
                <AttachmentGrid urls={row.submissionAttachments} testIdPrefix="student" />
              </div>
            )}
            {!row.submissionContent && (!row.submissionAttachments || row.submissionAttachments.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Chưa có nội dung bài nộp.
              </div>
            )}
          </div>
        ) : viewOnly ? (
          /* Student view-only */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {row.submissionContent && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Nội dung bài làm</h4>
                <SubmissionContentDisplay content={row.submissionContent} />
              </div>
            )}

            {row.submissionAttachments && row.submissionAttachments.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">File đính kèm</h4>
                <AttachmentGrid urls={row.submissionAttachments} testIdPrefix="student" />
              </div>
            )}

            {!row.submissionContent && (!row.submissionAttachments || row.submissionAttachments.length === 0) && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Chưa có nội dung bài nộp.
              </div>
            )}
          </div>
        ) : (
          /* Student editable form */
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nội dung bài làm</label>

              <RichEditor
                value={submissionText}
                onChange={setSubmissionText}
                placeholder="Nhập nội dung bài làm, hoặc paste ảnh trực tiếp vào đây..."
                minHeight="220px"
              />
            </div>

            {/* File attachments */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Đính kèm file</label>
              <FileAttachmentInput
                value={attachments}
                onChange={setAttachments}
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>
    </div>
    <FileViewer
      open={!!viewerFile}
      onClose={() => setViewerFile(null)}
      url={viewerFile?.url ?? ""}
      name={viewerFile?.name ?? ""}
      canDownload={canDownload}
    />
    </>
  );
}

/* ── Helpers ── */
function SubmissionContentDisplay({ content }: { content: string }) {
  if (content.trimStart().startsWith("<")) {
    return (
      <div
        className="rounded-xl border border-border bg-muted/20 px-4 py-3 prose prose-sm max-w-none dark:prose-invert min-h-[80px]"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  const lines = content.split("\n");
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground leading-relaxed space-y-2 min-h-[80px]">
      {lines.map((line, i) => {
        if (/^\/uploads\//.test(line.trim()) || /^https?:\/\//.test(line.trim())) {
          const url = line.trim();
          if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url)) {
            return (
              <div key={i}>
                <img src={url} alt="ảnh bài làm" className="max-h-60 rounded-lg object-contain border border-border" />
              </div>
            );
          }
          return (
            <div key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all text-xs">
                {url}
              </a>
            </div>
          );
        }
        return line ? <p key={i}>{line}</p> : <br key={i} />;
      })}
    </div>
  );
}

function AttachmentGrid({ urls, testIdPrefix }: { urls: Array<string | { name: string; url: string }>; testIdPrefix: string }) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const canDownload = useCanDownloadFiles();
  return (
    <>
    <div className="grid grid-cols-3 gap-3">
      {urls.map((entry, i) => {
        const url: string = typeof entry === "string" ? entry : (entry.url ?? "");
        const name: string = typeof entry === "string" ? getFileName(entry) : (entry.name && !entry.name.startsWith("http") ? entry.name : getFileName(url));
        const cat = getCategory(name);
        const style = CATEGORY_STYLE[cat];
        return (
          <button
            key={i}
            type="button"
            onClick={() => setViewerFile({ url, name })}
            className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-border overflow-hidden transition-colors group text-center"
            data-testid={`link-submission-attachment-${testIdPrefix}-${i}`}
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center rounded-xl">
              <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
              {style.icon}
            </div>
            <span className="text-xs text-foreground leading-tight break-all line-clamp-2">{name}</span>
          </button>
        );
      })}
    </div>
    <FileViewer
      open={!!viewerFile}
      onClose={() => setViewerFile(null)}
      url={viewerFile?.url ?? ""}
      name={viewerFile?.name ?? ""}
      canDownload={canDownload}
    />
    </>
  );
}
