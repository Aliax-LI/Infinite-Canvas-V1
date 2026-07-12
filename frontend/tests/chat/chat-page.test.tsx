import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ChatPage } from "../../src/features/chat/ChatPage";
import { streamChatMessage } from "../../src/features/chat/stream";
import "../../src/shared/i18n";

const mockConversations = vi.fn();
const mockConfig = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
const mockUpload = vi.fn();

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: (path: string) => {
      if (path === "/api/conversations") return mockConversations();
      if (path === "/api/config") return mockConfig();
      return Promise.resolve({});
    },
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    upload: (...args: unknown[]) => mockUpload(...args),
  },
  getUserId: () => "test-user",
}));

vi.mock("../../src/features/chat/stream", () => ({
  streamChatMessage: vi.fn().mockResolvedValue({
    conversation: { id: "c1", messages: [{ role: "assistant", content: "hi" }] },
    text: "hi",
  }),
}));

function renderChat() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ChatPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    localStorage.clear();
    mockConversations.mockResolvedValue({ conversations: [] });
    mockConfig.mockResolvedValue({
      chat_model: "gpt-5",
      image_model: "dall-e",
      chat_models: ["gpt-5"],
      image_models: ["dall-e"],
      api_providers: [{ id: "openai", name: "OpenAI", chat_models: ["gpt-5"], image_models: ["dall-e"], enabled: true }],
    });
    mockPost.mockResolvedValue({ conversation: { id: "c1", messages: [] } });
    mockDelete.mockResolvedValue({ ok: true });
    mockUpload.mockResolvedValue({ files: [{ url: "/out/test.png", name: "test.png" }] });
  });

  it("renders chat page with mode tabs", async () => {
    renderChat();
    expect(screen.getByTestId("chat-page")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("chat-mode-chat")).toBeInTheDocument();
      expect(screen.getByTestId("chat-mode-agent")).toBeInTheDocument();
      expect(screen.getByTestId("chat-mode-image")).toBeInTheDocument();
      expect(screen.getByTestId("chat-composer-toolbar")).toBeInTheDocument();
    });
  });

  it("toggles settings panel", async () => {
    renderChat();
    fireEvent.click(screen.getByTestId("chat-settings-toggle"));
    expect(screen.getByTestId("chat-settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-system-prompt")).toBeInTheDocument();
    expect(screen.getByText("模型与模式请在输入框上方切换；此处仅配置系统提示词。")).toBeInTheDocument();
  });

  it("shows image controls in composer menu", async () => {
    renderChat();
    fireEvent.click(screen.getByTestId("chat-composer-config-toggle"));
    fireEvent.click(screen.getByTestId("chat-composer-mode-image"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-composer-image-provider-select")).toBeInTheDocument();
      expect(screen.getByTestId("chat-composer-image-model-select")).toBeInTheDocument();
      expect(screen.getByTestId("chat-composer-image-resolution-select")).toBeInTheDocument();
    });
  });

  it("starts a blank draft without creating an empty conversation", async () => {
    mockPost.mockResolvedValueOnce({
      conversation: { id: "new-1", title: "新对话", messages: [] },
    });
    renderChat();
    fireEvent.click(screen.getByTestId("chat-new-btn"));
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText("从一句话开始")).toBeInTheDocument();
  });

  it("restores input after failed send", async () => {
    vi.mocked(streamChatMessage).mockRejectedValueOnce(new Error("上游接口错误"));
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("chat-send-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-message-error")).toBeInTheDocument();
      expect(screen.getByTestId("chat-input")).toHaveValue("hello");
    });
  });

  it("shows thinking pending status while chat request is in flight", async () => {
    let resolveStream!: (value: { conversation: { id: string; messages: { role: string; content: string }[] }; text: string }) => void;
    vi.mocked(streamChatMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    );
    renderChat();
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "你好" } });
    fireEvent.click(screen.getByTestId("chat-send-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-pending-status")).toBeInTheDocument();
      expect(screen.getByTestId("chat-pending-status")).toHaveTextContent(/思考|Thinking/i);
    });
    resolveStream({
      conversation: { id: "c1", messages: [{ role: "assistant", content: "你好呀" }] },
      text: "你好呀",
    });
    await waitFor(() => {
      expect(screen.queryByTestId("chat-pending-status")).not.toBeInTheDocument();
      expect(screen.getByText("你好呀")).toBeInTheDocument();
    });
  });

  it("shows agent working pending status in agent mode", async () => {
    let resolveStream!: (value: { conversation: { id: string; messages: { role: string; content: string }[] }; text: string }) => void;
    vi.mocked(streamChatMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    );
    renderChat();
    fireEvent.click(screen.getByTestId("chat-composer-config-toggle"));
    fireEvent.click(screen.getByTestId("chat-composer-mode-agent"));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "帮我绘制一个女孩" } });
    fireEvent.click(screen.getByTestId("chat-send-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-pending-status")).toBeInTheDocument();
      expect(screen.getByTestId("chat-pending-status")).toHaveTextContent(/工具|tool/i);
    });
    resolveStream({
      conversation: {
        id: "c1",
        messages: [{ role: "assistant", type: "image", content: "女孩", image_url: "/out.png" } as never],
      },
      text: "女孩",
    });
    await waitFor(() => {
      expect(screen.queryByTestId("chat-pending-status")).not.toBeInTheDocument();
    });
  });
});
