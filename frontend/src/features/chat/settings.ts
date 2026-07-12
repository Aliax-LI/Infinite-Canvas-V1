import type { ChatImageRatio, ChatImageResolution, ChatMode, ChatSettings } from "./types";

const STORAGE_KEY = "chat_settings_v1";

const DEFAULTS: ChatSettings = {
  mode: "chat",
  provider: "",
  chatModel: "",
  imageModel: "",
  imageProvider: "",
  systemPrompt: "",
  imageRatio: "1:1",
  imageResolution: "auto",
  imageCustomSize: "1024x1024",
  chatProviderModels: {},
  pickerScope: "chat",
};

const VALID_RATIOS: ChatImageRatio[] = ["1:1", "2:3", "3:4", "4:3", "3:2", "9:16", "16:9"];
const VALID_RESOLUTIONS: ChatImageResolution[] = ["auto", "1k", "2k", "4k", "custom"];

const SIZE_BY_RATIO: Record<ChatImageRatio, Record<Exclude<ChatImageResolution, "auto" | "custom">, string>> = {
  "1:1": { "1k": "1024x1024", "2k": "1536x1536", "4k": "2048x2048" },
  "2:3": { "1k": "720x1080", "2k": "1024x1536", "4k": "1365x2048" },
  "3:4": { "1k": "1008x1344", "2k": "1536x2048", "4k": "2448x3264" },
  "4:3": { "1k": "1344x1008", "2k": "2048x1536", "4k": "3264x2448" },
  "3:2": { "1k": "1080x720", "2k": "1536x1024", "4k": "2048x1365" },
  "9:16": { "1k": "720x1280", "2k": "1080x1920", "4k": "1440x2560" },
  "16:9": { "1k": "1280x720", "2k": "1920x1080", "4k": "2560x1440" },
};

export function normalizeCustomImageSize(value: string): string {
  const match = String(value ?? "").trim().match(/^([1-9]\d{2,3})\s*[xX×*]\s*([1-9]\d{2,3})$/);
  if (!match) return "";
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 256 && width <= 8192 && height >= 256 && height <= 8192
    ? `${width}x${height}`
    : "";
}

export function chatImageSize(settings: ChatSettings): string {
  if (settings.imageResolution === "custom") {
    return normalizeCustomImageSize(settings.imageCustomSize) || "1024x1024";
  }
  if (settings.imageResolution === "auto") return "1024x1024";
  return SIZE_BY_RATIO[settings.imageRatio][settings.imageResolution];
}

const RATIO_KEY_BY_SIZE: Record<string, ChatImageRatio> = {
  "1:1": "1:1",
  "2:3": "2:3",
  "3:2": "3:2",
  "3:4": "3:4",
  "4:3": "4:3",
  "9:16": "9:16",
  "16:9": "16:9",
};

export function shortModelName(value: string): string {
  return String(value || "").split("/").pop()?.split(":")[0] || "Model";
}

export function chatSizeFromPrompt(message: string, settings: ChatSettings): string {
  const fallbackSize = chatImageSize(settings);
  const text = String(message || "");
  const direct = text.match(/(^|[^\d])([1-9]\d{2,3})\s*[xX×*]\s*([1-9]\d{2,3})(?!\d)/);
  if (direct) {
    const normalized = normalizeCustomImageSize(`${direct[2]}x${direct[3]}`);
    if (normalized) return normalized;
  }
  const normalized = text.replace(/[：﹕∶]/g, ":").replace(/比/g, ":").replace(/[／/]/g, ":");
  const match = normalized.match(/(^|[^\d])(1|2|3|4|9|16)\s*:\s*(1|2|3|4|9|16)(?!\d)/);
  if (!match) return fallbackSize;
  const ratio = `${Number(match[2])}:${Number(match[3])}`;
  const ratioKey = RATIO_KEY_BY_SIZE[ratio];
  if (!ratioKey) return fallbackSize;
  const wants4k = /4\s*k|4K|超清|超高分辨率/i.test(text);
  const wants2k = /2\s*k|2K|高清|高分辨率/i.test(text);
  if (settings.imageResolution === "custom" && !wants4k && !wants2k) return fallbackSize;
  const fallbackEdge = Math.max(
    ...String(fallbackSize || "")
      .split(/[xX×*]/)
      .map((n) => Number(n) || 0),
  );
  const resolution: Exclude<ChatImageResolution, "auto" | "custom"> = wants4k
    ? "4k"
    : wants2k
      ? "2k"
      : settings.imageResolution === "auto"
        ? "1k"
        : fallbackEdge >= 2400
          ? "4k"
          : fallbackEdge >= 1500
            ? "2k"
            : settings.imageResolution === "custom"
              ? "2k"
              : (settings.imageResolution as Exclude<ChatImageResolution, "auto" | "custom">);
  return SIZE_BY_RATIO[ratioKey][resolution] || fallbackSize;
}

export function loadChatSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      mode: (parsed.mode as ChatMode) ?? DEFAULTS.mode,
      provider: parsed.provider ?? DEFAULTS.provider,
      chatModel: parsed.chatModel ?? DEFAULTS.chatModel,
      imageModel: parsed.imageModel ?? DEFAULTS.imageModel,
      imageProvider: parsed.imageProvider ?? DEFAULTS.imageProvider,
      systemPrompt: parsed.systemPrompt ?? DEFAULTS.systemPrompt,
      imageRatio: VALID_RATIOS.includes(parsed.imageRatio as ChatImageRatio)
        ? (parsed.imageRatio as ChatImageRatio)
        : DEFAULTS.imageRatio,
      imageResolution: VALID_RESOLUTIONS.includes(parsed.imageResolution as ChatImageResolution)
        ? (parsed.imageResolution as ChatImageResolution)
        : DEFAULTS.imageResolution,
      imageCustomSize: normalizeCustomImageSize(parsed.imageCustomSize ?? "") || DEFAULTS.imageCustomSize,
      chatProviderModels:
        parsed.chatProviderModels && typeof parsed.chatProviderModels === "object"
          ? parsed.chatProviderModels
          : DEFAULTS.chatProviderModels,
      pickerScope: parsed.pickerScope === "image" ? "image" : "chat",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveChatSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
