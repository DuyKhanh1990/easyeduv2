import { FileText, FileImage, FileSpreadsheet, FileType2, Film, Music, File } from "lucide-react";
import type { ReactNode } from "react";

export const MAX_FILE_SIZE_MB = 100;

export const ACCEPTED_FILE_TYPES =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.mp4,.mov,.avi,.wav,.ogg,.aac,.mkv,.webm,.zip,.rar,.txt,.csv";

export function parseAttachment(att: string): { name: string; url: string | null } {
  if (att.includes("||")) {
    const sepIdx = att.indexOf("||");
    return { name: att.slice(0, sepIdx), url: att.slice(sepIdx + 2) };
  }
  return { name: att, url: null };
}

export function getFileTypeInfo(filename: string): { icon: ReactNode; color: string } {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
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
