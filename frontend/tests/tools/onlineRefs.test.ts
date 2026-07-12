import { describe, expect, it } from "vitest";
import {
  MAX_ONLINE_REFS,
  STUDIO_IMAGE_URL_MIME,
  isStudioImageUrl,
  mergeRefs,
  readDroppedImageUrl,
  toReferencePayload,
  type OnlineRefFile,
} from "../../src/features/tools/pages/onlineRefs";

describe("onlineRefs", () => {
  it("limits merged refs to max count", () => {
    const prev: OnlineRefFile[] = [
      { id: "a", url: "/assets/input/a.png", serverUrl: "/assets/input/a.png" },
      { id: "b", url: "/assets/input/b.png", serverUrl: "/assets/input/b.png" },
    ];
    const incoming: OnlineRefFile[] = [
      { id: "c", url: "/assets/input/c.png", serverUrl: "/assets/input/c.png" },
      { id: "d", url: "/assets/input/d.png", serverUrl: "/assets/input/d.png" },
    ];
    expect(mergeRefs(prev, incoming, MAX_ONLINE_REFS)).toHaveLength(3);
  });

  it("skips duplicate urls when merging", () => {
    const prev: OnlineRefFile[] = [
      { id: "a", url: "/assets/input/a.png", serverUrl: "/assets/input/a.png" },
    ];
    const incoming: OnlineRefFile[] = [
      { id: "b", url: "/assets/input/a.png", serverUrl: "/assets/input/a.png" },
    ];
    expect(mergeRefs(prev, incoming)).toHaveLength(1);
  });

  it("builds API payload and ignores uploading placeholders", () => {
    const refs: OnlineRefFile[] = [
      { id: "a", url: "blob:local", uploading: true },
      { id: "b", url: "/assets/input/b.png", serverUrl: "/assets/input/b.png", name: "b.png" },
    ];
    expect(toReferencePayload(refs)).toEqual([
      { url: "/assets/input/b.png", name: "b.png", mime: undefined },
    ]);
  });

  it("reads dropped archive urls from custom mime", () => {
    const dt = {
      getData: (type: string) =>
        type === STUDIO_IMAGE_URL_MIME ? "/assets/output/hist.png" : "",
    } as DataTransfer;
    expect(readDroppedImageUrl(dt)).toBe("/assets/output/hist.png");
  });

  it("accepts persisted asset urls", () => {
    expect(isStudioImageUrl("/assets/output/x.png")).toBe(true);
    expect(isStudioImageUrl("ftp://x")).toBe(false);
  });
});
