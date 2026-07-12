import type { LegacyConnection, LegacyNode } from "./types";

export const LTX_DIRECTOR_WORKFLOW = "LTXDirectorv2-API.json";

export interface LtxSegment {
  id: string;
  start: number;
  length: number;
  prompt: string;
  type: "text" | "image";
  imageB64?: string;
  canvasSourceId?: string;
  guideStrength?: number;
}

export interface LtxTimelineData {
  segments: LtxSegment[];
  audioSegments: unknown[];
}

export function parseLtxTimeline(raw: unknown): LtxTimelineData {
  if (typeof raw === "string") {
    try {
      return parseLtxTimeline(JSON.parse(raw));
    } catch {
      return { segments: [], audioSegments: [] };
    }
  }
  if (!raw || typeof raw !== "object") {
    return { segments: [], audioSegments: [] };
  }
  const o = raw as Record<string, unknown>;
  const segments = Array.isArray(o.segments)
    ? (o.segments as LtxSegment[])
    : [];
  const audioSegments = Array.isArray(o.audioSegments) ? o.audioSegments : [];
  return { segments, audioSegments };
}

export function readLtxTimeline(node: LegacyNode): LtxTimelineData {
  const fromSettings = node.settings?.ltxTimelineData;
  if (fromSettings) return parseLtxTimeline(fromSettings);
  return { segments: [], audioSegments: [] };
}

export function ltxDirectorSyncSeconds(settings: Record<string, unknown>): Record<string, unknown> {
  const fps = Math.max(1, Number(settings.frameRate) || 24);
  const frames = Math.max(1, Number(settings.durationFrames) || 120);
  const seconds = Math.round((frames / fps) * 1000) / 1000;
  return { ...settings, durationSeconds: seconds, durationFrames: frames, frameRate: fps };
}

function imageRefsFromLegacyNode(
  node: LegacyNode,
  nodes: LegacyNode[],
): { url: string; name?: string }[] {
  if (node.kind === "image" && node.images?.[0]?.url) {
    return [{ url: node.images[0].url, name: node.images[0].name }];
  }
  if (node.kind === "group" || node.kind === "promptGroup") {
    const items = Array.isArray(node.settings?.items)
      ? (node.settings.items as string[])
      : [];
    return items
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n?.images?.[0]?.url))
      .map((n) => ({ url: n.images![0].url, name: n.images![0].name }));
  }
  if (node.kind === "output") {
    return (node.images ?? [])
      .map((img) => img.url)
      .filter(Boolean)
      .map((url, i) => ({ url, name: `output-${i + 1}` }));
  }
  return [];
}

export function wiredImageSources(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): { id: string; prompt: string; refs: { url: string; name?: string }[] }[] {
  return connections
    .filter((c) => c.to === node.id)
    .map((c) => nodes.find((n) => n.id === c.from))
    .filter((n): n is LegacyNode => Boolean(n))
    .map((src) => ({
      id: src.id,
      prompt: src.prompt || "",
      refs: imageRefsFromLegacyNode(src, nodes),
    }))
    .filter((s) => s.refs.length > 0);
}

/** Fork-first: history `ltxSyncConnectedImagesToTimeline`. */
export function syncConnectedImagesToTimeline(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): { settings: Record<string, unknown> } {
  const settings = { ...node.settings };
  const fps = Math.max(1, Number(settings.frameRate) || 24);
  const defaultLen = Math.max(6, fps);
  const timeline = readLtxTimeline(node);
  const imageInputs = wiredImageSources(node, nodes, connections);
  const manual = timeline.segments.filter((s) => !s.canvasSourceId);
  const existingAuto = new Map(
    timeline.segments
      .filter((s) => s.canvasSourceId)
      .map((s) => [s.canvasSourceId!, s]),
  );
  const autoSegs: LtxSegment[] = [];
  let cursor = 0;
  for (const src of imageInputs) {
    const ref = src.refs[0];
    if (!ref?.url) continue;
    let seg = existingAuto.get(src.id);
    if (seg) {
      seg = { ...seg, imageB64: ref.url, type: "image" as const };
      if (!seg.length || seg.length < 1) seg.length = defaultLen;
    } else {
      seg = {
        id: crypto.randomUUID(),
        start: cursor,
        length: defaultLen,
        prompt: src.prompt || "",
        type: "image",
        imageB64: ref.url,
        canvasSourceId: src.id,
        guideStrength: 1,
      };
    }
    seg.start = cursor;
    cursor += Math.max(1, Number(seg.length) || defaultLen);
    autoSegs.push(seg);
  }
  let nextStart = cursor;
  const reflowedManual = [...manual].sort(
    (a, b) => (Number(a.start) || 0) - (Number(b.start) || 0),
  );
  for (const seg of reflowedManual) {
    seg.start = nextStart;
    nextStart += Math.max(1, Number(seg.length) || defaultLen);
  }
  const allSegs = [...autoSegs, ...reflowedManual];
  const maxEnd = allSegs.reduce(
    (m, s) => Math.max(m, (Number(s.start) || 0) + (Number(s.length) || 0)),
    0,
  );
  if (maxEnd > (Number(settings.durationFrames) || 0)) {
    settings.durationFrames = Math.ceil(maxEnd);
    Object.assign(settings, ltxDirectorSyncSeconds(settings));
  }
  settings.ltxTimelineData = JSON.stringify({
    segments: allSegs,
    audioSegments: timeline.audioSegments,
  });
  return { settings };
}

