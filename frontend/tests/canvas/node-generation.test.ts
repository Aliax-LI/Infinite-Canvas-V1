import { describe, expect, it, vi, afterEach } from "vitest";
import {
  collectGenerationInput,
  collectLlmInput,
  collectLlmMedia,
  generatorSources,
  resolveGenerationPrompt,
} from "../../src/features/canvas/core/nodeSources";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import {
  buildLegacyPayload,
  extractGenerationUrls,
} from "../../src/features/canvas/core/generation";
import { mapRunningHubInputs, runCanvasNode, runGeneratorNode, runMsGenNode } from "../../src/features/canvas/core/runNodeGeneration";
import { MS_GEN_MODELS } from "../../src/features/canvas/core/msGenModels";
import { ApiError } from "../../src/shared/api/client";
import { formatApiError } from "../../src/shared/api/formatError";

describe("nodeSources", () => {
  it("collects prompt and image refs from wired upstream nodes", () => {
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      title: "Image",
      images: [{ url: "/output/a.png", kind: "image", name: "cat.png" }],
    });
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "a cat",
    });
    const generator = createLegacyNode({ id: "gen1", kind: "generator" });
    const nodes = [image, prompt, generator];
    const connections = [
      { id: "c1", from: "img1", to: "gen1" },
      { id: "c2", from: "p1", to: "gen1" },
    ];

    const sources = generatorSources(generator, nodes, connections);
    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.refs.length)?.refs[0]?.name).toBe("cat.png");
    const input = collectGenerationInput(generator, nodes, connections);
    expect(input.prompt).toBe("a cat");
    expect(input.refs).toEqual(["/output/a.png"]);
  });

  it("collects llm input from prompt nodes", () => {
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "summarize",
    });
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const input = collectLlmInput(llm, [prompt, llm], [
      { id: "c1", from: "p1", to: "l1" },
    ]);
    expect(input).toBe("summarize");
  });

  it("uses node.prompt when settings.text is empty (defaultSettingsForKind)", () => {
    // Regression: `settings.text: ""` must not block `node.prompt` via `??`.
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt:
        "frames, character consistency maintained across all angles",
      settings: { text: "" },
    });
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [{ url: "/output/a.jpg", kind: "image", name: "a.jpg" }],
    });
    const nodes = [prompt, image, llm];
    const connections = [
      { id: "c1", from: "p1", to: "l1" },
      { id: "c2", from: "img1", to: "l1" },
    ];
    expect(collectLlmInput(llm, nodes, connections)).toBe(
      "frames, character consistency maintained across all angles",
    );
    expect(collectLlmMedia(llm, nodes, connections).images).toHaveLength(1);
    const gen = createLegacyNode({ id: "gen1", kind: "generator" });
    expect(
      collectGenerationInput(gen, [...nodes, gen], [
        ...connections,
        { id: "c3", from: "l1", to: "gen1" },
      ]).prompt,
    ).toBe("frames, character consistency maintained across all angles");
  });

  it("collects llm media from wired image nodes", () => {
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [
        { url: "/output/flow.jpg", kind: "image", name: "需求整理-流程图.jpg" },
      ],
    });
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const media = collectLlmMedia(llm, [image, llm], [
      { id: "c1", from: "img1", to: "l1" },
    ]);
    expect(media.images).toHaveLength(1);
    expect(media.images[0].name).toBe("需求整理-流程图.jpg");
    expect(media.videos).toHaveLength(0);
  });

  it("propagates prompt and images through LLM → generator edges", () => {
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [{ url: "/output/flow.jpg", kind: "image", name: "flow.jpg" }],
    });
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "A multi-camera angle reference sheet",
    });
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const generator = createLegacyNode({ id: "gen1", kind: "generator" });
    const nodes = [image, prompt, llm, generator];
    const connections = [
      { id: "c1", from: "p1", to: "l1" },
      { id: "c2", from: "img1", to: "l1" },
      { id: "c3", from: "l1", to: "gen1" },
    ];

    const sources = generatorSources(generator, nodes, connections);
    const input = collectGenerationInput(generator, nodes, connections);
    expect(input.prompt).toBe("A multi-camera angle reference sheet");
    expect(input.refs).toEqual(["/output/flow.jpg"]);
    expect(sources.some((s) => s.type === "llm")).toBe(true);
    expect(sources.some((s) => s.type === "llmImage")).toBe(true);
  });

  it("prefers LLM outputText over wired passthrough for generator prompts", () => {
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "upstream",
    });
    const llm = createLegacyNode({
      id: "l1",
      kind: "llm",
      settings: { outputText: "refined result" },
    });
    const generator = createLegacyNode({ id: "gen1", kind: "generator" });
    const input = collectGenerationInput(
      generator,
      [prompt, llm, generator],
      [
        { id: "c1", from: "p1", to: "l1" },
        { id: "c2", from: "l1", to: "gen1" },
      ],
    );
    expect(input.prompt).toBe("refined result");
  });

  it("resolveGenerationPrompt uses wired PROMPT when local textarea is empty", () => {
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "一个女生",
      settings: { text: "一个女生" },
    });
    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "",
    });
    const resolved = resolveGenerationPrompt(
      generator,
      [prompt, generator],
      [{ id: "c1", from: "p1", to: "gen1" }],
    );
    expect(resolved.fromWire).toBe(true);
    expect(resolved.wiredPrompt).toBe("一个女生");
    expect(resolved.localPrompt).toBe("");
    expect(resolved.prompt).toBe("一个女生");
  });

  it("resolveGenerationPrompt appends local prompt after wired text", () => {
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "一个女生",
    });
    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "电影光影",
    });
    const resolved = resolveGenerationPrompt(
      generator,
      [prompt, generator],
      [{ id: "c1", from: "p1", to: "gen1" }],
    );
    expect(resolved.prompt).toBe("一个女生\n\n电影光影");
  });
});

