import type { CSSProperties } from "react";

/** Size presets aligned with history/static/online.html SIZE_OPTIONS. */

export type OnlineRatio =
  | "square"
  | "portrait"
  | "portrait43"
  | "landscape43"
  | "landscape"
  | "story"
  | "wide"
  /** Follow first connected input image aspect (history `ratio: 'source'`). */
  | "source";

export type OnlineResolution = "1k" | "2k" | "4k";

const SIZE_OPTIONS: Record<
  Exclude<OnlineRatio, "source">,
  Array<[string, OnlineResolution]>
> = {
  square: [
    ["1024x1024", "1k"],
    ["2048x2048", "2k"],
    ["3840x2160", "4k"],
  ],
  portrait: [
    ["1024x1536", "1k"],
    ["1360x2048", "2k"],
    ["2352x3520", "4k"],
  ],
  portrait43: [
    ["1008x1344", "1k"],
    ["1536x2048", "2k"],
    ["2448x3264", "4k"],
  ],
  landscape43: [
    ["1344x1008", "1k"],
    ["2048x1536", "2k"],
    ["3264x2448", "4k"],
  ],
  landscape: [
    ["1536x1024", "1k"],
    ["2048x1360", "2k"],
    ["3520x2352", "4k"],
  ],
  story: [
    ["720x1280", "1k"],
    ["1152x2048", "2k"],
    ["2160x3840", "4k"],
  ],
  wide: [
    ["1280x720", "1k"],
    ["2048x1152", "2k"],
    ["3840x2160", "4k"],
  ],
};

export const ONLINE_RATIOS: Array<{ id: OnlineRatio; labelKey: string }> = [
  { id: "square", labelKey: "online.square" },
  { id: "portrait", labelKey: "online.portrait" },
  { id: "portrait43", labelKey: "online.portrait43" },
  { id: "landscape43", labelKey: "online.landscape43" },
  { id: "landscape", labelKey: "online.landscape" },
  { id: "story", labelKey: "online.story" },
  { id: "wide", labelKey: "online.wide" },
  /** Label via canvas.adaptiveRatio — not studio.online.* */
  { id: "source", labelKey: "adaptiveRatio" },
];

export const ONLINE_RESOLUTIONS: OnlineResolution[] = ["1k", "2k", "4k"];

export function resolveOnlineSize(ratio: OnlineRatio, resolution: OnlineResolution): string {
  if (ratio === "source") {
    // Placeholder until customRatio is derived from input image at run/UI sync.
    return SIZE_OPTIONS.square.find(([, label]) => label === resolution)?.[0]
      ?? SIZE_OPTIONS.square[0][0];
  }
  const options = SIZE_OPTIONS[ratio] || SIZE_OPTIONS.square;
  const match = options.find(([, label]) => label === resolution);
  return match?.[0] ?? SIZE_OPTIONS.square[0][0];
}

export function parseOnlineSizeDimensions(
  size: string,
): { width: number; height: number } | null {
  const match = String(size || "")
    .trim()
    .match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Preview slot sizing — derived from resolved pixel size (history resultBox object-contain). */
export function onlinePreviewSlotStyle(
  size: string,
  mode: "single" | "grid-cell" | "grid-fit" = "grid-cell",
  options?: { loading?: boolean },
): CSSProperties {
  const dims = parseOnlineSizeDimensions(size);
  const aspectRatio = dims ? `${dims.width} / ${dims.height}` : "1 / 1";

  if (mode === "grid-fit" || (mode === "single" && options?.loading)) {
    return {
      aspectRatio,
      height: "100%",
      width: "auto",
      maxWidth: "100%",
      maxHeight: "100%",
    };
  }

  if (mode === "grid-cell") {
    return {
      aspectRatio,
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
    };
  }

  // Single slot: fit inside stage bounds (history resultBox object-contain), keep aspect ratio.
  return {
    aspectRatio,
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
  };
}

/** Slot layout mode for a result/skeleton count inside the bounded preview stage. */
export function onlinePreviewSlotMode(count: number): "single" | "grid-fit" {
  return count <= 1 ? "single" : "grid-fit";
}

/** Protocols where backend consumes `quality` (history QUALITY_PROTOCOLS). */
export function qualityApplies(protocol: string | undefined, providerId: string): boolean {
  const proto = String(protocol || "").toLowerCase();
  const pid = String(providerId || "").toLowerCase();
  if (proto === "apimart" || proto === "api" || !proto) {
    if (["modelscope", "runninghub", "jimeng", "volcengine", "gemini"].includes(pid)) {
      return false;
    }
    return true;
  }
  return proto === "apimart" || proto === "openai" || proto === "openai-compatible";
}
