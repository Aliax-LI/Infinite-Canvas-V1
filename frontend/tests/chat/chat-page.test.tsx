import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ChatPage } from "../../src/features/chat/ChatPage";
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
    mockConversations.mockResolvedValue({ conversations: [] });
    mockConfig.mockResolvedValue({
      chat_model: "gpt-5",
      image_model: "dall-e",
      chat_models: ["gpt-5"],
      image_models: ["dall-e"],
      api_providers: [{ id: "openai", name: "OpenAI", chat_models: ["gpt-5"], enabled: true }],
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
    });
  });

  it("toggles settings panel", async () => {
    renderChat();
    fireEvent.click(screen.getByTestId("chat-settings-toggle"));
    expect(screen.getByTestId("chat-settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-provider-select")).toBeInTheDocument();
  });

  it("creates new conversation", async () => {
    mockPost.mockResolvedValueOnce({
      conversation: { id: "new-1", title: "新对话", messages: [] },
    });
    renderChat();
    fireEvent.click(screen.getByTestId("chat-new-btn"));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });
});
