import { streamSse } from "../../shared/api/client";
import type { ChatAttachment, ChatMode, Conversation } from "./types";

export interface StreamChatParams {
  conversationId: string;
  message: string;
  mode: ChatMode;
  systemPrompt: string;
  provider: string;
  chatModel: string;
  imageModel?: string;
  imageProvider?: string;
  imageSize?: string;
  referenceImages?: ChatAttachment[];
  signal?: AbortSignal;
}

export interface StreamChatResult {
  conversation?: Conversation;
  text: string;
}

function chatPostEndpoint(mode: ChatMode): string {
  if (mode === "agent") return "/api/chat/agent";
  if (mode === "image") return "/api/chat";
  return "/api/chat/stream";
}

function buildChatPostBody(params: StreamChatParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    conversation_id: params.conversationId,
    message: params.message,
    system_prompt: params.systemPrompt,
    mode: params.mode,
    reference_images: params.referenceImages ?? [],
    size: params.imageSize,
  };

  if (params.mode === "image") {
    const imageProvider = params.imageProvider || params.provider;
    body.provider = imageProvider;
    body.image_provider = imageProvider;
    body.image_model = params.imageModel;
    body.model = params.chatModel;
    return body;
  }

  body.provider = params.provider;
  body.model = params.chatModel;
  body.image_model = params.imageModel;
  body.image_provider = params.imageProvider;
  if (params.provider === "modelscope" && params.chatModel) {
    body.ms_model = params.chatModel;
  }
  return body;
}

export async function streamChatMessage(
  params: StreamChatParams,
  onDelta?: (text: string) => void,
): Promise<StreamChatResult> {
  if (params.mode === "agent" || params.mode === "image") {
    const { api } = await import("../../shared/api/client");
    const data = await api.post<{ conversation: Conversation }>(
      chatPostEndpoint(params.mode),
      buildChatPostBody(params),
    );
    const messages = data.conversation.messages ?? [];
    const last = messages[messages.length - 1];
    const text = last?.content ?? "";
    onDelta?.(text);
    return { conversation: data.conversation, text };
  }

  let conversation: Conversation | undefined;
  let text = "";
  const streamBody: Record<string, unknown> = {
    conversation_id: params.conversationId,
    message: params.message,
    system_prompt: params.systemPrompt,
    mode: "chat",
    model: params.chatModel,
    provider: params.provider,
    reference_images: params.referenceImages ?? [],
  };
  if (params.provider === "modelscope" && params.chatModel) {
    streamBody.ms_model = params.chatModel;
  }
  for await (const event of streamSse("/api/chat/stream", streamBody, params.signal)) {
    if (event.type === "meta" && event.conversation) {
      conversation = event.conversation as Conversation;
    }
    if (event.type === "delta" && typeof event.delta === "string") {
      text += event.delta;
      onDelta?.(text);
    }
    if (event.type === "error") {
      throw new Error(String(event.detail ?? "Request failed"));
    }
    if (event.type === "done" && event.conversation) {
      conversation = event.conversation as Conversation;
      const messages = conversation.messages ?? [];
      const last = messages[messages.length - 1];
      if (last?.content) text = last.content;
    }
  }
  return { conversation, text };
}
