import { memo } from "react";
import {
  connectionPathResolved,
  resolvePortPoint,
} from "../core/layout";
import {
  nodesWithDragLivePositions,
  useDragLivePositions,
  withDragLivePosition,
} from "../core/dragLivePositions";
import type { LegacyConnection, LegacyNode } from "../core/types";

export interface TempWire {
  fromId: string;
  x2: number;
  y2: number;
  originKind?: "in" | "out";
}

interface ConnectionLayerProps {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  selectedIds?: string[];
  connectFromId?: string | null;
  tempWire?: TempWire | null;
  knifeMode?: boolean;
  onDeleteConnection?: (id: string) => void;
}

const PROMPT_KINDS = new Set(["prompt", "promptGroup", "llm", "loop"]);
const IMAGE_KINDS = new Set([
  "image",
  "group",
  "output",
  "generator",
  "comfy",
  "msgen",
  "video",
  "rh",
  "ltxDirector",
]);

/** Light touch: color-code image vs prompt wires for readability. */
function wireStroke(
  fromKind: string,
  knifeMode: boolean,
  active: boolean,
): string {
  if (knifeMode) return "#dc2626";
  if (PROMPT_KINDS.has(fromKind)) return active ? "#047857" : "#10b981";
  if (IMAGE_KINDS.has(fromKind)) return active ? "#1d4ed8" : "#3b82f6";
  return active ? "#0f172a" : "#334155";
}

export const ConnectionLayer = memo(function ConnectionLayer({
  nodes,
  connections,
  selectedIds = [],
  connectFromId,
  tempWire,
  knifeMode = false,
  onDeleteConnection,
}: ConnectionLayerProps) {
  const live = useDragLivePositions();
  const resolved = nodesWithDragLivePositions(nodes, live);
  const nodeMap = new Map(resolved.map((n) => [n.id, n]));
  const selected = new Set(selectedIds);

  return (
    <svg
      className={
        knifeMode
          ? "absolute inset-0 z-30 overflow-visible cursor-crosshair"
          : "absolute inset-0 pointer-events-none overflow-visible"
      }
      style={{ width: 6000, height: 4000 }}
      data-testid="legacy-connection-layer"
    >
      {connections.map((conn) => {
        const from = nodeMap.get(conn.from);
        const to = nodeMap.get(conn.to);
        if (!from || !to) return null;
        const { x1, y1, x2, y2 } = connectionPathResolved(from, to);
        const active =
          selected.has(conn.from) ||
          selected.has(conn.to) ||
          connectFromId === conn.from ||
          connectFromId === conn.to;
        return (
          <g key={conn.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={wireStroke(from.kind, knifeMode, active)}
              strokeWidth={knifeMode ? 3 : active ? 2.5 : 2}
              data-testid={`legacy-connection-${conn.id}`}
              data-wire-kind={
                PROMPT_KINDS.has(from.kind)
                  ? "prompt"
                  : IMAGE_KINDS.has(from.kind)
                    ? "image"
                    : "default"
              }
            />
            {knifeMode ? (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={18}
                className="pointer-events-auto"
                style={{ pointerEvents: "stroke" }}
                data-testid={`legacy-connection-hit-${conn.id}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConnection?.(conn.id);
                }}
              />
            ) : null}
          </g>
        );
      })}
      {tempWire
        ? (() => {
            const raw = nodeMap.get(tempWire.fromId);
            if (!raw) return null;
            const from = withDragLivePosition(raw, live);
            const origin = resolvePortPoint(
              from,
              tempWire.originKind === "in" ? "in" : "out",
            );
            return (
              <line
                x1={origin.x}
                y1={origin.y}
                x2={tempWire.x2}
                y2={tempWire.y2}
                stroke={wireStroke(from.kind, false, true)}
                strokeWidth={2.5}
                strokeDasharray="6 6"
                data-testid="legacy-temp-wire"
              />
            );
          })()
        : null}
    </svg>
  );
});
