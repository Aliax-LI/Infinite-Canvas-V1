import { describe, expect, it } from "vitest";
import {
  imageCaption,
  mediaHeightForAspect,
  nodeHeightForMedia,
  readImageFit,
  readNaturalSize,
} from "../../src/features/canvas/core/imageFit";

describe("imageFit helpers", () => {
  it("defaults imageFit to contain", () => {
    expect(readImageFit(undefined)).toBe("contain");
    expect(readImageFit({})).toBe("contain");
    expect(readImageFit({ imageFit: "cover" })).toBe("cover");
  });

  it("computes media height from native aspect", () => {
    // 280 wide, 16:9 -> ~158
    expect(mediaHeightForAspect(280, 1920, 1080)).toBe(158);
    // very tall image is capped
    expect(mediaHeightForAspect(280, 100, 2000)).toBe(480);
    // very wide image has min height
    expect(mediaHeightForAspect(280, 4000, 100)).toBe(96);
  });

  it("includes chrome in node height", () => {
    expect(nodeHeightForMedia(280, 1024, 1024)).toBe(280 + 56);
  });

  it("reads natural size from settings aliases", () => {
    expect(readNaturalSize({ naturalW: 100, naturalH: 50 })).toEqual({
      w: 100,
      h: 50,
    });
    expect(readNaturalSize({ natural_w: 10, natural_h: 20 })).toEqual({
      w: 10,
      h: 20,
    });
    expect(readNaturalSize({})).toBeNull();
  });

  it("avoids misleading 生成结果 caption on image cards", () => {
    expect(imageCaption("生成结果", "生成结果", "/a/photo.png")).toBe("photo.png");
    expect(imageCaption("图片", "vacation.jpg", "")).toBe("vacation.jpg");
    expect(imageCaption("我的参考图", undefined, "")).toBe("我的参考图");
  });
});
