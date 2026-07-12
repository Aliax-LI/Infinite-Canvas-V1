import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Grid3x3, Paintbrush, Scissors, X, ZoomOut } from "lucide-react";
import { canvasDisplayMediaUrl } from "../core/uploadMedia";
import {
  cropImageToBlob,
  defaultCropRect,
  drawCanvasHasPixels,
  maskCanvasFromDraw,
  outpaintImageToBlob,
  type CropRect,
} from "../core/imageEdit";
import { uploadCanvasMediaFiles } from "../core/uploadMedia";
import { cn } from "../../../shared/utils";
import { CompareSlider } from "./CompareSlider";

type EditTab = "preview" | "crop" | "mask" | "outpaint";

interface ImageEditModalProps {
  open: boolean;
  url: string;
  compareUrl?: string;
  title?: string;
  nodeId?: string;
  onClose: () => void;
  onImageUpdated?: (nodeId: string, url: string, name?: string) => void;
  onMaskCreated?: (nodeId: string, maskUrl: string) => void;
}

export function ImageEditModal({
  open,
  url,
  compareUrl,
  title,
  nodeId,
  onClose,
  onImageUpdated,
  onMaskCreated,
}: ImageEditModalProps) {
  const { t } = useTranslation("canvas");
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<EditTab>("preview");
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const drawing = useRef(false);

  const displayUrl = canvasDisplayMediaUrl(url);
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

  useEffect(() => {
    if (!open) {
      setTab("preview");
      setCrop(null);
      setShowGrid(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isVideo) return;
    const img = imgRef.current;
    if (!img) return;
    const sync = () => {
      const w = img.clientWidth || 0;
      const h = img.clientHeight || 0;
      setDisplaySize({ w, h });
      if (!crop && w && h) setCrop(defaultCropRect(w, h));
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
  }, [open, url, isVideo, crop]);

  if (!open || !url) return null;

  const applyBlob = async (blob: Blob, suffix: string) => {
    if (!nodeId) return;
    setBusy(true);
    try {
      const base = (title || "image").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}_${suffix}.png`, { type: "image/png" });
      const uploaded = await uploadCanvasMediaFiles([file]);
      const first = uploaded[0];
      if (!first?.url) return;
      onImageUpdated?.(nodeId, first.url, first.name);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleCrop = async () => {
    const img = imgRef.current;
    if (!img || !crop || !nodeId) return;
    const blob = await cropImageToBlob(img, crop, displaySize.w, displaySize.h);
    if (blob) await applyBlob(blob, "crop");
  };

  const handleOutpaint = async () => {
    const img = imgRef.current;
    if (!img || !crop || !nodeId) return;
    const blob = await outpaintImageToBlob(img, crop, displaySize.w, displaySize.h);
    if (blob) await applyBlob(blob, "outpaint");
  };

  const handleMask = async () => {
    const canvas = drawRef.current;
    if (!canvas || !nodeId || !drawCanvasHasPixels(canvas)) return;
    const mask = maskCanvasFromDraw(canvas);
    if (!mask) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      mask.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    setBusy(true);
    try {
      const base = (title || "image").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}_mask.png`, { type: "image/png" });
      const uploaded = await uploadCanvasMediaFiles([file]);
      const first = uploaded[0];
      if (first?.url) onMaskCreated?.(nodeId, first.url);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const onBrushDown = (e: React.PointerEvent) => {
    if (tab !== "mask") return;
    drawing.current = true;
    const canvas = drawRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onBrushMove = (e: React.PointerEvent) => {
    if (!drawing.current || tab !== "mask") return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const onBrushUp = () => {
    drawing.current = false;
  };

  const tabs: { id: EditTab; label: string; icon: typeof Scissors }[] = [
    { id: "preview", label: t("imageEdit.preview"), icon: Download },
    { id: "crop", label: t("imageEdit.crop"), icon: Scissors },
    { id: "mask", label: t("imageEdit.mask"), icon: Paintbrush },
    { id: "outpaint", label: t("imageEdit.outpaint"), icon: ZoomOut },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="legacy-image-edit-modal"
    >
      <div
        className="relative max-w-4xl max-h-[92vh] w-full bg-white rounded-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 gap-2">
          <span className="text-sm truncate flex-1">{title || t("image")}</span>
          {!isVideo ? (
            <div className="flex gap-1 flex-wrap justify-end">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-lg border",
                    tab === id
                      ? "border-black bg-black text-white"
                      : "border-gray-200 hover:border-gray-400",
                  )}
                  data-testid={`legacy-image-edit-tab-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={displayUrl}
              download
              className="p-1.5 rounded-lg hover:bg-gray-50"
              title={t("download")}
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-50"
              aria-label={t("common.close", { ns: "studio", defaultValue: "Close" })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 flex-1 overflow-auto bg-gray-50 flex flex-col items-center gap-2">
          {isVideo ? (
            <video
              src={displayUrl}
              controls
              playsInline
              className="max-w-full max-h-[70vh] rounded-md"
            />
          ) : compareUrl && tab === "preview" ? (
            <CompareSlider
              beforeUrl={compareUrl}
              afterUrl={url}
              className="max-w-full max-h-[60vh]"
            />
          ) : (
            <div className="relative inline-block max-w-full">
              <img
                ref={imgRef}
                src={displayUrl}
                alt=""
                className="max-w-full max-h-[60vh] object-contain rounded-md select-none"
                draggable={false}
                data-testid="legacy-edit-image"
              />
              {tab !== "preview" && crop && displaySize.w > 0 ? (
                <div
                  className="absolute border-2 border-black pointer-events-none"
                  style={{
                    left: `${(crop.x / displaySize.w) * 100}%`,
                    top: `${(crop.y / displaySize.h) * 100}%`,
                    width: `${(crop.w / displaySize.w) * 100}%`,
                    height: `${(crop.h / displaySize.h) * 100}%`,
                    backgroundImage: showGrid
                      ? "linear-gradient(rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)"
                      : undefined,
                    backgroundSize: showGrid ? "24px 24px" : undefined,
                  }}
                  data-testid="legacy-crop-overlay"
                />
              ) : null}
              {tab === "mask" ? (
                <canvas
                  ref={drawRef}
                  className="absolute inset-0 w-full h-full touch-none cursor-crosshair opacity-60"
                  onPointerDown={onBrushDown}
                  onPointerMove={onBrushMove}
                  onPointerUp={onBrushUp}
                  onPointerLeave={onBrushUp}
                  data-testid="legacy-mask-canvas"
                />
              ) : null}
            </div>
          )}

          {tab === "crop" && !isVideo ? (
            <div className="flex flex-wrap items-center gap-2 w-full max-w-lg">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                <Grid3x3 className="w-3.5 h-3.5" />
                {t("imageEdit.grid")}
              </label>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={crop ? crop.w / Math.max(1, displaySize.w) : 0.8}
                onChange={(e) => {
                  const ratio = Number(e.target.value);
                  const w = displaySize.w * ratio;
                  const h = displaySize.h * ratio;
                  setCrop({
                    x: (displaySize.w - w) / 2,
                    y: (displaySize.h - h) / 2,
                    w,
                    h,
                  });
                }}
                className="flex-1"
                data-testid="legacy-crop-slider"
              />
              <button
                type="button"
                disabled={busy || !nodeId}
                onClick={() => void handleCrop()}
                className="px-3 py-1.5 bg-black text-white text-xs rounded-lg disabled:opacity-50"
                data-testid="legacy-apply-crop"
              >
                {t("imageEdit.applyCrop")}
              </button>
            </div>
          ) : null}

          {tab === "mask" && !isVideo ? (
            <button
              type="button"
              disabled={busy || !nodeId}
              onClick={() => void handleMask()}
              className="px-3 py-1.5 bg-black text-white text-xs rounded-lg disabled:opacity-50"
              data-testid="legacy-apply-mask"
            >
              {t("imageEdit.applyMask")}
            </button>
          ) : null}

          {tab === "outpaint" && !isVideo ? (
            <div className="flex flex-wrap items-center gap-2 w-full max-w-lg">
              <input
                type="range"
                min={1}
                max={1.6}
                step={0.05}
                value={crop ? crop.w / Math.max(1, displaySize.w) : 1}
                onChange={(e) => {
                  const ratio = Number(e.target.value);
                  const w = displaySize.w * ratio;
                  const h = displaySize.h * ratio;
                  setCrop({
                    x: (displaySize.w - w) / 2,
                    y: (displaySize.h - h) / 2,
                    w,
                    h,
                  });
                }}
                className="flex-1"
              />
              <button
                type="button"
                disabled={busy || !nodeId}
                onClick={() => void handleOutpaint()}
                className="px-3 py-1.5 bg-black text-white text-xs rounded-lg disabled:opacity-50"
                data-testid="legacy-apply-outpaint"
              >
                {t("imageEdit.applyOutpaint")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
