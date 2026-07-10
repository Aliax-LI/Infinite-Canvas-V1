import type { SmartNode } from "./types";

/** Legacy `type` field → React `kind` */
export const LEGACY_TYPE_TO_KIND: Record<string, string> = {
  "smart-image": "image",
  "smart-prompt": "prompt",
  "smart-loop": "loop",
  "smart-group": "group",
  "smart-export": "export",
};

export const KIND_TO_LEGACY_TYPE: Record<string, string> = {
  image: "smart-image",
  prompt: "smart-prompt",
  loop: "smart-loop",
  group: "smart-group",
  export: "smart-export",
};

export function resolveKind(raw: Record<string, unknown>): string {
  const legacyType = raw.type != null ? String(raw.type) : "";
  if (legacyType && LEGACY_TYPE_TO_KIND[legacyType]) {
    return LEGACY_TYPE_TO_KIND[legacyType];
  }
  const kind = raw.kind != null ? String(raw.kind) : "";
  if (kind) return kind;
  return "image";
}

export function isSmartImageNode(node: SmartNode): boolean {
  return node.kind === "image" || !node.kind;
}

export function isSmartGroupNode(node: SmartNode): boolean {
  return node.kind === "group";
}

export function isHistoryGroupNode(node: SmartNode): boolean {
  return Boolean(node.settings?.isHistoryGroup || node.settings?.historyFor);
}

export function canAutoConnectNodes(source: SmartNode, target: SmartNode): boolean {
  if (source.id === target.id) return false;
  if (isHistoryGroupNode(source) || isHistoryGroupNode(target)) return false;
  if (isSmartGroupNode(target)) return false;
  if (isSmartImageNode(source)) {
    return (
      isSmartImageNode(target) ||
      target.kind === "loop" ||
      target.kind === "prompt"
    );
  }
  if (source.kind === "prompt") {
    return isSmartImageNode(target) || target.kind === "loop";
  }
  if (source.kind === "loop") return isSmartImageNode(target);
  if (source.kind === "group") {
    return isSmartImageNode(target) || target.kind === "loop";
  }
  return false;
}

export function extractMemberIds(raw: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(raw.member_ids)) {
    return raw.member_ids.map(String);
  }
  if (Array.isArray(raw.items)) {
    return raw.items.map(String);
  }
  return undefined;
}

export function extractLoopSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "count",
    "mode",
    "showPrompt",
    "imageInput",
    "loopStart",
    "imageBatchSize",
    "variablePrompt",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  return out;
}

export function extractPromptSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "text",
    "promptSeparator",
    "promptSplitEnabled",
    "llmEnabled",
    "llmProvider",
    "llmModel",
    "llmSystemEnabled",
    "llmSystemPrompt",
    "llmInstruction",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  return out;
}
