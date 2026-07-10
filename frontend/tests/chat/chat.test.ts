import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadChatSettings, saveChatSettings } from "../../src/features/chat/settings";
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
    });
    const loaded = loadChatSettings();
    expect(loaded.mode).toBe("agent");
    expect(loaded.systemPrompt).toBe("be helpful");
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
  });

  it("parses SSE delta events", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"type":"delta","delta":"Hello"}\n\n',
      'data: {"type":"done","conversation":{"id":"c1","messages":[{"role":"assistant","content":"Hello"}]}}\n\n',
    ];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      }),
    );
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
  });
});
