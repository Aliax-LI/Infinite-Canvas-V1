import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { loadChatSettings, saveChatSettings } from "./settings";
import { streamChatMessage } from "./stream";
import type {
  AiConfig,
  ChatAttachment,
  ChatMessage,
  ChatMode,
  ChatSettings,
  Conversation,
} from "./types";

const MAX_ATTACHMENTS = 20;

export function ChatPage() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(loadChatSettings);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: listData } = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      api.get<{ conversations: Conversation[] }>("/api/conversations"),
  });

  const { data: configData } = useQuery({
    queryKey: ["chat-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ conversation: Conversation }>("/api/conversations", {
        title: t("chat.newConversation"),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(res.conversation.id);
      setMessages(res.conversation.messages ?? []);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    },
  });

  useEffect(() => {
    saveChatSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!configData) return;
    setSettings((prev) => {
      const providers = (configData.api_providers ?? []).filter(
        (p) => p.enabled !== false,
      );
      const provider = prev.provider || providers[0]?.id || "";
      const providerCfg = providers.find((p) => p.id === provider);
      return {
        ...prev,
        provider,
        chatModel:
          prev.chatModel ||
          configData.chat_model ||
          providerCfg?.chat_models?.[0] ||
          configData.chat_models?.[0] ||
          "",
        imageModel:
          prev.imageModel ||
          configData.image_model ||
          providerCfg?.image_models?.[0] ||
          configData.image_models?.[0] ||
          "",
        imageProvider: prev.imageProvider || provider,
      };
    });
  }, [configData]);

  const providers = (configData?.api_providers ?? []).filter(
    (p) => p.enabled !== false,
  );
  const chatModels =
    settings.provider === "modelscope"
      ? configData?.ms_chat_models ?? []
      : providers.find((p) => p.id === settings.provider)?.chat_models?.length
        ? providers.find((p) => p.id === settings.provider)!.chat_models!
        : configData?.chat_models ?? [];

  const loadConversation = useCallback(async (id: string) => {
    const res = await api.get<{ conversation: Conversation }>(
      `/api/conversations/${id}`,
    );
    setActiveId(id);
    setMessages(res.conversation.messages ?? []);
  }, []);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = [...files];
    const available = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!available) return;
    const form = new FormData();
    list.slice(0, available).forEach((f) => form.append("files", f));
    try {
      const res = await api.upload<{ files?: ChatAttachment[] }>(
        "/api/ai/upload",
        form,
      );
      setAttachments((prev) =>
        [...prev, ...(res.files ?? [])].slice(0, MAX_ATTACHMENTS),
      );
    } catch {
      /* ignore */
    }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;
    let convId = activeId;
    if (!convId) {
      const created = await api.post<{ conversation: Conversation }>(
        "/api/conversations",
        { title: t("chat.newConversation") },
      );
      convId = created.conversation.id;
      setActiveId(convId);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }

    const text = input.trim();
    const pendingRefs = attachments.slice();
    setInput("");
    setAttachments([]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, attachments: pendingRefs },
    ]);
    setStreaming(true);

    const placeholder =
      settings.mode === "image"
        ? t("chat.generatingImage")
        : settings.mode === "agent"
          ? t("chat.agentWorking")
          : "";
    setMessages((prev) => [...prev, { role: "assistant", content: placeholder }]);

    try {
      const result = await streamChatMessage(
        {
          conversationId: convId,
          message: text,
          mode: settings.mode,
          systemPrompt: settings.systemPrompt,
          provider: settings.provider,
          chatModel: settings.chatModel || configData?.chat_model || "",
          imageModel: settings.imageModel || configData?.image_model,
          imageProvider: settings.imageProvider,
          referenceImages: pendingRefs,
        },
        (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: delta };
            }
            return next;
          });
        },
      );
      if (result.conversation?.messages) {
        setMessages(result.conversation.messages);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("chat.requestFailed");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: msg };
        }
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [
    activeId,
    attachments,
    configData,
    input,
    queryClient,
    settings,
    streaming,
    t,
  ]);

  const conversations = listData?.conversations ?? [];

  const modeButtons: { mode: ChatMode; label: string; icon: typeof MessageSquare }[] = [
    { mode: "chat", label: t("chat.chatMode"), icon: MessageSquare },
    { mode: "agent", label: t("chat.agentMode"), icon: Bot },
    { mode: "image", label: t("chat.imageMode"), icon: ImageIcon },
  ];

  return (
    <div className="h-full flex" data-testid="chat-page">
      <aside className="w-64 border-r border-[var(--border)] flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            className="w-full py-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)] text-sm"
            data-testid="chat-new-btn"
          >
            {t("chat.newConversation")}
          </button>
        </div>
        <ul className="flex-1 overflow-auto" data-testid="chat-history-list">
          {conversations.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              {t("chat.noHistory")}
            </li>
          )}
          {conversations.map((c) => (
            <li key={c.id} className="flex items-center group">
              <button
                type="button"
                onClick={() => loadConversation(c.id)}
                className={`flex-1 text-left px-4 py-3 text-sm truncate hover:bg-[var(--nav-hover-bg)] ${
                  activeId === c.id ? "bg-[var(--nav-hover-bg)]" : ""
                }`}
                data-testid={`conversation-${c.id}`}
              >
                {c.title ?? c.id}
              </button>
              <button
                type="button"
                title={t("chat.deleteTitle")}
                onClick={() => {
                  if (window.confirm(t("chat.deleteConfirm"))) {
                    deleteMutation.mutate(c.id);
                  }
                }}
                className="p-2 opacity-0 group-hover:opacity-100 text-red-500"
                data-testid={`conversation-delete-${c.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-3">
          <h1 className="font-medium flex-1">{t("chat.title")}</h1>
          <div className="flex gap-1" data-testid="chat-mode-tabs">
            {modeButtons.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, mode }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border ${
                  settings.mode === mode
                    ? "bg-black text-white border-black"
                    : "border-[var(--border)] hover:bg-[var(--nav-hover-bg)]"
                }`}
                data-testid={`chat-mode-${mode}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="p-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)]"
            data-testid="chat-settings-toggle"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </header>

        {settingsOpen && (
          <div
            className="px-6 py-3 border-b border-[var(--border)] grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"
            data-testid="chat-settings-panel"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[var(--muted)]">{t("chat.provider")}</span>
              <select
                value={settings.provider}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, provider: e.target.value, chatModel: "" }))
                }
                className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                data-testid="chat-provider-select"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[var(--muted)]">{t("chat.model")}</span>
              <select
                value={settings.chatModel}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, chatModel: e.target.value }))
                }
                className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                data-testid="chat-model-select"
              >
                {chatModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {settings.mode !== "chat" && (
              <label className="flex flex-col gap-1">
                <span className="text-[var(--muted)]">{t("chat.imageModel")}</span>
                <select
                  value={settings.imageModel}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, imageModel: e.target.value }))
                  }
                  className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                  data-testid="chat-image-model-select"
                >
                  {(configData?.image_models ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[var(--muted)]">{t("chat.systemPrompt")}</span>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, systemPrompt: e.target.value }))
                }
                rows={2}
                className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 resize-none"
                data-testid="chat-system-prompt"
              />
            </label>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 space-y-4" data-testid="chat-messages">
          {!activeId && messages.length === 0 && (
            <p className="text-[var(--muted)] text-sm">{t("chat.empty")}</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-xl p-3 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-black text-white"
                  : "border border-[var(--border)]"
              } ${streaming && i === messages.length - 1 && m.role === "assistant" ? "streaming" : ""}`}
              data-testid={`chat-message-${m.role}`}
            >
              {m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {m.attachments.map((ref, j) =>
                    ref.url?.match(/\.(png|jpe?g|gif|webp)/i) ? (
                      <img
                        key={j}
                        src={ref.url}
                        alt={ref.name ?? "attachment"}
                        className="w-16 h-16 object-cover"
                      />
                    ) : (
                      <span key={j} className="text-xs opacity-80">
                        {ref.name ?? ref.url}
                      </span>
                    ),
                  )}
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
        </div>

        <footer
          className={`p-4 border-t border-[var(--border)] ${dragOver ? "bg-[var(--nav-hover-bg)]" : ""}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2" data-testid="chat-attachments">
              {attachments.map((a, i) => (
                <div key={i} className="relative border border-[var(--border)] p-1">
                  {a.url?.match(/\.(png|jpe?g|gif|webp)/i) ? (
                    <img src={a.url} alt={a.name} className="w-12 h-12 object-cover" />
                  ) : (
                    <span className="text-xs px-2">{a.name ?? a.url}</span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="absolute -top-1 -right-1 bg-black text-white rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
              data-testid="chat-attachment-input"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              className="p-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)] disabled:opacity-50"
              data-testid="chat-attach-btn"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={streaming}
              placeholder={t("chat.placeholder")}
              className="flex-1 border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              data-testid="chat-input"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="px-4 py-2 bg-black text-white disabled:opacity-50"
              data-testid="chat-send-btn"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
