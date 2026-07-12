import { useEffect, useRef } from "react";
import { useSmartCanvasStore } from "../core/state";
import type { SmartNode } from "../core/types";

interface CanvasWorldProps {
  width: number;
  height: number;
  /** History-style: plain wheel zooms at cursor (screen coords relative to this element). */
  onWheelZoom?: (screenX: number, screenY: number, deltaY: number) => void;
  children: (nodes: SmartNode[]) => React.ReactNode;
}

/**
 * Presentational world transform. Pan / select are owned by SmartCanvasPage
 * (history `shell` handlers) so they do not fight node drag.
 */
export function CanvasWorld({
  width: _width,
  height: _height,
  onWheelZoom,
  children,
}: CanvasWorldProps) {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewport = useSmartCanvasStore((s) => s.viewport);
  const nodes = useSmartCanvasStore((s) => s.nodes);

  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    }
  }, [viewport]);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      data-testid="canvas-world"
      style={{
        backgroundImage:
          "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        cursor: "default",
      }}
      onWheel={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest(
            "[data-testid='composer'],[data-testid='mention-picker'],textarea,input,select,[contenteditable='true']",
          )
        ) {
          return;
        }
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        onWheelZoom?.(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
      }}
    >
      <div
        ref={worldRef}
        className="absolute origin-top-left will-change-transform"
        style={{ transformOrigin: "0 0" }}
        data-testid="canvas-world-inner"
      >
        {children(nodes)}
      </div>
    </div>
  );
}
