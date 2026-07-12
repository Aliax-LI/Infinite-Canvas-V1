export interface AnnotationProvider {
  id: string;
  name?: string;
  chat_models?: string[];
  enabled?: boolean;
}

const VISION_MODEL_KEYS = [
  "vision",
  "vl-",
  "-vl-",
  "internvl",
  "qvq",
  "qwen-vl",
  "qwen2-vl",
  "qwen3-vl",
  "doubao-vision",
  "glm-4v",
  "minicpm-v",
  "llava",
  "moondream",
  "cogvlm",
  "gemini",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-turbo",
  "gpt-5",
  "o1",
  "o3",
  "o4",
  "claude-3",
  "claude-4",
  "claude-opus",
  "claude-sonnet",
  "claude-haiku",
  "deepseek-vl",
  "mimo-vl",
];

/** Heuristic: model name suggests vision / multimodal chat capability. */
export function looksLikeVisionChatModel(model: string): boolean {
  const lc = String(model || "").trim().toLowerCase();
  if (!lc) return false;
  return VISION_MODEL_KEYS.some((key) => lc.includes(key));
}

/** Prefer vision-capable chat models; fall back to full list if none match. */
export function filterAnnotationChatModels(chatModels: string[] = []): string[] {
  const unique = [...new Set(chatModels.map((m) => String(m || "").trim()).filter(Boolean))];
  const vision = unique.filter(looksLikeVisionChatModel);
  return vision.length ? vision : unique;
}

export function annotationCapableProviders(providers: AnnotationProvider[]): AnnotationProvider[] {
  return providers
    .filter((p) => p.enabled !== false)
    .map((p) => ({
      ...p,
      chat_models: filterAnnotationChatModels(p.chat_models ?? []),
    }))
    .filter((p) => (p.chat_models?.length ?? 0) > 0);
}
