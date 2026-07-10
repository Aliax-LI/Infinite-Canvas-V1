import { describe, expect, it } from "vitest";
import { applyMergedServerCanvas, mergeCanvasPayload } from "../../src/features/smart-canvas/core/merge";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";
import { wsUrl } from "../../src/features/smart-canvas/core/websocket";

describe("merge", () => {
  it("prefers remote when newer", () => {
    const local = [normalizeNode({ id: "a", kind: "image", prompt: "old" })];
    const remote = [normalizeNode({ id: "a", kind: "image", prompt: "new" })];
    const merged = applyMergedServerCanvas(local, remote, 1, 2);
    expect(merged[0].prompt).toBe("new");
  });

  it("merges images into local when local is newer", () => {
    const local = [normalizeNode({ id: "a", kind: "image", images: [] })];
    const remote = [
      normalizeNode({
        id: "a",
        kind: "image",
        images: [{ url: "http://x.png" }],
        status: "done",
      }),
    ];
    const merged = applyMergedServerCanvas(local, remote, 5, 3);
    expect(merged[0].images[0].url).toBe("http://x.png");
    expect(merged[0].status).toBe("done");
  });

  it("mergeCanvasPayload accepts remote connections when newer", () => {
    const result = mergeCanvasPayload(
      { nodes: [], connections: [], updatedAt: 1 },
      {
        nodes: [normalizeNode({ id: "n", kind: "image" })],
        connections: [{ id: "c", from: "n", to: "n" }],
        updatedAt: 10,
      },
    );
    expect(result.acceptedRemote).toBe(true);
    expect(result.nodes).toHaveLength(1);
    expect(result.connections).toHaveLength(1);
  });
});

describe("websocket wsUrl", () => {
  it("includes client_id query", () => {
    expect(wsUrl("/ws/stats", "abc-123")).toContain("client_id=abc-123");
  });
});
