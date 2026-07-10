import { describe, expect, it } from "vitest";
import {
  deserializeCanvas,
  serializeCanvas,
} from "../../src/features/smart-canvas/core/persistence";
import type { CanvasDoc } from "../../src/types/api";

const doc: CanvasDoc = {
  id: "x",
  title: "Test Canvas",
  icon: "🧩",
  kind: "smart",
  nodes: [
    {
      id: "n1",
      kind: "image",
      x: 10,
      y: 20,
      width: 280,
      height: 200,
      title: "Node",
      prompt: "hello",
      images: [],
      settings: {},
    },
  ],
  connections: [],
  viewport: { x: 0, y: 0, scale: 1 },
  logs: [],
  settings: {},
};

describe("persistence", () => {
  it("serialize/deserialize round-trip", () => {
    const json = serializeCanvas(doc);
    const parsed = deserializeCanvas(json);
    expect(parsed?.title).toBe("Test Canvas");
    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.nodes?.[0].prompt).toBe("hello");
  });

  it("deserializeCanvas returns null for invalid json", () => {
    expect(deserializeCanvas("not json")).toBeNull();
  });
});
