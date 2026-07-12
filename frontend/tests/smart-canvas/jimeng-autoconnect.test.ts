import { describe, expect, it, vi, afterEach } from "vitest";
import {
  interpretJimengQuery,
  jimengQueueText,
  readJimengPending,
  withJimengPending,
} from "../../src/features/smart-canvas/core/jimeng";
import {
  findOverlapNode,
  resolveCtrlDragAutoSnap,
} from "../../src/features/smart-canvas/core/autoConnect";
import { pollImageTask } from "../../src/features/smart-canvas/core/generation";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

function node(partial: Partial<SmartNode> & { kind: string }): SmartNode {
  return {
    id: partial.id ?? "n1",
    kind: partial.kind,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 280,
    height: partial.height ?? 200,
    title: partial.title ?? "",
    prompt: partial.prompt ?? "",
    images: partial.images ?? [],
    settings: partial.settings ?? {},
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("jimeng", () => {
  it("formats queue text", () => {
    expect(jimengQueueText({ queue_idx: 2, queue_length: 10 })).toContain("2/10");
  });

  it("stores jimengPending on node settings", () => {
    const n = node({ kind: "image" });
    const patch = withJimengPending(n, { submitId: "sub_1", kind: "image" });
    expect(readJimengPending({ ...n, ...patch, settings: patch.settings! })?.submitId).toBe("sub_1");
  });

  it("interprets query success and failure", () => {
    expect(interpretJimengQuery({ status: "succeeded", urls: ["/a.png"] })).toEqual({
      done: true,
      urls: ["/a.png"],
      kind: "image",
    });
    expect(interpretJimengQuery({ status: "failed", error: "x" })).toMatchObject({
      done: true,
      failed: true,
    });
  });

  it("pollImageTask returns jimengPending instead of hanging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "jimeng_pending",
            submit_id: "jm_1",
            kind: "image",
            queue_info: { queue_idx: 1, queue_length: 3 },
            message: "排队中",
          }),
      }),
    );
    const result = await pollImageTask("canvas_img_1");
    expect(result.jimengPending).toBe(true);
    expect(result.submitId).toBe("jm_1");
    expect(result.pending).toBeUndefined();
  });
});

describe("autoConnect / loop snap", () => {
  it("finds overlap by center hit", () => {
    const target = node({ id: "img", kind: "image", x: 100, y: 100, width: 200, height: 200 });
    const hit = findOverlapNode("loop", 150, 150, 40, 40, [target]);
    expect(hit?.id).toBe("img");
  });

  it("Ctrl-drag loop snaps to image and restores position", () => {
    const loop = node({ id: "loop", kind: "loop", x: 0, y: 0, width: 100, height: 80 });
    const img = node({ id: "img", kind: "image", x: 0, y: 0, width: 280, height: 200 });
    const snap = resolveCtrlDragAutoSnap(loop, [loop, img], true, { x: 40, y: 40 });
    expect(snap.connected).toBe(true);
    expect(snap.targetId).toBe("img");
    expect(snap.restorePosition).toBe(true);
  });

  it("does not snap without Ctrl", () => {
    const loop = node({ id: "loop", kind: "loop", x: 0, y: 0 });
    const img = node({ id: "img", kind: "image", x: 0, y: 0 });
    expect(resolveCtrlDragAutoSnap(loop, [loop, img], false, { x: 10, y: 10 }).connected).toBe(
      false,
    );
  });
});
