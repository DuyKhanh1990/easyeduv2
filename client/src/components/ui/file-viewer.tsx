import { useEffect, useState } from "react";
import { X, Download, FileText, FileImage, FileVideo, FileAudio, FileSpreadsheet, File, Maximize2, Minimize2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";
import { getAuthHeaders } from "@/lib/queryClient";

export interface FileViewerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  name: string;
  canDownload?: boolean;
}

type FileCategory = "image" | "pdf" | "video" | "audio" | "word" | "excel" | "ppt" | "other";

function getFileCategory(name: string, url: string): FileCategory {
  const ext = (name.split(".").pop() || url.split(".").pop() || "").toLowerCase().split("?")[0];
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac"].includes(ext)) return "audio";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  return "other";
}

function getCategoryIcon(category: FileCategory) {
  switch (category) {
    case "image": return FileImage;
    case "video": return FileVideo;
    case "audio": return FileAudio;
    case "excel": return FileSpreadsheet;
    case "pdf":
    case "word":
    case "ppt": return FileText;
    default: return File;
  }
}

function getCategoryLabel(category: FileCategory): string {
  switch (category) {
    case "image": return "Hình ảnh";
    case "pdf": return "PDF";
    case "video": return "Video";
    case "audio": return "Âm thanh";
    case "word": return "Word";
    case "excel": return "Excel / Bảng tính";
    case "ppt": return "PowerPoint";
    default: return "File";
  }
}

function getViewerUrl(category: FileCategory, url: string): string {
  const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  if (category === "ppt") {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
  }
  if (category === "excel") {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absoluteUrl)}`;
  }
  if (category === "word") {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
  }
  if (category === "pdf") {
    return `${absoluteUrl}#toolbar=0&navpanes=0`;
  }
  return absoluteUrl;
}

