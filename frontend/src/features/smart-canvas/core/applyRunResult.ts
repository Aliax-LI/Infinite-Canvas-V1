import type { ComposerSettings, SmartNode } from "./types";

/** Fork-first from history `runGeneration`: image/video/group cards are runnable subjects. */
export function isSmartRunnableTarget(node: SmartNode | null | undefined): boolean {
  if (!node) return false;
  return node.kind === "image" || node.kind === "video" || node.kind === "group" || node.kind === "workflow";
}

export function smartNodeHasMedia(node: SmartNode): boolean {
  return (node.images ?? []).some((img) => Boolean(img?.url));
}

/**
 * History creates a branch output card when the selected card already has media
 * (or is a group). Empty import cards receive results in-place.
 */
export function shouldCreateBranchOutput(node: SmartNode): boolean {
  if (node.kind === "group") return true;
  return smartNodeHasMedia(node);
}

export function branchOutputPosition(source: SmartNode): { x: number; y: number } {
  return {
    x: source.x + (source.width ?? 280) + 40,
    y: source.y,
  };
}

export interface ApplySmartRunPlan {
  mode: "update" | "branch" | "create";
  sourceId?: string;
  targetPatch?: Partial<SmartNode>;
  createPartial?: Partial<SmartNode> & { kind: string };
  connectFrom?: string;
  selectId?: "source" | "created";
}

/** Pure plan for attaching generation URLs to cards (history finalizePendingNode / branch). */
export function planApplyImageResult(
  source: SmartNode | null,
  urls: string[],
  composer: ComposerSettings,
): ApplySmartRunPlan {
  const images = urls.map((url) => ({ url, kind: composer.kind }));
  const settings = {
    engine: composer.engine,
    kind: composer.kind,
    params: composer.params,
  };

  if (!source || !isSmartRunnableTarget(source)) {
    return {
      mode: "create",
      createPartial: {
        kind: composer.kind === "video" ? "video" : "image",
        x: 300,
        y: 200,
        title: "生成结果",
        prompt: composer.prompt,
        images,
        settings,
        status: "done",
      },
      selectId: "created",
    };
  }

  if (shouldCreateBranchOutput(source)) {
    const pos = branchOutputPosition(source);
    return {
      mode: "branch",
      sourceId: source.id,
      createPartial: {
        kind: composer.kind === "video" ? "video" : "image",
        x: pos.x,
        y: pos.y,
        title: "生成结果",
        prompt: composer.prompt,
        images,
        settings,
        status: "done",
      },
      connectFrom: source.id,
      selectId: "created",
    };
  }

  const nextTitle =
    !source.title || source.title === "导入节点" ? "Image" : source.title;
  return {
    mode: "update",
    sourceId: source.id,
    targetPatch: {
      images,
      title: nextTitle,
      prompt: composer.prompt,
      settings: { ...source.settings, ...settings },
      status: "done",
    },
    selectId: "source",
  };
}
