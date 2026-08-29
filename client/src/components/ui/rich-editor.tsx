import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ImageIcon, Paperclip, Link as LinkIcon,
  Baseline, Highlighter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

const VideoExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      style: { default: "max-width:100%;border-radius:6px;margin:6px 0" },
    };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes({ controls: true, style: "max-width:480px;width:100%;border-radius:6px;margin:6px 0;display:block" }, HTMLAttributes)];
  },
});

const AudioExtension = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      style: { default: "width:100%;margin:6px 0" },
    };
  },
  parseHTML() {
    return [{ tag: "audio[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["audio", mergeAttributes({ controls: true, style: "width:100%;margin:6px 0" }, HTMLAttributes)];
  },
});

async function uploadFilesApi(files: File[]): Promise<{ name: string; url: string; mimetype?: string }[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const res = await fetch("/api/upload", { method: "POST", body: formData, headers: getAuthHeaders(), credentials: "include" });
  if (!res.ok) throw new Error("Tải file thất bại");
  const data = await res.json();
  return data.files as { name: string; url: string; mimetype?: string }[];
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}
function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}
function isAudioUrl(url: string) {
  return /\.(mp3|wav|ogg|aac|m4a)(\?.*)?$/i.test(url);
}
function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?#]+)/);
  return m ? m[1] : null;
}

export function legacyToHtml(value: string): string {
  if (!value) return "";
  if (value.trim().startsWith("<")) return value;
  const lines = value.split("\n");
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<p></p>";
      if (isImageUrl(trimmed)) return `<img src="${trimmed}" />`;
      if (isVideoUrl(trimmed))
        return `<video src="${trimmed}" controls style="max-width:480px;width:100%;border-radius:6px;margin:6px 0;display:block"></video>`;
      if (isAudioUrl(trimmed))
        return `<audio src="${trimmed}" controls style="width:100%;margin:6px 0"></audio>`;
      const ytId = getYoutubeId(trimmed);
      if (ytId)
        return `<div data-youtube-video><iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:6px;margin:6px 0"></iframe></div>`;
      return `<p>${trimmed}</p>`;
    })
    .join("");
}

const TEXT_COLORS = [
  { label: "Mặc định", value: "" },
  { label: "Đen", value: "#000000" },
  { label: "Xám đậm", value: "#374151" },
  { label: "Xám", value: "#6B7280" },
  { label: "Đỏ", value: "#EF4444" },
  { label: "Cam", value: "#F97316" },
  { label: "Vàng", value: "#CA8A04" },
  { label: "Xanh lá", value: "#16A34A" },
  { label: "Xanh dương", value: "#2563EB" },
  { label: "Tím", value: "#9333EA" },
  { label: "Hồng", value: "#EC4899" },
  { label: "Trắng", value: "#FFFFFF" },
];

const HIGHLIGHT_COLORS = [
  { label: "Bỏ nền", value: "" },
  { label: "Vàng", value: "#FEF08A" },
  { label: "Xanh lá nhạt", value: "#BBF7D0" },
  { label: "Xanh dương nhạt", value: "#BAE6FD" },
  { label: "Hồng nhạt", value: "#FBCFE8" },
  { label: "Tím nhạt", value: "#E9D5FF" },
  { label: "Cam nhạt", value: "#FED7AA" },
  { label: "Đỏ nhạt", value: "#FECACA" },
  { label: "Xám nhạt", value: "#E5E7EB" },
];

interface ToolbarBtnProps {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}
function ToolbarBtn({ active, title, onClick, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border mx-0.5 self-center" />;
}

interface ColorSwatchProps {
  colors: { label: string; value: string }[];
  onSelect: (val: string) => void;
  onClose: () => void;
}
function ColorSwatches({ colors, onSelect, onClose }: ColorSwatchProps) {
  return (
    <div className="grid grid-cols-6 gap-1 p-2">
      {colors.map((c) => (
        <button
          key={c.value || "none"}
          type="button"
          title={c.label}
          onClick={() => { onSelect(c.value); onClose(); }}
          className={cn(
            "w-6 h-6 rounded border border-border hover:scale-110 transition-transform",
            c.value === "" && "bg-white dark:bg-zinc-800 text-[10px] text-muted-foreground flex items-center justify-center"
          )}
          style={c.value ? { backgroundColor: c.value } : undefined}
        >
          {c.value === "" ? "✕" : null}
        </button>
      ))}
    </div>
  );
}

export interface RichEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Giới hạn chiều cao vùng soạn thảo — khi vượt quá sẽ scroll nội bộ thay vì đẩy dialog ra ngoài */
  maxHeight?: string;
}

