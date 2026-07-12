import {
  ImagePlus,
  Link2,
  Maximize2,
  Ratio,
  Trash2,
  Upload,
  BookOpen,
} from "lucide-react";
import { NodeRunningBadge } from "./CanvasRunUi";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLegacyCanvasStore } from "../core/state";
import { nodeDragWorldPosition } from "../core/nodeDrag";
import { shouldShowCascadeButton } from "../core/cascade";
import { screenToWorld } from "../core/viewport";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";
import {
  imageCaption,
  mediaHeightForAspect,
  nodeHeightForMedia,
  readImageFit,
  readNaturalSize,
  type LegacyImageFit,
} from "../core/imageFit";
import { isNodeDragSurface } from "../core/nodeInteraction";
import {
  clearDragLivePositions,
  setDragLivePositions,
  type DragLiveMap,
} from "../core/dragLivePositions";
import { usePointerDrag } from "../../../shared/hooks/usePointerDrag";
import { cn } from "../../../shared/utils";
import {
  LEGACY_NODE_LABELS,
  isLegacyNodeKind,
  legacyNodeHasInPort,
  legacyNodeHasOutPort,
  type LegacyNode,
} from "../core/types";
import {
  GeneratorNodeBody,
  isRunnableGeneratorKind,
} from "./GeneratorNodeBody";
import { generatorSources } from "../core/nodeSources";
import { OutputNodeBody } from "./OutputNodeBody";
import { LoopNodeBody } from "./LoopNodeBody";
import { GroupNodeBody } from "./GroupNodeBody";
import { PromptGroupNodeBody } from "./PromptGroupNodeBody";
import { LtxDirectorNodeBody } from "./LtxDirectorNodeBody";
import type { RefObject } from "react";

interface LegacyNodeCardProps {
  node: LegacyNode;
  selected: boolean;
  selectedIds: string[];
  viewport: { x: number; y: number; scale: number };
  containerRef: RefObject<HTMLDivElement | null>;
  running?: boolean;
  runError?: string | null;
  cascadeHighlight?: "current" | "upstream" | null;
  onUpload: (nodeId: string, files: FileList) => void;
  onPortDragStart?: (
    nodeId: string,
    worldX: number,
    worldY: number,
    originKind?: "in" | "out",
  ) => void;
  onOpenPromptTemplates?: (nodeId: string) => void;
  onRunNode?: (nodeId: string) => void;
  onCascadeRun?: (
    nodeId: string,
    rounds?: number,
    mode?: "serial" | "parallel",
  ) => void;
  onPreviewImage?: (nodeId: string, url: string) => void;
}

