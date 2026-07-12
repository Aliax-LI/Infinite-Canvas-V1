import { describe, expect, it } from "vitest";
import {
  isSmartRunnableTarget,
  planApplyImageResult,
  shouldCreateBranchOutput,
} from "../../src/features/smart-canvas/core/applyRunResult";
import { validateComposerForRun } from "../../src/features/smart-canvas/core/generation";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

function node(partial: Partial<SmartNode> & { kind: string }): SmartNode {
  return {
    id: partial.id ?? "n1",
    kind: partial.kind,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 280,
    height: partial.height ?? 200,
    title: partial.title ?? "导入节点",
    prompt: partial.prompt ?? "",
    images: partial.images ?? [],
    settings: partial.settings ?? {},
    status: partial.status,
  };
}

describe("applyRunResult", () => {
  const composer = {
    engine: "api" as const,
    prompt: "a cat",
    kind: "image" as const,
    params: { provider_id: "comfly", model: "gpt-image-2" },
  };

  it("updates empty import card in place", () => {
    const plan = planApplyImageResult(
      node({ kind: "image", images: [] }),
      ["/output/a.png"],
      composer,
    );
    expect(plan.mode).toBe("update");
    expect(plan.targetPatch?.images?.[0]?.url).toBe("/output/a.png");
    expect(plan.targetPatch?.title).toBe("Image");
  });

  it("branches when source already has media", () => {
    const source = node({
      kind: "image",
      images: [{ url: "/output/old.png" }],
      x: 100,
      width: 280,
    });
    expect(shouldCreateBranchOutput(source)).toBe(true);
    const plan = planApplyImageResult(source, ["/output/new.png"], composer);
    expect(plan.mode).toBe("branch");
    expect(plan.createPartial?.x).toBe(100 + 280 + 40);
    expect(plan.connectFrom).toBe(source.id);
  });

  it("creates a card when nothing is selected", () => {
    const plan = planApplyImageResult(null, ["/output/a.png"], composer);
    expect(plan.mode).toBe("create");
    expect(isSmartRunnableTarget(null)).toBe(false);
  });

  it("allows a workflow card to be run directly", () => {
    expect(isSmartRunnableTarget(node({ kind: "workflow" }))).toBe(true);
  });
});

describe("validateComposerForRun", () => {
  it("requires provider and model for API engine", () => {
    expect(
      validateComposerForRun({
        engine: "api",
        prompt: "hi",
        kind: "image",
        params: {},
      }),
    ).toMatch(/Provider/);
  });

  it("passes when provider and model are set", () => {
    expect(
      validateComposerForRun({
        engine: "api",
        prompt: "hi",
        kind: "image",
        params: { provider_id: "comfly", model: "m1" },
      }),
    ).toBeNull();
  });
});
