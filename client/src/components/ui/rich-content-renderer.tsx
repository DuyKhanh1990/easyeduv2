export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface RichContentRendererProps {
  text: string;
  className?: string;
}

export function RichContentRenderer({ text, className }: RichContentRendererProps) {
  const isHtml = /<[a-z][\s\S]*>/i.test(text);

  if (isHtml) {
    return (
      <div
        className={
          className ??
          "prose prose-sm max-w-none text-foreground/90 " +
          "prose-p:my-1 prose-p:leading-relaxed " +
          "prose-ul:my-1 prose-ol:my-1 " +
          "prose-li:my-0.5 " +
          "prose-strong:font-semibold " +
          "prose-a:text-primary prose-a:underline " +
          "prose-img:rounded-lg prose-img:max-h-60 prose-img:object-contain prose-img:cursor-pointer"
        }
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }

  return (
    <div className={className ?? "text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap"}>
      {text}
    </div>
  );
}

export function RichContentPreview({ text, maxLength = 100 }: { text: string | null | undefined; maxLength?: number }) {
  if (!text) return null;
  const plain = /<[a-z][\s\S]*>/i.test(text)
    ? stripHtml(text)
    : text.replace(/\s+/g, " ").trim();
  return <>{plain.length > maxLength ? plain.slice(0, maxLength) + "..." : plain}</>;
}
