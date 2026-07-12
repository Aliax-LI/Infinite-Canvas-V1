import { describe, expect, it } from "vitest";
import {
  buildWorkflowPayload,
  importWorkflowAt,
  parseWorkflowPayload,
  workflowPayloadFromImportResponse,
  WORKFLOW_FORMAT,
} from "../../src/features/canvas/core/workflowTransfer";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("workflowTransfer", () => {
  it("builds payload for selected nodes", () => {
    const n = createLegacyNode({ kind: "generator", id: "g1" });
    const payload = buildWorkflowPayload(["g1"], [n], []);
    expect(payload?.format).toBe(WORKFLOW_FORMAT);
    expect(payload?.nodes).toHaveLength(1);
  });

  it("parses and imports workflow", () => {
    const raw = {
      format: WORKFLOW_FORMAT,
      version: 1,
      exported_at: Date.now(),
      nodes: [{ id: "x", kind: "image", x: 0, y: 0 }],
      connections: [],
    };
    const parsed = parseWorkflowPayload(raw);
    expect(parsed).not.toBeNull();
    const imported = importWorkflowAt(parsed!, 100, 100);
    expect(imported.nodes[0].id).not.toBe("x");
    expect(imported.selectedIds).toHaveLength(1);
  });

  it("rejects unknown format", () => {
    expect(parseWorkflowPayload({ format: "other" })).toBeNull();
  });

  it("parses backend import response", () => {
    const payload = workflowPayloadFromImportResponse({
      nodes: [{ id: "x", kind: "image", x: 0, y: 0 }],
      connections: [],
    });
    expect(payload?.nodes).toHaveLength(1);
  });
});
