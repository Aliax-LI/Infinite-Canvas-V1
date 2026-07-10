import { KIND_TO_LEGACY_TYPE } from "./legacyTypes";
import { normalizeNode, type SmartNode } from "./types";

const GROUP_DEFAULT_W = 480;
const GROUP_DEFAULT_H = 320;

export function createImageNode(
  partial: Partial<SmartNode> & { x?: number; y?: number; images?: SmartNode["images"] } = {},
): SmartNode {
  const images = partial.images ?? [];
  return normalizeNode({
    id: partial.id ?? crypto.randomUUID(),
    kind: "image",
    type: KIND_TO_LEGACY_TYPE.image,
    x: partial.x ?? 100,
    y: partial.y ?? 100,
    title: partial.title ?? (images.length ? "Image" : "导入节点"),
    images,
    settings: partial.settings ?? {},
  });
}

export function createPromptNode(x = 100, y = 100): SmartNode {
  return normalizeNode({
    id: crypto.randomUUID(),
    kind: "prompt",
    type: "smart-prompt",
    x,
    y,
    w: 316,
    h: 240,
    title: "Prompt",
    text: "",
    promptSeparator: ";",
    promptSplitEnabled: false,
    llmEnabled: false,
    llmSystemPrompt: "You are a helpful prompt assistant.",
    llmInstruction: "",
  });
}

export function createLoopNode(x = 100, y = 100): SmartNode {
  return normalizeNode({
    id: crypto.randomUUID(),
    kind: "loop",
    type: "smart-loop",
    x,
    y,
    w: 340,
    h: 168,
    title: "Loop",
    count: 1,
    mode: "serial",
    showPrompt: false,
    imageInput: false,
    loopStart: 1,
    imageBatchSize: 1,
    variablePrompt: "",
  });
}

export function createSmartGroupNode(x = 100, y = 100): SmartNode {
  return normalizeNode({
    id: crypto.randomUUID(),
    kind: "group",
    type: "smart-group",
    x,
    y,
    w: GROUP_DEFAULT_W,
    h: GROUP_DEFAULT_H,
    title: "智能分组",
    items: [],
  });
}

export function createExportNode(x = 100, y = 100): SmartNode {
  return normalizeNode({
    id: crypto.randomUUID(),
    kind: "export",
    type: "smart-export",
    x,
    y,
    w: 280,
    h: 120,
    title: "导出",
  });
}

export function cloneNode(node: SmartNode, dx = 20, dy = 20): SmartNode {
  const copy = JSON.parse(JSON.stringify(node)) as SmartNode;
  copy.id = crypto.randomUUID();
  copy.x = node.x + dx;
  copy.y = node.y + dy;
  copy.status = "idle";
  return copy;
}
