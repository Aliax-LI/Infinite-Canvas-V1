import { describe, expect, it } from "vitest";
import {
  buildGenerationPayload,
  submitGeneration,
} from "../../src/features/smart-canvas/core/generation";

describe("useGeneration helpers", () => {
  it("buildGenerationPayload for image", () => {
    const payload = buildGenerationPayload({
      engine: "comfy",
      prompt: "cat",
      kind: "image",
      params: {},
    });
    expect(payload.prompt).toBe("cat");
    expect(payload.engine).toBe("comfy");
  });

  it("submitGeneration surfaces unknown engine error", async () => {
    const result = await submitGeneration({
      engine: "unknown" as "api",
      prompt: "x",
      kind: "image",
      params: {},
    });
    expect(result.error).toBeTruthy();
  });
});
