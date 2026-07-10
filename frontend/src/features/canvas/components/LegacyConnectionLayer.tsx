import { memo } from "react";
import type { LegacyNode, ViewportState } from "../core/types";

interface ConnectionLayerProps {
  nodes: LegacyNode[];
  connections: Array<{ id: string; from: string; to: string }>;
  viewport: ViewportState;
}

function nodeCenter(nodes: LegacyNode[], id: string) {
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  return { x: n.x + (n.width ?? 240) / 2, y: n.y + (n.height ?? 160) / 2 };
}

export const LegacyConnectionLayer = memo(function LegacyConnectionLayer({
  nodes,
  connections,
}: ConnectionLayerProps) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      data-testid="legacy-connection-layer"
    >
      {connections.map((c) => {
        const from = nodeCenter(nodes, c.from);
        const to = nodeCenter(nodes, c.to);
        if (!from || !to) return null;
        return (
          <line
            key={c.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--border)"
            strokeWidth={2}
            data-testid={`legacy-connection-${c.id}`}
          />
        );
      })}
    </svg>
  );
});
