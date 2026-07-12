import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  legacyNodesFromResultUrls,
  nextAppendPosition,
  appendUrlsToClassicCanvas,
  rememberCanvasId,
  readRememberedCanvasId,
  LAST_CANVAS_ID_KEY,
} from "../../src/features/canvas/core/addResultToCanvas";
import { DEFAULT_VIEWPORT, LEGACY_NODE_W } from "../../src/features/canvas/core/types";

describe("addResultToCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("rememberCanvasId persists to localStorage", () => {
    rememberCanvasId("cv-test");
    expect(readRememberedCanvasId()).toBe("cv-test");
    expect(localStorage.getItem(LAST_CANVAS_ID_KEY)).toBe("cv-test");
  });

  it("nextAppendPosition centers on empty canvas viewport", () => {
    const pos = nextAppendPosition([], DEFAULT_VIEWPORT);
    expect(pos.x).toBe(Math.round(800 / 2 - LEGACY_NODE_W / 2));
    expect(pos.y).toBe(Math.round(600 / 2 - 200 / 2));
  });

  it("nextAppendPosition stacks after existing nodes", () => {
    const pos = nextAppendPosition(
      [
        {
          id: "n1",
          kind: "image",
          x: 100,
          y: 50,
          width: 280,
          height: 200,
          title: "a",
          prompt: "",
          images: [],
          settings: {},
        },
      ],
      DEFAULT_VIEWPORT,
    );
    expect(pos.x).toBe(100 + 280 + 40);
    expect(pos.y).toBe(50);
  });

  it("legacyNodesFromResultUrls creates staggered image nodes", () => {
    const nodes = legacyNodesFromResultUrls(
      ["/output/a.png", "/output/b.png"],
      120,
      80,
      "增强结果",
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0].images[0].url).toBe("/output/a.png");
    expect(nodes[1].x).toBe(120 + 36);
    expect(nodes[1].title).toBe("增强结果_2");
  });
});

describe("appendUrlsToClassicCanvas", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads canvas, appends nodes, saves, and remembers id", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            canvas: {
              id: "cv-1",
              title: "测试",
              nodes: [],
              connections: [],
              viewport: DEFAULT_VIEWPORT,
              settings: {},
              updated_at: 100,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            canvas: {
              id: "cv-1",
              title: "测试",
              nodes: [
                {
                  id: "new-1",
                  kind: "image",
                  x: 260,
                  y: 100,
                  width: 280,
                  height: 200,
                  title: "mock",
                  prompt: "",
                  images: [{ url: "/output/mock.png", kind: "image" }],
                  settings: {},
                },
              ],
              connections: [],
              viewport: DEFAULT_VIEWPORT,
              settings: {},
              updated_at: 200,
            },
          }),
      });

    const result = await appendUrlsToClassicCanvas("cv-1", ["/output/mock.png"], {
      title: "mock",
    });
    expect(result.addedCount).toBe(1);
    expect(result.canvasId).toBe("cv-1");
    expect(readRememberedCanvasId()).toBe("cv-1");

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[0]).toContain("/api/canvases/cv-1");
    expect(putCall[1]?.method).toBe("PUT");
    const body = JSON.parse(String(putCall[1]?.body));
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].images[0].url).toBe("/output/mock.png");
  });
});
