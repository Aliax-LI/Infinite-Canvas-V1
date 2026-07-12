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
import { formatApiError } from "../../shared/api/formatError";
import { StudioSelect } from "../../shared/ui/StudioSelect";
import { chatImageSize, chatSizeFromPrompt, loadChatSettings, saveChatSettings, shortModelName } from "./settings";
import {
  chatCapableProviders,
  composerModelLabel,
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveChatModel,
  resolveImageModel,
} from "./providers";
import { streamChatMessage } from "./stream";
import type {
  AiConfig,
  ChatAttachment,
  ChatImageRatio,
  ChatImageResolution,
  ChatMessage,
  ChatMode,
  ChatPickerScope,
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
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(loadChatSettings);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerMenuRef = useRef<HTMLDivElement>(null);

  const { data: listData } = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      api.get<{ conversations: Conversation[] }>("/api/conversations"),
  });

  const { data: configData } = useQuery({
    queryKey: ["chat-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
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
      const providers = chatCapableProviders(configData);
      const provider = providers.some((p) => p.id === prev.provider)
        ? prev.provider
        : providers[0]?.id || "";
      const imageProvider = pickDefaultImageProvider(configData, prev.imageProvider || provider);
      const chatModel = resolveChatModel(configData, provider, prev.chatProviderModels, prev.chatModel);
      const imageModel = resolveImageModel(configData, imageProvider, prev.imageModel);
      return {
        ...prev,
        provider,
        chatModel,
        imageModel,
        imageProvider,
        chatProviderModels: {
          ...prev.chatProviderModels,
          [provider]: chatModel,
        },
      };
    });
  }, [configData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!composerMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!composerMenuRef.current?.contains(event.target as Node)) {
        setComposerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [composerMenuOpen]);

  const providers = chatCapableProviders(configData);
  const imageProviders = imageCapableProviders(configData);
  const chatModels =
    settings.provider === "modelscope"
      ? configData?.ms_chat_models ?? []
      : providers.find((p) => p.id === settings.provider)?.chat_models?.length
        ? providers.find((p) => p.id === settings.provider)!.chat_models!
        : configData?.chat_models ?? [];
  const imageModels =
    imageProviders.find((p) => p.id === settings.imageProvider)?.image_models?.length
      ? imageProviders.find((p) => p.id === settings.imageProvider)!.image_models!
      : configData?.image_models ?? [];

  const setChatMode = useCallback(
    (mode: ChatMode) => {
      setSettings((prev) => {
        const nextScope: ChatPickerScope = mode === "image" ? "image" : "chat";
        if (mode === "chat") {
          return { ...prev, mode, pickerScope: nextScope };
        }
        const imageProvider = pickDefaultImageProvider(configData, prev.imageProvider);
        const imageModel = resolveImageModel(configData, imageProvider, prev.imageModel);
        return { ...prev, mode, imageProvider, imageModel, pickerScope: nextScope };
      });
    },
    [configData],
  );

  const setPickerScope = useCallback((scope: ChatPickerScope) => {
    setSettings((prev) => ({ ...prev, pickerScope: scope }));
  }, []);

  const updateChatProvider = useCallback(
    (provider: string) => {
      setSettings((prev) => {
        const chatModel = resolveChatModel(configData, provider, prev.chatProviderModels, "");
        return {
          ...prev,
          provider,
          chatModel,
          chatProviderModels: { ...prev.chatProviderModels, [provider]: chatModel },
        };
      });
    },
    [configData],
  );

  const updateChatModel = useCallback((chatModel: string) => {
    setSettings((prev) => ({
      ...prev,
      chatModel,
      chatProviderModels: { ...prev.chatProviderModels, [prev.provider]: chatModel },
    }));
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    if (streaming) return;
    const res = await api.get<{ conversation: Conversation }>(
      `/api/conversations/${id}`,
    );
    setActiveId(id);
    setMessages(res.conversation.messages ?? []);
  }, [streaming]);

  const startNewConversation = useCallback(() => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setAttachments([]);
    setInput("");
  }, [streaming]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files];
    const available = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!available) {
      setUploadError(t("chat.attachmentLimit", { count: MAX_ATTACHMENTS }));
      return;
    }
    const form = new FormData();
    list.slice(0, available).forEach((f) => form.append("files", f));
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.upload<{ files?: ChatAttachment[] }>(
        "/api/ai/upload",
        form,
      );
      setAttachments((prev) =>
        [...prev, ...(res.files ?? [])].slice(0, MAX_ATTACHMENTS),
      );
    } catch (err) {
      setUploadError(formatApiError(err, t("chat.uploadFailed")));
    } finally {
      setUploading(false);
    }
  }, [attachments.length, t]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length) {
        event.preventDefault();
        void uploadFiles(files);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploadFiles]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;
    let convId = activeId;
    try {
      if (!convId) {
        const created = await api.post<{ conversation: Conversation }>(
          "/api/conversations",
          { title: t("chat.newConversation") },
        );
        convId = created.conversation.id;
        setActiveId(convId);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    } catch (err) {
      setUploadError(formatApiError(err, t("chat.requestFailed")));
      return;
    }

    const text = input.trim();
    const pendingRefs = attachments.slice();
    setInput("");
    setAttachments([]);
    setUploadError(null);
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
          : t("chat.thinking");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: placeholder, pending: true },
    ]);

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
          imageSize: chatSizeFromPrompt(text, settings),
          referenceImages: pendingRefs,
        },
        (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && !last.error) {
              next[next.length - 1] = { ...last, content: delta, pending: false };
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
      const msg = formatApiError(err, t("chat.requestFailed"));
      setInput(text);
      setAttachments(pendingRefs);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: msg, error: true };
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
  const activeModeButton = modeButtons.find((item) => item.mode === settings.mode) ?? modeButtons[0];
  const ActiveModeIcon = activeModeButton.icon;
  const activeModel = composerModelLabel(settings.mode, settings);
  const showImageControls = settings.mode !== "chat";
  const pickerScope = settings.mode === "agent" ? settings.pickerScope : settings.mode === "image" ? "image" : "chat";
  const providerOptions = providers.map((provider) => ({ value: provider.id, label: provider.name }));
  const imageProviderOptions = imageProviders.map((provider) => ({
    value: provider.id,
    label: provider.name,
  }));
  const chatModelOptions = chatModels.map((model) => ({ value: model, label: model }));
  const imageModelOptions = imageModels.map((model) => ({ value: model, label: model }));
  const quickStarts = [
    t("chat.quickAsk"),
    t("chat.quickBrainstorm"),
    t("chat.quickImage"),
  ];

  return (
    <div className="h-full flex" data-testid="chat-page">
      <aside className="w-64 border-r border-[var(--border)] flex flex-col bg-[var(--settings-bg)]">
        <div className="p-4 border-b border-[var(--border)]">
          <button
            type="button"
            onClick={startNewConversation}
            disabled={streaming}
            className="w-full py-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)] text-sm disabled:opacity-50"
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
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => loadConversation(c.id)}
                disabled={streaming}
                className={`w-full text-left px-4 py-3 pr-10 text-sm hover:bg-[var(--nav-hover-bg)] disabled:opacity-50 ${
                  activeId === c.id ? "bg-[var(--nav-hover-bg)]" : ""
                }`}
                data-testid={`conversation-${c.id}`}
              >
                <div className="font-medium truncate">{c.title ?? c.id}</div>
                {c.last_message && (
                  <div className="mt-1 text-[11px] text-[var(--muted)] truncate">
                    {c.last_message}
                  </div>
                )}
              </button>
              <button
                type="button"
                title={t("chat.deleteTitle")}
                onClick={() => {
                  if (window.confirm(t("chat.deleteConfirm"))) {
                    deleteMutation.mutate(c.id);
                  }
                }}
                className="absolute top-2 right-2 p-2 opacity-0 group-hover:opacity-100 text-red-500"
                data-testid={`conversation-delete-${c.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="relative flex-1 flex flex-col min-w-0">
        <header className="px-6 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-medium">{t("chat.title")}</h1>
          </div>
          <div className="hidden" data-testid="chat-mode-tabs">
            {modeButtons.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChatMode(mode)}
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
            className="absolute top-[73px] right-6 z-20 w-[min(420px,calc(100%-3rem))] border border-[var(--border)] bg-[var(--settings-panel)] p-4 shadow-xl text-sm"
            data-testid="chat-settings-panel"
          >
            <p className="mb-3 text-xs text-[var(--muted)]">{t("chat.settingsHint")}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[var(--muted)]">{t("chat.systemPrompt")}</span>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, systemPrompt: e.target.value }))
                }
                rows={3}
                className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 resize-none"
                data-testid="chat-system-prompt"
              />
            </label>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 space-y-4" data-testid="chat-messages">
          {!activeId && messages.length === 0 && (
            <div className="h-full min-h-72 flex flex-col items-center justify-center text-center">
              <div className="max-w-md">
                <h2 className="text-xl font-medium">{t("chat.startTitle")}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("chat.startDescription")}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {quickStarts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="border border-[var(--border)] bg-[var(--settings-panel)] px-3 py-2 text-xs hover:bg-[var(--nav-hover-bg)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            const imageUrls = [...new Set(m.image_urls?.length ? m.image_urls : m.image_url ? [m.image_url] : [])];
            const messageText = m.error
              ? m.content
              : m.type === "image"
                ? m.agent_reply || t("chat.generated")
                : m.content;
            const isStreamingBubble =
              streaming && i === messages.length - 1 && m.role === "assistant" && !m.error;
            const isPendingBubble = Boolean(isStreamingBubble && m.pending);
            return (
              <div
                key={i}
                className={`max-w-xl p-3 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-black text-white"
                    : m.error
                      ? "border border-red-300 bg-red-50 text-red-700"
                      : "border border-[var(--border)]"
                } ${isStreamingBubble ? "chat-message-streaming" : ""} ${
                  isPendingBubble ? "chat-message-pending" : ""
                }`}
                data-testid={m.error ? "chat-message-error" : `chat-message-${m.role}`}
                data-pending={isPendingBubble ? "true" : undefined}
                aria-busy={isPendingBubble || undefined}
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
                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    {imageUrls.map((url, j) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setPreviewImage(url)}
                        className="block text-left"
                      >
                        <img
                          src={url}
                          alt={`${t("chat.generated")} ${j + 1}`}
                          className="w-full max-h-96 object-contain border border-[var(--border)] bg-[var(--settings-soft)] cursor-zoom-in"
                        />
                      </button>
                    ))}
                  </div>
                )}
                {messageText && (
                  <div
                    className={`whitespace-pre-wrap ${isPendingBubble ? "chat-pending-label" : ""}`}
                    data-testid={isPendingBubble ? "chat-pending-status" : undefined}
                  >
                    {messageText}
                  </div>
                )}
                {isStreamingBubble && !messageText && (
                  <div className="chat-pending-label" data-testid="chat-pending-status">
                    {t("chat.thinking")}
                  </div>
                )}
                {m.role === "assistant" && m.model && !m.error && (
                  <div className="mt-2 text-[10px] text-[var(--muted)] opacity-70">
                    {shortModelName(m.model)}
                  </div>
                )}
                {m.type === "image" && m.size && (
                  <div className="mt-2 text-xs text-[var(--muted)]">{m.size}</div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {previewImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
            onClick={() => setPreviewImage(null)}
            data-testid="chat-image-preview"
          >
            <img
              src={previewImage}
              alt={t("chat.generated")}
              className="max-h-full max-w-full object-contain border border-white/20"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        <footer
          className={`relative p-4 border-t border-[var(--border)] ${dragOver ? "bg-[var(--nav-hover-bg)]" : ""}`}
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
          <div className="mb-2 flex items-center gap-2" data-testid="chat-composer-toolbar">
            <button
              type="button"
              onClick={() => setComposerMenuOpen((open) => !open)}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--settings-panel)] px-3 py-1.5 text-xs hover:bg-[var(--nav-hover-bg)]"
              aria-expanded={composerMenuOpen}
              data-testid="chat-composer-config-toggle"
            >
              <ActiveModeIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{activeModel || t("chat.modelNotSelected")}</span>
              <span className="text-[var(--muted)]">· {activeModeButton.label}</span>
            </button>
            <span className="text-xs text-[var(--muted)]">{t("chat.composerHint")}</span>
          </div>
          {composerMenuOpen && (
            <div
              ref={composerMenuRef}
              className="absolute bottom-[calc(100%+8px)] left-4 z-30 w-[min(380px,calc(100%-2rem))] border border-[var(--border)] bg-[var(--settings-panel)] p-3 shadow-xl"
              data-testid="chat-composer-config-menu"
            >
              <div className="mb-3 flex gap-1 rounded-lg bg-[var(--settings-soft)] p-1">
                {modeButtons.map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs ${settings.mode === mode ? "bg-[var(--settings-panel)] text-[var(--settings-text)] shadow-sm" : "text-[var(--settings-muted)]"}`}
                    data-testid={`chat-composer-mode-${mode}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
              {settings.mode === "agent" && (
                <div className="mb-3 flex gap-1 rounded-lg bg-[var(--settings-soft)] p-1" data-testid="chat-agent-picker-scope">
                  <button
                    type="button"
                    onClick={() => setPickerScope("chat")}
                    className={`flex flex-1 rounded-md px-2 py-1.5 text-xs ${pickerScope === "chat" ? "bg-[var(--settings-panel)] shadow-sm" : "text-[var(--settings-muted)]"}`}
                    data-testid="chat-agent-scope-chat"
                  >
                    {t("chat.llmScope")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerScope("image")}
                    className={`flex flex-1 rounded-md px-2 py-1.5 text-xs ${pickerScope === "image" ? "bg-[var(--settings-panel)] shadow-sm" : "text-[var(--settings-muted)]"}`}
                    data-testid="chat-agent-scope-image"
                  >
                    {t("chat.imageScope")}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {(pickerScope === "chat" || settings.mode === "chat") && <>
                  <label className="text-xs text-[var(--muted)]">
                    {t("chat.provider")}
                    <StudioSelect value={settings.provider} onChange={updateChatProvider} options={providerOptions} className="mt-1" data-testid="chat-composer-provider-select" />
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    {t("chat.model")}
                    <StudioSelect value={settings.chatModel} onChange={updateChatModel} options={chatModelOptions} className="mt-1" data-testid="chat-composer-model-select" />
                  </label>
                </>}
                {showImageControls && (pickerScope === "image" || settings.mode === "image") && <>
                  <label className="text-xs text-[var(--muted)]">
                    {t("chat.imageProvider")}
                    <StudioSelect
                      value={settings.imageProvider}
                      onChange={(imageProvider) =>
                        setSettings((s) => ({
                          ...s,
                          imageProvider,
                          imageModel: resolveImageModel(configData, imageProvider, ""),
                        }))
                      }
                      options={imageProviderOptions}
                      className="mt-1"
                      data-testid="chat-composer-image-provider-select"
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    {t("chat.imageModel")}
                    <StudioSelect value={settings.imageModel} onChange={(imageModel) => setSettings((s) => ({ ...s, imageModel }))} options={imageModelOptions} className="mt-1" data-testid="chat-composer-image-model-select" />
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    {t("chat.imageSize")}
                    <StudioSelect value={settings.imageResolution} onChange={(imageResolution) => setSettings((s) => ({ ...s, imageResolution: imageResolution as ChatImageResolution }))} options={["auto", "1k", "2k", "4k", "custom"].map((value) => ({ value, label: value === "auto" ? t("chat.imageSizeAuto") : value === "custom" ? t("chat.imageSizeCustom") : value.toUpperCase() }))} className="mt-1" data-testid="chat-composer-image-resolution-select" />
                  </label>
                  {settings.imageResolution !== "auto" && settings.imageResolution !== "custom" && <label className="text-xs text-[var(--muted)]">
                    {t("chat.imageRatio")}
                    <StudioSelect value={settings.imageRatio} onChange={(imageRatio) => setSettings((s) => ({ ...s, imageRatio: imageRatio as ChatImageRatio }))} options={["1:1", "2:3", "3:4", "4:3", "3:2", "9:16", "16:9"].map((value) => ({ value, label: value }))} className="mt-1" data-testid="chat-composer-image-ratio-select" />
                  </label>}
                  {settings.imageResolution === "custom" && <label className="col-span-2 text-xs text-[var(--muted)]">
                    {t("chat.imageCustomSize")}
                    <input value={settings.imageCustomSize} onChange={(e) => setSettings((s) => ({ ...s, imageCustomSize: e.target.value }))} placeholder="1024x1024" className="mt-1 h-9 w-full border border-[var(--settings-line)] bg-[var(--settings-panel)] px-2 text-sm text-[var(--settings-text)]" data-testid="chat-composer-image-custom-size" />
                  </label>}
                </>}
              </div>
            </div>
          )}
          {(uploadError || uploading) && (
            <div
              className={`mb-2 text-xs ${uploadError ? "text-red-600" : "text-[var(--muted)]"}`}
              data-testid="chat-upload-status"
            >
              {uploadError ?? t("chat.uploading")}
            </div>
          )}
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
              disabled={attachments.length >= MAX_ATTACHMENTS || uploading}
              title={
                attachments.length >= MAX_ATTACHMENTS
                  ? t("chat.attachmentLimit", { count: MAX_ATTACHMENTS })
                  : undefined
              }
              className="p-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)] disabled:opacity-50"
              data-testid="chat-attach-btn"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={streaming}
              placeholder={t("chat.placeholder")}
              rows={1}
              className="flex-1 min-h-10 max-h-36 resize-y border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-5"
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
