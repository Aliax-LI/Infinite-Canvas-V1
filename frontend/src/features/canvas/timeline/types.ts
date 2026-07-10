export interface TimelineSettings {
  fps: number;
  resolution: string;
  seed: number;
}

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  fps: 24,
  resolution: "1280x720",
  seed: 0,
};

export interface TimelineClip {
  id: string;
  label: string;
  start: number;
  duration: number;
  prompt?: string;
  track?: number;
}

export interface TimelineTrack {
  id: string;
  kind: "video" | "audio" | "image";
  label: string;
  clips: TimelineClip[];
}

export interface TimelineState {
  clips: TimelineClip[];
  settings: TimelineSettings;
  currentTime: number;
}

export interface FrameMarker {
  frame: number;
  time: number;
  label: string;
}

export function parseTimelineFromSettings(
  raw: unknown,
): Partial<TimelineState> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const clips = Array.isArray(o.clips) ? (o.clips as TimelineClip[]) : undefined;
  const settings = o.settings as TimelineSettings | undefined;
  const currentTime =
    typeof o.currentTime === "number" ? o.currentTime : undefined;
  return { clips, settings, currentTime };
}

export function serializeTimeline(state: TimelineState): Record<string, unknown> {
  return {
    clips: state.clips,
    settings: state.settings,
    currentTime: state.currentTime,
  };
}
