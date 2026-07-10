import { describe, expect, it } from "vitest";
import {
  buildGenerationPayload,
  submitGeneration,
} from "../../src/features/smart-canvas/core/generation";

describe("generation", () => {
  it("buildGenerationPayload includes prompt and engine", () => {
    const payload = buildGenerationPayload(
      { engine: "api", prompt: "test", kind: "image", params: { size: "1024" } },
      ["/output/a.png"],
    );
    expect(payload.prompt).toBe("test");
    expect(payload.engine).toBe("api");
    expect(payload.reference_images).toEqual(["/output/a.png"]);
  });

  it("buildGenerationPayload sets video mode", () => {
    const payload = buildGenerationPayload(
      { engine: "api", prompt: "v", kind: "video", params: {} },
    );
    expect(payload.mode).toBe("video");
  });

  it("submitGeneration returns error for unknown engine", async () => {
    const result = await submitGeneration({
      engine: "unknown" as "api",
      prompt: "x",
      kind: "image",
      params: {},
    });
    expect(result.error).toContain("Unknown engine");
  });
});
