import { memo } from "react";
import { connectionPath } from "../core/layout";
import type { LegacyConnection, LegacyNode } from "../core/types";

interface ConnectionLayerProps {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  selectedNodeId?: string | null;
  connectFromId?: string | null;
}

export const ConnectionLayer = memo(function ConnectionLayer({
  nodes,
  connections,
  selectedNodeId,
  connectFromId,
}: ConnectionLayerProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: "100%", height: "100%" }}
      data-testid="legacy-connection-layer"
    >
      {connections.map((conn) => {
        const from = nodeMap.get(conn.from);
        const to = nodeMap.get(conn.to);
        if (!from || !to) return null;
        const { x1, y1, x2, y2 } = connectionPath(from, to);
        const active =
          selectedNodeId === conn.from ||
          selectedNodeId === conn.to ||
          connectFromId === conn.from ||
          connectFromId === conn.to;
        return (
          <line
            key={conn.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={active ? "var(--text)" : "var(--muted)"}
            strokeWidth={active ? 2 : 1.5}
            data-testid={`legacy-connection-${conn.id}`}
          />
        );
      })}
    </svg>
  );
});
