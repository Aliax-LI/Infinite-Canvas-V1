import { imageCaption } from "./imageFit";
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

export interface LlmMediaRef {
  url: string;
  name?: string;
  kind: "image" | "video";
}

/**
 * Prompt body text. History uses `node.text`; React editor writes `node.prompt`.
 * `defaultSettingsForKind("prompt")` seeds `settings.text: ""`, which must NOT
 * win via `??` over a non-empty `node.prompt` (empty string is not nullish).
 */
export function promptNodeText(node: LegacyNode): string {
  const fromSettings = String(node.settings?.text ?? "").trim();
  if (fromSettings) return fromSettings;
  return String(node.prompt ?? "").trim();
}

const MEDIA_OUTPUT_KINDS = new Set([
  "generator",
  "comfy",
  "msgen",
  "video",
  "rh",
  "ltxDirector",
]);

function mediaKindOf(
  kind: string | undefined,
  url: string,
): "image" | "video" | "audio" | "other" {
  const k = String(kind || "").toLowerCase();
  if (k === "video" || /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) return "video";
  if (k === "audio" || /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url)) return "audio";
  if (k === "image" || k === "" || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url)) {
    return "image";
  }
  return "other";
}

function imageDisplayName(node: LegacyNode, url: string): string {
  return (
    imageCaption(node.title, node.images?.[0]?.name, url) ||
    node.images?.[0]?.name ||
    node.title ||
    "image"
  );
}

function outputUrlValue(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "url" in item) {
    return String((item as { url?: string }).url ?? "");
  }
  return "";
}

function incomingNodes(
  targetId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): LegacyNode[] {
  return connections
    .filter((c) => c.to === targetId)
    .map((c) => nodes.find((n) => n.id === c.from))
    .filter((n): n is LegacyNode => Boolean(n));
}

/**
 * History `llmInputImages` / `llmInputVideos` — media wired directly into an LLM.
 */
export function collectLlmMedia(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): { images: LlmMediaRef[]; videos: LlmMediaRef[] } {
  const images: LlmMediaRef[] = [];
  const videos: LlmMediaRef[] = [];

  const pushUrl = (url: string, name?: string, kindHint?: string) => {
    if (!url) return;
    const kind = mediaKindOf(kindHint, url);
    if (kind === "video") videos.push({ url, name, kind: "video" });
    else if (kind === "image") images.push({ url, name, kind: "image" });
  };

  for (const n of incomingNodes(target.id, nodes, connections)) {
    if (n.kind === "image") {
      const url = n.images?.[0]?.url;
      if (url) pushUrl(url, imageDisplayName(n, url), n.images[0].kind);
      continue;
    }
    if (n.kind === "output" && n.images?.length) {
      const reversed = [...n.images].reverse();
      for (const item of reversed) {
        const url = outputUrlValue(item);
        if (!url) continue;
        const kind = mediaKindOf(item.kind, url);
        if (kind === "audio") continue;
        pushUrl(url, item.name || imageDisplayName(n, url), item.kind);
        break;
      }
      continue;
    }
    if (n.kind === "group" && Array.isArray(n.settings?.items)) {
      for (const id of n.settings.items as string[]) {
        const child = nodes.find((x) => x.id === id);
        if (child?.kind !== "image") continue;
        const url = child.images?.[0]?.url;
        if (url) {
          pushUrl(url, imageDisplayName(child, url), child.images[0].kind);
        }
      }
    }
  }

  return { images, videos };
}

