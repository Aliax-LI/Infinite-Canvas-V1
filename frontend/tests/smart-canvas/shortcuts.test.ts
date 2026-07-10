import { describe, expect, it } from "vitest";
import {
  imageLayout,
  matchShortcut,
  SMART_CANVAS_SHORTCUTS,
  thumbGridStyle,
} from "../../src/features/smart-canvas/core/shortcuts";

describe("shortcuts", () => {
  it("defines core bindings", () => {
    expect(SMART_CANVAS_SHORTCUTS.length).toBeGreaterThan(10);
    expect(SMART_CANVAS_SHORTCUTS.some((b) => b.action === "undo")).toBe(true);
  });

  it("matches ctrl+z undo", () => {
    const e = {
      key: "z",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      target: document.body,
    } as unknown as KeyboardEvent;
    expect(matchShortcut(e)).toBe("undo");
  });

  it("ignores input fields", () => {
    const input = document.createElement("input");
    const e = {
      key: "z",
      metaKey: true,
      target: input,
    } as unknown as KeyboardEvent;
    expect(matchShortcut(e)).toBeNull();
  });

  it("imageLayout scales with count", () => {
    expect(imageLayout(1)).toEqual({ cols: 1, rows: 1 });
    expect(imageLayout(4)).toEqual({ cols: 2, rows: 2 });
    expect(imageLayout(10).cols).toBeGreaterThan(2);
  });

  it("thumbGridStyle positions cells", () => {
    const s = thumbGridStyle(7, 9, 100, 80);
    expect(s.left).toBe(100);
    expect(s.top).toBe(160);
  });
});
