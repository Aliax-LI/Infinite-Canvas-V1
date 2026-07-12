import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGenerationPayload,
  collectSmartNodeInputs,
  pollImageTask,
  submitGeneration,
} from "../../src/features/smart-canvas/core/generation";

afterEach(() => vi.unstubAllGlobals());

describe("generation", () => {
  it("uses smart-group members as generation inputs", () => {
    const inputs = collectSmartNodeInputs(
      "group",
      [
        { id: "group", kind: "group", x: 0, y: 0, width: 280, height: 200, title: "Group", prompt: "", images: [], settings: {}, member_ids: ["image", "prompt"] },
        { id: "image", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "Image", prompt: "", images: [{ url: "/output/a.png" }], settings: {}, group_id: "group" },
        { id: "prompt", kind: "prompt", x: 0, y: 0, width: 280, height: 200, title: "Prompt", prompt: "a cat", images: [], settings: {}, group_id: "group" },
      ],
      [],
    );
    expect(inputs).toEqual({ prompt: "a cat", refs: ["/output/a.png"] });
  });

  it("buildGenerationPayload matches the canvas image task contract", () => {
    const payload = buildGenerationPayload(
      { engine: "api", prompt: "test", kind: "image", params: { size: "1024" } },
      ["/output/a.png"],
    );
    expect(payload.prompt).toBe("test");
    expect(payload.provider_id).toBe("comfly");
    expect(payload.reference_images).toEqual([{ url: "/output/a.png" }]);
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

  it("sends a reference entered in the dynamic parameter field", () => {
    const payload = buildGenerationPayload({
      engine: "api",
      prompt: "edit",
      kind: "image",
      params: { reference: "/output/manual-ref.png" },
    });
    expect(payload.reference_images).toEqual([{ url: "/output/manual-ref.png" }]);
  });

  it("submits API image generation to the asynchronous canvas endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: "canvas_img_1", status: "queued" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitGeneration({
      engine: "api",
      prompt: "cat",
      kind: "image",
      params: { provider: "comfly", model: "gpt-image-2" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/canvas-image-tasks");
    expect(result).toMatchObject({ taskId: "canvas_img_1", taskType: "image", pending: true });
  });

  it("reads nested URLs from a completed canvas task", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: "succeeded",
        result: { images: ["/output/a.png", { url: "/output/b.png" }] },
      }),
    }));
    const result = await pollImageTask("canvas_img_1");
    expect(result.urls).toEqual(["/output/a.png", "/output/b.png"]);
  });

  it("uses real Comfy and RunningHub endpoints and poll routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ task_id: "canvas_comfy_1" }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { taskId: "rh_1" } }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: "running" }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { status: "SUCCESS", urls: ["/output/rh.png"] } }) });
    vi.stubGlobal("fetch", fetchMock);

    const comfy = await submitGeneration({ engine: "comfy", prompt: "x", kind: "image", params: {} });
    const rh = await submitGeneration({ engine: "runninghub", prompt: "x", kind: "image", params: { workflow_id: "wf" } });
    await pollImageTask(String(comfy.taskId), comfy.taskType);
    const rhDone = await pollImageTask(String(rh.taskId), rh.taskType);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/canvas-comfy-tasks",
      "/api/runninghub/workflow-submit",
      "/api/canvas-comfy-tasks/canvas_comfy_1",
      "/api/runninghub/query?taskId=rh_1",
    ]);
    expect(rhDone.url).toBe("/output/rh.png");
  });

  it("routes text generation to canvas LLM and returns text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ text: "generated copy" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitGeneration({
      engine: "api",
      prompt: "write copy",
      kind: "text",
      params: { provider_id: "comfly", model: "gpt-5" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/canvas-llm");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      message: "write copy",
      provider: "comfly",
      model: "gpt-5",
    });
    expect(result.text).toBe("generated copy");
  });

  it("accepts completed video responses without polling them as image tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        videos: ["/output/video.mp4"],
        task_id: "upstream-video-task",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitGeneration({
      engine: "api",
      prompt: "move",
      kind: "video",
      params: { provider_id: "comfly", model: "veo3-fast" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/canvas-video");
    expect(result).toMatchObject({
      url: "/output/video.mp4",
      urls: ["/output/video.mp4"],
    });
    expect(result.pending).toBeUndefined();
  });
});
