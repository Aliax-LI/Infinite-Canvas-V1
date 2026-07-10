import { describe, expect, it, vi } from "vitest";
import { exportSmartCanvasGroup } from "../../src/features/smart-canvas/core/advanced";

describe("advanced", () => {
  it("exportSmartCanvasGroup posts to API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      }),
    );
    const result = await exportSmartCanvasGroup({
      group_name: "test-group",
      items: [{ kind: "image", url: "/output/a.png" }],
    });
    expect(result).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });
});
