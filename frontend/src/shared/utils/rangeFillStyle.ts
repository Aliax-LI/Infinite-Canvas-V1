import type { CSSProperties } from "react";

/** Maps range value to a CSS percentage for filled-track gradients. */
export function rangeFillPercent(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return ((value - min) / span) * 100;
}

/** Inline style setting `--studio-range-pct` for studio range sliders. */
export function rangeFillStyle(
  value: number,
  min: number,
  max: number,
): CSSProperties {
  return {
    "--studio-range-pct": `${rangeFillPercent(value, min, max)}%`,
  } as CSSProperties;
}
