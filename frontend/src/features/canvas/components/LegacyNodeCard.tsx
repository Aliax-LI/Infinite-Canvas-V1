import {
  ImagePlus,
  Library,
  Link2,
  Maximize2,
  Ratio,
  Trash2,
  Upload,
} from "lucide-react";
import { NodeRunningBadge } from "./CanvasRunUi";
import { useEffect, useMemo, useRef, useState } from "react";
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
  clampLegacyNodeSize,
  isLegacyNodeSized,
  LEGACY_RESIZE_MIN_H,
} from "../core/nodeResize";
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
import { generatorSources, collectLlmInput, collectLlmMedia } from "../core/nodeSources";
import { OutputNodeBody } from "./OutputNodeBody";
import { LoopNodeBody } from "./LoopNodeBody";
import { GroupNodeBody } from "./GroupNodeBody";
import { PromptGroupNodeBody } from "./PromptGroupNodeBody";
import { LtxDirectorNodeBody } from "./LtxDirectorNodeBody";
import type { RefObject } from "react";

/** History `PROMPT_TEXT_MAX_LENGTH` in canvas.js */
const PROMPT_TEXT_MAX_LENGTH = 20000;

function promptTextLength(text: string) {
  return Array.from(String(text || "")).length;
}

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
  onImageContextMenu?: (
    nodeId: string,
    url: string,
    clientX: number,
    clientY: number,
    name?: string,
  ) => void;
  knifeMode?: boolean;
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
  onImageContextMenu,
  knifeMode = false,
}: LegacyNodeCardProps) {
  const { t } = useTranslation("canvas");
  const {
    selectNode,
    moveNode,
    moveNodes,
    removeNode,
    updateNode,
    resizeNode,
    pushUndo,
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
  const resizeOriginRef = useRef({ w: node.width, h: node.height });
  const resizingRef = useRef(false);
  const [emptyDragOver, setEmptyDragOver] = useState(false);

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
  const isSized = isLegacyNodeSized(node.settings);
  const imageFit = readImageFit(node.settings);
  const natural = readNaturalSize(node.settings);

  const mediaH = useMemo(() => {
    if (!isImage || !url) return 128;
    // Manual resize: fill remaining card height (history `.node.sized`).
    if (isSized) return Math.max(72, node.height - 56);
    if (natural) return mediaHeightForAspect(node.width, natural.w, natural.h);
    return Math.max(128, node.height - 56);
  }, [isImage, url, natural, node.width, node.height, isSized]);

  const showCascade = shouldShowCascadeButton(node.id, nodes, connections);
  const wiredSources = useMemo(
    () =>
      isGenerator ? generatorSources(node, nodes, connections) : [],
    [isGenerator, node, nodes, connections],
  );
  const llmWiredInput = useMemo(
    () =>
      node.kind === "llm" ? collectLlmInput(node, nodes, connections) : "",
    [node, nodes, connections],
  );
  const llmWiredMedia = useMemo(
    () =>
      node.kind === "llm"
        ? collectLlmMedia(node, nodes, connections)
        : { images: [], videos: [] },
    [node, nodes, connections],
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
      if (!isSized && imageFit === "contain") {
        const nextH = nodeHeightForMedia(node.width, nw, nh);
        if (Math.abs(nextH - node.height) > 2) {
          updateNode(node.id, { height: nextH });
        }
      }
      return;
    }
    const nextH = isSized
      ? node.height
      : imageFit === "contain"
        ? nodeHeightForMedia(node.width, nw, nh)
        : Math.max(node.height, mediaHeightForAspect(node.width, nw, nh) + 56);
    updateNode(node.id, {
      ...(isSized ? {} : { height: nextH }),
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
  // Skip while user-resized (`settings.sized`) so shrink sticks.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      if (resizingRef.current) return;
      const currentNode = useLegacyCanvasStore
        .getState()
        .nodes.find((n) => n.id === node.id);
      if (!currentNode || isLegacyNodeSized(currentNode.settings)) return;
      const entry = entries[0];
      const nextH = Math.round(entry?.contentRect.height || el.offsetHeight);
      if (nextH <= 0) return;
      if (Math.abs(nextH - currentNode.height) <= 2) return;
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
    if (!isSized && fit === "contain" && nat) {
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

  const nodeResizeDrag = usePointerDrag({
    stopPropagation: true,
    onStart: (e) => {
      e?.preventDefault();
      if (!selected) selectNode(node.id);
      pushUndo();
      resizingRef.current = true;
      const el = cardRef.current;
      const rect = el?.getBoundingClientRect();
      const scale = viewport.scale > 0 ? viewport.scale : 1;
      resizeOriginRef.current = {
        w: rect ? rect.width / scale : node.width,
        h: rect ? rect.height / scale : node.height,
      };
      document.body.classList.add("canvas-node-resize");
    },
    onMove: (clientX, clientY, _dx, _dy, start) => {
      if (!start) return;
      const scale = viewport.scale > 0 ? viewport.scale : 1;
      const next = clampLegacyNodeSize(
        resizeOriginRef.current.w + (clientX - start.x) / scale,
        resizeOriginRef.current.h + (clientY - start.y) / scale,
      );
      // Live DOM update for smooth drag; store sync keeps minimap/ports in sync.
      if (cardRef.current) {
        cardRef.current.style.width = `${next.width}px`;
        cardRef.current.style.height = `${next.height}px`;
        cardRef.current.style.minHeight = `${next.height}px`;
      }
      resizeNode(node.id, next.width, next.height);
    },
    onEnd: () => {
      resizingRef.current = false;
      document.body.classList.remove("canvas-node-resize");
    },
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
          llmWiredInput={llmWiredInput}
          llmWiredImageCount={llmWiredMedia.images.length}
          llmWiredVideoCount={llmWiredMedia.videos.length}
          onUpdateSettings={(patch) =>
            updateNode(node.id, { settings: { ...node.settings, ...patch } })
          }
          onUpdatePrompt={(prompt) => updateNode(node.id, { prompt })}
          onRun={() => onRunNode?.(node.id)}
          onCascade={() => onCascadeRun?.(node.id)}
        />
      );
    }
    if (isOutput) {
      return (
        <OutputNodeBody
          node={node}
          onPreviewImage={onPreviewImage}
          onImageContextMenu={onImageContextMenu}
        />
      );
    }
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
      const charCount = promptTextLength(node.prompt);
      const overLimit = charCount > PROMPT_TEXT_MAX_LENGTH;
      return (
        <div
          className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-2"
          data-node-control=""
          data-testid={`legacy-prompt-editor-${node.id}`}
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <button
              type="button"
              className="inline-flex h-[23px] shrink-0 items-center justify-center gap-1 border border-[var(--border)] bg-[var(--bg)] px-1.5 text-[9.5px] font-extrabold text-[var(--muted)] transition-[transform,border-color,color,background-color] hover:-translate-y-px hover:border-gray-300 hover:text-[var(--text)]"
              title={t("promptTemplateLibrary")}
              data-testid={`legacy-prompt-template-${node.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPromptTemplates?.(node.id);
              }}
            >
              <Library className="h-3 w-3" />
              <span>{t("promptTemplateShort")}</span>
            </button>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 text-[10.5px] font-extrabold leading-none select-none",
                overLimit ? "text-red-600" : "text-slate-400",
              )}
              data-testid={`legacy-prompt-counter-${node.id}`}
            >
              <span>{charCount.toLocaleString()}</span>
              <span>/ {PROMPT_TEXT_MAX_LENGTH.toLocaleString()}</span>
            </div>
          </div>
          <textarea
            value={node.prompt}
            onChange={(e) => {
              const text = e.target.value;
              updateNode(node.id, {
                prompt: text,
                settings: { ...node.settings, text },
              });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "w-full flex-1 resize-none border border-[#edf2f7] bg-[#fbfdff] px-3 py-3 text-[13px] leading-[1.6] outline-none focus:border-[var(--text)]",
              isSized ? "min-h-0" : "min-h-[140px]",
            )}
            placeholder={t("promptPlaceholder")}
            data-testid={`legacy-prompt-${node.id}`}
          />
        </div>
      );
    }
    if (url) {
      return (
        <div
          className={cn("px-2 pb-1", isSized ? "min-h-0 flex-1" : null)}
          data-testid={`legacy-media-${node.id}`}
        >
          <div
            className="block w-full overflow-hidden border border-gray-100 bg-gray-50 cursor-grab active:cursor-grabbing"
            style={{ height: mediaH }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onPreviewImage?.(node.id, url);
            }}
            onContextMenu={(e) => {
              if (!onImageContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              onImageContextMenu(
                node.id,
                url,
                e.clientX,
                e.clientY,
                node.images?.[0]?.name,
              );
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
        className={cn(
          "mx-2 mb-2 flex h-[190px] min-h-[72px] w-[calc(100%-1rem)] flex-col items-center justify-center gap-2 border border-dashed bg-[#f8fafc] px-3 text-center text-[11px] font-bold text-slate-400 transition-colors",
          emptyDragOver
            ? "border-[var(--text)] bg-white text-[var(--text)]"
            : "border-slate-300 hover:border-[var(--text)] hover:bg-white hover:text-[var(--text)]",
        )}
        data-testid={`legacy-node-empty-${node.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isImage) fileRef.current?.click();
        }}
        onDragOver={(e) => {
          if (!isImage) return;
          e.preventDefault();
          e.stopPropagation();
          setEmptyDragOver(true);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          setEmptyDragOver(false);
        }}
        onDrop={(e) => {
          if (!isImage) return;
          e.preventDefault();
          e.stopPropagation();
          setEmptyDragOver(false);
          if (e.dataTransfer.files?.length) onUpload(node.id, e.dataTransfer.files);
        }}
      >
        <ImagePlus className="h-7 w-7 shrink-0" />
        <div className="max-w-[220px] leading-snug">
          {t("clickDragPasteImage")}
        </div>
      </button>
    );
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "legacy-node-card absolute border bg-white shadow-[0_16px_42px_var(--shadow)] select-none transition-[outline,border-color] duration-150",
        isSized ? "flex flex-col overflow-hidden" : null,
        knifeMode && !selected
          ? "outline outline-1 outline-dashed outline-red-500/45 outline-offset-4"
          : null,
        running && !runError
          ? "border-blue-400 outline outline-2 outline-blue-400/40 studio-canvas-node-running"
          : selected || connecting
            ? "border-[var(--text)] outline outline-2 outline-[var(--text)] outline-offset-0"
            : connectTarget
              ? "border-blue-400"
              : cascadeHighlight === "current"
                ? "border-blue-500 outline outline-2 outline-blue-400/40"
                : cascadeHighlight === "upstream"
                  ? "border-blue-300"
                  : "border-[var(--border)] hover:border-gray-300",
        runError ? "border-red-300" : null,
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        // Manual resize locks both axes (history `.node.sized`); otherwise
        // minHeight + ResizeObserver lets content grow for wire midpoints.
        // OUTPUT follows content height (ComfyUI SaveImage–like): use the
        // resize floor so a stale tall height cannot leave empty whitespace.
        ...(isSized
          ? { height: node.height, minHeight: node.height }
          : {
              minHeight: isOutput
                ? LEGACY_RESIZE_MIN_H
                : node.height,
            }),
      }}
      data-testid={`legacy-node-${node.id}`}
      data-node-kind={node.kind}
      data-node-running={running ? "1" : "0"}
      data-node-sized={isSized ? "1" : "0"}
      data-selected={selected ? "1" : "0"}
      data-image-fit={isImage ? imageFit : undefined}
      aria-busy={running || undefined}
      {...nodeDrag.handlers}
    >
      {hasInPort ? (
        <div
          className="absolute -left-[15px] top-1/2 z-10 h-11 w-11 -translate-y-1/2 cursor-crosshair"
          title={t("connectHere")}
          data-testid={`legacy-port-in-${node.id}`}
          data-port="in"
          {...portInDrag.handlers}
        >
          <span className="legacy-node-port-dot pointer-events-none absolute left-[15px] top-[15px] h-3.5 w-3.5 border-2 border-white bg-[#111827] shadow-[0_0_0_1px_#94a3b8]" />
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-1 px-2 pt-1.5 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
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
          <button
            type="button"
            className="p-1 hover:bg-gray-100 text-gray-500"
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

      <div
        className={cn(
          isSized ? "flex min-h-0 flex-1 flex-col overflow-auto" : null,
        )}
      >
        {renderBody()}

        {isImage && caption ? (
          <p className="text-[11px] px-2 pb-1.5 truncate text-gray-500 shrink-0">
            {caption}
          </p>
        ) : null}
      </div>

      {hasOutPort ? (
        <div
          className="absolute -right-[15px] top-1/2 z-10 h-11 w-11 -translate-y-1/2 cursor-crosshair"
          title={t("dragConnect")}
          data-testid={`legacy-port-out-${node.id}`}
          data-port="out"
          {...portOutDrag.handlers}
        >
          <span className="legacy-node-port-dot pointer-events-none absolute left-[15px] top-[15px] h-3.5 w-3.5 border-2 border-white bg-[#111827] shadow-[0_0_0_1px_#94a3b8]" />
        </div>
      ) : null}

      <div
        className="legacy-node-resize-handle resize-handle"
        tabIndex={0}
        aria-label={t("resize")}
        title={t("resize")}
        data-testid={`legacy-resize-${node.id}`}
        {...nodeResizeDrag.handlers}
      />
    </div>
  );
}
