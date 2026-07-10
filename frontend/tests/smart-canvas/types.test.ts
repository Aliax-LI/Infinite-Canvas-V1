import { describe, expect, it } from "vitest";
import {
  createNode,
  normalizeCanvasPayload,
  normalizeNode,
  UNDO_LIMIT,
} from "../../src/features/smart-canvas/core/types";

describe("types", () => {
  it("UNDO_LIMIT is 40", () => {
    expect(UNDO_LIMIT).toBe(40);
  });

  it("normalizeNode fills defaults", () => {
    const node = normalizeNode({ id: "a", kind: "image" });
    expect(node.width).toBe(280);
    expect(node.images).toEqual([]);
  });

  it("createNode generates id", () => {
    const node = createNode({ kind: "text" });
    expect(node.id).toBeTruthy();
    expect(node.kind).toBe("text");
  });

  it("normalizeCanvasPayload handles array", () => {
    const result = normalizeCanvasPayload([{ id: "1", kind: "image" }]);
    expect(result.nodes).toHaveLength(1);
    expect(result.connections).toEqual([]);
  });

  it("normalizeCanvasPayload handles nodes object", () => {
    const result = normalizeCanvasPayload({
      nodes: [{ id: "1", kind: "image" }],
      connections: [{ id: "c1", from: "1", to: "2" }],
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.connections).toHaveLength(1);
  });

  it("normalizeCanvasPayload handles workflow wrapper", () => {
    const result = normalizeCanvasPayload({
      workflow: {
        nodes: [{ id: "1", kind: "workflow" }],
        connections: [],
      },
    });
    expect(result.nodes[0].kind).toBe("workflow");
  });

  it("normalizeCanvasPayload handles invalid", () => {
    expect(normalizeCanvasPayload(null).nodes).toEqual([]);
  });
});
