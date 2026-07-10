import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Eraser, Grid3x3, Maximize2, X } from "lucide-react";

export type ImageEditMode = "preview" | "crop" | "mask" | "brush" | "grid" | "outpaint";

interface ImageEditModalProps {
  open: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  onApply?: (index: number, dataUrl: string) => void;
}

const MODES: { id: ImageEditMode; label: string; icon: typeof Crop }[] = [
  { id: "preview", label: "预览", icon: Maximize2 },
  { id: "crop", label: "裁剪", icon: Crop },
  { id: "mask", label: "蒙版", icon: Eraser },
  { id: "grid", label: "宫格", icon: Grid3x3 },
  { id: "outpaint", label: "扩图", icon: Maximize2 },
];

export function ImageEditModal({
  open,
  images,
  initialIndex = 0,
  onClose,
  onApply,
}: ImageEditModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [mode, setMode] = useState<ImageEditMode>("preview");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setMode("preview");
    }
  }, [open, initialIndex]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const src = images[index];
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      if (mode === "grid") {
        const cols = 2;
        const rows = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        for (let c = 1; c < cols; c++) {
          const x = (canvas.width / cols) * c;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let r = 1; r < rows; r++) {
          const y = (canvas.height / rows) * r;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }
      if (mode === "crop") {
        const pad = Math.min(canvas.width, canvas.height) * 0.1;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
        ctx.setLineDash([]);
      }
    };
    img.src = src;
  }, [images, index, mode]);

  useEffect(() => {
    if (open) drawPreview();
  }, [open, drawPreview]);

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

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onApply?.(index, canvas.toDataURL("image/png"));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80"
      data-testid="image-edit-modal"
    >
      <header className="flex items-center gap-2 px-4 py-3 bg-[var(--bg)] border-b border-[var(--border)]">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`flex items-center gap-1 px-3 py-1.5 text-sm border ${
              mode === id
                ? "border-black bg-black text-white"
                : "border-[var(--border)]"
            }`}
            onClick={() => setMode(id)}
            data-testid={`image-edit-mode-${id}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        {images.length > 1 && (
          <span className="text-sm text-[var(--muted)]">
            {index + 1} / {images.length}
          </span>
        )}
        <button type="button" onClick={onClose} className="p-2" aria-label="关闭">
          <X className="w-5 h-5" />
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full border border-[var(--border)]"
          data-testid="image-edit-canvas"
        />
      </div>
      <footer className="flex justify-end gap-2 px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)]">
        <button
          type="button"
          className="px-4 py-2 border border-[var(--border)] text-sm"
          onClick={onClose}
          data-testid="image-edit-cancel"
        >
          取消
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-black text-white text-sm"
          onClick={handleApply}
          data-testid="image-edit-apply"
        >
          应用
        </button>
      </footer>
    </div>
  );
}
