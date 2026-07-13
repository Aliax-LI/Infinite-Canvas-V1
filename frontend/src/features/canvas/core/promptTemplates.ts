import type { PromptLibraryDoc, PromptTemplate } from "../../../types/api";

/** Shared react-query key for `/api/prompt-libraries` (canvas template panel + asset manager). */
export const PROMPT_LIBRARIES_QUERY_KEY = ["prompt-libraries"] as const;

export const BUILTIN_CATEGORY_IDS = new Set([
  "view",
  "storyboard",
  "character",
  "product",
  "lighting",
  "custom",
  "mine",
]);

export const DEFAULT_PROMPT_CATEGORIES = [
  { id: "view", nameKey: "promptTemplateView" as const },
  { id: "storyboard", nameKey: "promptTemplateStoryboard" as const },
  { id: "character", nameKey: "promptTemplateCharacter" as const },
  { id: "product", nameKey: "promptTemplateProduct" as const },
  { id: "lighting", nameKey: "promptTemplateLighting" as const },
  { id: "custom", nameKey: "promptTemplateMine" as const },
];

export interface PromptTemplateItem extends PromptTemplate {
  id: string;
  name: string;
  positive: string;
  builtin: boolean;
  libraryId: string;
  libraryName: string;
}

export function templateName(item: Pick<PromptTemplate, "name" | "title">): string {
  return String(item.name || item.title || "").trim();
}

export function templatePositive(item: Pick<PromptTemplate, "positive" | "content">): string {
  return String(item.positive || item.content || "").trim();
}

export function templateScene(item: Pick<PromptTemplate, "scene">): string {
  return String(item.scene || "").trim();
}

export function templateApplyText(
  item: Pick<PromptTemplate, "positive" | "content" | "negative" | "params">,
  mode: "positive" | "full" = "positive",
): string {
  const positive = templatePositive(item);
  if (mode === "positive") return positive;
  const negative = String(item.negative || "").trim();
  const params = Object.entries(item.params || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return [
    positive,
    negative ? `Negative prompt:\n${negative}` : "",
    params ? `Params:\n${params}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeLibraryItems(
  libraries: PromptLibraryDoc[],
  activeLibraryId: string,
): PromptTemplateItem[] {
  const active = libraries.find((lib) => lib.id === activeLibraryId) || libraries[0];
  if (!active) return [];

  const mapItem = (
    item: PromptTemplate,
    lib: PromptLibraryDoc,
    builtin: boolean,
  ): PromptTemplateItem | null => {
    const positive = templatePositive(item);
    if (!item.id || !positive) return null;
    return {
      ...item,
      id: item.id,
      name: templateName(item) || positive.slice(0, 24),
      positive,
      negative: item.negative || "",
      scene: templateScene(item),
      category: item.category || "custom",
      params: item.params || {},
      builtin,
      libraryId: lib.id,
      libraryName: lib.name || "",
    };
  };

  if (active.id !== "system") {
    return (active.items || [])
      .map((item) => mapItem(item, active, false))
      .filter((item): item is PromptTemplateItem => Boolean(item));
  }

  const system = libraries.find((lib) => lib.id === "system") || active;
  const builtins = (system.items || [])
    .map((item) => mapItem(item, system, true))
    .filter((item): item is PromptTemplateItem => Boolean(item));
  const remotes = libraries
    .filter((lib) => lib.id !== "system")
    .flatMap((lib) =>
      (lib.items || [])
        .map((item) => mapItem(item, lib, false))
        .filter((item): item is PromptTemplateItem => Boolean(item)),
    );
  return [...builtins, ...remotes];
}

export function filterPromptTemplates(
  items: PromptTemplateItem[],
  category: string,
  query: string,
): PromptTemplateItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== "all" && (item.category || "custom") !== category) return false;
    if (!q) return true;
    const haystack = [
      item.name,
      item.scene,
      item.positive,
      item.negative,
      item.category,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function defaultTemplateNameFromText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 24) || "新模板";
}
