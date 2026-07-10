import { Link2 } from "lucide-react";
import { useLegacyCanvasStore } from "../core/state";
import { screenToWorld } from "../core/viewport";
import { usePointerDrag } from "../../../shared/hooks/usePointerDrag";
import { LEGACY_NODE_LABELS, isLegacyNodeKind, type LegacyNode } from "../core/types";
import type { RefObject } from "react";
import { useRef } from "react";

interface LegacyNodeCardProps {
  node: LegacyNode;
  selected: boolean;
  viewport: { x: number; y: number; scale: number };
  containerRef: RefObject<HTMLDivElement | null>;
}

export function LegacyNodeCard({
  node,
  selected,
  viewport,
  containerRef,
}: LegacyNodeCardProps) {
  const {
    selectNode,
    moveNode,
    connectFromId,
    startConnect,
    completeConnect,
  } = useLegacyCanvasStore();
  const url = node.images?.[0]?.url;
  const connecting = connectFromId === node.id;
  const connectTarget = connectFromId && connectFromId !== node.id;

  const nodeDrag = usePointerDrag({
    onStart: () => {
      if (connectFromId) {
        completeConnect(node.id);
        return;
      }
      selectNode(node.id);
    },
    onMove: (_x, _y, dx, dy, start) => {
      if (connectFromId || !start || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const world = screenToWorld(start.x, start.y, rect, viewport);
      moveNode(node.id, world.x + dx / viewport.scale, world.y + dy / viewport.scale);
    },
  });

  const kindLabel = isLegacyNodeKind(node.kind)
    ? LEGACY_NODE_LABELS[node.kind]
    : node.kind;

  return (
    <div
      className={`absolute border p-2 bg-[var(--bg)] ${
        selected || connecting
          ? "border-black ring-2 ring-black/20"
          : connectTarget
            ? "border-blue-400"
            : "border-[var(--border)]"
      }`}
      style={{ left: node.x, top: node.y, width: node.width }}
      data-testid={`legacy-node-${node.id}`}
      data-node-kind={node.kind}
      {...nodeDrag.handlers}
    >
      <div className="flex items-center justify-between mb-1 pointer-events-none">
        <span className="text-[10px] text-[var(--muted)]">{kindLabel}</span>
        <button
          type="button"
          className="pointer-events-auto p-0.5 hover:bg-[var(--nav-hover-bg)]"
          title="连接"
          data-testid={`legacy-node-connect-${node.id}`}
          onClick={(e) => {
            e.stopPropagation();
            if (connectFromId === node.id) return;
            if (connectFromId) {
              completeConnect(node.id);
            } else {
              startConnect(node.id);
            }
          }}
        >
          <Link2 className="w-3 h-3" />
        </button>
      </div>
      {url ? (
        <img src={url} alt="" className="w-full h-32 object-cover pointer-events-none" />
      ) : (
        <div className="w-full h-32 bg-[var(--nav-hover-bg)] flex items-center justify-center text-[var(--muted)] text-sm pointer-events-none">
          {kindLabel}
        </div>
      )}
      <p className="text-xs mt-2 truncate pointer-events-none">{node.title}</p>
    </div>
  );
}
