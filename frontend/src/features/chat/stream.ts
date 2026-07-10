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
  referenceImages?: ChatAttachment[];
  signal?: AbortSignal;
}

export interface StreamChatResult {
  conversation?: Conversation;
  text: string;
}

export async function streamChatMessage(
  params: StreamChatParams,
  onDelta?: (text: string) => void,
): Promise<StreamChatResult> {
  const endpoint =
    params.mode === "agent" ? "/api/chat/agent" : "/api/chat/stream";

  if (params.mode === "agent" || params.mode === "image") {
    const { api } = await import("../../shared/api/client");
    const body: Record<string, unknown> = {
      conversation_id: params.conversationId,
      message: params.message,
      system_prompt: params.systemPrompt,
      mode: params.mode,
      model: params.chatModel,
      provider: params.mode === "image" ? params.imageProvider : params.provider,
      reference_images: params.referenceImages ?? [],
    };
    if (params.mode === "agent") {
      body.image_model = params.imageModel;
      body.image_provider = params.imageProvider;
    } else {
      body.image_model = params.imageModel;
    }
    const data = await api.post<{ conversation: Conversation }>(endpoint, body);
    const messages = data.conversation.messages ?? [];
    const last = messages[messages.length - 1];
    const text = last?.content ?? "";
    onDelta?.(text);
    return { conversation: data.conversation, text };
  }

  let conversation: Conversation | undefined;
  let text = "";
  for await (const event of streamSse(
    "/api/chat/stream",
    {
      conversation_id: params.conversationId,
      message: params.message,
      system_prompt: params.systemPrompt,
      mode: "chat",
      model: params.chatModel,
      provider: params.provider,
      reference_images: params.referenceImages ?? [],
    },
    params.signal,
  )) {
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
