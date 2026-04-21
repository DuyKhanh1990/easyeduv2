import { useState, useRef } from "react";
import { FileViewer } from "@/components/ui/file-viewer";
import {
  X, Send, FileText, Eye, CheckCircle2, Loader2, Plus,
  Image, FileSpreadsheet, FileVideo, FileAudio, FileType2, File, Star,
  ImageIcon, Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssignmentRow } from "@/types/my-assignments";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

const WEEKDAY_LABELS: Record<number, string> = {
  2: "Thứ Hai", 3: "Thứ Ba", 4: "Thứ Tư", 5: "Thứ Năm",
  6: "Thứ Sáu", 7: "Thứ Bảy", 1: "Chủ Nhật",
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
  const [submissionText, setSubmissionText] = useState(row.submissionContent ?? "");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>(row.submissionAttachments ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const gradeImgInputRef = useRef<HTMLInputElement>(null);
  const gradeCommentRef = useRef<HTMLTextAreaElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkPreview, setLinkPreview] = useState<string | null>(null);

  const [isGradeUploading, setIsGradeUploading] = useState(false);
  const [gradeLinkInputVisible, setGradeLinkInputVisible] = useState(false);
  const [gradeLinkValue, setGradeLinkValue] = useState("");
  const [gradeLinkPreview, setGradeLinkPreview] = useState<string | null>(null);

  const [gradeScore, setGradeScore] = useState(row.score ?? "");
  const [gradeComment, setGradeComment] = useState(row.comment ?? "");

  const isAlreadySubmitted = row.submissionStatus === "submitted";

  const uploadFilesApi = async (files: File[]): Promise<{ name: string; url: string }[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Tải file thất bại");
    const data = await res.json();
    return data.files as { name: string; url: string }[];
  };

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      const results = await uploadFilesApi(files);
      return results.map((f) => f.url);
    },
  });

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

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeUploadedUrl = (idx: number) => {
    setUploadedUrls((prev) => prev.filter((_, i) => i !== idx));
  };

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
    let finalUrls = [...uploadedUrls];
    if (attachedFiles.length > 0) {
      const newUrls = await uploadFiles.mutateAsync(attachedFiles);
      finalUrls = [...finalUrls, ...newUrls];
    }
    submitHomework.mutate({
      homeworkId: row.homeworkId,
      submissionContent: submissionText,
      submissionAttachments: finalUrls,
    });
  };

  const handleGradeImagePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setIsGradeUploading(true);
    try {
      const results = await uploadFilesApi([file]);
      const imgUrl = results[0].url;
      setGradeComment((prev) => prev + (prev ? "\n" : "") + imgUrl);
      setTimeout(() => autoResizeTextarea(gradeCommentRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsGradeUploading(false);
    }
  };

  const handleGradeImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsGradeUploading(true);
    try {
      const results = await uploadFilesApi(files);
      const urls = results.map((f) => f.url).join("\n");
      setGradeComment((prev) => prev + (prev ? "\n" : "") + urls);
      setTimeout(() => autoResizeTextarea(gradeCommentRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsGradeUploading(false);
      e.target.value = "";
    }
  };

  const handleGradeInsertLink = () => {
    const url = gradeLinkValue.trim();
    if (!url) return;
    setGradeComment((prev) => prev + (prev ? "\n" : "") + url);
    setGradeLinkValue("");
    setGradeLinkPreview(null);
    setGradeLinkInputVisible(false);
    setTimeout(() => autoResizeTextarea(gradeCommentRef.current), 0);
  };

  const handleGradeLinkChange = (val: string) => {
    setGradeLinkValue(val);
    if (isImageUrl(val)) {
      setGradeLinkPreview(`image:${val}`);
    } else if (val.startsWith("http")) {
      setGradeLinkPreview(`link:${val}`);
    } else {
      setGradeLinkPreview(null);
    }
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

  const isPending = isUploading || uploadFiles.isPending || submitHomework.isPending;
  const canSubmit = !isPending && (!!submissionText.trim() || attachedFiles.length > 0 || uploadedUrls.length > 0);
  const canGrade = !gradeHomework.isPending && (!!gradeScore.trim() || !!gradeComment.trim());

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
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {row.homeworkDescription}
              </div>
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
          {!viewOnly && !isStaff && (
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-foreground">Nhận xét bài làm</label>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Đính kèm ảnh vào nhận xét"
                      onClick={() => gradeImgInputRef.current?.click()}
                      disabled={isGradeUploading}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-grade-attach-image"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Thêm link / URL"
                      onClick={() => setGradeLinkInputVisible((v) => !v)}
                      className={cn(
                        "p-1.5 rounded hover:bg-muted transition-colors",
                        gradeLinkInputVisible ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="button-grade-insert-link"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                    <input
                      ref={gradeImgInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleGradeImageAttach}
                    />
                  </div>
                </div>

                {gradeLinkInputVisible && (
                  <div className="space-y-2 mb-2 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Dán link ảnh hoặc URL tham khảo..."
                        value={gradeLinkValue}
                        onChange={(e) => handleGradeLinkChange(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        data-testid="input-grade-link-value"
                      />
                      <button
                        type="button"
                        onClick={handleGradeInsertLink}
                        disabled={!gradeLinkValue.trim()}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                        data-testid="button-grade-insert-link-confirm"
                      >
                        Chèn
                      </button>
                    </div>
                    {gradeLinkPreview && gradeLinkPreview.startsWith("image:") && (
                      <img
                        src={gradeLinkPreview.replace("image:", "")}
                        alt="preview"
                        className="max-h-32 rounded object-contain"
                      />
                    )}
                  </div>
                )}

                <textarea
                  ref={gradeCommentRef}
                  value={gradeComment}
                  onChange={(e) => {
                    setGradeComment(e.target.value);
                    autoResizeTextarea(e.currentTarget);
                  }}
                  onPaste={handleGradeImagePaste}
                  onInput={(e) => autoResizeTextarea(e.currentTarget)}
                  placeholder="Nhập nhận xét, hoặc paste ảnh trực tiếp vào đây..."
                  className="w-full min-h-[120px] rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none overflow-hidden"
                  data-testid="textarea-grade-comment"
                />
                {isGradeUploading && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Đang tải ảnh lên...
                  </p>
                )}
              </div>
            </div>
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
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">Nội dung bài làm</label>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Đính kèm ảnh vào bài làm"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-attach-image"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Thêm link / URL"
                    onClick={() => setLinkInputVisible((v) => !v)}
                    className={cn(
                      "p-1.5 rounded hover:bg-muted transition-colors",
                      linkInputVisible ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid="button-insert-link"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageAttach}
                  />
                </div>
              </div>

              {/* Link input panel */}
              {linkInputVisible && (
                <div className="space-y-2 mb-2 p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Dán link ảnh hoặc URL tham khảo..."
                      value={linkValue}
                      onChange={(e) => handleLinkChange(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      data-testid="input-link-value"
                    />
                    <button
                      type="button"
                      onClick={handleInsertLink}
                      disabled={!linkValue.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                      data-testid="button-insert-link-confirm"
                    >
                      Chèn
                    </button>
                  </div>
                  {linkPreview && linkPreview.startsWith("image:") && (
                    <img
                      src={linkPreview.replace("image:", "")}
                      alt="preview"
                      className="max-h-32 rounded object-contain"
                    />
                  )}
                </div>
              )}

              <textarea
                ref={contentTextareaRef}
                value={submissionText}
                onChange={(e) => {
                  setSubmissionText(e.target.value);
                  autoResizeTextarea(e.currentTarget);
                }}
                onPaste={handleImagePaste}
                onInput={(e) => autoResizeTextarea(e.currentTarget)}
                placeholder="Nhập nội dung bài làm, hoặc paste ảnh trực tiếp vào đây..."
                className="w-full min-h-[280px] rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none overflow-hidden"
                data-testid="textarea-submission-content"
              />
              {isUploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Đang tải ảnh lên...
                </p>
              )}
            </div>

            {/* File attachments */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Đính kèm file</label>

              <div className="flex flex-wrap gap-2 items-center">
                {uploadedUrls.map((url, i) => (
                  <div
                    key={`uploaded-${i}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted/40 max-w-[200px]"
                    data-testid={`chip-uploaded-${i}`}
                  >
                    {CATEGORY_STYLE[getCategory(getFileName(url))].icon}
                    <span className="truncate text-xs text-foreground">{shortName(getFileName(url))}</span>
                    <button
                      onClick={() => removeUploadedUrl(i)}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      data-testid={`remove-uploaded-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {attachedFiles.map((file, i) => (
                  <div
                    key={`pending-${i}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/5 max-w-[200px]"
                    data-testid={`chip-pending-${i}`}
                  >
                    {CATEGORY_STYLE[getCategory(file.name)].icon}
                    <span className="truncate text-xs text-foreground">{shortName(file.name)}</span>
                    <button
                      onClick={() => removeAttachedFile(i)}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      data-testid={`remove-pending-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-border hover:border-primary/60 hover:bg-muted/40 text-muted-foreground transition-colors"
                  data-testid="button-add-file"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-xs">Thêm file</span>
                </button>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                Ảnh, Word, Excel, PowerPoint, PDF, Video, MP3... | Tối đa 100MB/file
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-submission-files"
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
      canDownload={true}
    />
    </>
  );
}

/* ── Helpers ── */
function SubmissionContentDisplay({ content }: { content: string }) {
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

function AttachmentGrid({ urls, testIdPrefix }: { urls: string[]; testIdPrefix: string }) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  return (
    <>
    <div className="grid grid-cols-3 gap-3">
      {urls.map((url, i) => {
        const name = getFileName(url);
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
      canDownload={true}
    />
    </>
  );
}
