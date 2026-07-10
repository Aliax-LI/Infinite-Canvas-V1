import { useCallback, useEffect, useRef } from "react";
import { useSmartCanvasStore } from "../core/state";
import { isNodeVisible } from "../core/layout";
import { usePointerDrag } from "../../../shared/hooks/usePointerDrag";
import type { SmartNode } from "../core/types";

interface CanvasWorldProps {
  width: number;
  height: number;
  onBackgroundPan?: (dx: number, dy: number) => void;
  onZoom?: (delta: number, centerX: number, centerY: number) => void;
  children: (visibleNodes: SmartNode[]) => React.ReactNode;
}

export function CanvasWorld({
  width,
  height,
  onBackgroundPan,
  onZoom,
  children,
}: CanvasWorldProps) {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewport = useSmartCanvasStore((s) => s.viewport);
  const nodes = useSmartCanvasStore((s) => s.nodes);

  const panHandlers = usePointerDrag(
    (dx, dy) => onBackgroundPan?.(dx, dy),
    { stopPropagation: false },
  );

  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    }
  }, [viewport]);

  const visibleNodes = nodes.filter((n) =>
    isNodeVisible(n, viewport, width, height),
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        onZoom?.(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY);
      } else {
        onBackgroundPan?.(-e.deltaX, -e.deltaY);
      }
    },
    [onBackgroundPan, onZoom],
  );

  return (
    <div
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      {...panHandlers}
      data-testid="canvas-world"
      style={{
        backgroundImage:
          "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
    >
      <div
        ref={worldRef}
        className="absolute origin-top-left"
        style={{ transformOrigin: "0 0" }}
      >
        {children(visibleNodes)}
      </div>
    </div>
  );
}
