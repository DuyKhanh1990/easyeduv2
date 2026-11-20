import { useRef, useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileViewer } from "@/components/ui/file-viewer";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import { useCanDownloadFiles } from "@/hooks/use-can-download-files";
import { cn } from "@/lib/utils";
import { getFileTypeInfo, MAX_FILE_SIZE_MB, ACCEPTED_FILE_TYPES } from "@/lib/file-utils";

export interface AttachedFile {
  name: string;
  url: string;
}

interface FileAttachmentInputProps {
  value: AttachedFile[];
  onChange: (value: AttachedFile[]) => void;
  disabled?: boolean;
  maxSizeMb?: number;
  accept?: string;
  description?: string;
}

export function FileAttachmentInput({
  value,
  onChange,
  disabled,
  maxSizeMb = MAX_FILE_SIZE_MB,
  accept = ACCEPTED_FILE_TYPES,
  description,
}: FileAttachmentInputProps) {
  const { toast } = useToast();
  const canDownload = useCanDownloadFiles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerFile, setViewerFile] = useState<AttachedFile | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.filter((f) => f.size > maxSizeMb * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: "File quá lớn",
        description: `Tối đa ${maxSizeMb}MB/file`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: formData, headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Upload thất bại");
      const data = await res.json();
      const uploaded: AttachedFile[] = data.files as { name: string; url: string }[];
      onChange([...value, ...uploaded]);
    } catch {
      toast({
        title: "Lỗi upload",
        description: "Không thể tải file lên",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="grid grid-cols-6 gap-2">
          {value.map((att, idx) => {
            const { icon, color } = getFileTypeInfo(att.name);
            return (
              <div
                key={idx}
                className="group relative flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-lg bg-muted/30 border border-border text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setViewerFile(att)}
              >
                <div className={cn("flex items-center justify-center w-8 h-8 rounded-md shrink-0", color)}>
                  {icon}
                </div>
                <span className="text-[10px] text-foreground w-full truncate px-0.5">{att.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!disabled && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={accept}
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-dashed"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {isUploading ? "Đang tải lên..." : "Thêm file"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">
            {description ?? `Ảnh, Word, Excel, PowerPoint, PDF, Video, MP3... | Tối đa ${maxSizeMb}MB/file`}
          </p>
        </div>
      )}

      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={canDownload}
      />
    </div>
  );
}
