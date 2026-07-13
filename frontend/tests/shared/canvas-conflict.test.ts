import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/shared/api/client";
import { conflictCanvasUpdatedAt } from "../../src/shared/api/canvasConflict";

describe("conflictCanvasUpdatedAt", () => {
  it("returns null for non-409 errors", () => {
    expect(conflictCanvasUpdatedAt(new Error("fail"))).toBeNull();
    expect(conflictCanvasUpdatedAt(new ApiError("nope", 500))).toBeNull();
  });

  it("reads updated_at from 409 detail", () => {
    const err = new ApiError("conflict", 409, {
      detail: { message: "冲突", updated_at: 12345, canvas: { updated_at: 999 } },
    });
    expect(conflictCanvasUpdatedAt(err)).toBe(12345);
  });

  it("falls back to detail.canvas.updated_at", () => {
    const err = new ApiError("conflict", 409, {
      detail: { canvas: { updated_at: 777 } },
    });
    expect(conflictCanvasUpdatedAt(err)).toBe(777);
  });
});
