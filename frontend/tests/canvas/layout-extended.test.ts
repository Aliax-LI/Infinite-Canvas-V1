import { describe, expect, it } from "vitest";
import { connectionPath, filterValidConnections } from "../../src/features/canvas/core/layout";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("legacy layout", () => {
  it("connectionPath connects node edges", () => {
    const from = createLegacyNode({ kind: "image", x: 0, y: 0 });
    const to = createLegacyNode({ kind: "video", x: 400, y: 100 });
    const path = connectionPath(from, to);
    expect(path.x1).toBeGreaterThan(path.x2 - 500);
    expect(path.y2).toBeGreaterThan(0);
  });

  it("filterValidConnections drops orphans", () => {
    const a = createLegacyNode({ kind: "image" });
    const conns = filterValidConnections(
      [
        { id: "1", from: a.id, to: "missing" },
        { id: "2", from: a.id, to: a.id },
      ],
      new Set([a.id]),
    );
    expect(conns).toHaveLength(1);
    expect(conns[0].to).toBe(a.id);
  });
});
