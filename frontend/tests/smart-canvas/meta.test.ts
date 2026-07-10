import { describe, expect, it } from "vitest";
import { fetchCanvasMeta, loadCanvasMeta } from "../../src/features/smart-canvas/core/meta";

describe("meta", () => {
  it("loadCanvasMeta is alias for fetchCanvasMeta", () => {
    expect(loadCanvasMeta).toBe(fetchCanvasMeta);
  });
});
