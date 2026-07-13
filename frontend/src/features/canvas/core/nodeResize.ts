/**
 * Classic canvas node resize — mirrors history `startNodeResize` / `onNodeResize`
 * clamps (`Math.min(defaultW, 220)` → 220 for all current kinds, minH 96).
 */

export const LEGACY_RESIZE_MIN_W = 220;
export const LEGACY_RESIZE_MIN_H = 96;

export function clampLegacyNodeSize(
  width: number,
  height: number,
): { width: number; height: number } {
  return {
    width: Math.max(LEGACY_RESIZE_MIN_W, Math.round(Number(width) || 0)),
    height: Math.max(LEGACY_RESIZE_MIN_H, Math.round(Number(height) || 0)),
  };
}

export function isLegacyNodeSized(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(settings?.sized);
}
