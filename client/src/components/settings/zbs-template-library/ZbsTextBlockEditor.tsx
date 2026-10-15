import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Bold, Italic, Palette } from "lucide-react";

export function toRichTextHtml(value: string) {
  if (!value) return "";
  if (/^\s*<(p|br|strong|em|span)\b/i.test(value)) return value;
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\r?\n/g, "<br>")}</p>`;
}

export function ZbsTextBlockEditor({
  value,
  disabled,
  onChange,
  onEditorReady,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onEditorReady: (editor: Editor | null) => void;
}) {
  const onChangeRef = useRef(onChange);
  const onEditorReadyRef = useRef(onEditorReady);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onEditorReadyRef.current = onEditorReady; }, [onEditorReady]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      TextStyle,
      Color,
    ],
    content: toRichTextHtml(value),
    editable: !disabled,
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      onChangeRef.current(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: "zbs-text-editor-prose",
        "aria-label": "Nội dung khối văn bản",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    onEditorReadyRef.current(editor);
    return () => onEditorReadyRef.current(null);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const incoming = toRichTextHtml(value);
    const normalized = incoming || "<p></p>";
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="min-h-24 rounded-md border border-[#d8e1da] bg-white" />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-[#d8e1da] bg-white">
      <div className="flex items-center gap-1 border-b border-[#e4ebe5] bg-[#f8faf7] px-2 py-1">
        <button
          type="button"
          title="In đậm"
          aria-label="In đậm"
          aria-pressed={editor.isActive("bold")}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded p-1.5 hover:bg-[#e9f0eb] disabled:opacity-50 ${editor.isActive("bold") ? "bg-[#e1ebe4] text-[#315f4e]" : "text-[#60736a]"}`}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="In nghiêng"
          aria-label="In nghiêng"
          aria-pressed={editor.isActive("italic")}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded p-1.5 hover:bg-[#e9f0eb] disabled:opacity-50 ${editor.isActive("italic") ? "bg-[#e1ebe4] text-[#315f4e]" : "text-[#60736a]"}`}
        >
          <Italic className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-[#dce5de]" />
        <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs text-[#60736a] hover:bg-[#e9f0eb]">
          <Palette className="h-4 w-4" />
          <span>Màu chữ</span>
          <input
            type="color"
            aria-label="Chọn màu chữ"
            disabled={disabled}
            onChange={(event) => editor.chain().focus().setColor(event.currentTarget.value).run()}
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          title="Bỏ màu chữ"
          aria-label="Bỏ màu chữ"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().unsetColor().run()}
          className="rounded px-2 py-1 text-[11px] text-[#60736a] hover:bg-[#e9f0eb] disabled:opacity-50"
        >
          Bỏ màu
        </button>
      </div>
      <EditorContent editor={editor} className={`zbs-text-editor-content ${disabled ? "is-disabled" : ""}`} />
    </div>
  );
}