export function FileViewer({ open, onClose, url, name, canDownload = true }: FileViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [docxHtml, setDocxHtml] = useState("");
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState("");
  const category = getFileCategory(name, url);
  const CategoryIcon = getCategoryIcon(category);
  const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const isDocx = name.split(".").pop()?.toLowerCase() === "docx";
  useEffect(() => {
    if (!open) setIsFullscreen(false);
  }, [open]);
  useEffect(() => {
    if (!open || !isDocx || !url) {
      setDocxHtml("");
      setDocxError("");
      setDocxLoading(false);
      return;
    }

    const controller = new AbortController();
    setDocxHtml("");
    setDocxError("");
    setDocxLoading(true);
    const fileUrl = url.startsWith(window.location.origin)
      ? url
      : `/api/media/proxy?url=${encodeURIComponent(url)}`;

    void (async () => {
      try {
        const response = await fetch(fileUrl, {
          headers: getAuthHeaders(),
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Không thể tải nội dung tệp.");
        const { convertToHtml } = await import("mammoth");
        const result = await convertToHtml({ arrayBuffer: await response.arrayBuffer() });
        setDocxHtml(DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true } }));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[FileViewer] DOCX preview failed", error);
          setDocxError("Không thể xem trực tiếp tệp Word này. Bạn có thể tải tệp xuống để xem.");
        }
      } finally {
        if (!controller.signal.aborted) setDocxLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, isDocx, url]);
  const toggleFullscreen = () => setIsFullscreen((value) => !value);
  const closeViewer = () => {
    setIsFullscreen(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeViewer(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className={`fixed z-[200] p-0 gap-0 overflow-hidden flex flex-col bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] ${
          isFullscreen
            ? "inset-0 w-screen h-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none"
            : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-w-5xl w-full max-h-[90vh] sm:rounded-lg"
        }`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/40 shrink-0">
          <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-sm font-medium truncate" data-testid="file-viewer-name">{name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={isFullscreen ? "Thu nhỏ" : "Mở rộng"}
              aria-label={isFullscreen ? "Thu nhỏ" : "Mở rộng"}
              onClick={toggleFullscreen}
              data-testid="file-viewer-expand-btn"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            {canDownload && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Tải xuống"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = absoluteUrl;
                  a.download = name;
                  a.click();
                }}
                data-testid="file-viewer-download-btn"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={closeViewer}
              data-testid="file-viewer-close-btn"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={`flex-1 overflow-hidden bg-muted/20 ${isFullscreen ? "min-h-0" : ""}`} data-testid="file-viewer-content">
          {category === "image" && (
            <div className={`w-full h-full flex items-center justify-center p-4 ${isFullscreen ? "min-h-0" : "min-h-[60vh]"}`}>
              <img
                src={absoluteUrl}
                alt={name}
                className={`max-w-full ${isFullscreen ? "max-h-full" : "max-h-[75vh]"} object-contain rounded`}
                data-testid="file-viewer-image"
              />
            </div>
          )}

          {category === "pdf" && (
            <iframe
              src={getViewerUrl("pdf", url)}
              className={`w-full ${isFullscreen ? "h-full min-h-0" : "min-h-[75vh]"}`}
              title={name}
              data-testid="file-viewer-pdf"
            />
          )}

          {category === "video" && (
            <div className={`w-full flex items-center justify-center p-4 ${isFullscreen ? "h-full min-h-0" : "min-h-[60vh]"}`}>
              <video
                src={absoluteUrl}
                controls
                controlsList={canDownload ? undefined : "nodownload"}
                className={`max-w-full ${isFullscreen ? "max-h-full" : "max-h-[75vh]"} rounded`}
                data-testid="file-viewer-video"
              />
            </div>
          )}

          {category === "audio" && (
            <div className={`w-full flex flex-col items-center justify-center gap-6 p-8 ${isFullscreen ? "h-full min-h-0" : "min-h-[30vh]"}`}>
              <div className="flex flex-col items-center gap-2">
                <FileAudio className="h-16 w-16 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">{name}</p>
              </div>
              <audio
                src={absoluteUrl}
                controls
                controlsList={canDownload ? undefined : "nodownload"}
                className="w-full max-w-md"
                data-testid="file-viewer-audio"
              />
            </div>
          )}

          {category === "word" && isDocx && (
            <div className={`w-full overflow-auto bg-white p-6 sm:p-10 ${isFullscreen ? "h-full min-h-0" : "min-h-[60vh] max-h-[75vh]"}`}>
              {docxLoading ? (
                <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
                  Đang tải bản xem trước...
                </div>
              ) : docxError ? (
                <div className="flex min-h-[50vh] items-center justify-center text-center text-sm text-muted-foreground">
                  {docxError}
                </div>
              ) : (
                <article
                  className="prose prose-sm mx-auto max-w-3xl text-slate-800"
                  dangerouslySetInnerHTML={{ __html: docxHtml }}
                  data-testid="file-viewer-docx"
                />
              )}
            </div>
          )}

          {((category === "word" && !isDocx) || category === "excel" || category === "ppt") && (
            <div className={`relative w-full ${isFullscreen ? "h-full min-h-0" : "min-h-[75vh]"}`}>
              <iframe
                src={getViewerUrl(category, url)}
                className={`w-full ${isFullscreen ? "h-full min-h-0" : "min-h-[75vh]"} border-0`}
                title={name}
                data-testid={`file-viewer-${category}`}
              />
              <div className="absolute bottom-3 right-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5 text-xs shadow"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Thu nhỏ" : "Mở rộng"}
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {isFullscreen ? "Thu nhỏ" : "Mở rộng"}
                </Button>
              </div>
            </div>
          )}

          {category === "other" && (
            <div className="w-full flex flex-col items-center justify-center gap-4 p-8 min-h-[30vh]">
              <File className="h-16 w-16 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getCategoryLabel(category)} — không thể xem trực tiếp
                </p>
              </div>
              {canDownload && (
                <a href={absoluteUrl} download={name} target="_blank" rel="noopener noreferrer">
                  <Button variant="default" size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Tải xuống để xem
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
