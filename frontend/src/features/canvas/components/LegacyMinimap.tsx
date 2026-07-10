import { memo } from "react";
import type { LegacyNode, ViewportState } from "../core/types";

interface MinimapProps {
  nodes: LegacyNode[];
  viewport: ViewportState;
  width?: number;
  height?: number;
  onNavigate?: (x: number, y: number) => void;
}

export const LegacyMinimap = memo(function LegacyMinimap({
  nodes,
  viewport,
  width = 160,
  height = 100,
  onNavigate,
}: MinimapProps) {
  if (!nodes.length) {
    return (
      <div
        className="border border-[var(--border)] bg-[var(--bg)]"
        style={{ width, height }}
        data-testid="legacy-minimap"
      />
    );
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + (n.width ?? 240)));
  const maxY = Math.max(...nodes.map((n) => n.y + (n.height ?? 160)));
  const worldW = Math.max(maxX - minX, 1);
  const worldH = Math.max(maxY - minY, 1);
  const scale = Math.min(width / worldW, height / worldH) * 0.9;

  return (
    <div
      className="relative border border-[var(--border)] bg-[var(--nav-hover-bg)] overflow-hidden"
      style={{ width, height }}
      data-testid="legacy-minimap"
      onClick={(e) => {
        if (!onNavigate) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        onNavigate(minX + px / scale, minY + py / scale);
      }}
    >
      {nodes.map((n) => (
        <div
          key={n.id}
          className="absolute bg-black/60"
          style={{
            left: (n.x - minX) * scale,
            top: (n.y - minY) * scale,
            width: Math.max(4, (n.width ?? 240) * scale),
            height: Math.max(4, (n.height ?? 160) * scale),
          }}
          data-testid={`legacy-minimap-node-${n.id}`}
        />
      ))}
      <div
        className="absolute border-2 border-black pointer-events-none"
        style={{
          left: (-viewport.x - minX) * scale * viewport.scale,
          top: (-viewport.y - minY) * scale * viewport.scale,
          width: 40,
          height: 30,
        }}
        data-testid="legacy-minimap-viewport"
      />
    </div>
  );
});
