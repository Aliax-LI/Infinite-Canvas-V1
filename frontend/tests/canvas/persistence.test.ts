import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  canvasMediaPreviewUrl,
  legacyNodesFromUploads,
} from "../../src/features/canvas/core/uploadMedia";
import { loadLegacyCanvas, saveLegacyCanvas } from "../../src/features/canvas/core/persistence";
import { normalizeLegacyNode } from "../../src/features/canvas/core/types";

describe("uploadMedia", () => {
  it("canvasMediaPreviewUrl proxies local output paths", () => {
    const url = canvasMediaPreviewUrl("/output/test.png", 256);
    expect(url).toContain("/api/media-preview");
    expect(url).toContain(encodeURIComponent("/output/test.png"));
  });

  it("legacyNodesFromUploads offsets stacked nodes", () => {
    const nodes = legacyNodesFromUploads(
      [{ url: "/output/a.png", name: "a.png" }],
      100,
      200,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].images[0].url).toBe("/output/a.png");
  });
});

describe("legacy canvas persistence", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadLegacyCanvas normalizes history node shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          canvas: {
            id: "c1",
            title: "Classic",
            nodes: [
              {
                id: "n1",
                type: "image",
                x: 10,
                y: 20,
                url: "/output/x.png",
                name: "x.png",
              },
            ],
            connections: [],
            viewport: { x: 0, y: 0, scale: 1 },
          },
        }),
    });

    const doc = await loadLegacyCanvas("c1");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].kind).toBe("image");
    expect(doc.nodes[0].images[0].url).toBe("/output/x.png");
  });

  it("saveLegacyCanvas PUTs nodes and viewport", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          canvas: {
            id: "c1",
            title: "Saved",
            nodes: [{ id: "n1", kind: "image", x: 1, y: 2, images: [] }],
            connections: [],
            viewport: { x: 5, y: 6, scale: 1 },
            updated_at: 999,
          },
        }),
    });

    const doc = await saveLegacyCanvas("c1", {
      title: "Saved",
      nodes: [
        normalizeLegacyNode({ id: "n1", kind: "image", x: 1, y: 2 }),
      ],
      connections: [],
      viewport: { x: 5, y: 6, scale: 1 },
    });
    expect(doc.updated_at).toBe(999);
    const putCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.nodes).toHaveLength(1);
    expect(body.viewport.x).toBe(5);
  });
});
