import { memo, useState } from "react";
import { Image, Video, FileText, Workflow, Layers, MessageSquare, ListOrdered, Repeat, ChevronLeft, ChevronRight, Download, Eye, Grid3x3, Trash2 } from "lucide-react";
import type { NodeImage, SmartNode } from "../core/types";

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
  groupImages?: NodeImage[];
  viewportScale?: number;
  onSelect: (id: string, ev?: React.PointerEvent | React.MouseEvent) => void;
  onDragStart?: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onConnect?: (id: string) => void;
  onEditImage?: (id: string, index: number) => void;
  onPreviewImage?: (id: string, index: number) => void;
  /** History empty import card: click / drop to upload media. */
  onUpload?: (id: string, files?: FileList | null) => void;
  onJimengQuery?: (id: string) => void;
  /** History `node-delete` / floating trash — remove the whole card. */
  onDelete?: (id: string) => void;
  onDragEnd?: (info: {
    id: string;
    originX: number;
    originY: number;
    ctrlKey: boolean;
    clientX: number;
    clientY: number;
  }) => void;
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
  onUpload,
  onJimengQuery,
  onDelete,
  memberCount = 0,
  groupImages = [],
  viewportScale = 1,
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
  const jimeng = node.settings?.jimengPending as
    | { submitId?: string; queueInfo?: Record<string, unknown>; message?: string; querying?: boolean }
    | undefined;

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Controls inside a card must remain clickable; starting a window-level
    // drag here steals their interaction and makes upload/preview/connect feel broken.
    if (target.closest("button,a,input,textarea,select,[contenteditable='true']")) return;
    e.stopPropagation();
    onSelect(node.id, e);
    onDragStart?.(node.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = node.x;
    const originY = node.y;
    const ctrlKey = e.ctrlKey || e.metaKey;

    const onMove = (ev: PointerEvent) => {
      const scale = Math.max(0.01, viewportScale);
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onDrag(node.id, originX + dx, originY + dy);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onDragEnd?.({
        id: node.id,
        originX,
        originY,
        ctrlKey: ctrlKey || ev.ctrlKey || ev.metaKey,
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`absolute border bg-[var(--bg)] select-none ${
        selected
          ? "border-[var(--text)] shadow-[0_8px_20px_var(--shadow)]"
          : "border-[var(--border)]"
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
        <span className="text-sm font-medium truncate flex-1 font-serif">
          {node.title || node.kind}
        </span>
        {node.status === "running" && (
          <span className="text-xs text-[var(--muted)] animate-pulse">生成中</span>
        )}
        {isGroup && memberCount > 0 && (
          <span className="text-xs text-[var(--muted)]">{memberCount}</span>
        )}
        {onDelete && !isGroup ? (
          <button
            type="button"
            className="p-1 text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
            title="删除节点 (Delete)"
            data-testid={`node-delete-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </header>
      <div className="p-3">
        {node.collapsed && isGroup ? (
          <p className="text-xs text-[var(--muted)]">分组已折叠</p>
        ) : isGroup ? (
          groupImages.length > 0 ? (
            <div
              className="grid grid-cols-2 gap-1"
              data-testid={`group-preview-${node.id}`}
            >
              {groupImages.slice(0, 4).map((image, index) => (
                <img
                  key={`${image.url}-${index}`}
                  src={image.url}
                  alt=""
                  className="h-20 w-full object-cover"
                  draggable={false}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              {memberCount > 0 ? `${memberCount} 个成员，暂无素材预览` : "将节点拖入此分组"}
            </p>
          )
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
        ) : jimeng?.submitId ? (
          <div
            className="h-28 flex flex-col items-center justify-center gap-2 text-xs text-[var(--muted)] border border-dashed border-[var(--border)]"
            data-testid={`jimeng-pending-${node.id}`}
          >
            <p className="animate-pulse px-2 text-center">
              {jimeng.message ||
                (jimeng.queueInfo
                  ? `即梦排队 ${String(jimeng.queueInfo.queue_idx ?? "")}/${String(jimeng.queueInfo.queue_length ?? "")}`
                  : "即梦云端生成中")}
            </p>
            <button
              type="button"
              className="px-2 py-1 border border-[var(--border)] text-black hover:bg-[var(--nav-hover-bg)]"
              disabled={Boolean(jimeng.querying)}
              data-testid={`jimeng-query-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onJimengQuery?.(node.id);
              }}
            >
              {jimeng.querying ? "查询中…" : "查询结果"}
            </button>
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
        ) : onUpload && (node.kind === "image" || node.kind === "video") ? (
          <button
            type="button"
            className="w-full h-28 border border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1 text-xs text-[var(--muted)] hover:border-black hover:text-black"
            data-testid={`node-upload-zone-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onUpload(node.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUpload(node.id, e.dataTransfer.files);
            }}
          >
            <Image className="w-5 h-5" />
            <span>拖拽 / 点击上传</span>
          </button>
        ) : (
          <p className="text-xs text-[var(--muted)] line-clamp-3">
            {node.prompt || "空节点"}
          </p>
        )}
      </div>
      {onConnect && (
        <button
          type="button"
          className="absolute -left-2 top-1/2 grid h-4 w-4 place-items-center bg-[var(--text)] text-xs text-[var(--bg)]"
          onClick={(e) => {
            e.stopPropagation();
            onConnect(node.id);
          }}
          aria-label={`连接到 ${node.title || node.kind}`}
          data-testid={`connect-input-${node.id}`}
        >
          ←
        </button>
      )}
      {onConnect && (
        <button
          type="button"
          className="absolute -right-2 top-1/2 grid h-4 w-4 place-items-center bg-[var(--text)] text-xs text-[var(--bg)]"
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
