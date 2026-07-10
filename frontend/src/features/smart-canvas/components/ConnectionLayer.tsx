import { memo } from "react";
import type { CanvasConnection, SmartNode } from "../core/types";
import { connectionPath } from "../core/layout";
import type { CascadeEdgeState } from "../core/cascade";
import { cascadeEdgeKey } from "../core/cascade";

const EDGE_COLORS: Record<CascadeEdgeState, string> = {
  idle: "var(--muted)",
  running: "#3b82f6",
  done: "#22c55e",
  error: "#ef4444",
};

interface ConnectionLayerProps {
  nodes: SmartNode[];
  connections: CanvasConnection[];
  selectedNodeId?: string | null;
  selectedIds?: string[];
  edgeStates?: Record<string, CascadeEdgeState>;
}

export const ConnectionLayer = memo(function ConnectionLayer({
  nodes,
  connections,
  selectedNodeId,
  selectedIds = [],
  edgeStates = {},
}: ConnectionLayerProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const selectedSet = new Set(
    selectedIds.length ? selectedIds : selectedNodeId ? [selectedNodeId] : [],
  );

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: "100%", height: "100%" }}
      data-testid="connection-layer"
    >
      {connections.map((conn) => {
        const from = nodeMap.get(conn.from);
        const to = nodeMap.get(conn.to);
        if (!from || !to) return null;
        const { x1, y1, x2, y2 } = connectionPath(from, to);
        const active = selectedSet.has(conn.from) || selectedSet.has(conn.to);
        const edgeKey = cascadeEdgeKey(conn.from, conn.to);
        const cascadeState = edgeStates[edgeKey];
        const stroke = cascadeState
          ? EDGE_COLORS[cascadeState]
          : active
            ? "var(--text)"
            : "var(--muted)";
        return (
          <line
            key={conn.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth={active || cascadeState === "running" ? 2 : 1.5}
            strokeDasharray={cascadeState === "running" ? "6 4" : undefined}
            data-testid={`connection-${conn.id}`}
            data-edge-state={cascadeState ?? "none"}
          />
        );
      })}
    </svg>
  );
});
