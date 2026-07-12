import type { LegacyConnection, LegacyNode } from "./types";
import { loopInputImageRefs, renderLoopPrompt } from "./loop";

/** Fork-first from history `generatorSources` / `orderedSources` (classic scope). */
export interface GeneratorSource {
  id: string;
  type: string;
  prompt: string;
  refs: Array<{ url: string; name?: string; kind?: string }>;
}

export interface GenerationContext {
  loopIndex?: number;
  loopTotal?: number;
}

const MEDIA_OUTPUT_KINDS = new Set([
  "generator",
  "comfy",
  "msgen",
  "video",
  "rh",
  "ltxDirector",
]);

function sourceFromNode(
  node: LegacyNode,
  allNodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): GeneratorSource | GeneratorSource[] | null {
  if (node.kind === "image") {
    const url = node.images?.[0]?.url;
    if (!url) return null;
    return {
      id: node.id,
      type: "image",
      prompt: "",
      refs: [
        {
          url,
          name: node.title,
          kind: node.images[0].kind || "image",
        },
      ],
    };
  }

  if (node.kind === "prompt") {
    const text = String(node.settings?.text ?? node.prompt ?? "").trim();
    if (!text) return null;
    return { id: node.id, type: "prompt", prompt: text, refs: [] };
  }

  if (MEDIA_OUTPUT_KINDS.has(node.kind)) {
    const url = node.images?.[0]?.url;
    if (!url) return null;
    return {
      id: `${node.id}:generated:0`,
      type: "generatedImage",
      prompt: node.prompt || "",
      refs: [{ url, name: node.title, kind: node.images[0].kind || "image" }],
    };
  }

  if (node.kind === "group" && Array.isArray(node.settings?.items)) {
    const itemIds = node.settings.items as string[];
    return itemIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n))
      .flatMap((child) => {
        const src = sourceFromNode(child, allNodes, connections, ctx);
        if (!src) return [];
        return Array.isArray(src) ? src : [src];
      });
  }

  if (node.kind === "promptGroup" && Array.isArray(node.settings?.items)) {
    const itemIds = node.settings.items as string[];
    return itemIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n && n.kind === "prompt"))
      .map((p) => ({
        id: p.id,
        type: "prompt",
        prompt: String(p.prompt ?? p.settings?.text ?? "").trim(),
        refs: [] as GeneratorSource["refs"],
      }))
      .filter((s) => s.prompt);
  }

  if (node.kind === "loop") {
    const prompt = renderLoopPrompt(node, allNodes, connections, {
      index: ctx.loopIndex,
      total: ctx.loopTotal,
    });
    const refs = loopInputImageRefs(node, allNodes, connections, {
      index: ctx.loopIndex,
    });
    if (!prompt && !refs.length) return null;
    return {
      id: node.id,
      type: "loop",
      prompt,
      refs: refs.map((r) => ({ url: r.url, name: r.name, kind: "image" })),
    };
  }

  if (node.kind === "llm") {
    const text = String(node.settings?.outputText ?? node.prompt ?? "").trim();
    if (!text) return null;
    return { id: node.id, type: "llm", prompt: text, refs: [] };
  }

  return null;
}

export function generatorSources(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): GeneratorSource[] {
  const incoming = connections
    .filter((c) => c.to === target.id)
    .map((c) => nodes.find((n) => n.id === c.from))
    .filter((n): n is LegacyNode => Boolean(n));

  return incoming
    .flatMap((n) => {
      const src = sourceFromNode(n, nodes, connections, ctx);
      if (!src) return [];
      return Array.isArray(src) ? src : [src];
    })
    .filter(Boolean);
}

export function collectGenerationInput(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): { prompt: string; refs: string[] } {
  const sources = generatorSources(target, nodes, connections, ctx);
  const prompt = sources
    .map((s) => s.prompt)
    .filter(Boolean)
    .join("\n\n");
  const refs = sources
    .flatMap((s) => s.refs.map((r) => r.url))
    .filter(Boolean);
  return { prompt, refs };
}

/** Fork-first from history `llmInputText`. */
export function collectLlmInput(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string {
  return connections
    .filter((c) => c.to === target.id)
    .map((c) => nodes.find((n) => n.id === c.from))
    .filter((n): n is LegacyNode => Boolean(n))
    .map((n) => {
      if (n.kind === "prompt") {
        return String(n.settings?.text ?? n.prompt ?? "").trim();
      }
      if (n.kind === "promptGroup" && Array.isArray(n.settings?.items)) {
        return (n.settings.items as string[])
          .map((id) => nodes.find((x) => x.id === id))
          .filter((x): x is LegacyNode => Boolean(x?.kind === "prompt"))
          .map((p) => String(p.prompt ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
      }
      if (n.kind === "llm") {
        return String(n.settings?.outputText ?? n.prompt ?? "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