export function LegacyNodeCard({
  node,
  selected,
  selectedIds,
  viewport,
  containerRef,
  running = false,
  runError,
  cascadeHighlight = null,
  onUpload,
  onPortDragStart,
  onOpenPromptTemplates,
  onRunNode,
  onCascadeRun,
  onPreviewImage,
}: LegacyNodeCardProps) {
  const { t } = useTranslation("canvas");
  const {
    selectNode,
    moveNode,
    moveNodes,
    removeNode,
    updateNode,
    connectFromId,
    startConnect,
    completeConnect,
    nodes,
    connections,
  } = useLegacyCanvasStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef({ x: node.x, y: node.y });
  const dragStartClientRef = useRef({ x: 0, y: 0 });

  const url = node.images?.[0]?.url;
  const preview = url ? canvasMediaPreviewUrl(url) : "";
  const connecting = connectFromId === node.id;
  const connectTarget = Boolean(connectFromId && connectFromId !== node.id);
  const hasOutPort = legacyNodeHasOutPort(node.kind);
  const hasInPort = legacyNodeHasInPort(node.kind);
  const isGenerator = isRunnableGeneratorKind(node.kind);
  const isOutput = node.kind === "output";
  const isImage = node.kind === "image";
  const isPrompt = node.kind === "prompt";
  const imageFit = readImageFit(node.settings);
  const natural = readNaturalSize(node.settings);

  const mediaH = useMemo(() => {
    if (!isImage || !url) return 128;
    if (natural) return mediaHeightForAspect(node.width, natural.w, natural.h);
    return Math.max(128, node.height - 56);
  }, [isImage, url, natural, node.width, node.height]);

  const showCascade = shouldShowCascadeButton(node.id, nodes, connections);
  const wiredSources = useMemo(
    () =>
      isGenerator ? generatorSources(node, nodes, connections) : [],
    [isGenerator, node, nodes, connections],
  );

  const kindLabel = isLegacyNodeKind(node.kind)
    ? LEGACY_NODE_LABELS[node.kind]
    : node.kind;

  const caption = isImage
    ? imageCaption(node.title, node.images?.[0]?.name, url)
    : node.title;

  const applyNaturalSize = (nw: number, nh: number) => {
    if (nw <= 0 || nh <= 0) return;
    const prev = readNaturalSize(node.settings);
    if (prev && prev.w === nw && prev.h === nh) {
      // Still ensure height tracks width for contain adaptive layout
      if (imageFit === "contain") {
        const nextH = nodeHeightForMedia(node.width, nw, nh);
        if (Math.abs(nextH - node.height) > 2) {
          updateNode(node.id, { height: nextH });
        }
      }
      return;
    }
    const nextH =
      imageFit === "contain"
        ? nodeHeightForMedia(node.width, nw, nh)
        : Math.max(node.height, mediaHeightForAspect(node.width, nw, nh) + 56);
    updateNode(node.id, {
      height: nextH,
      settings: {
        ...node.settings,
        naturalW: nw,
        naturalH: nh,
      },
    });
  };

  useEffect(() => {
    if (!isImage || !url || natural) return;
    const img = new Image();
    img.onload = () => applyNaturalSize(img.naturalWidth, img.naturalHeight);
    img.src = preview || url;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure once per url
  }, [isImage, url, preview]);

  // Keep stored height aligned with rendered card (history offsetHeight → node.h).
  // Generator/output cards size by content; without this, wires using height/2 drift.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextH = Math.round(entry?.contentRect.height || el.offsetHeight);
      if (nextH <= 0) return;
      const current = useLegacyCanvasStore
        .getState()
        .nodes.find((n) => n.id === node.id)?.height;
      if (current == null || Math.abs(nextH - current) <= 2) return;
      updateNode(node.id, { height: nextH });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, updateNode]);

  const setFit = (fit: LegacyImageFit) => {
    const nat = readNaturalSize(node.settings);
    const patch: Partial<LegacyNode> = {
      settings: { ...node.settings, imageFit: fit },
    };
    if (fit === "contain" && nat) {
      patch.height = nodeHeightForMedia(node.width, nat.w, nat.h);
    }
    updateNode(node.id, patch);
  };

  const nodeDrag = usePointerDrag({
    // Must gate BEFORE setPointerCapture — otherwise StudioSelect / form
    // controls never receive click (pointer captured by the card).
    shouldStart: (e) => isNodeDragSurface(e.target),
    onStart: (e) => {
      if (connectFromId) {
        completeConnect(node.id);
        return;
      }
      if (e?.ctrlKey || e?.metaKey) {
        selectNode(node.id, { additive: true });
      } else if (!selected) {
        selectNode(node.id);
      }
      dragOriginRef.current = { x: node.x, y: node.y };
      if (e) dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    },
    onMove: (clientX, clientY, _dx, _dy, start) => {
      if (connectFromId || !start || !cardRef.current) return;
      const { x, y } = nodeDragWorldPosition(
        dragOriginRef.current.x,
        dragOriginRef.current.y,
        clientX,
        clientY,
        start.x,
        start.y,
        viewport.scale,
      );
      const dx = x - dragOriginRef.current.x;
      const dy = y - dragOriginRef.current.y;
      if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
        const live: DragLiveMap = {};
        selectedIds.forEach((id) => {
          const el = document.querySelector(
            `[data-testid="legacy-node-${id}"]`,
          ) as HTMLElement | null;
          const n = useLegacyCanvasStore.getState().nodes.find((item) => item.id === id);
          if (!el || !n) return;
          const nx = n.x + dx;
          const ny = n.y + dy;
          el.style.left = `${nx}px`;
          el.style.top = `${ny}px`;
          live[id] = { x: nx, y: ny };
        });
        setDragLivePositions(live);
      } else {
        cardRef.current.style.left = `${x}px`;
        cardRef.current.style.top = `${y}px`;
        setDragLivePositions({ [node.id]: { x, y } });
      }
    },
    onEnd: (e) => {
      if (connectFromId || !cardRef.current || !e) {
        clearDragLivePositions();
        return;
      }
      const { x, y } = nodeDragWorldPosition(
        dragOriginRef.current.x,
        dragOriginRef.current.y,
        e.clientX,
        e.clientY,
        dragStartClientRef.current.x,
        dragStartClientRef.current.y,
        viewport.scale,
      );
      const dx = x - dragOriginRef.current.x;
      const dy = y - dragOriginRef.current.y;
      if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
        moveNodes(selectedIds, dx, dy);
        selectedIds.forEach((id) => {
          const el = document.querySelector(
            `[data-testid="legacy-node-${id}"]`,
          ) as HTMLElement | null;
          const n = useLegacyCanvasStore.getState().nodes.find((item) => item.id === id);
          if (!el || !n) return;
          el.style.left = `${n.x}px`;
          el.style.top = `${n.y}px`;
        });
      } else {
        moveNode(node.id, x, y);
        cardRef.current.style.left = `${x}px`;
        cardRef.current.style.top = `${y}px`;
      }
      clearDragLivePositions();
    },
    stopPropagation: true,
  });

  const portOutDrag = usePointerDrag({
    onStart: (e) => {
      if (!e || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
      startConnect(node.id, "out");
      onPortDragStart?.(node.id, world.x, world.y, "out");
    },
    stopPropagation: true,
  });

  const portInDrag = usePointerDrag({
    onStart: (e) => {
      if (!e || !containerRef.current) return;
      if (connectFromId && connectFromId !== node.id) {
        completeConnect(node.id);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
      startConnect(node.id, "in");
      onPortDragStart?.(node.id, world.x, world.y, "in");
    },
    stopPropagation: true,
  });

  const renderBody = () => {
    if (isGenerator) {
      return (
        <GeneratorNodeBody
          node={node}
          running={running}
          error={runError}
          showCascade={showCascade}
          sources={wiredSources}
          onUpdateSettings={(patch) =>
            updateNode(node.id, { settings: { ...node.settings, ...patch } })
          }
          onUpdatePrompt={(prompt) => updateNode(node.id, { prompt })}
          onRun={() => onRunNode?.(node.id)}
          onCascade={() => onCascadeRun?.(node.id)}
        />
      );
    }
    if (isOutput) return <OutputNodeBody node={node} />;
    if (node.kind === "loop") {
      return (
        <LoopNodeBody
          node={node}
          onRunCascade={(targetId, rounds, mode) =>
            onCascadeRun?.(targetId, rounds, mode)
          }
        />
      );
    }
    if (node.kind === "group") return <GroupNodeBody node={node} />;
    if (node.kind === "promptGroup") return <PromptGroupNodeBody node={node} />;
    if (node.kind === "ltxDirector") return <LtxDirectorNodeBody node={node} />;
    if (isPrompt) {
      return (
        <div className="px-2 pb-2" data-node-control="">
          <textarea
            value={node.prompt}
            onChange={(e) => updateNode(node.id, { prompt: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full min-h-[80px] border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:border-black focus:outline-none"
            placeholder={t("promptPlaceholder")}
            data-testid={`legacy-prompt-${node.id}`}
          />
        </div>
      );
    }
    if (url) {
      return (
        <div className="px-2 pb-1" data-testid={`legacy-media-${node.id}`}>
          <div
            className="block w-full rounded-lg overflow-hidden bg-gray-50 border border-gray-100 cursor-grab active:cursor-grabbing"
            style={{ height: mediaH }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onPreviewImage?.(node.id, url);
            }}
            data-testid={`legacy-node-preview-${node.id}`}
          >
            <img
              src={preview}
              alt=""
              className={cn(
                "w-full h-full pointer-events-none",
                imageFit === "cover" ? "object-cover" : "object-contain",
              )}
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                applyNaturalSize(img.naturalWidth, img.naturalHeight);
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="mx-2 mb-1 w-[calc(100%-1rem)] h-28 bg-gray-50 border border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs hover:border-black hover:text-gray-600 transition-colors"
        data-testid={`legacy-node-empty-${node.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isImage) fileRef.current?.click();
        }}
      >
        <ImagePlus className="w-5 h-5 mb-1" />
        {t("clickDragPasteImage", { defaultValue: "点击上传" })}
      </button>
    );
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "absolute border rounded-lg bg-white shadow-sm select-none transition-[box-shadow,border-color] duration-200",
        running && !runError
          ? "border-blue-400 ring-2 ring-blue-400/35 studio-canvas-node-running"
          : selected || connecting
            ? "border-black ring-2 ring-black/15"
            : connectTarget
              ? "border-blue-400"
              : cascadeHighlight === "current"
                ? "border-blue-500 ring-2 ring-blue-400/40"
                : cascadeHighlight === "upstream"
                  ? "border-blue-300"
                  : "border-gray-200 hover:border-gray-300",
        runError ? "border-red-300" : null,
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        // Definite block height so port `top-1/2` resolves to mid-edge (history
        // sized nodes). Content may grow; ResizeObserver syncs height upward.
        minHeight: node.height,
      }}
      data-testid={`legacy-node-${node.id}`}
      data-node-kind={node.kind}
      data-node-running={running ? "1" : "0"}
      data-image-fit={isImage ? imageFit : undefined}
      aria-busy={running || undefined}
      {...nodeDrag.handlers}
    >
      {hasInPort ? (
        <div
          className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-black bg-white z-10 cursor-crosshair"
          title={t("connectHere")}
          data-testid={`legacy-port-in-${node.id}`}
          data-port="in"
          {...portInDrag.handlers}
        />
      ) : null}

      <div className="flex items-center justify-between gap-1 px-2 pt-1.5 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-medium text-gray-500 tracking-wide truncate">
            {kindLabel}
          </span>
          {running && !runError ? <NodeRunningBadge /> : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isImage && url ? (
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              title={
                imageFit === "contain"
                  ? t("fitCover", { defaultValue: "铺满" })
                  : t("fitContain", { defaultValue: "自适应" })
              }
              data-testid={`legacy-image-fit-${node.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setFit(imageFit === "contain" ? "cover" : "contain");
              }}
            >
              {imageFit === "contain" ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Ratio className="w-3.5 h-3.5" />
              )}
            </button>
          ) : null}
          {isPrompt ? (
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              title={t("promptTemplateShort")}
              data-testid={`legacy-prompt-template-${node.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPromptTemplates?.(node.id);
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
            title={t("dragConnect")}
            data-testid={`legacy-node-connect-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (connectFromId === node.id) return;
              if (connectFromId) completeConnect(node.id);
              else startConnect(node.id);
            }}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          {isImage ? (
            <>
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                title={t("upload")}
                data-testid={`legacy-node-upload-${node.id}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUpload(node.id, e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          ) : null}
          <button
            type="button"
            className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
            title={t("common.delete", { defaultValue: "删除" })}
            data-testid={`legacy-node-delete-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              removeNode(node.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {renderBody()}

      {isImage && caption ? (
        <p className="text-[11px] px-2 pb-1.5 truncate text-gray-500">{caption}</p>
      ) : null}

      {hasOutPort ? (
        <div
          className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-black bg-white z-10 cursor-crosshair"
          title={t("dragConnect")}
          data-testid={`legacy-port-out-${node.id}`}
          data-port="out"
          {...portOutDrag.handlers}
        />
      ) : null}
    </div>
  );
}
