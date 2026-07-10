import type { ChatMode, ChatSettings } from "./types";

const STORAGE_KEY = "chat_settings_v1";

const DEFAULTS: ChatSettings = {
  mode: "chat",
  provider: "",
  chatModel: "",
  imageModel: "",
  imageProvider: "",
  systemPrompt: "",
};

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
