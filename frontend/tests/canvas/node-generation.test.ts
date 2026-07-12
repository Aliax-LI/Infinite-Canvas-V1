import { describe, expect, it, vi, afterEach } from "vitest";
import { collectGenerationInput, collectLlmInput, generatorSources } from "../../src/features/canvas/core/nodeSources";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import {
  buildLegacyPayload,
  extractGenerationUrls,
} from "../../src/features/canvas/core/generation";
import { mapRunningHubInputs, runCanvasNode, runGeneratorNode } from "../../src/features/canvas/core/runNodeGeneration";

describe("nodeSources", () => {
  it("collects prompt and image refs from wired upstream nodes", () => {
    const image = createLegacyNode({
      id: "img1",
      kind: "image",
      images: [{ url: "/output/a.png", kind: "image" }],
    });
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      settings: { text: "a cat" },
    });
    const generator = createLegacyNode({ id: "gen1", kind: "generator" });
    const nodes = [image, prompt, generator];
    const connections = [
      { id: "c1", from: "img1", to: "gen1" },
      { id: "c2", from: "p1", to: "gen1" },
    ];

    const sources = generatorSources(generator, nodes, connections);
    expect(sources).toHaveLength(2);
    const input = collectGenerationInput(generator, nodes, connections);
    expect(input.prompt).toBe("a cat");
    expect(input.refs).toEqual(["/output/a.png"]);
  });

  it("collects llm input from prompt nodes", () => {
    const prompt = createLegacyNode({
      id: "p1",
      kind: "prompt",
      settings: { text: "summarize" },
    });
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const input = collectLlmInput(llm, [prompt, llm], [
      { id: "c1", from: "p1", to: "l1" },
    ]);
    expect(input).toBe("summarize");
  });
});

describe("runGeneratorNode", () => {
  afterEach(() => vi.unstubAllGlobals());

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
