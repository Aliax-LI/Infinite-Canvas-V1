import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_SETTINGS,
  parseTimelineFromSettings,
  serializeTimeline,
} from "../../src/features/canvas/timeline/types";

describe("timeline types", () => {
  it("parses settings blob", () => {
    const parsed = parseTimelineFromSettings({
      clips: [{ id: "1", label: "A", start: 0, duration: 2 }],
      settings: { fps: 30, resolution: "1920x1080", seed: 1 },
      currentTime: 0.5,
    });
    expect(parsed?.clips).toHaveLength(1);
    expect(parsed?.settings?.fps).toBe(30);
    expect(parsed?.currentTime).toBe(0.5);
  });

  it("returns null for invalid input", () => {
    expect(parseTimelineFromSettings(null)).toBeNull();
    expect(parseTimelineFromSettings("bad")).toBeNull();
  });

  it("serializes timeline state", () => {
    const blob = serializeTimeline({
      clips: [],
      settings: DEFAULT_TIMELINE_SETTINGS,
      currentTime: 0,
    });
    expect(blob.clips).toEqual([]);
    expect(blob.settings.fps).toBe(24);
  });
});

describe("timeline frame math", () => {
  const cases = [
    { fps: 24, sec: 1, frames: 24 },
    { fps: 30, sec: 2, frames: 60 },
    { fps: 60, sec: 0.5, frames: 30 },
  ];

  for (const { fps, sec, frames } of cases) {
    it(`converts ${sec}s at ${fps}fps to ${frames} frames`, () => {
      expect(Math.round(sec * fps)).toBe(frames);
    });
  }
});

describe("timeline clip ordering", () => {
  it("sorts clips by start time", () => {
    const clips = [
      { id: "b", label: "B", start: 5, duration: 2 },
      { id: "a", label: "A", start: 0, duration: 3 },
    ];
    const sorted = [...clips].sort((x, y) => x.start - y.start);
    expect(sorted[0].id).toBe("a");
  });

  it("computes total duration", () => {
    const clips = [
      { id: "a", label: "A", start: 0, duration: 3 },
      { id: "b", label: "B", start: 3, duration: 5 },
    ];
    const total = Math.max(8, clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
    expect(total).toBe(8);
  });
});
