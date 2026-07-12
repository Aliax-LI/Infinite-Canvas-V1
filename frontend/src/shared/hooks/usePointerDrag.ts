import { useCallback, useRef } from "react";

export interface PointerDragHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export interface LegacyPointerDragOptions {
  onStart?: (e?: PointerEvent) => void;
  onMove?: (
    x: number,
    y: number,
    dx: number,
    dy: number,
    start?: { x: number; y: number },
  ) => void;
  onEnd?: (e?: PointerEvent) => void;
  stopPropagation?: boolean;
  /** Return false to skip drag (e.g. clicking form controls). */
  shouldStart?: (e: PointerEvent) => boolean;
}

function isLegacyOptions(
  arg: unknown,
): arg is LegacyPointerDragOptions {
  return (
    typeof arg === "object" &&
    arg !== null &&
    ("onMove" in arg ||
      "onStart" in arg ||
      "onEnd" in arg ||
      "stopPropagation" in arg ||
      "shouldStart" in arg)
  );
}

export function usePointerDrag(
  onMoveOrOptions:
    | ((dx: number, dy: number, e: PointerEvent) => void)
    | LegacyPointerDragOptions,
  options?: {
    onStart?: (e: PointerEvent) => void;
    onEnd?: (e: PointerEvent) => void;
    stopPropagation?: boolean;
  },
): PointerDragHandlers & { handlers: PointerDragHandlers } {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);

  const legacy = isLegacyOptions(onMoveOrOptions);
  const onMove = legacy
    ? onMoveOrOptions.onMove
    : onMoveOrOptions;
  const mergedOptions = legacy
    ? {
        onStart: onMoveOrOptions.onStart,
        onEnd: onMoveOrOptions.onEnd,
        stopPropagation: onMoveOrOptions.stopPropagation,
        shouldStart: onMoveOrOptions.shouldStart,
      }
    : options;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (mergedOptions?.shouldStart && !mergedOptions.shouldStart(e.nativeEvent)) {
      return;
    }
    if (mergedOptions?.stopPropagation) e.stopPropagation();
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    mergedOptions?.onStart?.(e.nativeEvent);
  }, [mergedOptions]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      if (legacy) {
        onMoveOrOptions.onMove?.(
          e.clientX,
          e.clientY,
          dx,
          dy,
          start.current ?? undefined,
        );
      } else if (typeof onMove === "function") {
        onMove(dx, dy, e.nativeEvent);
      }
    },
    [legacy, onMove, onMoveOrOptions],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      start.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      mergedOptions?.onEnd?.(e.nativeEvent);
    },
    [mergedOptions],
  );

  const handlers = { onPointerDown, onPointerMove, onPointerUp };
  return { ...handlers, handlers };
}