/** Fork-first from history `llmInputText`. */
export function collectLlmInput(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): string {
  return incomingNodes(target.id, nodes, connections)
    .map((n) => {
      if (n.kind === "prompt") {
        return promptNodeText(n);
      }
      if (n.kind === "loop") {
        return renderLoopPrompt(n, nodes, connections, {
          index: ctx.loopIndex,
          total: ctx.loopTotal,
        }).trim();
      }
      if (n.kind === "promptGroup" && Array.isArray(n.settings?.items)) {
        return (n.settings.items as string[])
          .map((id) => nodes.find((x) => x.id === id))
          .filter((x): x is LegacyNode => Boolean(x?.kind === "prompt"))
          .map((p) => promptNodeText(p))
          .filter(Boolean)
          .join("\n\n");
      }
      if (n.kind === "llm") {
        return String(n.settings?.outputText ?? "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

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
      type: mediaKindOf(node.images[0].kind, url),
      prompt: "",
      refs: [
        {
          url,
          name: imageDisplayName(node, url),
          kind: node.images[0].kind || "image",
        },
      ],
    };
  }

  if (node.kind === "prompt") {
    const text = promptNodeText(node);
    if (!text) return null;
    return { id: node.id, type: "prompt", prompt: text, refs: [] };
  }

  if (node.kind === "output" && node.images?.length) {
    const reversed = [...node.images]
      .map((item, index) => ({ item, index }))
      .reverse();
    const found = reversed.find((entry) => outputUrlValue(entry.item));
    if (!found) return null;
    const url = outputUrlValue(found.item);
    return {
      id: node.id,
      type: "outputImage",
      prompt: "",
      refs: [
        {
          url,
          name: found.item.name || imageDisplayName(node, url) || "output.png",
          kind: found.item.kind || "image",
        },
      ],
    };
  }

  if (MEDIA_OUTPUT_KINDS.has(node.kind)) {
    const url = node.images?.[0]?.url;
    if (!url) return null;
    return {
      id: `${node.id}:generated:0`,
      type: "generatedImage",
      prompt: "",
      refs: [
        {
          url,
          name: imageDisplayName(node, url),
          kind: node.images[0].kind || "image",
        },
      ],
    };
  }

  if (node.kind === "group" && Array.isArray(node.settings?.items)) {
    const itemIds = node.settings.items as string[];
    const children = itemIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n));
    // History: image children as separate refs; prompts combined once (not both).
    const sources = children
      .filter((child) => child.kind !== "prompt")
      .flatMap((child) => {
        const src = sourceFromNode(child, allNodes, connections, ctx);
        if (!src) return [];
        return Array.isArray(src) ? src : [src];
      });
    const prompts = children
      .filter((c) => c.kind === "prompt")
      .map((p) => promptNodeText(p))
      .filter(Boolean);
    if (prompts.length) {
      sources.push({
        id: `${node.id}:prompts`,
        type: "groupPrompt",
        prompt: prompts.join("\n\n"),
        refs: [],
      });
    }
    return sources.length ? sources : null;
  }

  if (node.kind === "promptGroup" && Array.isArray(node.settings?.items)) {
    const itemIds = node.settings.items as string[];
    const prompts = itemIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is LegacyNode => Boolean(n && n.kind === "prompt"))
      .map((p) => promptNodeText(p))
      .filter(Boolean);
    if (!prompts.length) return null;
    return {
      id: node.id,
      type: "promptGroup",
      prompt: prompts.join("\n\n"),
      refs: [],
    };
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
    // History only forwards outputText; also passthrough wired prompt/media so
    // API/generator cards show upstream IMAGE/PROMPT through an LLM edge
    // (matches classic canvas UX when LLM has not / has just produced text).
    const output = String(node.settings?.outputText ?? "").trim();
    const wiredPrompt = collectLlmInput(node, allNodes, connections, ctx);
    const prompt = output || wiredPrompt;
    const media = collectLlmMedia(node, allNodes, connections);
    const out: GeneratorSource[] = [];
    if (prompt) {
      out.push({ id: node.id, type: "llm", prompt, refs: [] });
    }
    media.images.forEach((ref, i) => {
      out.push({
        id: `${node.id}:image:${i}:${ref.url}`,
        type: "llmImage",
        prompt: "",
        refs: [{ url: ref.url, name: ref.name, kind: "image" }],
      });
    });
    media.videos.forEach((ref, i) => {
      out.push({
        id: `${node.id}:video:${i}:${ref.url}`,
        type: "llmVideo",
        prompt: "",
        refs: [{ url: ref.url, name: ref.name, kind: "video" }],
      });
    });
    return out.length ? out : null;
  }

  return null;
}

export function generatorSources(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): GeneratorSource[] {
  return incomingNodes(target.id, nodes, connections)
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

/**
 * Effective run prompt for API/Comfy/MS/video/RH generators.
 * Wired PROMPT/LLM/loop text is primary (history `runGenerator`); local
 * `node.prompt` is an optional append when both are set.
 */
export function resolveGenerationPrompt(
  target: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  ctx: GenerationContext = {},
): {
  prompt: string;
  wiredPrompt: string;
  localPrompt: string;
  fromWire: boolean;
  refs: string[];
} {
  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    target,
    nodes,
    connections,
    ctx,
  );
  const localPrompt = String(target.prompt ?? "").trim();
  const parts = [wiredPrompt, localPrompt].filter(Boolean);
  return {
    prompt: parts.join("\n\n"),
    wiredPrompt,
    localPrompt,
    fromWire: Boolean(wiredPrompt),
    refs,
  };
}
