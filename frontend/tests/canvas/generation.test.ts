import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLegacyPayload,
  extractGenerationUrls,
  isCanvasTaskPending,
  parseCanvasImageTaskPoll,
  pollLegacyImageTask,
  pollLegacyUntilDone,
  submitLegacyGeneration,
} from "../../src/features/canvas/core/generation";

describe("legacy generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildLegacyPayload for api matches OnlineImageRequest shape", () => {
    const p = buildLegacyPayload(
      {
        prompt: "cat",
        engine: "api",
        kind: "image",
        params: { provider_id: "comfly", size: "512x512", n: 2 },
      },
      ["ref.png"],
    );
    expect(p.prompt).toBe("cat");
    expect(p.provider_id).toBe("comfly");
    expect(p.size).toBe("512x512");
    expect(p.n).toBe(2);
    expect(p.reference_images).toEqual([{ url: "ref.png" }]);
    expect(p).not.toHaveProperty("engine");
  });

  it("buildLegacyPayload for comfy matches GenerateRequest shape", () => {
    const p = buildLegacyPayload(
      {
        prompt: "enhance",
        engine: "comfy",
        kind: "image",
        params: { workflow_json: "upscale.json", type: "upscale", width: 768 },
      },
    );
    expect(p.prompt).toBe("enhance");
    expect(p.workflow_json).toBe("upscale.json");
    expect(p.type).toBe("upscale");
    expect(p.width).toBe(768);
    expect(p.height).toBe(1024);
    expect(p).not.toHaveProperty("engine");
  });

  it("extractGenerationUrls reads images array from backend", () => {
    expect(
      extractGenerationUrls({
        prompt: "x",
        images: ["/output/online_1.png", "/output/online_2.png"],
      }),
    ).toEqual(["/output/online_1.png", "/output/online_2.png"]);
  });

  it("extractGenerationUrls reads comfy outputs fallback", () => {
    expect(
      extractGenerationUrls({
        images: [],
        outputs: ["/output/comfy_1.png"],
      }),
    ).toEqual(["/output/comfy_1.png"]);
  });

  it("extractGenerationUrls returns empty when error field set", () => {
    expect(extractGenerationUrls({ error: "ComfyUI 渲染超时" })).toEqual([]);
  });

  it("isCanvasTaskPending treats queued and running as in-flight", () => {
    expect(isCanvasTaskPending("queued")).toBe(true);
    expect(isCanvasTaskPending("running")).toBe(true);
    expect(isCanvasTaskPending("succeeded")).toBe(false);
  });

  it("parseCanvasImageTaskPoll reads images from result on succeeded", () => {
    const parsed = parseCanvasImageTaskPoll(
      {
        status: "succeeded",
        result: { images: ["/output/task.png"] },
      },
      "canvas_img_1",
    );
    expect(parsed.url).toBe("/output/task.png");
    expect(parsed.pending).toBeUndefined();
  });

  it("submitLegacyGeneration uses canvas-image-tasks then polls", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({ task_id: "canvas_img_x", status: "queued" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              status: "succeeded",
              result: {
                images: ["/output/online_abc.png"],
              },
            }),
        }),
    );

    const result = await submitLegacyGeneration({
      prompt: "cat",
      engine: "api",
      kind: "image",
      params: {},
    });

    expect(result.url).toBe("/output/online_abc.png");
    expect(result.urls).toEqual(["/output/online_abc.png"]);
    expect(result.error).toBeUndefined();
  });

  it("submitLegacyGeneration surfaces API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => JSON.stringify({ detail: "上游生图接口错误" }),
      }),
    );

    const result = await submitLegacyGeneration({
      prompt: "cat",
      engine: "api",
      kind: "image",
      params: {},
    });

    expect(result.error).toContain("上游生图接口错误");
  });

  it("submitLegacyGeneration surfaces comfy error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ images: [], error: "Workflow file not found" }),
      }),
    );

    const result = await submitLegacyGeneration({
      prompt: "cat",
      engine: "comfy",
      kind: "image",
      params: {},
    });

    expect(result.error).toBe("Workflow file not found");
  });

  it("pollLegacyImageTask returns pending for queued status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "queued",
          }),
      }),
    );

    const result = await pollLegacyImageTask("task-1");
    expect(result.pending).toBe(true);
    expect(result.taskId).toBe("task-1");
  });

  it("pollLegacyImageTask returns urls when task succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            result: { images: ["/output/task.png"] },
          }),
      }),
    );

    const result = await pollLegacyImageTask("task-1");
    expect(result.url).toBe("/output/task.png");
    expect(result.pending).toBeUndefined();
  });

  it("pollLegacyUntilDone returns timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ status: "running" }),
      }),
    );

    const result = await pollLegacyUntilDone("task-1", 2, 10, 50);
    expect(result.error).toBe("生成超时");
  });
});
