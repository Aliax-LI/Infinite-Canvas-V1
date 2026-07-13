import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import {
  computeMinimapLayout,
  worldViewRect,
} from "../core/minimapLayout";
import {
  LEGACY_NODE_H,
  LEGACY_NODE_W,
  type LegacyNode,
  type ViewportState,
} from "../core/types";

interface MinimapProps {
  nodes: LegacyNode[];
  viewport: ViewportState;
  containerWidth: number;
  containerHeight: number;
  selectedCount?: number;
  onArrangeSelected?: () => void;
}

export function Minimap({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
  selectedCount = 0,
  onArrangeSelected,
}: MinimapProps) {
  const mapW = 120;
  const mapH = 80;

  const layout = useMemo(() => {
    if (!nodes.length) return null;
    const nodeRects = nodes.map((n) => ({
      x: n.x,
      y: n.y,
      w: n.width ?? LEGACY_NODE_W,
      h: n.height ?? LEGACY_NODE_H,
    }));
    const view = worldViewRect(viewport, containerWidth, containerHeight);
    return computeMinimapLayout(nodeRects, view, mapW, mapH);
  }, [nodes, viewport, containerWidth, containerHeight]);

  if (!layout) return null;

  const showArrange = selectedCount >= 1 && Boolean(onArrangeSelected);

  return (
    <div className="absolute bottom-4 right-[22px] z-10 flex flex-col items-end gap-2">
      {showArrange ? (
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 border border-[var(--border)] bg-[var(--bg)]/95 px-2.5 text-[11px] font-extrabold text-[var(--muted)] shadow-[0_10px_24px_rgba(15,23,42,0.13)] backdrop-blur-md hover:-translate-y-px hover:text-[var(--text)]"
          title="整理选中节点"
          aria-label="整理选中节点"
          data-testid="legacy-arrange-selected-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onArrangeSelected}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>整理选中</span>
        </button>
      ) : null}
      <div
        className="border border-[var(--border)] bg-[var(--bg)]/90 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.13)] backdrop-blur-md"
        style={{ width: mapW + 8, height: mapH + 8 }}
        data-testid="legacy-minimap"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg width={mapW} height={mapH} className="block overflow-hidden">
          {nodes.map((n) => {
            const r = layout.project({
              x: n.x,
              y: n.y,
              w: n.width ?? LEGACY_NODE_W,
              h: n.height ?? LEGACY_NODE_H,
            });
            return (
              <rect
                key={n.id}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill="var(--muted)"
              />
            );
          })}
          <rect
            data-testid="legacy-minimap-viewport"
            x={layout.view.x}
            y={layout.view.y}
            width={layout.view.w}
            height={layout.view.h}
            fill="rgba(17,24,39,0.08)"
            stroke="var(--text)"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  );
}
