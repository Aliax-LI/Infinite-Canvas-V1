import { useEffect, useRef, useState } from "react";
import { Crop, Eraser, Grid3x3, Maximize2, X } from "lucide-react";
import {
  cropImageToBlob,
  defaultCropRect,
  drawCanvasHasPixels,
  maskCanvasFromDraw,
  outpaintImageToBlob,
  type CropRect,
} from "../../canvas/core/imageEdit";
import { uploadCanvasMediaFiles } from "../../canvas/core/uploadMedia";

export type ImageEditMode = "preview" | "crop" | "mask" | "grid" | "outpaint";

interface ImageEditModalProps {
  open: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  onApply?: (index: number, dataUrlOrUrl: string) => void;
}

const MODES: { id: ImageEditMode; label: string; icon: typeof Crop }[] = [
  { id: "preview", label: "预览", icon: Maximize2 },
  { id: "crop", label: "裁剪", icon: Crop },
  { id: "mask", label: "蒙版", icon: Eraser },
  { id: "grid", label: "宫格", icon: Grid3x3 },
  { id: "outpaint", label: "扩图", icon: Maximize2 },
];

/** Fork-first from classic `features/canvas/components/ImageEditModal` + imageEdit.ts */
export function ImageEditModal({
  open,
  images,
  initialIndex = 0,
  onClose,
  onApply,
}: ImageEditModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [mode, setMode] = useState<ImageEditMode>("preview");
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const src = images[index] ?? "";

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setMode("preview");
      setCrop(null);
      setError("");
    }
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open || !src) return;
    const img = imgRef.current;
    if (!img) return;
    const sync = () => {
      const w = img.clientWidth || 0;
      const h = img.clientHeight || 0;
      setDisplaySize({ w, h });
      if (w && h) setCrop((c) => c ?? defaultCropRect(w, h));
      const canvas = drawRef.current;
      if (canvas && w && h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    sync();
    img.addEventListener("load", sync);
    window.addEventListener("resize", sync);
    return () => {
      img.removeEventListener("load", sync);
      window.removeEventListener("resize", sync);
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1) {
        setIndex((i) => (i - 1 + images.length) % images.length);
      }
      if (e.key === "ArrowRight" && images.length > 1) {
        setIndex((i) => (i + 1) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length, onClose]);

  if (!open || !images.length) return null;

  const paint = (clientX: number, clientY: number) => {
    const canvas = drawRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(255,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 12, 0, Math.PI * 2);
    ctx.fill();
  };

  const applyBlob = async (blob: Blob, suffix: string) => {
    setBusy(true);
    setError("");
    try {
      const file = new File([blob], `edit_${suffix}.png`, { type: "image/png" });
      const uploaded = await uploadCanvasMediaFiles([file]);
      const url = uploaded[0]?.url;
      if (!url) {
        setError("上传编辑结果失败");
        return;
      }
      onApply?.(index, url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "编辑失败");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    const img = imgRef.current;
    if (!img) return;
    if (mode === "preview" || mode === "grid") {
      onClose();
      return;
    }
    if (mode === "crop" && crop) {
      const blob = await cropImageToBlob(img, crop, displaySize.w, displaySize.h);
      if (blob) await applyBlob(blob, "crop");
      return;
    }
    if (mode === "outpaint" && crop) {
      const blob = await outpaintImageToBlob(img, crop, displaySize.w, displaySize.h);
      if (blob) await applyBlob(blob, "outpaint");
      return;
    }
    if (mode === "mask") {
      const canvas = drawRef.current;
      if (!canvas || !drawCanvasHasPixels(canvas)) {
        setError("请先在图上涂抹蒙版区域");
        return;
      }
      const mask = maskCanvasFromDraw(canvas);
      if (!mask) return;
      const blob = await new Promise<Blob | null>((resolve) =>
        mask.toBlob((b) => resolve(b), "image/png"),
      );
      if (blob) await applyBlob(blob, "mask");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80"
      data-testid="image-edit-modal"
    >
      <header className="flex items-center gap-2 px-4 py-3 bg-[var(--bg)] border-b border-[var(--border)]">
        <span className="text-sm font-medium flex-1">图片编辑</span>
        {MODES.map(({ id, label, icon: ModeIcon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex items-center gap-1 px-2 py-1 text-sm border ${
              mode === id ? "border-black" : "border-[var(--border)]"
            }`}
            data-testid={`image-edit-mode-${id}`}
          >
            <ModeIcon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <button type="button" onClick={onClose} className="p-2" aria-label="关闭">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center overflow-auto p-4 relative">
        <div className="relative max-w-full max-h-full">
          <img
            ref={imgRef}
            src={src}
            alt=""
            className="max-w-[90vw] max-h-[70vh] object-contain"
            data-testid="image-edit-canvas"
            draggable={false}
          />
          {(mode === "crop" || mode === "outpaint") && crop && (
            <div
              className="absolute border-2 border-black border-dashed pointer-events-none"
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
              }}
              data-testid="image-edit-crop-rect"
            />
          )}
          {mode === "mask" && (
            <canvas
              ref={drawRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              data-testid="image-edit-mask-canvas"
              onPointerDown={(e) => {
                drawing.current = true;
                paint(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                paint(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                drawing.current = false;
              }}
              onPointerLeave={() => {
                drawing.current = false;
              }}
            />
          )}
          {mode === "grid" && displaySize.w > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${displaySize.w} ${displaySize.h}`}
            >
              <line
                x1={displaySize.w / 2}
                y1={0}
                x2={displaySize.w / 2}
                y2={displaySize.h}
                stroke="white"
                strokeOpacity={0.6}
              />
              <line
                x1={0}
                y1={displaySize.h / 2}
                x2={displaySize.w}
                y2={displaySize.h / 2}
                stroke="white"
                strokeOpacity={0.6}
              />
            </svg>
          )}
        </div>
      </div>
      {error && (
        <p className="px-4 py-2 text-sm text-red-500 bg-[var(--bg)]" role="alert">
          {error}
        </p>
      )}
      {(mode === "crop" || mode === "outpaint") && crop && (
        <div className="flex gap-2 px-4 py-2 bg-[var(--bg)] border-t border-[var(--border)] text-xs">
          <label>
            X
            <input
              type="number"
              className="ml-1 w-16 border border-[var(--border)] px-1"
              value={Math.round(crop.x)}
              onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })}
            />
          </label>
          <label>
            Y
            <input
              type="number"
              className="ml-1 w-16 border border-[var(--border)] px-1"
              value={Math.round(crop.y)}
              onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })}
            />
          </label>
          <label>
            W
            <input
              type="number"
              className="ml-1 w-16 border border-[var(--border)] px-1"
              value={Math.round(crop.w)}
              onChange={(e) => setCrop({ ...crop, w: Number(e.target.value) })}
            />
          </label>
          <label>
            H
            <input
              type="number"
              className="ml-1 w-16 border border-[var(--border)] px-1"
              value={Math.round(crop.h)}
              onChange={(e) => setCrop({ ...crop, h: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <footer className="flex justify-end gap-2 px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)]">
        {images.length > 1 && (
          <span className="text-sm text-[var(--muted)] mr-auto self-center">
            {index + 1}/{images.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 border border-[var(--border)] text-sm"
          data-testid="image-edit-cancel"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={busy}
          className="px-3 py-1.5 bg-black text-white text-sm disabled:opacity-50"
          data-testid="image-edit-apply"
        >
          {busy
            ? "处理中…"
            : mode === "preview" || mode === "grid"
              ? "关闭"
              : "应用"}
        </button>
      </footer>
    </div>
  );
}
