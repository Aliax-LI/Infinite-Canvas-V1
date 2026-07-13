import { describe, expect, it } from "vitest";
import {
  formatApiDetail,
  formatApiError,
  normalizeGenerationError,
  truncateErrorText,
} from "../../src/shared/api/formatError";
import { ApiError } from "../../src/shared/api/client";

describe("formatApiDetail", () => {
  it("returns trimmed string details", () => {
    expect(formatApiDetail("  upstream failed  ")).toBe("upstream failed");
  });

  it("formats FastAPI validation arrays", () => {
    expect(
      formatApiDetail([
        { loc: ["body", "prompt"], msg: "Field required", type: "missing" },
      ]),
    ).toBe("body.prompt: Field required");
  });

  it("extracts message / msg / error from objects", () => {
    expect(formatApiDetail({ message: "quota exceeded" })).toBe("quota exceeded");
    expect(formatApiDetail({ msg: "bad request" })).toBe("bad request");
    expect(formatApiDetail({ error: "no credits" })).toBe("no credits");
  });

  it("stringifies opaque objects instead of returning null", () => {
    expect(formatApiDetail({ code: 502, reason: "gateway" })).toContain("502");
  });

  it("returns null for empty values", () => {
    expect(formatApiDetail("")).toBeNull();
    expect(formatApiDetail("   ")).toBeNull();
    expect(formatApiDetail({})).toBeNull();
  });
});

describe("truncateErrorText", () => {
  it("keeps short text and truncates long bodies", () => {
    expect(truncateErrorText("ok")).toBe("ok");
    const long = "x".repeat(600);
    const out = truncateErrorText(long, 40);
    expect(out.length).toBe(40);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("normalizeGenerationError", () => {
  it("maps httpx disconnect to Chinese guidance", () => {
    expect(
      normalizeGenerationError("Server disconnected without sending a response."),
    ).toContain("断开连接");
  });

  it("unwraps backend prefix then normalizes", () => {
    expect(
      normalizeGenerationError(
        "请求上游生图接口失败：Server disconnected without sending a response.",
      ),
    ).toContain("断开连接");
  });

  it("explains empty HTTP Error bodies", () => {
    expect(normalizeGenerationError("HTTP Error 502:")).toContain("HTTP 502");
    expect(normalizeGenerationError("HTTP Error 502: ")).toContain("未提供详细错误信息");
  });
});

describe("formatApiError", () => {
  it("prefers nested detail message from ApiError body", () => {
    const err = new ApiError("Request failed", 502, {
      detail: { message: "ModelScope gateway timeout" },
    });
    expect(formatApiError(err, "fallback")).toBe("ModelScope gateway timeout");
  });

  it("never leaves bare empty HTTP Error 502", () => {
    const err = new ApiError("HTTP Error 502:", 502, {
      detail: "HTTP Error 502:",
    });
    expect(formatApiError(err, "MS 生成失败")).toContain("HTTP 502");
    expect(formatApiError(err, "MS 生成失败")).not.toMatch(/HTTP Error 502:\s*$/);
  });

  it("falls back to status guidance when body is empty", () => {
    const err = new ApiError("", 502, null);
    expect(formatApiError(err, "MS 生成失败")).toContain("502");
  });
});
