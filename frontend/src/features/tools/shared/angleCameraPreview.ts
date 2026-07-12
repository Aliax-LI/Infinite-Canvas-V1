/** CSS 3D transform for angle tool live preview (mirrors legacy orbital camera feel). */
export function buildCameraPreviewTransform(
  rotation: number,
  pitch: number,
  distance: number,
): string {
  const scale = 4 / Math.max(distance, 0.1);
  const depth = (4 - distance) * 10;
  return `rotateY(${rotation}deg) rotateX(${pitch}deg) scale(${scale}) translateZ(${depth}px)`;
}
