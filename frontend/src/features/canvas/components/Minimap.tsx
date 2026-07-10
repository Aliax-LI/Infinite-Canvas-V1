import { useMemo } from "react";
import { computeBounds } from "../core/viewport";
import type { LegacyNode, ViewportState } from "../core/types";

interface MinimapProps {
  nodes: LegacyNode[];
  viewport: ViewportState;
  containerWidth: number;
  containerHeight: number;
}

export function Minimap({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
}: MinimapProps) {
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);

  if (!bounds) return null;

  const mapW = 120;
  const mapH = 80;
  const contentW = bounds.maxX - bounds.minX || 1;
  const contentH = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(mapW / contentW, mapH / contentH);

  const viewW = (containerWidth / viewport.scale) * scale;
  const viewH = (containerHeight / viewport.scale) * scale;
  const viewX = (-viewport.x / viewport.scale - bounds.minX) * scale;
  const viewY = (-viewport.y / viewport.scale - bounds.minY) * scale;

  return (
    <div
      className="absolute bottom-4 right-4 border border-[var(--border)] bg-[var(--bg)]/80 p-1 z-10"
      style={{ width: mapW + 8, height: mapH + 8 }}
      data-testid="legacy-minimap"
    >
      <svg width={mapW} height={mapH} className="block">
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={(n.x - bounds.minX) * scale}
            y={(n.y - bounds.minY) * scale}
            width={(n.width ?? 280) * scale}
            height={4}
            fill="var(--muted)"
          />
        ))}
        <rect
          x={viewX}
          y={viewY}
          width={viewW}
          height={viewH}
          fill="none"
          stroke="var(--text)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
