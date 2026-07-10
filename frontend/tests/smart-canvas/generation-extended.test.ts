import { describe, expect, it } from "vitest";
import { buildGenerationPayload } from "../../src/features/smart-canvas/core/generation";
import type { ComposerSettings } from "../../src/features/smart-canvas/core/types";

const base: ComposerSettings = {
  prompt: "hello",
  engine: "api",
  kind: "image",
  params: {},
};

describe("buildGenerationPayload engines", () => {
  const engines = ["api", "volcengine", "modelscope", "comfy", "runninghub", "openai"] as const;

  for (const engine of engines) {
    it(`includes engine ${engine}`, () => {
      const p = buildGenerationPayload({ ...base, engine }, ["r.png"]);
      expect(p.engine).toBe(engine);
      expect(p.reference_images).toEqual(["r.png"]);
    });
  }

  it("video kind sets mode", () => {
    expect(buildGenerationPayload({ ...base, kind: "video" }).mode).toBe("video");
  });

  it("merges params", () => {
    const p = buildGenerationPayload({ ...base, params: { steps: 30 } });
    expect(p.steps).toBe(30);
  });
});
