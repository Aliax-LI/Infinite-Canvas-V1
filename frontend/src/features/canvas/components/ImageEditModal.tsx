import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Grid3x3,
  Maximize2,
  Paintbrush,
  RotateCcw,
  Scissors,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  clampMaskBrushSize,
  clampOutpaintRect,
  cropImageToBlob,
  defaultCropRect,
  defaultOutpaintRect,
  drawCanvasHasPixels,
  fitImageDisplaySize,
  MASK_BRUSH_DEFAULT,
  MASK_BRUSH_MAX,
  MASK_BRUSH_MIN,
  maskCanvasFromDraw,
  moveCropRect,
  moveOutpaintImage,
  nextZoomLevel,
  outpaintFromRatio,
  outpaintImageToBlob,
  resizeCropRect,
  resizeOutpaintFrame,
  type CropHandle,
  type CropRect,
  type OutpaintHandle,
} from "../core/imageEdit";
import { canvasDisplayMediaUrl, uploadCanvasMediaFiles } from "../core/uploadMedia";
import { cn } from "../../../shared/utils";
import { CompareSlider } from "./CompareSlider";
import {
  ImageContextMenu,
  type ImageContextMenuTarget,
} from "./ImageContextMenu";

type EditTab = "preview" | "crop" | "mask" | "outpaint";

type DragMode =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { kind: "crop-move"; sx: number; sy: number; start: CropRect }
  | { kind: "crop-resize"; handle: CropHandle; sx: number; sy: number; start: CropRect }
  | { kind: "outpaint-image"; sx: number; sy: number; start: CropRect }
  | { kind: "outpaint-resize"; handle: OutpaintHandle; sx: number; sy: number; start: CropRect };

export interface ImageEditResult {
  url: string;
  name?: string;
  kind: "crop" | "mask" | "outpaint";
}

interface ImageEditModalProps {
  open: boolean;
  url: string;
  compareUrl?: string;
  title?: string;
  nodeId?: string;
  onClose: () => void;
  /** @deprecated Prefer onResultCreated — kept for callers that update in place. */
  onImageUpdated?: (nodeId: string, url: string, name?: string) => void;
  /** @deprecated Prefer onResultCreated. */
  onMaskCreated?: (nodeId: string, maskUrl: string) => void;
  /** After crop / mask / outpaint: spawn a new IMAGE input node. */
  onResultCreated?: (sourceNodeId: string, result: ImageEditResult) => void;
  /** Right-click preview → spawn IMAGE with the current URL (no edit). */
  onCreateImportNode?: (sourceNodeId: string, url: string, name?: string) => void;
}

const CROP_HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const OUTPAINT_HANDLES: OutpaintHandle[] = ["n", "s", "e", "w", "se"];

