import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface RichHtmlImagePreviewProps {
  html: string;
  className?: string;
}

export function RichHtmlImagePreview({ html, className }: RichHtmlImagePreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeImage, setActiveImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    contentRef.current?.querySelectorAll("img").forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", image.alt ? `Xem ảnh: ${image.alt}` : "Xem ảnh");
    });
  }, [html]);

  function openImage(image: HTMLImageElement) {
    setActiveImage({
      src: image.currentSrc || image.src,
      alt: image.alt,
    });
  }

  return (
    <>
      <div
        ref={contentRef}
        className={cn("[&_img]:cursor-zoom-in [&_img]:focus-visible:outline [&_img]:focus-visible:outline-2 [&_img]:focus-visible:outline-ring", className)}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(event) => {
          const target = event.target;
          if (target instanceof HTMLImageElement && contentRef.current?.contains(target)) {
            event.preventDefault();
            openImage(target);
          }
        }}
        onKeyDown={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLImageElement &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            openImage(target);
          }
        }}
      />
      <Dialog open={!!activeImage} onOpenChange={(open) => !open && setActiveImage(null)}>
        <DialogContent className="flex h-[90vh] w-[calc(100vw-2rem)] max-w-[96vw] flex-col items-center justify-center p-3 sm:p-5">
          <DialogTitle className="sr-only">Xem ảnh nhận xét</DialogTitle>
          {activeImage && (
            <img
              src={activeImage.src}
              alt={activeImage.alt || "Ảnh trong nhận xét"}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
