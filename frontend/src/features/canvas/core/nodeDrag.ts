/** Cumulative drag offset in world space (matches history canvas.js onNodeDrag). */
export function nodeDragWorldOffset(
  clientX: number,
  clientY: number,
  startClientX: number,
  startClientY: number,
  scale: number,
): { dx: number; dy: number } {
  const s = scale > 0 ? scale : 1;
  return {
    dx: (clientX - startClientX) / s,
    dy: (clientY - startClientY) / s,
  };
}

export function nodeDragWorldPosition(
  originX: number,
  originY: number,
  clientX: number,
  clientY: number,
  startClientX: number,
  startClientY: number,
  scale: number,
): { x: number; y: number } {
  const { dx, dy } = nodeDragWorldOffset(
    clientX,
    clientY,
    startClientX,
    startClientY,
    scale,
  );
  return { x: originX + dx, y: originY + dy };
}