export function ImageEditModal({
  open,
  url,
  compareUrl,
  title,
  nodeId,
  onClose,
  onImageUpdated,
  onMaskCreated,
  onResultCreated,
  onCreateImportNode,
}: ImageEditModalProps) {
  const { t } = useTranslation("canvas");
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [tab, setTab] = useState<EditTab>("preview");
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brushSize, setBrushSize] = useState(MASK_BRUSH_DEFAULT);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const [imageMenu, setImageMenu] = useState<ImageContextMenuTarget | null>(null);
  const drawing = useRef(false);
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;

  const displayUrl = canvasDisplayMediaUrl(url);
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

  useEffect(() => {
    if (!open) {
      setTab("preview");
      setCrop(null);
      setShowGrid(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setBrushCursor(null);
      setImageMenu(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isVideo) return;
    const img = imgRef.current;
    if (!img) return;
    const sync = () => {
      const maxW = Math.min(1300, window.innerWidth - 100);
      const maxH = Math.min(840, window.innerHeight - 200);
      const fitted = fitImageDisplaySize(
        img.naturalWidth || img.clientWidth,
        img.naturalHeight || img.clientHeight,
        maxW,
        maxH,
      );
      const w = fitted.w;
      const h = fitted.h;
      if (!w || !h) return;
      setDisplaySize({ w, h });
      setCrop((prev) => {
        if (tab === "outpaint") {
          if (prev && prev.w >= w && prev.h >= h) {
            return clampOutpaintRect(prev, w, h);
          }
          return defaultOutpaintRect(w, h);
        }
        if (prev && tab === "crop") {
          return {
            x: Math.min(prev.x, Math.max(0, w - 24)),
            y: Math.min(prev.y, Math.max(0, h - 24)),
            w: Math.min(prev.w, Math.max(24, w)),
            h: Math.min(prev.h, Math.max(24, h)),
          };
        }
        return defaultCropRect(w, h);
      });
      const canvas = drawRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    if (img.complete && img.naturalWidth) sync();
    img.addEventListener("load", sync);
    window.addEventListener("resize", sync);
    return () => {
      img.removeEventListener("load", sync);
      window.removeEventListener("resize", sync);
    };
  }, [open, url, isVideo, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (drag.kind === "pan") {
        setPan({ x: drag.ox + dx, y: drag.oy + dy });
        return;
      }
      if (drag.kind === "crop-move") {
        setCrop(moveCropRect(drag.start, dx, dy, displaySize.w, displaySize.h));
        return;
      }
      if (drag.kind === "crop-resize") {
        setCrop(
          resizeCropRect(drag.start, drag.handle, dx, dy, displaySize.w, displaySize.h),
        );
        return;
      }
      if (drag.kind === "outpaint-image") {
        setCrop(moveOutpaintImage(drag.start, dx, dy, displaySize.w, displaySize.h));
        return;
      }
      if (drag.kind === "outpaint-resize") {
        setCrop(
          resizeOutpaintFrame(
            drag.start,
            drag.handle,
            dx,
            dy,
            displaySize.w,
            displaySize.h,
          ),
        );
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [displaySize.h, displaySize.w]);

  if (!open || !url) return null;

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const emitResult = async (blob: Blob, kind: ImageEditResult["kind"]) => {
    if (!nodeId) return;
    setBusy(true);
    try {
      const base = (title || "image").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}_${kind}.png`, { type: "image/png" });
      const uploaded = await uploadCanvasMediaFiles([file]);
      const first = uploaded[0];
      if (!first?.url) return;
      if (onResultCreated) {
        onResultCreated(nodeId, { url: first.url, name: first.name, kind });
      } else if (kind === "mask") {
        onMaskCreated?.(nodeId, first.url);
      } else {
        onImageUpdated?.(nodeId, first.url, first.name);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleCrop = async () => {
    const img = imgRef.current;
    if (!img || !crop || !nodeId) return;
    const blob = await cropImageToBlob(img, crop, displaySize.w, displaySize.h);
    if (blob) await emitResult(blob, "crop");
  };

  const handleOutpaint = async () => {
    const img = imgRef.current;
    if (!img || !crop || !nodeId) return;
    const blob = await outpaintImageToBlob(img, crop, displaySize.w, displaySize.h);
    if (blob) await emitResult(blob, "outpaint");
  };

  const handleMask = async () => {
    const canvas = drawRef.current;
    if (!canvas || !nodeId || !drawCanvasHasPixels(canvas)) return;
    const mask = maskCanvasFromDraw(canvas);
    if (!mask) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      mask.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob) await emitResult(blob, "mask");
  };

  const maskPointerLocal = (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onBrushDown = (e: React.PointerEvent) => {
    if (tab !== "mask") return;
    drawing.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const canvas = drawRef.current;
    if (!canvas) return;
    const { x, y } = maskPointerLocal(e, canvas);
    setBrushCursor({ x, y });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = brushSizeRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onBrushMove = (e: React.PointerEvent) => {
    if (tab !== "mask") return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const { x, y } = maskPointerLocal(e, canvas);
    setBrushCursor({ x, y });
    if (!drawing.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = brushSizeRef.current;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onBrushUp = () => {
    drawing.current = false;
  };

  const onBrushLeave = () => {
    drawing.current = false;
    setBrushCursor(null);
  };

  const onStageWheel = (e: React.WheelEvent) => {
    if (isVideo) return;
    e.preventDefault();
    const stage = stageRef.current;
    const oldZoom = zoom;
    const next = nextZoomLevel(oldZoom, e.deltaY < 0 ? 1 : -1);
    if (Math.abs(next - oldZoom) < 0.0001) return;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const ox = e.clientX - rect.left - rect.width / 2;
      const oy = e.clientY - rect.top - rect.height / 2;
      const ratio = next / oldZoom;
      setPan({
        x: pan.x - ox * (ratio - 1),
        y: pan.y - oy * (ratio - 1),
      });
    }
    setZoom(next);
  };

  const beginPan = (e: React.PointerEvent) => {
    if (tab !== "preview") return;
    if (zoom <= 1.01 && e.button === 0) return;
    e.preventDefault();
    dragRef.current = {
      kind: "pan",
      sx: e.clientX,
      sy: e.clientY,
      ox: pan.x,
      oy: pan.y,
    };
  };

  const tabs: { id: EditTab; label: string; icon: typeof Scissors }[] = [
    { id: "preview", label: t("imageEdit.preview"), icon: Maximize2 },
    { id: "crop", label: t("imageEdit.crop"), icon: Scissors },
    { id: "mask", label: t("imageEdit.mask"), icon: Paintbrush },
    { id: "outpaint", label: t("imageEdit.outpaint"), icon: ZoomOut },
  ];

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
  };

  return (
    <div
      className="legacy-image-edit-modal"
      onClick={onClose}
      data-testid="legacy-image-edit-modal"
    >
      <div
        className="legacy-image-edit-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || t("image")}
      >
        <div className="legacy-image-edit-head">
          <div className="legacy-image-edit-headline min-w-0">
            <div className="legacy-image-edit-title truncate">{title || t("image")}</div>
            <div className="legacy-image-edit-sub">
              {tab === "preview"
                ? t("imageEdit.previewHint")
                : tab === "crop"
                  ? t("imageEdit.cropHint")
                  : tab === "mask"
                    ? t("imageEdit.maskHint")
                    : t("imageEdit.outpaintHint")}
            </div>
          </div>
          {!isVideo ? (
            <div className="legacy-image-edit-mode" role="tablist">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setCrop(null);
                    setBrushCursor(null);
                    if (id === "preview") resetView();
                  }}
                  className={cn(tab === id && "active")}
                  data-testid={`legacy-image-edit-tab-${id}`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="legacy-image-edit-head-end">
            {!isVideo ? (
              <div className="legacy-image-edit-zoom" data-testid="legacy-image-edit-zoom">
                <button
                  type="button"
                  className="legacy-image-edit-icon-btn"
                  onClick={() => setZoom((z) => nextZoomLevel(z, -1))}
                  aria-label={t("imageEdit.zoomOut")}
                  data-testid="legacy-image-zoom-out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="legacy-image-edit-zoom-label"
                  onClick={resetView}
                  data-testid="legacy-image-zoom-label"
                  title={t("imageEdit.resetView")}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="legacy-image-edit-icon-btn"
                  onClick={() => setZoom((z) => nextZoomLevel(z, 1))}
                  aria-label={t("imageEdit.zoomIn")}
                  data-testid="legacy-image-zoom-in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="legacy-image-edit-icon-btn"
                  onClick={resetView}
                  aria-label={t("imageEdit.resetView")}
                  data-testid="legacy-image-zoom-reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            ) : null}
            <a
              href={displayUrl}
              download
              className="legacy-image-edit-icon-btn"
              title={t("download")}
              aria-label={t("download")}
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="legacy-image-edit-icon-btn"
              aria-label={t("common.close", { ns: "common", defaultValue: "Close" })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className={cn(
            "legacy-image-edit-stage",
            "studio-transparency-board",
            zoom > 1.01 && "is-zoomed",
            tab === "outpaint" && "is-outpaint",
          )}
          onWheel={onStageWheel}
          onContextMenu={(e) => {
            if (tab !== "preview" || isVideo || !nodeId || !onCreateImportNode) return;
            e.preventDefault();
            e.stopPropagation();
            setImageMenu({
              screenX: e.clientX,
              screenY: e.clientY,
              nodeId,
              url,
              name: title,
            });
          }}
          data-testid="legacy-image-edit-stage"
        >
          <div className="legacy-image-edit-stage-inner">
            {isVideo ? (
              <video
                src={displayUrl}
                controls
                playsInline
                className="legacy-image-edit-video"
              />
            ) : compareUrl && tab === "preview" ? (
              <div style={transformStyle} className="legacy-image-edit-frame">
                <CompareSlider
                  beforeUrl={compareUrl}
                  afterUrl={url}
                  className="legacy-image-edit-compare"
                />
              </div>
            ) : tab === "outpaint" && crop && displaySize.w > 0 ? (
              <div
                className="legacy-outpaint-canvas"
                style={{
                  ...transformStyle,
                  width: crop.w,
                  height: crop.h,
                }}
                data-testid="legacy-outpaint-canvas"
              >
                <img
                  ref={imgRef}
                  src={displayUrl}
                  alt=""
                  className="legacy-outpaint-image"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: displaySize.w,
                    height: displaySize.h,
                  }}
                  draggable={false}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragRef.current = {
                      kind: "outpaint-image",
                      sx: e.clientX,
                      sy: e.clientY,
                      start: crop,
                    };
                  }}
                  data-testid="legacy-edit-image"
                />
                <div className="legacy-outpaint-frame" data-testid="legacy-outpaint-frame">
                  {OUTPAINT_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className="legacy-outpaint-handle"
                      data-outpaint-handle={handle}
                      data-testid={`legacy-outpaint-handle-${handle}`}
                      aria-label={handle}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dragRef.current = {
                          kind: "outpaint-resize",
                          handle,
                          sx: e.clientX,
                          sy: e.clientY,
                          start: crop,
                        };
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "legacy-crop-canvas",
                  tab === "mask" && "mask-mode",
                  tab === "preview" && "preview-mode",
                )}
                style={transformStyle}
                onPointerDown={beginPan}
              >
                <img
                  ref={imgRef}
                  src={displayUrl}
                  alt=""
                  className="legacy-crop-image"
                  style={
                    displaySize.w > 0
                      ? { width: displaySize.w, height: displaySize.h }
                      : undefined
                  }
                  draggable={false}
                  data-testid="legacy-edit-image"
                />
                {tab === "crop" && crop && displaySize.w > 0 ? (
                  <div
                    className={cn("legacy-crop-box", showGrid && "has-grid")}
                    style={{
                      left: crop.x,
                      top: crop.y,
                      width: crop.w,
                      height: crop.h,
                    }}
                    data-testid="legacy-crop-overlay"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragRef.current = {
                        kind: "crop-move",
                        sx: e.clientX,
                        sy: e.clientY,
                        start: crop,
                      };
                    }}
                  >
                    {CROP_HANDLES.map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        className="legacy-crop-handle"
                        data-crop-handle={handle}
                        data-testid={`legacy-crop-handle-${handle}`}
                        aria-label={handle}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragRef.current = {
                            kind: "crop-resize",
                            handle,
                            sx: e.clientX,
                            sy: e.clientY,
                            start: crop,
                          };
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                {tab === "mask" ? (
                  <>
                    <canvas
                      ref={drawRef}
                      className="legacy-mask-canvas"
                      onPointerDown={onBrushDown}
                      onPointerMove={onBrushMove}
                      onPointerUp={onBrushUp}
                      onPointerLeave={onBrushLeave}
                      data-testid="legacy-mask-canvas"
                    />
                    {brushCursor ? (
                      <div
                        className="legacy-mask-brush-cursor"
                        data-testid="legacy-mask-brush-cursor"
                        style={{
                          width: brushSize,
                          height: brushSize,
                          left: brushCursor.x,
                          top: brushCursor.y,
                        }}
                        aria-hidden
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="legacy-image-edit-footer">
          {tab === "crop" && !isVideo ? (
            <div className="legacy-image-edit-tools-row">
              <label className="legacy-image-edit-check">
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
                  setCrop(
                    moveCropRect(
                      {
                        x: (displaySize.w - w) / 2,
                        y: (displaySize.h - h) / 2,
                        w,
                        h,
                      },
                      0,
                      0,
                      displaySize.w,
                      displaySize.h,
                    ),
                  );
                }}
                className="legacy-image-edit-range"
                data-testid="legacy-crop-slider"
              />
              <button
                type="button"
                disabled={busy || !nodeId}
                onClick={() => void handleCrop()}
                className="legacy-image-edit-btn primary"
                data-testid="legacy-apply-crop"
              >
                {t("imageEdit.applyCrop")}
              </button>
            </div>
          ) : null}

          {tab === "mask" && !isVideo ? (
            <div className="legacy-image-edit-tools-row">
              <label className="legacy-image-edit-check" htmlFor="legacy-mask-brush-size">
                {t("imageEdit.brushSize")}
              </label>
              <input
                id="legacy-mask-brush-size"
                type="range"
                min={MASK_BRUSH_MIN}
                max={MASK_BRUSH_MAX}
                step={1}
                value={brushSize}
                onChange={(e) => setBrushSize(clampMaskBrushSize(Number(e.target.value)))}
                className="legacy-image-edit-range"
                data-testid="legacy-mask-brush-slider"
                aria-valuemin={MASK_BRUSH_MIN}
                aria-valuemax={MASK_BRUSH_MAX}
                aria-valuenow={brushSize}
                aria-label={t("imageEdit.brushSize")}
              />
              <span
                className="legacy-image-edit-brush-size-value"
                data-testid="legacy-mask-brush-size-value"
              >
                {brushSize}
              </span>
              <button
                type="button"
                disabled={busy || !nodeId}
                onClick={() => void handleMask()}
                className="legacy-image-edit-btn primary"
                data-testid="legacy-apply-mask"
              >
                {t("imageEdit.applyMask")}
              </button>
            </div>
          ) : null}

          {tab === "outpaint" && !isVideo ? (
            <div className="legacy-image-edit-tools-row">
              <span className="legacy-image-edit-check">{t("imageEdit.outpaintScale")}</span>
              <input
                type="range"
                min={1}
                max={1.6}
                step={0.05}
                value={crop ? crop.w / Math.max(1, displaySize.w) : 1}
                onChange={(e) => {
                  setCrop(outpaintFromRatio(displaySize.w, displaySize.h, Number(e.target.value)));
                }}
                className="legacy-image-edit-range"
                data-testid="legacy-outpaint-slider"
              />
              <button
                type="button"
                disabled={busy || !nodeId}
                onClick={() => void handleOutpaint()}
                className="legacy-image-edit-btn primary"
                data-testid="legacy-apply-outpaint"
              >
                {t("imageEdit.applyOutpaint")}
              </button>
            </div>
          ) : null}

          {tab === "preview" || isVideo ? (
            <div className="legacy-image-edit-tools-row">
              <button
                type="button"
                onClick={onClose}
                className="legacy-image-edit-btn secondary"
              >
                {t("imageEdit.close")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {imageMenu && onCreateImportNode ? (
        <ImageContextMenu
          target={imageMenu}
          onClose={() => setImageMenu(null)}
          onCreateImport={(sourceNodeId, imageUrl, name) => {
            onCreateImportNode(sourceNodeId, imageUrl, name);
            setImageMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}
