import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, PointerEvent } from "react";

type ZbsLogoCropFieldProps = {
  label: string;
  theme?: "light" | "dark";
  value: string | null | undefined;
  disabled?: boolean;
  onChange: (url: string | null) => void;
};

type CropImage = {
  file: File;
  src: string;
  width: number;
  height: number;
};

const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = 96;
const MAX_SOURCE_SIZE = 12 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function ZbsLogoCropField({
  label,
  theme = "light",
  value,
  disabled = false,
  onChange,
}: ZbsLogoCropFieldProps) {
  const [image, setImage] = useState<CropImage | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameWidth, setFrameWidth] = useState(400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const inputId = `zbs-logo-file-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setFrameWidth(frame.getBoundingClientRect().width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    return () => {
      if (image?.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
    };
  }, [image]);

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp ảnh PNG, JPEG, WebP hoặc định dạng ảnh được hỗ trợ.");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      setError("Ảnh quá lớn. Vui lòng chọn tệp nhỏ hơn 12 MB.");
      return;
    }

    const src = URL.createObjectURL(file);
    try {
      const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Không thể mở ảnh này."));
        element.src = src;
      });
      if (!loaded.naturalWidth || !loaded.naturalHeight) {
        throw new Error("Không thể mở ảnh này.");
      }
      setImage({ file, src, width: loaded.naturalWidth, height: loaded.naturalHeight });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    } catch (cause) {
      URL.revokeObjectURL(src);
      setError(cause instanceof Error ? cause.message : "Không thể mở ảnh này.");
    }
  };

  const cropBounds = () => {
    if (!image) return null;
    const frameHeight = frameWidth * OUTPUT_HEIGHT / OUTPUT_WIDTH;
    const baseScale = Math.max(frameWidth / image.width, frameHeight / image.height);
    const drawnWidth = image.width * baseScale * zoom;
    const drawnHeight = image.height * baseScale * zoom;
    return {
      frameHeight,
      drawnWidth,
      drawnHeight,
      left: (frameWidth - drawnWidth) / 2 + offset.x,
      top: (frameHeight - drawnHeight) / 2 + offset.y,
    };
  };

  const clampOffset = (x: number, y: number, nextZoom = zoom) => {
    if (!image) return { x, y };
    const frameHeight = frameWidth * OUTPUT_HEIGHT / OUTPUT_WIDTH;
    const baseScale = Math.max(frameWidth / image.width, frameHeight / image.height);
    const maxX = Math.max(0, (image.width * baseScale * nextZoom - frameWidth) / 2);
    const maxY = Math.max(0, (image.height * baseScale * nextZoom - frameHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const updateZoom = (nextZoom: number) => {
    const safeZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(safeZoom);
    setOffset((current) => clampOffset(current.x, current.y, safeZoom));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || disabled || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { ...dragRef.current, x: event.clientX, y: event.clientY };
    setOffset((current) => clampOffset(current.x + dx, current.y + dy));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!image) return;
    const nudge = event.shiftKey ? 12 : 3;
    if (event.key === "ArrowLeft") setOffset((current) => clampOffset(current.x - nudge, current.y));
    else if (event.key === "ArrowRight") setOffset((current) => clampOffset(current.x + nudge, current.y));
    else if (event.key === "ArrowUp") setOffset((current) => clampOffset(current.x, current.y - nudge));
    else if (event.key === "ArrowDown") setOffset((current) => clampOffset(current.x, current.y + nudge));
    else if (event.key === "+" || event.key === "=") updateZoom(zoom + 0.1);
    else if (event.key === "-") updateZoom(zoom - 0.1);
    else return;
    event.preventDefault();
  };

  const saveCrop = async () => {
    if (!image || disabled || busy) return;
    setBusy(true);
    setError("");
    try {
      const bounds = cropBounds();
      if (!bounds) throw new Error("Vui lòng chọn ảnh trước khi lưu.");
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không thể chuẩn bị ảnh đã cắt.");
      const scale = OUTPUT_WIDTH / frameWidth;
      const outputImage = new window.Image();
      outputImage.src = image.src;
      await new Promise<void>((resolve, reject) => {
        if (outputImage.complete && outputImage.naturalWidth) resolve();
        else {
          outputImage.onload = () => resolve();
          outputImage.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
        }
      });
      context.drawImage(
        outputImage,
        bounds.left * scale,
        bounds.top * scale,
        bounds.drawnWidth * scale,
        bounds.drawnHeight * scale,
      );
      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể tạo ảnh PNG.")), "image/png");
      });
      const form = new FormData();
      form.append("files", png, "zbs-logo.png");
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Tải ảnh lên thất bại. Vui lòng thử lại.");
      const result = await response.json() as { files?: Array<{ url?: string }> };
      const url = result.files?.[0]?.url;
      if (!url) throw new Error("Tải ảnh lên xong nhưng không nhận được đường dẫn ảnh.");
      onChange(url);
      setImage(null);
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu logo này. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = () => {
    if (disabled || busy) return;
    setImage(null);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setError("");
    onChange(null);
  };

  const bounds = cropBounds();

  return (
    <section className="zbs-logo-field">
      <style>{`
        .zbs-logo-field{--zlf-ink:#20323b;--zlf-muted:#63777d;--zlf-line:#d5e0dc;--zlf-tint:#f3f8f5;--zlf-accent:#286c60;color:var(--zlf-ink);font-family:inherit}
        .zbs-logo-field *{box-sizing:border-box}
        .zlf-heading{display:block;margin:0 0 8px;font-size:14px;font-weight:650;letter-spacing:.01em}
        .zlf-preview{position:relative;display:flex;width:min(100%,400px);aspect-ratio:400/96;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--zlf-line);border-radius:8px;background-color:#f8fbf9;background-image:linear-gradient(45deg,#e8efeb 25%,transparent 25%),linear-gradient(-45deg,#e8efeb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8efeb 75%),linear-gradient(-45deg,transparent 75%,#e8efeb 75%);background-position:0 0,0 6px,6px -6px,-6px 0;background-size:12px 12px}
        .zlf-preview-dark{background:#17211e;border-color:#34433d}
        .zlf-preview img{display:block;max-width:100%;max-height:100%;object-fit:contain}
        .zlf-preview-placeholder{font-size:12px;color:var(--zlf-muted);letter-spacing:.02em}
        .zlf-crop-frame{position:relative;width:min(100%,400px);aspect-ratio:400/96;overflow:hidden;touch-action:none;cursor:grab;border:1px solid #b5cbc2;border-radius:8px;background:#f4f8f5;outline:none}
        .zlf-crop-frame-dark{background:#17211e;border-color:#53645c}
        .zlf-crop-frame:active{cursor:grabbing}
        .zlf-crop-frame:focus-visible{outline:3px solid #8bb5a5;outline-offset:3px}
        .zlf-crop-image{position:absolute;max-width:none;max-height:none;user-select:none;pointer-events:none}
        .zlf-frame-outline{position:absolute;inset:0;border:1px solid rgba(34,77,67,.45);pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
        .zlf-help{margin:7px 0 0;font-size:12px;line-height:1.45;color:var(--zlf-muted)}
        .zlf-controls{display:flex;align-items:center;gap:12px;margin-top:12px;max-width:400px}
        .zlf-zoom-label{font-size:12px;font-weight:600;white-space:nowrap}
        .zlf-zoom{width:100%;accent-color:var(--zlf-accent)}
        .zlf-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:12px}
        .zlf-file-label,.zlf-button{display:inline-flex;min-height:36px;align-items:center;justify-content:center;gap:7px;padding:7px 12px;border:1px solid #bfd0c8;border-radius:6px;background:#fff;color:var(--zlf-ink);font:inherit;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer}
        .zlf-file-label:hover,.zlf-button:hover:not(:disabled){background:#f1f7f3;border-color:#88aa9d}
        .zlf-button-primary{background:var(--zlf-accent);border-color:var(--zlf-accent);color:#fff}
        .zlf-button-primary:hover:not(:disabled){background:#205b50;border-color:#205b50;color:#fff}
        .zlf-button:disabled,.zlf-file-label[data-disabled="true"]{opacity:.55;cursor:not-allowed}
        .zlf-file-input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%);border:0}
        .zlf-file-input:focus-visible + .zlf-file-label{outline:3px solid #8bb5a5;outline-offset:3px}
        .zlf-error{margin:9px 0 0;padding:9px 11px;border:1px solid #e6c6bd;border-radius:6px;background:#fff7f4;color:#873d2b;font-size:13px;line-height:1.45}
        .zlf-status{font-size:12px;color:var(--zlf-muted)}
        @media(max-width:480px){.zlf-actions{align-items:stretch}.zlf-file-label,.zlf-button{flex:1}.zlf-controls{gap:9px}}
      `}</style>
      <span className="zlf-heading" id={`${inputId}-label`}>{label}</span>
      <div className={`zlf-preview ${theme === "dark" ? "zlf-preview-dark" : ""}`} aria-label={`Xem trước ${label}`}>
        {value ? (
          <img src={value} alt={label} />
        ) : (
          <span className="zlf-preview-placeholder">Chưa chọn logo</span>
        )}
      </div>

      {image && bounds && (
        <>
          <div
            ref={frameRef}
            className={`zlf-crop-frame ${theme === "dark" ? "zlf-crop-frame-dark" : ""}`}
            role="group"
            aria-label={`Cắt ${label}. Kéo để căn chỉnh, dùng phím mũi tên để dịch chuyển và dấu cộng trừ để phóng to.`}
            tabIndex={disabled || busy ? -1 : 0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={handleKeyDown}
          >
            <img
              className="zlf-crop-image"
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: bounds.drawnWidth,
                height: bounds.drawnHeight,
                left: bounds.left,
                top: bounds.top,
              }}
            />
            <span className="zlf-frame-outline" aria-hidden="true" />
          </div>
          <p className="zlf-help">Kéo ảnh để căn trong khung 400 × 96 px. Dùng phím mũi tên để chỉnh chính xác.</p>
          <div className="zlf-controls">
            <label className="zlf-zoom-label" htmlFor={`${inputId}-zoom`}>Thu phóng</label>
            <input
              id={`${inputId}-zoom`}
              className="zlf-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.05"
              value={zoom}
              disabled={disabled || busy}
              onChange={(event) => updateZoom(Number(event.currentTarget.value))}
            aria-label={`Thu phóng ảnh ${label}`}
            />
            <span className="zlf-status" aria-live="polite">{Math.round(zoom * 100)}%</span>
          </div>
        </>
      )}

      <div className="zlf-actions">
        <input
          id={inputId}
          className="zlf-file-input"
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          onChange={selectImage}
          aria-labelledby={`${inputId}-label`}
        />
        <label className="zlf-file-label" data-disabled={disabled || busy} htmlFor={inputId}>
          {image ? "Chọn ảnh khác" : value ? "Thay logo" : "Chọn ảnh"}
        </label>
        {image && (
          <button className="zlf-button zlf-button-primary" type="button" onClick={saveCrop} disabled={disabled || busy}>
            {busy ? "Đang lưu PNG…" : "Lưu ảnh đã cắt"}
          </button>
        )}
        {(image || value) && (
          <button className="zlf-button" type="button" onClick={removeLogo} disabled={disabled || busy}>
            Xóa logo
          </button>
        )}
      </div>
      {error && <p className="zlf-error" role="alert">{error}</p>}
      {busy && <p className="zlf-status" role="status" aria-live="polite">Đang tạo và tải lên ảnh PNG 400 × 96 px…</p>}
    </section>
  );
}

export default ZbsLogoCropField;
