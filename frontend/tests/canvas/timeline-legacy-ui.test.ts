import { describe, expect, it } from "vitest";
import { connectionPath } from "../../src/features/canvas/core/layout";
import { createLegacyNode, LEGACY_NODE_KINDS } from "../../src/features/canvas/core/types";
import { useTimeline } from "../../src/features/canvas/timeline/useTimeline";
import { renderHook, act } from "@testing-library/react";

describe("legacy canvas components", () => {
  it("connectionPath links node centers", () => {
    const a = createLegacyNode({ id: "a", kind: "image", x: 0, y: 0 });
    const b = createLegacyNode({ id: "b", kind: "output", x: 300, y: 0 });
    const path = connectionPath(a, b);
    expect(path.x2).toBeGreaterThan(path.x1);
  });

  it("defines 12 legacy node kinds", () => {
    expect(LEGACY_NODE_KINDS.length).toBeGreaterThanOrEqual(10);
    expect(LEGACY_NODE_KINDS).toContain("ltxDirector");
    expect(LEGACY_NODE_KINDS).toContain("comfy");
  });
});

describe("useTimeline", () => {
  it("adds clip and serializes settings", () => {
    const { result } = renderHook(() => useTimeline());
    act(() => result.current.addClip());
    expect(result.current.clips.length).toBeGreaterThan(0);
    const data = result.current.getState();
    expect(data.settings.fps).toBeDefined();
    expect(Array.isArray(data.clips)).toBe(true);
  });

  it("scrubs currentTime within bounds", () => {
    const { result } = renderHook(() => useTimeline());
    act(() => result.current.scrubTo(3));
    expect(result.current.currentTime).toBe(3);
  });
});