export function RichEditor({ value, onChange, placeholder, minHeight = "72px", maxHeight }: RichEditorProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Image.configure({ inline: false, allowBase64: false }),
      VideoExtension,
      AudioExtension,
      Youtube.configure({ width: 480, height: 270, nocookie: true }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Nhập nội dung..." }),
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
    ],
    content: legacyToHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm`,
        style: `min-height: ${minHeight}`,
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith("image/"));
        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return false;
          setIsUploading(true);
          uploadFilesApi([file])
            .then((results) => {
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: results[0].url })
                )
              );
            })
            .catch(() => toast({ title: "Lỗi upload ảnh", variant: "destructive" }))
            .finally(() => setIsUploading(false));
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = legacyToHtml(value);
    if (current !== incoming && (incoming !== "<p></p>" || value === "")) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  const handleMediaAttach = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length || !editor) return;
      setIsUploading(true);
      try {
        const results = await uploadFilesApi(files);
        results.forEach((r) => {
          const mime = r.mimetype ?? "";
          const isImage = mime.startsWith("image/") || isImageUrl(r.url) || isImageUrl(r.name);
          const isVideo = mime.startsWith("video/") || isVideoUrl(r.url) || isVideoUrl(r.name);
          const isAudio = mime.startsWith("audio/") || isAudioUrl(r.url) || isAudioUrl(r.name);

          if (isImage) {
            editor.chain().focus().setImage({ src: r.url }).run();
          } else if (isVideo) {
            editor
              .chain()
              .focus()
              .insertContent({ type: "video", attrs: { src: r.url } })
              .run();
          } else if (isAudio) {
            editor
              .chain()
              .focus()
              .insertContent({ type: "audio", attrs: { src: r.url } })
              .run();
          }
        });
      } catch {
        toast({ title: "Lỗi upload file", variant: "destructive" });
      } finally {
        setIsUploading(false);
        e.target.value = "";
      }
    },
    [editor, toast]
  );

  const handleYoutube = useCallback(() => {
    const url = window.prompt("Dán link YouTube:");
    if (!url || !editor) return;
    const ytId = getYoutubeId(url.trim());
    if (ytId) {
      editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
    } else {
      toast({
        title: "Link không hợp lệ",
        description: "Vui lòng nhập link YouTube hợp lệ",
        variant: "destructive",
      });
    }
  }, [editor, toast]);

  const handleLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Dán link cần gắn:", previousUrl);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor.chain().focus().setLink({ href: normalized, target: "_blank", rel: "noopener noreferrer" }).run();
  }, [editor]);

  if (!editor) return null;

  const currentColor = editor.getAttributes("textStyle").color ?? "";
  const currentHighlight = editor.getAttributes("highlight").color ?? "";
  const currentFontFamily = editor.getAttributes("textStyle").fontFamily ?? "";
  const currentFontSize = editor.getAttributes("textStyle").fontSize ?? "";

  return (
    <div className={cn("tiptap-rich-editor rounded-md border border-input bg-background", isUploading && "opacity-60 pointer-events-none")}>
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-border/50">

        {/* Font family */}
        <select
          title="Font chữ"
          value={currentFontFamily}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          className="h-6 rounded border border-border bg-background text-[11px] text-foreground px-1 cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring max-w-[110px]"
        >
          <option value="">Mặc định</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="Trebuchet MS, sans-serif">Trebuchet</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Times New Roman, serif">Times New Roman</option>
          <option value="Courier New, monospace">Courier New</option>
          <option value="'Segoe UI', sans-serif">Segoe UI</option>
        </select>

        {/* Font size */}
        <select
          title="Cỡ chữ"
          value={currentFontSize}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontSize(v).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
          className="h-6 w-14 rounded border border-border bg-background text-[11px] text-foreground px-1 cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Cỡ</option>
          <option value="10px">10</option>
          <option value="11px">11</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
          <option value="28px">28</option>
          <option value="32px">32</option>
          <option value="36px">36</option>
          <option value="48px">48</option>
        </select>

        <Divider />

        <ToolbarBtn active={editor.isActive("bold")} title="Đậm (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")} title="Nghiêng (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("underline")} title="Gạch chân (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("strike")} title="Gạch ngang" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <Divider />

        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Màu chữ"
              className="p-1 rounded hover:bg-muted transition-colors flex flex-col items-center gap-0"
            >
              <Baseline className="w-3.5 h-3.5 text-muted-foreground" />
              <div
                className="w-3.5 h-1 rounded-sm border border-border/50"
                style={{ backgroundColor: currentColor || "#000000" }}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <p className="text-xs text-muted-foreground px-2 pt-2 pb-1 font-medium">Màu chữ</p>
            <ColorSwatches
              colors={TEXT_COLORS}
              onSelect={(v) => {
                if (v) editor.chain().focus().setColor(v).run();
                else editor.chain().focus().unsetColor().run();
              }}
              onClose={() => setColorOpen(false)}
            />
          </PopoverContent>
        </Popover>

        <Popover open={highlightOpen} onOpenChange={setHighlightOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Màu nền"
              className="p-1 rounded hover:bg-muted transition-colors flex flex-col items-center gap-0"
            >
              <Highlighter className="w-3.5 h-3.5 text-muted-foreground" />
              <div
                className="w-3.5 h-1 rounded-sm border border-border/50"
                style={{ backgroundColor: currentHighlight || "transparent" }}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <p className="text-xs text-muted-foreground px-2 pt-2 pb-1 font-medium">Màu nền chữ</p>
            <ColorSwatches
              colors={HIGHLIGHT_COLORS}
              onSelect={(v) => {
                if (v) editor.chain().focus().setHighlight({ color: v }).run();
                else editor.chain().focus().unsetHighlight().run();
              }}
              onClose={() => setHighlightOpen(false)}
            />
          </PopoverContent>
        </Popover>

        <Divider />

        <ToolbarBtn active={editor.isActive({ textAlign: "left" })} title="Căn trái" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive({ textAlign: "center" })} title="Căn giữa" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive({ textAlign: "right" })} title="Căn phải" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive({ textAlign: "justify" })} title="Căn đều" onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn active={editor.isActive("bulletList")} title="Danh sách" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("orderedList")} title="Danh sách đánh số" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <Divider />

        <label title="Đính kèm ảnh / video / audio" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ImageIcon className="w-3.5 h-3.5" />
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/mpeg,audio/mp3,audio/wav,audio/aac"
            multiple
            className="hidden"
            onChange={handleMediaAttach}
          />
        </label>
        <ToolbarBtn title="Chèn video YouTube" onClick={handleYoutube}>
          <Paperclip className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("link")} title="Gắn link vào đoạn văn bản" onClick={handleLink}>
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>

        {isUploading && <span className="text-[10px] text-muted-foreground ml-1">Đang tải...</span>}
      </div>

      <div
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
        className={maxHeight ? "overflow-y-auto" : undefined}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
