import "@testing-library/jest-dom/vitest";

// jsdom lacks canvas 2d — stub for ImageEditModal and similar
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function getContext(
    type: string,
  ): CanvasRenderingContext2D | null {
    if (type !== "2d") return null;
    return {
      clearRect: () => {},
      drawImage: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      setLineDash: () => {},
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
  };
}
