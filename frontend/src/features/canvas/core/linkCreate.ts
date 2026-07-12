import { canConnect } from "./connectRules";
import type { LegacyConnection, LegacyNode } from "./types";

export interface LinkCreateState {
  originId: string;
  originKind: "in" | "out";
  worldX: number;
  worldY: number;
}

export interface LinkCreateOption {
  kind: string;
  labelKey: string;
  defaultLabel: string;
}

const GENERATOR_KINDS = new Set([
  "generator",
  "msgen",
  "comfy",
  "ltxDirector",
  "video",
  "rh",
  "llm",
]);

const OUT_ORIGIN_KINDS = new Set([
  "image",
  "prompt",
  "promptGroup",
  "loop",
  "group",
  "llm",
  "output",
]);

/** Fork-first: history `linkCreateOptions`, filtered by canConnect. */
export function linkCreateOptions(
  state: Pick<LinkCreateState, "originId" | "originKind">,
  nodes: LegacyNode[],
  connections: LegacyConnection[] = [],
): LinkCreateOption[] {
  const node = nodes.find((n) => n.id === state.originId);
  if (!node) return [];

  const probe = (kind: string): boolean => {
    const phantomId = `__link_create_${kind}`;
    const phantom: LegacyNode = {
      id: phantomId,
      kind,
      x: 0,
      y: 0,
      width: 280,
      height: 200,
      title: kind,
      prompt: "",
      images: [],
      settings:
        kind === "loop"
          ? { showPrompt: true, imageInput: true, showImageInput: true }
          : {},
    };
    const probeNodes = [...nodes, phantom];
    if (state.originKind === "out") {
      return canConnect(node.id, phantomId, probeNodes, connections);
    }
    return canConnect(phantomId, node.id, probeNodes, connections);
  };

  if (state.originKind === "out") {
    if (!OUT_ORIGIN_KINDS.has(node.kind)) return [];
    const options: LinkCreateOption[] = [
      { kind: "generator", labelKey: "apiGenerate", defaultLabel: "API Generate" },
      { kind: "msgen", labelKey: "modelscopeGenerate", defaultLabel: "ModelScope" },
      { kind: "comfy", labelKey: "comfyGenerate", defaultLabel: "ComfyUI" },
      { kind: "rh", labelKey: "rhGenerate", defaultLabel: "RunningHub" },
      { kind: "ltxDirector", labelKey: "ltxDirector", defaultLabel: "LTX Director" },
      { kind: "video", labelKey: "videoGenerateNode", defaultLabel: "Video" },
    ];
    if (node.kind !== "output") {
      options.push({ kind: "llm", labelKey: "llmNode", defaultLabel: "LLM" });
    }
    return options.filter((o) => probe(o.kind));
  }

  if (GENERATOR_KINDS.has(node.kind) || node.kind === "llm") {
    return [
      { kind: "image", labelKey: "image", defaultLabel: "Image" },
      { kind: "prompt", labelKey: "prompt", defaultLabel: "Prompt" },
      { kind: "loop", labelKey: "loopNode", defaultLabel: "Loop" },
      { kind: "group", labelKey: "group", defaultLabel: "Group" },
      { kind: "llm", labelKey: "llmNode", defaultLabel: "LLM" },
    ].filter((o) => probe(o.kind));
  }

  return [];
}

const GENERATOR_OUT_AUTO_OUTPUT = new Set([
  "generator",
  "msgen",
  "comfy",
  "ltxDirector",
  "video",
  "rh",
]);

/** Create node at point and wire to origin (fork-first: `createLinkedNode`). */
export function createLinkedNodeAt(
  kind: string,
  originId: string,
  originKind: "in" | "out",
  worldX: number,
  worldY: number,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  addNodeAtKind: (kind: string, x: number, y: number) => LegacyNode,
  addConnection: (from: string, to: string) => void,
): LegacyNode | null {
  const origin = nodes.find((n) => n.id === originId);
  if (!origin) return null;
  const created = addNodeAtKind(kind, worldX, worldY);
  const fromId = originKind === "out" ? origin.id : created.id;
  const toId = originKind === "out" ? created.id : origin.id;
  const probeNodes = [...nodes.filter((n) => n.id !== created.id), created];
  if (!canConnect(fromId, toId, probeNodes, connections)) {
    return created;
  }
  addConnection(fromId, toId);
  return created;
}

export function shouldAutoCreateOutputOnDrag(
  originId: string,
  originKind: "in" | "out",
  nodes: LegacyNode[],
): boolean {
  if (originKind !== "out") return false;
  const origin = nodes.find((n) => n.id === originId);
  return Boolean(origin && GENERATOR_OUT_AUTO_OUTPUT.has(origin.kind));
}
