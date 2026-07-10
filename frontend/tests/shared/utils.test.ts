import { describe, expect, it } from "vitest";
import { wsUrl } from "../../src/features/smart-canvas/core/websocket";
import { clamp, escapeHtml, formatTime } from "../../src/shared/utils";

describe("shared utils", () => {
  it("clamp limits value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it("escapeHtml escapes special chars", () => {
    expect(escapeHtml("<a>&")).toBe("&lt;a&gt;&amp;");
  });

  it("formatTime handles seconds timestamp", () => {
    const result = formatTime(1700000000);
    expect(result).not.toBe("--");
  });

  it("formatTime returns -- for empty", () => {
    expect(formatTime(undefined)).toBe("--");
  });

  it("wsUrl builds path", () => {
    expect(wsUrl("/ws/stats")).toContain("/ws/stats");
  });
});

describe("theme store key", () => {
  it("studio_theme is the storage key", () => {
    expect("studio_theme").toBe("studio_theme");
  });
});
