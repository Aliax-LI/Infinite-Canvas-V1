import { describe, expect, it } from "vitest";
import {
  ltxBuildContiguousRelay,
  parseLtxTimeline,
  syncConnectedImagesToTimeline,
} from "../../src/features/canvas/core/ltxTimeline";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("ltxTimeline", () => {
  it("parses timeline JSON string", () => {
    const data = parseLtxTimeline(
      JSON.stringify({ segments: [{ id: "a", start: 0, length: 24, prompt: "hi", type: "text" }] }),
    );
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].prompt).toBe("hi");
  });

  it("syncs wired image nodes into segments", () => {
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [{ url: "/output/test.png" }],
    });
    const ltx = createLegacyNode({
      id: "ltx1",
      kind: "ltxDirector",
      settings: { frameRate: 24, durationFrames: 120 },
    });
    const connections = [{ id: "c1", from: "img1", to: "ltx1" }];
    const synced = syncConnectedImagesToTimeline(ltx, [image, ltx], connections);
    const timeline = parseLtxTimeline(synced.settings.ltxTimelineData);
    expect(timeline.segments.some((s) => s.type === "image" && s.imageB64 === "/output/test.png")).toBe(
      true,
    );
  });

  it("builds contiguous relay prompts", () => {
    const settings = {
      frameRate: 24,
      durationFrames: 48,
      ltxTimelineData: JSON.stringify({
        segments: [
          { id: "1", start: 0, length: 24, prompt: "a", type: "text" },
          { id: "2", start: 24, length: 24, prompt: "b", type: "text" },
        ],
        audioSegments: [],
      }),
    };
    const relay = ltxBuildContiguousRelay(settings, "fallback");
    expect(relay.local_prompts).toContain("a");
    expect(relay.segment_lengths).toBe("24,24");
  });
});
