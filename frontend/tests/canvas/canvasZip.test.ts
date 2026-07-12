import { describe, expect, it } from "vitest";
import {
  collectCanvasResourceUrls,
  createZipBlob,
  safeExportBase,
} from "../../src/features/canvas-list/canvasZip";

describe("canvasZip", () => {
  it("collects asset urls from canvas doc", () => {
    const urls = collectCanvasResourceUrls({
      nodes: [{ images: [{ url: "/output/a.png" }] }],
    });
    expect(urls).toContain("/output/a.png");
  });

  it("sanitizes export base name", () => {
    expect(safeExportBase('bad:name*')).toBe("bad_name_");
  });

  it("creates a zip blob with entries", () => {
    const enc = new TextEncoder();
    const blob = createZipBlob([
      { name: "canvas.json", bytes: enc.encode("{}") },
    ]);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(20);
  });
});
