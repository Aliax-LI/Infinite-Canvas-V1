import { describe, expect, it } from "vitest";
import { buildLegacyPayload } from "../../src/features/canvas/core/generation";

describe("legacy generation", () => {
  it("buildLegacyPayload includes prompt", () => {
    const p = buildLegacyPayload(
      { prompt: "cat", engine: "api", kind: "image", params: { steps: 20 } },
      ["ref.png"],
    );
    expect(p.prompt).toBe("cat");
    expect(p.reference_images).toEqual(["ref.png"]);
  });

  it("video mode sets mode", () => {
    const p = buildLegacyPayload(
      { prompt: "v", engine: "comfy", kind: "video", params: {} },
    );
    expect(p.mode).toBe("video");
  });
});