describe("runGeneratorNode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes wired PROMPT text in canvas-image payload when local prompt is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ task_id: "canvas_img_wired", status: "queued" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            result: { images: ["/output/girl.png"] },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const promptNode = createLegacyNode({
      id: "p1",
      kind: "prompt",
      prompt: "一个女生",
      settings: { text: "一个女生" },
    });
    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "",
      settings: {
        apiProvider: "modelscope",
        provider_id: "modelscope",
        model: "Tongyi-MAI/Z-Image-Turbo",
        ratio: "story",
        resolution: "1k",
      },
    });
    const connections = [{ id: "c1", from: "p1", to: "gen1" }];

    const result = await runGeneratorNode(
      generator,
      [promptNode, generator],
      connections,
      undefined,
      { x: 0, y: 0, scale: 1 },
    );
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("/output/girl.png");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.prompt).toBe("一个女生");
    expect(body.provider_id).toBe("modelscope");
  });

  it("posts canvas-image-tasks then polls until succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            task_id: "canvas_img_abc",
            status: "queued",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            result: { images: ["/output/gen.png"] },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "dog",
      settings: {
        apiProvider: "comfly",
        model: "gpt-image-1",
        ratio: "square",
        resolution: "1k",
      },
    });
    const result = await runGeneratorNode(generator, [generator], [], undefined, {
      x: 0,
      y: 0,
      scale: 1,
    });
    expect(result.url).toBe("/output/gen.png");
    expect(result.resultNodes?.length).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(submitUrl).toContain("/api/canvas-image-tasks");
    expect(submitInit.method).toBe("POST");
    const body = JSON.parse(String(submitInit.body));
    expect(body.provider_id).toBe("comfly");
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("dog");

    const [pollUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toContain("/api/canvas-image-tasks/canvas_img_abc");
  });

  it("count=2 fires 2 parallel tasks with n=1 each (not n×count)", async () => {
    let taskSeq = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" || String(url).endsWith("/api/canvas-image-tasks")) {
        taskSeq += 1;
        const id = `canvas_img_${taskSeq}`;
        return {
          ok: true,
          text: async () => JSON.stringify({ task_id: id, status: "queued" }),
        };
      }
      const match = String(url).match(/canvas_img_(\d+)/);
      const n = match?.[1] ?? "1";
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            // Provider may return extras; client must keep one per slot.
            result: { images: [`/output/a${n}.png`, `/output/extra${n}.png`] },
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const generator = createLegacyNode({
      id: "gen-count",
      kind: "generator",
      prompt: "cats",
      settings: {
        apiProvider: "comfly",
        model: "gpt-image-1",
        ratio: "square",
        resolution: "1k",
        count: 2,
      },
    });
    const result = await runGeneratorNode(generator, [generator], [], undefined, {
      x: 0,
      y: 0,
      scale: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.urls).toEqual(["/output/a1.png", "/output/a2.png"]);
    expect(result.urls).toHaveLength(2);

    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(2);
    for (const call of posts) {
      const body = JSON.parse(String((call[1] as RequestInit).body));
      expect(body.n).toBe(1);
    }
  });

  it("includes wired image URLs as reference_images in submit payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ task_id: "canvas_img_ref", status: "queued" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            result: { images: ["/output/out.png"] },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [{ url: "/output/ref-a.png", kind: "image" }],
    });
    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "",
      settings: {
        apiProvider: "comfly",
        provider_id: "comfly",
        model: "flux",
      },
    });
    const connections = [{ id: "c1", from: "img1", to: "gen1" }];

    const result = await runGeneratorNode(
      generator,
      [image, generator],
      connections,
      undefined,
      { x: 0, y: 0, scale: 1 },
    );
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("/output/out.png");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.reference_images).toEqual([{ url: "/output/ref-a.png" }]);
    expect(body.provider_id).toBe("comfly");
    expect(body.model).toBe("flux");
    expect(body.prompt).toBe("Edit the reference images.");
  });

  it("uses wired refs in payload", () => {
    const payload = buildLegacyPayload(
      {
        prompt: "edit",
        engine: "api",
        kind: "image",
        params: { provider_id: "comfly", model: "m1", size: "1024x1024" },
      },
      ["/output/ref.png"],
    );
    expect(payload.reference_images).toEqual([{ url: "/output/ref.png" }]);
    expect(extractGenerationUrls({ images: ["/output/x.png"] })).toEqual([
      "/output/x.png",
    ]);
    expect(extractGenerationUrls({ videos: ["/output/x.mp4"] })).toEqual([
      "/output/x.mp4",
    ]);
  });

  it("poll completes and returns error on task failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ task_id: "canvas_img_fail", status: "queued" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "failed",
            error: "请求上游生图接口失败：Server disconnected without sending a response.",
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const generator = createLegacyNode({
      id: "gen1",
      kind: "generator",
      prompt: "x",
      settings: { apiProvider: "comfly", model: "m1" },
    });
    const result = await runGeneratorNode(generator, [generator], []);
    expect(result.error).toContain("断开连接");
  });
});

