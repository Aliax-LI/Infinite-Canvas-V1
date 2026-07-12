export type ChatMode = "chat" | "agent" | "image";
export type ChatPickerScope = "chat" | "image";

export interface ChatAttachment {
  url: string;
  name?: string;
  kind?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
  type?: "image" | "text";
  image_url?: string;
  image_urls?: string[];
  agent_action?: string;
  agent_reply?: string;
  model?: string;
  size?: string;
  attachments?: ChatAttachment[];
  error?: boolean;
  /** Local-only: waiting for model / tool (thinking, agent, image). */
  pending?: boolean;
}

export interface Conversation {
  id: string;
  title?: string;
  updated_at?: number;
  last_message?: string;
  messages?: ChatMessage[];
}

export interface ChatSettings {
  mode: ChatMode;
  provider: string;
  chatModel: string;
  imageModel: string;
  imageProvider: string;
  systemPrompt: string;
  imageRatio: ChatImageRatio;
  imageResolution: ChatImageResolution;
  imageCustomSize: string;
  chatProviderModels: Record<string, string>;
  pickerScope: ChatPickerScope;
}

export type ChatImageRatio =
  | "1:1"
  | "2:3"
  | "3:4"
  | "4:3"
  | "3:2"
  | "9:16"
  | "16:9";

export type ChatImageResolution = "auto" | "1k" | "2k" | "4k" | "custom";

export interface AiConfig {
  chat_model?: string;
  image_model?: string;
  chat_models?: string[];
  image_models?: string[];
  ms_chat_models?: string[];
  api_providers?: Array<{
    id: string;
    name: string;
    protocol?: string;
    chat_models?: string[];
    image_models?: string[];
    video_models?: string[];
    enabled?: boolean;
    primary?: boolean;
  }>;
  video_models?: string[];
}
