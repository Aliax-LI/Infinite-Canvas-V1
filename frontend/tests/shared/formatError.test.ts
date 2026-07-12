import { describe, expect, it } from "vitest";
import { normalizeGenerationError } from "../../src/shared/api/formatError";

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
});
