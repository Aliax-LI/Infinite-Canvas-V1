import { describe, expect, it } from "vitest";
import {
  createNode,
  normalizeCanvasPayload,
  normalizeNode,
} from "../../src/features/smart-canvas/core/types";

describe("normalizeCanvasPayload variants", () => {
  it("null input", () => {
    expect(normalizeCanvasPayload(null)).toEqual({ nodes: [], connections: [] });
  });

  it("array of nodes", () => {
    const r = normalizeCanvasPayload([{ id: "1", kind: "text" }]);
    expect(r.nodes[0].kind).toBe("text");
    expect(r.connections).toEqual([]);
  });

  it("object with nodes and connections", () => {
    const r = normalizeCanvasPayload({
      nodes: [{ id: "a" }],
      connections: [{ id: "c1", from: "a", to: "b" }],
    });
    expect(r.nodes).toHaveLength(1);
    expect(r.connections).toHaveLength(1);
  });

  it("workflow wrapper", () => {
    const r = normalizeCanvasPayload({
      workflow: { nodes: [{ id: "w1", kind: "workflow" }] },
    });
    expect(r.nodes[0].id).toBe("w1");
  });

  it("normalizeNode defaults", () => {
    const n = normalizeNode({});
    expect(n.kind).toBe("image");
    expect(n.width).toBe(280);
  });

  it("createNode assigns title", () => {
    expect(createNode({ kind: "video", title: "V" }).title).toBe("V");
  });
});

describe("normalizeNode fields", () => {
  it("preserves member_ids", () => {
    expect(normalizeNode({ member_ids: ["a", "b"] }).member_ids).toEqual(["a", "b"]);
  });

  it("collapsed boolean", () => {
    expect(normalizeNode({ collapsed: true }).collapsed).toBe(true);
  });

  it("status field", () => {
    expect(normalizeNode({ status: "running" }).status).toBe("running");
  });
});
