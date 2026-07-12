import { describe, expect, it, vi } from "vitest";
import { ApiError, api, apiFetch, streamSse } from "../../src/shared/api/client";

describe("api client", () => {
  it("apiFetch throws ApiError on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => JSON.stringify({ detail: "missing" }),
      }),
    );
    await expect(apiFetch("/api/test")).rejects.toBeInstanceOf(ApiError);
    vi.unstubAllGlobals();
  });

  it("apiFetch parses json success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ ok: true }),
      }),
    );
    const result = await apiFetch<{ ok: boolean }>("/api/test");
    expect(result.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("apiFetch sends X-User-ID header", async () => {
    localStorage.clear();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/test");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("X-User-ID")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("streamSse uses POST with JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const gen = streamSse("/api/chat/stream", { message: "hi" });
    await gen.next();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/chat/stream");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ message: "hi" }));
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    vi.unstubAllGlobals();
  });

  it("api.upload leaves Content-Type unset for multipart boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ files: [{ comfy_name: "a.png" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("files", new File(["pixels"], "a.png", { type: "image/png" }));
    await api.upload("/api/upload", form);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBeNull();
    expect(init.body).toBe(form);
    vi.unstubAllGlobals();
  });
});
