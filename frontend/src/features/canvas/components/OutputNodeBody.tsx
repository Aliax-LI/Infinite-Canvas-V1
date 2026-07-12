import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  readOutputImages,
  readPendingList,
} from "../core/pendingOutput";
import {
  mediaHeightForAspect,
  readImageFit,
  readNaturalSize,
} from "../core/imageFit";
import type { LegacyNode } from "../core/types";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";
import { useLegacyCanvasStore } from "../core/state";
import { cn } from "../../../shared/utils";
import { PendingOutputCard } from "./CanvasRunUi";

interface OutputNodeBodyProps {
  node: LegacyNode;
}

export function OutputNodeBody({ node }: OutputNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const updateNode = useLegacyCanvasStore((s) => s.updateNode);
  const [, tick] = useState(0);
  const pending = readPendingList(node);
  const images = readOutputImages(node);
  const imageFit = readImageFit(node.settings);
  const natural = readNaturalSize(node.settings);
  const single = images.length === 1 && pending.length === 0;

  useEffect(() => {
    if (!pending.length) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [pending.length]);

  const applyNatural = (nw: number, nh: number) => {
    if (nw <= 0 || nh <= 0) return;
    const prev = readNaturalSize(node.settings);
    if (prev && prev.w === nw && prev.h === nh) return;
    const mediaH = mediaHeightForAspect(node.width - 16, nw, nh);
    updateNode(node.id, {
      height: Math.max(node.height, mediaH + 56),
      settings: {
        ...node.settings,
        naturalW: nw,
        naturalH: nh,
      },
    });
  };

  const singleH = natural
    ? mediaHeightForAspect(node.width - 16, natural.w, natural.h)
    : Math.max(160, node.height - 56);

  return (
    <div
      className="px-2 pb-2"
      data-node-control=""
      data-testid={`output-node-body-${node.id}`}
      data-image-fit={imageFit}
    >
      {single ? (
        <div
          className="relative w-full rounded-lg overflow-hidden border border-gray-100 bg-gray-50"
          style={{ height: singleH }}
          data-testid={`output-image-${node.id}-0`}
        >
          <img
            src={canvasMediaPreviewUrl(images[0].url)}
            alt=""
            className={cn(
              "w-full h-full",
              imageFit === "cover" ? "object-cover" : "object-contain",
            )}
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget;
              applyNatural(img.naturalWidth, img.naturalHeight);
            }}
          />
          {images[0].runMs ? (
            <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/70 text-white font-mono">
              {(images[0].runMs / 1000).toFixed(1)}s
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-72 overflow-auto">
          {pending.map((p) => (
            <PendingOutputCard key={p.id} pending={p} width={node.width - 16} />
          ))}
          {images.map((img, i) => (
            <div
              key={`${img.url}-${i}`}
              className="relative w-full rounded-lg overflow-hidden border border-gray-100 bg-gray-50"
              style={{
                height: Math.max(120, Math.round((node.width - 16) * 0.75)),
              }}
              data-testid={`output-image-${node.id}-${i}`}
            >
              <img
                src={canvasMediaPreviewUrl(img.url)}
                alt=""
                className={cn(
                  "w-full h-full",
                  imageFit === "cover" ? "object-cover" : "object-contain",
                )}
                loading="lazy"
                onLoad={(e) => {
                  if (i === 0) {
                    const el = e.currentTarget;
                    applyNatural(el.naturalWidth, el.naturalHeight);
                  }
                }}
              />
              {img.runMs ? (
                <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/70 text-white font-mono">
                  {(img.runMs / 1000).toFixed(1)}s
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {!pending.length && !images.length ? (
        <p className="text-xs text-gray-400 py-6 text-center">{t("outputEmpty")}</p>
      ) : null}
    </div>
  );
}
