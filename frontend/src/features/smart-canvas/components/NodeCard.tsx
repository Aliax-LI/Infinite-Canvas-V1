import { memo, useState } from "react";
import { Image, Video, FileText, Workflow, Layers, MessageSquare, ListOrdered, Repeat, ChevronLeft, ChevronRight, Download, Eye, Grid3x3 } from "lucide-react";
import type { SmartNode } from "../core/types";

const kindIcons: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  text: FileText,
  workflow: Workflow,
  group: Layers,
  prompt: MessageSquare,
  loop: ListOrdered,
  export: FileText,
};

interface NodeCardProps {
  node: SmartNode;
  selected: boolean;
  memberCount?: number;
  onSelect: (id: string, ev?: React.PointerEvent | React.MouseEvent) => void;
  onDragStart?: () => void;
  onDrag: (id: string, x: number, y: number) => void;
  onDragEnd?: () => void;
  onConnect?: (id: string) => void;
  onEditImage?: (id: string, index: number) => void;
  onPreviewImage?: (id: string, index: number) => void;
}

export const NodeCard = memo(function NodeCard({
  node,
  selected,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onConnect,
  onEditImage,
  onPreviewImage,
  memberCount = 0,
}: NodeCardProps) {
  const Icon = kindIcons[node.kind] ?? Layers;
  const images = node.images ?? [];
  const [imgIndex, setImgIndex] = useState(0);
  const thumb = images[imgIndex]?.url ?? images[0]?.url;
  const isGroup = node.kind === "group";
  const isPrompt = node.kind === "prompt";
  const isLoop = node.kind === "loop";
  const isWorkflow = node.kind === "workflow";
  const workflowId = node.settings?.workflowId as string | undefined;
  const loopCount = Number(node.settings?.count ?? 1);
  const loopMode = String(node.settings?.mode ?? "serial");

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(node.id, e);
    onDragStart?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = node.x;
    const originY = node.y;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onDrag(node.id, originX + dx, originY + dy);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onDragEnd?.();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`absolute border bg-[var(--bg)] select-none ${
        selected ? "border-black shadow-md" : "border-[var(--border)]"
      } ${node.status === "running" ? "opacity-70" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 280,
        minHeight: node.height ?? 200,
      }}
      onPointerDown={handlePointerDown}
      data-testid={`node-card-${node.id}`}
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">
          {node.title || node.kind}
        </span>
        {node.status === "running" && (
          <span className="text-xs text-[var(--muted)] animate-pulse">生成中</span>
        )}
        {isGroup && memberCount > 0 && (
          <span className="text-xs text-[var(--muted)]">{memberCount}</span>
        )}
      </header>
      <div className="p-3">
        {node.collapsed && isGroup ? (
          <p className="text-xs text-[var(--muted)]">分组已折叠</p>
        ) : isWorkflow && workflowId ? (
          <p className="text-xs text-[var(--muted)]">工作流: {workflowId}</p>
        ) : isPrompt ? (
          <p className="text-xs whitespace-pre-wrap line-clamp-6">{node.prompt || "空 Prompt"}</p>
        ) : isLoop ? (
          <div className="text-xs text-[var(--muted)] space-y-1">
            <p className="flex items-center gap-1"><Repeat className="w-3 h-3" /> {loopCount} 轮 · {loopMode}</p>
            {String(node.settings?.variablePrompt ?? "") && (
              <p className="line-clamp-2">{String(node.settings?.variablePrompt)}</p>
            )}
          </div>
        ) : thumb ? (
          <div className="relative group">
            <img
              src={thumb}
              alt=""
              className="w-full h-32 object-cover mb-2"
              draggable={false}
            />
            {images.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1">
                <button
                  type="button"
                  className="p-1 bg-black/60 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgIndex((i) => (i - 1 + images.length) % images.length);
                  }}
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-xs text-white bg-black/60 px-1">
                  {imgIndex + 1}/{images.length}
                </span>
                <button
                  type="button"
                  className="p-1 bg-black/60 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgIndex((i) => (i + 1) % images.length);
                  }}
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
            {selected && (onEditImage || onPreviewImage) && (
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                {onPreviewImage && (
                  <button
                    type="button"
                    className="p-1 bg-black text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewImage(node.id, imgIndex);
                    }}
                    data-testid={`node-preview-${node.id}`}
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
                {onEditImage && (
                  <button
                    type="button"
                    className="p-1 bg-black text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditImage(node.id, imgIndex);
                    }}
                    data-testid={`node-edit-${node.id}`}
                  >
                    <Grid3x3 className="w-3 h-3" />
                  </button>
                )}
                <a
                  href={thumb}
                  download
                  className="p-1 bg-black text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)] line-clamp-3">
            {node.prompt || "空节点"}
          </p>
        )}
      </div>
      {onConnect && (
        <button
          type="button"
          className="absolute -right-2 top-1/2 w-4 h-4 bg-black text-white text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onConnect(node.id);
          }}
          data-testid={`connect-port-${node.id}`}
        >
          →
        </button>
      )}
    </div>
  );
});