export function ltxBuildContiguousRelay(
  settings: Record<string, unknown>,
  globalPromptFallback = "",
): {
  local_prompts: string;
  segment_lengths: string;
  guide_strength: string;
  sortedSegments: LtxSegment[];
} {
  const synced = ltxDirectorSyncSeconds(settings);
  const durationFrames = Math.max(1, Number(synced.durationFrames) || 120);
  const fallback =
    (globalPromptFallback || String(synced.globalPrompt || "")).trim() || ".";
  const timeline = readLtxTimeline({ ...({} as LegacyNode), settings: synced });
  const sortedSegments = [...timeline.segments].sort(
    (a, b) => (Number(a.start) || 0) - (Number(b.start) || 0),
  );
  const contiguousLengths: number[] = [];
  const contiguousPrompts: string[] = [];
  let currentCursor = 0;
  let pendingGap = 0;
  for (const seg of sortedSegments) {
    const start = Number(seg.start) || 0;
    const length = Math.max(1, Number(seg.length) || 1);
    if (start >= durationFrames) break;
    if (start > currentCursor) {
      const gapLength = Math.min(start, durationFrames) - currentCursor;
      if (contiguousLengths.length > 0) {
        contiguousLengths[contiguousLengths.length - 1] += gapLength;
      } else {
        pendingGap += gapLength;
      }
    }
    const clippedEnd = Math.min(start + length, durationFrames);
    const clippedLength = clippedEnd - start;
    contiguousLengths.push(clippedLength + pendingGap);
    const prompt = (seg.prompt || "").trim();
    contiguousPrompts.push(prompt || fallback);
    pendingGap = 0;
    currentCursor = start + length;
  }
  const clampedCursor = Math.min(currentCursor, durationFrames);
  if (contiguousLengths.length > 0 && clampedCursor < durationFrames) {
    contiguousLengths[contiguousLengths.length - 1] +=
      durationFrames - clampedCursor;
  }
  if (!contiguousLengths.length) {
    contiguousLengths.push(durationFrames);
    contiguousPrompts.push(fallback);
  }
  const guideStrength = sortedSegments
    .filter((s) => s.type !== "text")
    .map((s) => (s.guideStrength !== undefined ? s.guideStrength : 1).toFixed(2))
    .join(",");
  return {
    local_prompts: contiguousPrompts.join(" | "),
    segment_lengths: contiguousLengths.join(","),
    guide_strength: guideStrength,
    sortedSegments,
  };
}

export function buildLtxDirectorComfyParams(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  globalPromptFallback = "",
): Record<string, unknown> {
  const synced = ltxDirectorSyncSeconds(node.settings ?? {});
  const relay = ltxBuildContiguousRelay(synced, globalPromptFallback);
  const timeline = readLtxTimeline({ ...node, settings: synced });
  const timelineJson = JSON.stringify({
    segments: relay.sortedSegments,
    audioSegments: timeline.audioSegments,
  });
  return {
    global_prompt: globalPromptFallback.trim(),
    duration_frames: Number(synced.durationFrames) || 120,
    duration_seconds: Number(synced.durationSeconds) || 5,
    timeline_data: timelineJson,
    local_prompts: relay.local_prompts,
    segment_lengths: relay.segment_lengths,
    guide_strength: relay.guide_strength,
    epsilon: Number(synced.epsilon) || 0.001,
    frame_rate: Number(synced.frameRate) || 24,
    use_custom_audio: Boolean(synced.useCustomAudio),
    display_mode: String(synced.displayMode || "seconds"),
    custom_width: Math.max(0, Number(synced.customWidth) || 0),
    custom_height: Math.max(0, Number(synced.customHeight) || 0),
    resize_method: "maintain aspect ratio",
    divisible_by: Math.max(1, Number(synced.divisibleBy) || 32),
    img_compression: Number(synced.imgCompression) ?? 18,
    timeline_ui: "",
  };
}

export function defaultLtxTimelineJson(frameRate = 24): string {
  const len = Math.max(24, frameRate * 5);
  return JSON.stringify({
    segments: [
      {
        id: crypto.randomUUID(),
        start: 0,
        length: len,
        prompt: "",
        type: "text",
      },
    ],
    audioSegments: [],
  });
}
