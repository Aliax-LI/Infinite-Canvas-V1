import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  chatImageSize,
  chatSizeFromPrompt,
  loadChatSettings,
  normalizeCustomImageSize,
  saveChatSettings,
} from "../../src/features/chat/settings";
import { getUserId } from "../../src/shared/api/client";

describe("chat settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when storage empty", () => {
    const s = loadChatSettings();
    expect(s.mode).toBe("chat");
    expect(s.systemPrompt).toBe("");
  });

  it("persists settings to localStorage", () => {
    saveChatSettings({
      mode: "agent",
      provider: "openai",
      chatModel: "gpt-5",
      imageModel: "dall-e",
      imageProvider: "openai",
      systemPrompt: "be helpful",
      imageRatio: "16:9",
      imageResolution: "2k",
      imageCustomSize: "1024x1024",
    });
    const loaded = loadChatSettings();
    expect(loaded.mode).toBe("agent");
    expect(loaded.systemPrompt).toBe("be helpful");
  });

  it("resolves legacy-compatible image sizes", () => {
    const settings = {
      ...loadChatSettings(),
      imageRatio: "16:9" as const,
      imageResolution: "2k" as const,
    };
    expect(chatImageSize(settings)).toBe("1920x1080");
    expect(normalizeCustomImageSize("2048 × 1024")).toBe("2048x1024");
    expect(normalizeCustomImageSize("12x1024")).toBe("");
    expect(chatSizeFromPrompt("画一张 16:9 高清图", settings)).toBe("1920x1080");
    expect(chatSizeFromPrompt("1024x768 的风景", settings)).toBe("1024x768");
  });
});

describe("getUserId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and reuses user id", () => {
    const a = getUserId();
    const b = getUserId();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });
});

describe("streamChatMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../../src/shared/api/client");
    vi.resetModules();
  });

  it("parses SSE delta events", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"type":"delta","delta":"Hello"}\n\n',
      'data: {"type":"done","conversation":{"id":"c1","messages":[{"role":"assistant","content":"Hello"}]}}\n\n',
    ];
    let i = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (i >= chunks.length) return { done: true, value: undefined };
            const value = encoder.encode(chunks[i++]);
            return { done: false, value };
          },
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { streamChatMessage } = await import("../../src/features/chat/stream");
    const deltas: string[] = [];
    const result = await streamChatMessage(
      {
        conversationId: "",
        message: "hi",
        mode: "chat",
        systemPrompt: "",
        provider: "openai",
        chatModel: "gpt",
      },
      (t) => deltas.push(t),
    );
    expect(deltas).toContain("Hello");
    expect(result.text).toBe("Hello");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(typeof init.body).toBe("string");
  });

  it("posts image mode to /api/chat", async () => {
    const postMock = vi.fn().mockResolvedValue({
      conversation: {
        id: "c1",
        messages: [{ role: "assistant", type: "image", content: "cat", image_url: "/out.png" }],
      },
    });
    vi.doMock("../../src/shared/api/client", () => ({
      api: { post: postMock },
      streamSse: vi.fn(),
    }));
    const { streamChatMessage } = await import("../../src/features/chat/stream");
    const result = await streamChatMessage({
      conversationId: "c1",
      message: "draw a cat",
      mode: "image",
      systemPrompt: "",
      provider: "openai",
      chatModel: "gpt-5",
      imageModel: "dall-e",
      imageProvider: "openai",
      imageSize: "1024x1024",
    });
    expect(postMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        mode: "image",
        provider: "openai",
        image_provider: "openai",
        image_model: "dall-e",
      }),
    );
    expect(result.text).toBe("cat");
  });

  it("posts agent mode to /api/chat/agent with ms_model for modelscope", async () => {
    const postMock = vi.fn().mockResolvedValue({
      conversation: {
        id: "c1",
        messages: [{ role: "assistant", content: "agent-reply" }],
      },
    });
    vi.doMock("../../src/shared/api/client", () => ({
      api: { post: postMock },
      streamSse: vi.fn(),
    }));
    const { streamChatMessage } = await import("../../src/features/chat/stream");
    await streamChatMessage({
      conversationId: "c1",
      message: "generate a cat",
      mode: "agent",
      systemPrompt: "",
      provider: "modelscope",
      chatModel: "MiniMax/MiniMax-M2.7",
      imageModel: "gpt-image-2",
      imageProvider: "comfly",
      imageSize: "1024x1024",
    });
    expect(postMock).toHaveBeenCalledWith(
      "/api/chat/agent",
      expect.objectContaining({
        mode: "agent",
        provider: "modelscope",
        ms_model: "MiniMax/MiniMax-M2.7",
        image_provider: "comfly",
      }),
    );
  });

  it("includes ms_model in chat stream body for modelscope", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { streamChatMessage } = await import("../../src/features/chat/stream");
    await streamChatMessage({
      conversationId: "c1",
      message: "hi",
      mode: "chat",
      systemPrompt: "",
      provider: "modelscope",
      chatModel: "MiniMax/MiniMax-M2.7",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "modelscope",
      ms_model: "MiniMax/MiniMax-M2.7",
    });
  });
});
