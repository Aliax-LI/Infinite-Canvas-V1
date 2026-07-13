import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  readOutputImages,
  readPendingList,
  type OutputImageEntry,
  type PendingRun,
} from "../core/pendingOutput";
import {
  mediaHeightForAspect,
  readImageFit,
  readNaturalSize,
} from "../core/imageFit";
import { isLegacyNodeSized } from "../core/nodeResize";
import type { LegacyNode } from "../core/types";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";
import { formatRunDuration } from "../core/generationLog";
import { useLegacyCanvasStore } from "../core/state";
import { cn } from "../../../shared/utils";
import { FailedOutputRow, PendingOutputCard } from "./CanvasRunUi";

interface OutputNodeBodyProps {
  node: LegacyNode;
  onPreviewImage?: (nodeId: string, url: string) => void;
  onImageContextMenu?: (
    nodeId: string,
    url: string,
    clientX: number,
    clientY: number,
    name?: string,
  ) => void;
}

type DisplayRow =
  | { kind: "pending"; pending: PendingRun }
  | { kind: "error-group"; error: string; ids: string[]; count: number }
  | { kind: "image"; img: OutputImageEntry; index: number };

/** Collapse consecutive identical failed pendings into one compact row. */
export function buildOutputDisplayRows(
  pending: PendingRun[],
  images: OutputImageEntry[],
): DisplayRow[] {
  const rows: DisplayRow[] = [];
  let i = 0;
  while (i < pending.length) {
    const p = pending[i];
    if (p.failed) {
      const error = String(p.error || "").trim();
      const ids = [p.id];
      let j = i + 1;
      while (j < pending.length) {
        const next = pending[j];
        if (!next.failed) break;
        if (String(next.error || "").trim() !== error) break;
        ids.push(next.id);
        j += 1;
      }
      rows.push({ kind: "error-group", error, ids, count: ids.length });
      i = j;
      continue;
    }
    rows.push({ kind: "pending", pending: p });
    i += 1;
  }
  for (let idx = 0; idx < images.length; idx += 1) {
    rows.push({ kind: "image", img: images[idx], index: idx });
  }
  return rows;
}

/** Split status (errors) from media so the preview can stay image-first. */
export function partitionOutputRows(rows: DisplayRow[]): {
  errors: Extract<DisplayRow, { kind: "error-group" }>[];
  media: Exclude<DisplayRow, { kind: "error-group" }>[];
} {
  const errors: Extract<DisplayRow, { kind: "error-group" }>[] = [];
  const media: Exclude<DisplayRow, { kind: "error-group" }>[] = [];
  for (const row of rows) {
    if (row.kind === "error-group") errors.push(row);
    else media.push(row);
  }
  return { errors, media };
}

