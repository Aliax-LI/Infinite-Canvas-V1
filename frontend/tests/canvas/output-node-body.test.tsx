import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  OutputNodeBody,
  buildOutputDisplayRows,
  partitionOutputRows,
} from "../../src/features/canvas/components/OutputNodeBody";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

afterEach(() => {
  cleanup();
  useLegacyCanvasStore.setState({ nodes: [], connections: [] });
});

describe("OutputNodeBody preview", () => {
  it("renders completed image as hero (full-width) preview", () => {
    const onPreview = vi.fn();
    const node = createLegacyNode({
      id: "o1",
      kind: "output",
      width: 320,
      height: 280,
      images: [{ url: "/output/a.png", kind: "image" }],
      settings: {
        outputImages: [{ url: "/output/a.png", runMs: 3200 }],
      },
    });
    useLegacyCanvasStore.setState({ nodes: [node] });

    render(<OutputNodeBody node={node} onPreviewImage={onPreview} />);
    const body = screen.getByTestId("output-node-body-o1");
    expect(body.getAttribute("data-layout")).toBe("hero");
    expect(body.getAttribute("data-image-count")).toBe("1");
    const wrap = screen.getByTestId("output-image-o1-0");
    expect(wrap.getAttribute("data-variant")).toBe("hero");
    fireEvent.click(screen.getByTestId("output-image-preview-o1-0"));
    expect(onPreview).toHaveBeenCalledWith("o1", "/output/a.png");
  });

  it("renders multiple result thumbnails in dense grid", () => {
    const node = createLegacyNode({
      id: "o2",
      kind: "output",
      images: [
        { url: "/output/a.png" },
        { url: "/output/b.png" },
      ],
      settings: {
        outputImages: [
          { url: "/output/a.png", runMs: 1000 },
          { url: "/output/b.png", runMs: 1200 },
        ],
      },
    });
    render(<OutputNodeBody node={node} />);
    expect(screen.getByTestId("output-node-body-o2").getAttribute("data-layout")).toBe(
      "grid",
    );
    const thumb0 = screen.getByTestId("output-image-o2-0");
    expect(thumb0.getAttribute("data-variant")).toBe("thumb");
    // Grid cells always fill with object-cover (no gray letterbox/pillarbox).
    expect(thumb0.getAttribute("data-image-fit")).toBe("cover");
    expect(thumb0.className).toMatch(/legacy-output-img-wrap--filled/);
    const img = thumb0.querySelector("img");
    expect(img?.className).toMatch(/object-cover/);
    expect(screen.getByTestId("output-image-o2-1")).toBeInTheDocument();
  });

  it("hero default uses intrinsic aspect without cover crop", () => {
    const node = createLegacyNode({
      id: "o6",
      kind: "output",
      images: [{ url: "/output/a.png" }],
      settings: {
        outputImages: [{ url: "/output/a.png" }],
      },
    });
    render(<OutputNodeBody node={node} />);
    const wrap = screen.getByTestId("output-image-o6-0");
    expect(wrap.getAttribute("data-variant")).toBe("hero");
    expect(wrap.getAttribute("data-image-fit")).toBe("contain");
    expect(wrap.querySelector("img")?.className).toMatch(/legacy-output-img--natural/);
  });

  it("keeps hero image when collapsed errors sit above", () => {
    const node = createLegacyNode({
      id: "o5",
      kind: "output",
      images: [{ url: "/output/a.png" }],
      settings: {
        outputImages: [{ url: "/output/a.png" }],
        _pending: [
          { id: "e1", startedAt: 1, failed: true, error: "rate limited" },
          { id: "e2", startedAt: 1, failed: true, error: "rate limited" },
        ],
      },
    });
    render(<OutputNodeBody node={node} />);
    expect(screen.getByTestId("output-node-body-o5").getAttribute("data-layout")).toBe(
      "hero",
    );
    expect(screen.getByTestId("output-error-group-e1-count").textContent).toBe("×2");
    expect(screen.getByTestId("output-image-o5-0").getAttribute("data-variant")).toBe(
      "hero",
    );
  });

  it("shows pending generating card while in-flight", () => {
    const now = 1_700_000_300_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const node = createLegacyNode({
      id: "o3",
      kind: "output",
      settings: {
        _pending: [{ id: "p1", startedAt: now }],
      },
    });
    render(<OutputNodeBody node={node} />);
    const card = screen.getByTestId("output-pending-p1");
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.textContent).not.toMatch(/10\.0s/);
  });

  it("collapses consecutive identical failed errors into one row", () => {
    const node = createLegacyNode({
      id: "o4",
      kind: "output",
      settings: {
        _pending: [
          { id: "e1", startedAt: 1, failed: true, error: "rate limited" },
          { id: "e2", startedAt: 1, failed: true, error: "rate limited" },
          { id: "e3", startedAt: 1, failed: true, error: "rate limited" },
          { id: "e4", startedAt: 1, failed: true, error: "other" },
        ],
      },
    });
    render(<OutputNodeBody node={node} />);
    expect(screen.getByTestId("output-error-group-e1")).toBeInTheDocument();
    expect(screen.getByTestId("output-error-group-e1-count").textContent).toBe(
      "×3",
    );
    expect(screen.getByTestId("output-error-group-e4")).toBeInTheDocument();
    expect(screen.queryByTestId("output-error-group-e4-count")).toBeNull();
  });
});

describe("buildOutputDisplayRows", () => {
  it("groups consecutive duplicate failures", () => {
    const rows = buildOutputDisplayRows(
      [
        { id: "a", startedAt: 1, failed: true, error: "x" },
        { id: "b", startedAt: 1, failed: true, error: "x" },
        { id: "c", startedAt: 1 },
      ],
      [{ url: "/o.png" }],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "error-group", count: 2 });
    expect(rows[1]).toMatchObject({ kind: "pending" });
    expect(rows[2]).toMatchObject({ kind: "image" });
  });

  it("partitionOutputRows separates errors from media", () => {
    const rows = buildOutputDisplayRows(
      [
        { id: "a", startedAt: 1, failed: true, error: "x" },
        { id: "c", startedAt: 1 },
      ],
      [{ url: "/o.png" }],
    );
    const parts = partitionOutputRows(rows);
    expect(parts.errors).toHaveLength(1);
    expect(parts.media).toHaveLength(2);
  });
});