describe("RunningHub input mapping", () => {
  it("maps prompt and uploaded references into matching workflow fields", () => {
    const result = mapRunningHubInputs(
      [
        { nodeId: "1", fieldName: "positive_prompt", fieldValue: "old" },
        { nodeId: "2", fieldName: "negative_prompt", fieldValue: "bad" },
        { nodeId: "3", fieldName: "image", fieldType: "IMAGE", fieldValue: "old.png" },
      ],
      "a cat",
      ["uploaded-cat.png"],
    );
    expect(result.mappedPrompt).toBe(true);
    expect(result.mappedRefs).toBe(1);
    expect(result.items.map((item) => item.fieldValue)).toEqual([
      "a cat",
      "bad",
      "uploaded-cat.png",
    ]);
  });
});

describe("legacy multi-select state", () => {
  it("supports additive selection and bulk delete", () => {
    const a = createLegacyNode({ id: "a", kind: "image" });
    const b = createLegacyNode({ id: "b", kind: "image" });
    const store = useLegacyCanvasStore.getState();
    store.init({ canvasId: "c1", title: "T", nodes: [a, b] });
    store.selectNode("a");
    store.selectNode("b", { additive: true });
    expect(useLegacyCanvasStore.getState().selectedIds).toEqual(["a", "b"]);
    store.removeNodes(["a", "b"]);
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(0);
    expect(useLegacyCanvasStore.getState().selectedIds).toHaveLength(0);
  });

  it("delete selected nodes is undoable and cascades group items", () => {
    const child = createLegacyNode({ id: "child", kind: "image" });
    const group = createLegacyNode({
      id: "grp",
      kind: "group",
      settings: { items: ["child"] },
    });
    const other = createLegacyNode({ id: "other", kind: "image" });
    const store = useLegacyCanvasStore.getState();
    store.init({
      canvasId: "c1",
      title: "T",
      nodes: [child, group, other],
    });
    store.setSelectedIds(["grp", "other"]);
    store.removeNodes(["grp", "other"]);
    const after = useLegacyCanvasStore.getState();
    expect(after.nodes.map((n) => n.id)).toEqual([]);
    expect(after.undo()).toBe(true);
    const restored = useLegacyCanvasStore.getState();
    expect(restored.nodes.map((n) => n.id).sort()).toEqual([
      "child",
      "grp",
      "other",
    ]);
  });

  it("removeNode routes through removeNodes with undo", () => {
    const node = createLegacyNode({ id: "n1", kind: "image" });
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "T",
      nodes: [node],
    });
    useLegacyCanvasStore.getState().removeNode("n1");
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(0);
    expect(useLegacyCanvasStore.getState().undo()).toBe(true);
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe("runCanvasNode kinds", () => {
  it("requires prompt or segments for ltx director", async () => {
    const node = createLegacyNode({ kind: "ltxDirector" });
    const result = await runCanvasNode(node, [node], []);
    expect(result.error).toMatch(/提示词|图片段/);
  });

  it("does not reject when settings.running is already true (UI stamps before call)", async () => {
    const node = createLegacyNode({
      kind: "ltxDirector",
      settings: { running: true },
    });
    const result = await runCanvasNode(node, [node], []);
    // Must reach kind handler — not the old false-positive "节点正在运行" guard.
    expect(result.error).not.toBe("节点正在运行");
    expect(result.error).toMatch(/提示词|图片段/);
  });

  it("reports an unavailable LTX workflow before submitting generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        available: false,
        reason: "工作流不存在",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = createLegacyNode({
      kind: "ltxDirector",
      prompt: "cinematic shot",
      settings: { workflow_json: "missing-ltx.json" },
    });
    const result = await runCanvasNode(node, [node], []);
    expect(result.error).toContain("工作流不存在");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("runMsGenNode ZImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes ZImage to /api/ms/generate (not Comfy /api/generate)", async () => {
    expect(MS_GEN_MODELS.zimage.endpoint).toBe("/api/ms/generate");
    expect(MS_GEN_MODELS.zimage.endpoint).not.toBe("/api/generate");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ url: "/output/zimage.png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const node = createLegacyNode({
      id: "ms1",
      kind: "msgen",
      prompt: "一个女生",
      settings: {
        msgenModel: "zimage",
        msRatio: "square",
        msResolution: "1k",
        count: 1,
      },
    });
    const config = {
      has_ms_key: true,
      api_providers: [{ id: "modelscope", api_key: "ms-test" }],
    } as never;

    const result = await runMsGenNode(
      node,
      [node],
      [],
      { x: 0, y: 0, scale: 1 },
      undefined,
      config,
    );
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("/output/zimage.png");

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/ms/generate");
    const body = JSON.parse(String(init.body));
    expect(body.prompt).toBe("一个女生");
    expect(body.model).toBe("Tongyi-MAI/Z-Image-Turbo");
    expect(body.size).toMatch(/^\d+x\d+$/);
    expect(body.workflow_json).toBeUndefined();
  });

  it("surfaces ApiError detail instead of empty HTTP Error 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () =>
        JSON.stringify({ detail: { message: "ModelScope upstream unavailable" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const node = createLegacyNode({
      id: "ms2",
      kind: "msgen",
      prompt: "一个女生",
      settings: { msgenModel: "zimage", count: 1 },
    });
    const config = { has_ms_key: true } as never;
    const result = await runMsGenNode(
      node,
      [node],
      [],
      { x: 0, y: 0, scale: 1 },
      undefined,
      config,
    );
    expect(result.error).toBe("ModelScope upstream unavailable");

    const bare = formatApiError(
      new ApiError("HTTP Error 502:", 502, { detail: "HTTP Error 502:" }),
      "MS 生成失败",
    );
    expect(bare).toContain("HTTP 502");
    expect(bare).not.toMatch(/HTTP Error 502:\s*$/);
  });
});
