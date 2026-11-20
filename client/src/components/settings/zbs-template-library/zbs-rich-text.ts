import DOMPurify from "dompurify";
import { toRichTextHtml } from "./ZbsTextBlockEditor";

export function richTextPreviewHtml(text: string, variables: { key: string; example: string }[]) {
  const examples = new Map(variables.map((variable) => [variable.key, variable.example]));
  const html = toRichTextHtml(text).replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}|&lt;([a-zA-Z][a-zA-Z0-9_]*)&gt;/g,
    (token, doubleBraceKey: string | undefined, angleKey: string | undefined) => {
      const key = doubleBraceKey ?? angleKey ?? "";
      const example = examples.get(key);
      if (example === undefined) return token;
      return example
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
  );
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "span"],
    ALLOWED_ATTR: ["style"],
  });
  return sanitized.replace(/<(p|br)\b[^>]*>/gi, "<$1>");
}
