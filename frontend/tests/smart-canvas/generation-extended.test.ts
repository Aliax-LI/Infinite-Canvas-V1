import { describe, expect, it } from "vitest";
import {
  buildGenerationPayload,
  collectSmartNodeInputs,
  smartNodeComposer,
} from "../../src/features/smart-canvas/core/generation";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";
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
      if (["api", "volcengine", "openai"].includes(engine)) {
        expect(p.reference_images).toEqual([{ url: "r.png" }]);
      } else if (engine === "modelscope") {
        expect(p.image_urls).toEqual(["r.png"]);
      }
    });
  }

  it("video kind sets mode", () => {
    expect(buildGenerationPayload({ ...base, kind: "video" }).mode).toBe("video");
  });

  it("merges params", () => {
    const p = buildGenerationPayload({ ...base, params: { steps: 30 } });
    expect(p.steps).toBe(30);
  });

  it("collects upstream prompts and media for a cascade node", () => {
    const prompt = normalizeNode({ id: "p", kind: "prompt", prompt: "a cat" });
    const image = normalizeNode({
      id: "i",
      kind: "image",
      images: [{ url: "/output/ref.png" }],
    });
    const target = normalizeNode({ id: "t", kind: "image" });
    expect(collectSmartNodeInputs("t", [prompt, image, target], [
      { id: "c1", from: "p", to: "t" },
      { id: "c2", from: "i", to: "t" },
    ])).toEqual({ prompt: "a cat", refs: ["/output/ref.png"] });
  });

  it("uses node-specific generation settings during cascade", () => {
    const node = normalizeNode({
      id: "n",
      kind: "video",
      prompt: "move",
      settings: {
        engine: "runninghub",
        kind: "video",
        params: { workflow_id: "wf" },
      },
    });
    expect(smartNodeComposer(node, base)).toEqual({
      engine: "runninghub",
      kind: "video",
      prompt: "move",
      params: { workflow_id: "wf" },
    });
  });
});
