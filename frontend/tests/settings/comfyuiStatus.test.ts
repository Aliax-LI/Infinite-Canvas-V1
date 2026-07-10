import { describe, expect, it } from "vitest";
import {
  comfyAggregateLabel,
  comfyStatusLabel,
  normalizeComfyAddress,
} from "../../src/features/settings/workflows/useComfyuiStatus";

describe("useComfyuiStatus helpers", () => {
  it("normalizes comfy addresses", () => {
    expect(normalizeComfyAddress(" http://127.0.0.1:8188/ ")).toBe("127.0.0.1:8188");
  });

  it("maps row status labels", () => {
    expect(comfyStatusLabel(true, false)).toBe("在线");
    expect(comfyStatusLabel(false, false)).toBe("离线");
    expect(comfyStatusLabel(undefined, true)).toBe("检测中…");
  });

  it("builds aggregate labels", () => {
    expect(comfyAggregateLabel(2, 2, false)).toBe("全部在线（2）");
    expect(comfyAggregateLabel(0, 2, false)).toBe("全部离线（2）");
    expect(comfyAggregateLabel(1, 2, false)).toBe("1/2 在线");
    expect(comfyAggregateLabel(0, 2, true)).toBe("检测连接中…");
  });
});
