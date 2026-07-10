import { describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../src/shared/api/client";

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
});
