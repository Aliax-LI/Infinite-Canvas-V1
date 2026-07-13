import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import {
  computeMinimapLayout,
  worldViewRect,
} from "../../canvas/core/minimapLayout";
import type { SmartNode, ViewportState } from "../core/types";

interface MinimapProps {
  nodes: SmartNode[];
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
  const mapW = 148;
  const mapH = 98;

  const layout = useMemo(() => {
    if (!nodes.length) return null;
    const nodeRects = nodes.map((n) => ({
      x: n.x,
      y: n.y,
      w: n.width ?? 280,
      h: n.height ?? 200,
    }));
    const view = worldViewRect(viewport, containerWidth, containerHeight);
    return computeMinimapLayout(nodeRects, view, mapW, mapH);
  }, [nodes, viewport, containerWidth, containerHeight]);

  if (!layout) return null;

  const showArrange = selectedCount >= 1 && Boolean(onArrangeSelected);

  return (
    <div className="absolute bottom-[22px] right-[22px] z-10 flex flex-col items-end gap-2">
      {showArrange ? (
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 border border-[var(--border)] bg-[var(--bg)]/95 px-2.5 text-[11px] font-extrabold text-[var(--muted)] shadow-[0_10px_24px_rgba(15,23,42,0.13)] backdrop-blur-md hover:-translate-y-px hover:text-[var(--text)]"
          title="整理选中节点"
          aria-label="整理选中节点"
          data-testid="smart-arrange-selected-btn"
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
        data-testid="minimap"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg width={mapW} height={mapH} className="block overflow-hidden">
          {nodes.map((n) => {
            const r = layout.project({
              x: n.x,
              y: n.y,
              w: n.width ?? 280,
              h: n.height ?? 200,
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
            data-testid="smart-minimap-viewport"
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
