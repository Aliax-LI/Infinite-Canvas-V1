import type { LegacyConnection, LegacyNode } from "./types";

export interface LoopContext {
  index?: number;
  total?: number;
}

export function loopCount(settings: Record<string, unknown>): number {
  return Math.max(1, Math.min(100, Number(settings.count) || 1));
}

function splitPromptIntoItems(text: string): string[] {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const numbered = trimmed
    .split(/\s*(?:^|\s)\d+\s*[.、)）．]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered;
  const lines = trimmed.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) return lines;
  return [trimmed];
}

export function loopInputPromptItems(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string[] {
  if (!node.settings?.showPrompt) return [];
  const items: string[] = [];
  connections
    .filter((c) => c.to === node.id)
    .map((c) => nodes.find((n) => n.id === c.from))
    .filter((n): n is LegacyNode => Boolean(n))
    .forEach((src) => {
      if (src.kind === "prompt" && src.prompt.trim()) {
        items.push(src.prompt.trim());
        return;
      }
      if (src.kind === "promptGroup") {
        const childIds = Array.isArray(src.settings?.items)
          ? (src.settings.items as string[])
          : [];
        childIds.forEach((id) => {
          const p = nodes.find((n) => n.id === id);
          if (p?.prompt?.trim()) items.push(p.prompt.trim());
        });
      }
      if (src.kind === "loop") {
        const nested = renderLoopPrompt(src, nodes, connections, { index: 1 });
        if (nested) items.push(nested);
      }
    });
  return items;
}

export function loopInputPrompt(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: LoopContext = {},
): string {
  const items = loopInputPromptItems(node, nodes, connections);
  if (!items.length) return "";
  const startBase = Math.max(1, Number(node.settings?.loopStart) || 1);
  const currentIndex = Math.max(1, Number(ctx.index || startBase) || startBase);
  return items[(currentIndex - 1) % items.length];
}

export function renderLoopPrompt(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: LoopContext = {},
): string {
  if (!node.settings?.showPrompt) return "";
  const variable = String(node.settings?.variablePrompt || "").trim();
  const count = loopCount(node.settings ?? {});
  const index = Math.max(1, Number(ctx.index) || 1);
  const total = Math.max(1, Number(ctx.total) || count);
  const replaceVars = (text: string) =>
    String(text || "")
      .replaceAll("《计数》", String(index))
      .replaceAll("《总数》", String(total))
      .replaceAll("《进度》", `${index}/${total}`);
  const selected = loopInputPrompt(node, nodes, connections, ctx);
  if (selected) return replaceVars(selected);
  return replaceVars(variable);
}

export function imageRefsFromLegacyNode(
  node: LegacyNode,
  nodes: LegacyNode[],
): { url: string; name?: string }[] {
  if (node.kind === "image" && node.images?.[0]?.url) {
    return [{ url: node.images[0].url, name: node.images[0].name }];
  }
  if (node.kind === "group" || node.kind === "promptGroup") {
    const items = Array.isArray(node.settings?.items)
      ? (node.settings.items as string[])
      : [];
    return items
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n?.images?.[0]?.url))
      .map((n) => ({ url: n.images![0].url, name: n.images![0].name }));
  }
  if (node.kind === "output") {
    return (node.images ?? [])
      .filter((img) => img.url)
      .map((img, i) => ({ url: img.url, name: img.name || `output-${i + 1}` }));
  }
  return [];
}

export function loopInputImageRefs(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: LoopContext = {},
): { url: string; name?: string }[] {
  if (!node.settings?.imageInput) return [];
  const allRefs = connections
    .filter((c) => c.to === node.id)
    .flatMap((c) => {
      const src = nodes.find((n) => n.id === c.from);
      return src ? imageRefsFromLegacyNode(src, nodes) : [];
    })
    .filter((ref) => ref.url);
  if (!allRefs.length) return [];
  const startBase = Math.max(1, Number(node.settings?.loopStart) || 1);
  const batchSize = Math.max(
    1,
    Math.min(100, Number(node.settings?.imageBatchSize) || 1),
  );
  const currentIndex = Math.max(1, Number(ctx.index || startBase) || startBase);
  const start = Math.max(0, currentIndex - 1);
  return allRefs.slice(start, start + batchSize);
}

export function findLoopCascadeTarget(
  loopId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string {
  const runKinds = new Set([
    "generator",
    "msgen",
    "comfy",
    "ltxDirector",
    "video",
    "rh",
    "llm",
  ]);
  const seen = new Set<string>();
  const candidates: { id: string; depth: number }[] = [];
  const walk = (id: string, depth = 0) => {
    if (seen.has(id)) return;
    seen.add(id);
    connections
      .filter((c) => c.from === id)
      .forEach((c) => {
        const next = nodes.find((n) => n.id === c.to);
        if (!next) return;
        if (runKinds.has(next.kind)) {
          candidates.push({ id: next.id, depth: depth + 1 });
        }
        walk(next.id, depth + 1);
      });
  };
  walk(loopId);
  const sorted = candidates.sort((a, b) => b.depth - a.depth);
  return sorted[0]?.id || "";
}

export { splitPromptIntoItems };
