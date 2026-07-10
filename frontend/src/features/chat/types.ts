export type ChatMode = "chat" | "agent" | "image";

export interface ChatAttachment {
  url: string;
  name?: string;
  kind?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
  attachments?: ChatAttachment[];
}

export interface Conversation {
  id: string;
  title?: string;
  updated_at?: number;
  messages?: ChatMessage[];
}

export interface ChatSettings {
  mode: ChatMode;
  provider: string;
  chatModel: string;
  imageModel: string;
  imageProvider: string;
  systemPrompt: string;
}

export interface AiConfig {
  chat_model?: string;
  image_model?: string;
  chat_models?: string[];
  image_models?: string[];
  ms_chat_models?: string[];
  api_providers?: Array<{
    id: string;
    name: string;
    chat_models?: string[];
    image_models?: string[];
    enabled?: boolean;
  }>;
}
