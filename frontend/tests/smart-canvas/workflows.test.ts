import { describe, expect, it, vi } from "vitest";
import {
  exportWorkflowZip,
  importWorkflowFile,
} from "../../src/features/smart-canvas/core/workflows";

describe("workflows", () => {
  it("exportWorkflowZip calls export endpoint", async () => {
    const blob = new Blob(["zip"], { type: "application/zip" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => blob,
      }),
    );
    const result = await exportWorkflowZip({
      nodes: [],
      connections: [],
      filename: "test.zip",
    });
    expect(result).toBe(blob);
    vi.unstubAllGlobals();
  });

  it("importWorkflowFile parses response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          nodes: [{ id: "n1", kind: "image" }],
          connections: [],
        }),
      }),
    );
    const file = new File(["{}"], "workflow.zip", { type: "application/zip" });
    const result = await importWorkflowFile(file);
    expect(result.nodes).toHaveLength(1);
    expect(result.name).toBe("workflow");
    vi.unstubAllGlobals();
  });
});