function OutputImageCard({
  nodeId,
  img,
  index,
  imageFit,
  variant,
  onPreview,
  onContextMenu,
  onDelete,
  onNatural,
}: {
  nodeId: string;
  img: OutputImageEntry;
  index: number;
  imageFit: "contain" | "cover";
  variant: "hero" | "thumb";
  onPreview?: (url: string) => void;
  onContextMenu?: (url: string, clientX: number, clientY: number, name?: string) => void;
  onDelete?: () => void;
  onNatural?: (w: number, h: number) => void;
}) {
  const preview = canvasMediaPreviewUrl(img.url);
  // Grid thumbs always cover the square cell (no gray letterbox/pillarbox).
  // Hero default uses intrinsic aspect (`legacy-output-img--natural`); cover mode crops to AR.
  const thumbCover = variant === "thumb";
  const heroCover = variant === "hero" && imageFit === "cover";
  const useCover = thumbCover || heroCover;
  const openMenu = (e: MouseEvent) => {
    if (!onContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(img.url, e.clientX, e.clientY, img.name);
  };
  return (
    <div
      className={cn(
        "legacy-output-img-wrap group",
        variant === "hero" && "legacy-output-img-wrap--hero",
        variant === "thumb" && "legacy-output-img-wrap--compact",
        heroCover && "legacy-output-img-wrap--hero-cover",
        useCover && "legacy-output-img-wrap--filled",
      )}
      data-testid={`output-image-${nodeId}-${index}`}
      data-variant={variant}
      data-image-fit={useCover ? "cover" : "contain"}
      onContextMenu={openMenu}
    >
      <button
        type="button"
        className="absolute inset-0 z-[1] cursor-zoom-in"
        data-testid={`output-image-preview-${nodeId}-${index}`}
        aria-label="preview"
        onClick={(e) => {
          e.stopPropagation();
          onPreview?.(img.url);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={openMenu}
      />
      <img
        src={preview}
        alt=""
        className={cn(
          "pointer-events-none",
          variant === "hero" && !heroCover
            ? "legacy-output-img--natural"
            : cn("h-full w-full", useCover ? "object-cover" : "object-contain"),
        )}
        loading="lazy"
        onLoad={(e) => {
          const el = e.currentTarget;
          onNatural?.(el.naturalWidth, el.naturalHeight);
        }}
        onError={(e) => {
          const el = e.currentTarget;
          if (img.url && el.src !== img.url) el.src = img.url;
        }}
      />
      {img.runMs ? (
        <span className="legacy-output-time-pill">{formatRunDuration(img.runMs)}</span>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className="legacy-output-item-dismiss absolute top-1 right-1 z-[2] opacity-0 group-hover:opacity-100"
          data-testid={`output-image-delete-${nodeId}-${index}`}
          aria-label="delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}

export function OutputNodeBody({
  node,
  onPreviewImage,
  onImageContextMenu,
}: OutputNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const updateNode = useLegacyCanvasStore((s) => s.updateNode);
  const pending = readPendingList(node);
  const images = readOutputImages(node);
  const imageFit = readImageFit(node.settings);
  const natural = readNaturalSize(node.settings);
  const sized = isLegacyNodeSized(node.settings);
  const [now, setNow] = useState(() => Date.now());

  const displayRows = useMemo(
    () => buildOutputDisplayRows(pending, images),
    [pending, images],
  );
  const { errors, media } = useMemo(
    () => partitionOutputRows(displayRows),
    [displayRows],
  );

  const activePending = media.filter((row) => row.kind === "pending");
  const mediaImages = media.filter((row) => row.kind === "image");
  const hero =
    mediaImages.length === 1 && activePending.length === 0;
  const useGrid = !hero && media.length > 0;

  useEffect(() => {
    if (!pending.some((p) => !p.failed)) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [pending]);

  const applyNatural = (nw: number, nh: number) => {
    if (nw <= 0 || nh <= 0) return;
    const prev = readNaturalSize(node.settings);
    if (prev && prev.w === nw && prev.h === nh) return;
    // Only store natural size; card height follows content via ResizeObserver
    // (and shrinks when not manually sized). Avoid locking a tall empty panel.
    const patch: Partial<LegacyNode> = {
      settings: {
        ...node.settings,
        naturalW: nw,
        naturalH: nh,
      },
    };
    if (!sized && hero) {
      const mediaH = mediaHeightForAspect(node.width - 16, nw, nh);
      const errorChrome = errors.length * 40;
      patch.height = Math.max(96, mediaH + 48 + errorChrome);
    }
    updateNode(node.id, patch);
  };

  const removeImageAt = (index: number) => {
    const nextImages = images.filter((_, i) => i !== index);
    updateNode(node.id, {
      images: nextImages.map((img) => ({
        url: img.url,
        kind: img.kind || "image",
        name: img.name,
      })),
      settings: {
        ...node.settings,
        outputImages: nextImages,
      },
    });
  };

  const removePendingIds = (ids: string[]) => {
    const drop = new Set(ids);
    updateNode(node.id, {
      settings: {
        ...node.settings,
        _pending: readPendingList(node).filter((p) => !drop.has(p.id)),
      },
    });
  };

  const contentW = Math.max(96, node.width - 16);
  const thumbSide = Math.max(96, Math.min(Math.round(contentW), 148));
  const heroAspect =
    natural && natural.w > 0 && natural.h > 0
      ? `${natural.w} / ${natural.h}`
      : undefined;

  return (
    <div
      className={cn(
        "legacy-output-body",
        sized && "legacy-output-body--sized",
        hero && "legacy-output-body--hero",
      )}
      data-node-control=""
      data-testid={`output-node-body-${node.id}`}
      data-image-fit={imageFit}
      data-image-count={images.length}
      data-pending-count={pending.length}
      data-layout={hero ? "hero" : useGrid ? "grid" : "empty"}
      style={
        heroAspect
          ? ({ "--output-hero-ar": heroAspect } as CSSProperties)
          : undefined
      }
    >
      {errors.length ? (
        <div className="legacy-output-status">
          {errors.map((row) => (
            <FailedOutputRow
              key={`err-${row.ids[0]}`}
              error={row.error || t("failed")}
              count={row.count}
              testId={`output-error-group-${row.ids[0]}`}
              onDismiss={() => removePendingIds(row.ids)}
            />
          ))}
        </div>
      ) : null}

      {hero ? (
        <div className="legacy-output-media">
          <OutputImageCard
            nodeId={node.id}
            img={mediaImages[0].img}
            index={mediaImages[0].index}
            imageFit={imageFit}
            variant="hero"
            onPreview={(url) => onPreviewImage?.(node.id, url)}
            onContextMenu={(url, x, y, name) =>
              onImageContextMenu?.(node.id, url, x, y, name)
            }
            onDelete={() => removeImageAt(mediaImages[0].index)}
            onNatural={applyNatural}
          />
        </div>
      ) : useGrid ? (
        <div
          className="legacy-output-media legacy-output-grid"
          style={
            {
              "--output-thumb-min": "96px",
              "--output-thumb-max": `${thumbSide}px`,
            } as CSSProperties
          }
        >
          {media.map((row) => {
            if (row.kind === "pending") {
              return (
                <PendingOutputCard
                  key={row.pending.id}
                  pending={row.pending}
                  width={thumbSide}
                  now={now}
                  onDismiss={() => removePendingIds([row.pending.id])}
                />
              );
            }
            return (
              <OutputImageCard
                key={`${row.img.url}-${row.index}`}
                nodeId={node.id}
                img={row.img}
                index={row.index}
                imageFit={imageFit}
                variant="thumb"
                onPreview={(url) => onPreviewImage?.(node.id, url)}
                onContextMenu={(url, x, y, name) =>
                  onImageContextMenu?.(node.id, url, x, y, name)
                }
                onDelete={() => removeImageAt(row.index)}
                onNatural={row.index === 0 ? applyNatural : undefined}
              />
            );
          })}
        </div>
      ) : !pending.length && !images.length ? (
        <p className="legacy-output-empty">{t("outputEmpty")}</p>
      ) : null}
    </div>
  );
}
