import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageContextMenu } from "../../src/features/canvas/components/ImageContextMenu";
import { createImportImageNodeFromSource } from "../../src/features/canvas/core/clipboard";
import {
  OutputNodeBody,
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

describe("createImportImageNodeFromSource", () => {
  it("places IMAGE node to the right of source without changing URL", () => {
    const node = createImportImageNodeFromSource(
      { x: 100, y: 50, width: 220, title: "Output" },
      "/output/a.png",
      "a.png",
    );
    expect(node.kind).toBe("image");
    expect(node.x).toBe(356);
    expect(node.y).toBe(50);
    expect(node.images?.[0]?.url).toBe("/output/a.png");
    expect(node.title).toBe("a.png");
  });

  it("supports vertical offset for mask-style placement", () => {
    const node = createImportImageNodeFromSource(
      { x: 10, y: 20, width: 100 },
      "/assets/m.png",
      undefined,
      28,
    );
    expect(node.x).toBe(146);
    expect(node.y).toBe(48);
  });
});

describe("ImageContextMenu", () => {
  it("offers create-import action", () => {
    const onCreateImport = vi.fn();
    const onPreview = vi.fn();
    render(
      <ImageContextMenu
        target={{
          screenX: 40,
          screenY: 60,
          nodeId: "o1",
          url: "/output/a.png",
          name: "a.png",
        }}
        onClose={() => undefined}
        onPreview={onPreview}
        onCreateImport={onCreateImport}
      />,
    );
    expect(screen.getByTestId("legacy-image-context-menu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("legacy-image-menu-create-import"));
    expect(onCreateImport).toHaveBeenCalledWith("o1", "/output/a.png", "a.png");
  });
});

describe("OutputNodeBody image context menu", () => {
  it("fires onImageContextMenu when right-clicking a result image", () => {
    const onMenu = vi.fn();
    const node = createLegacyNode({
      id: "o1",
      kind: "output",
      width: 320,
      height: 280,
      images: [{ url: "/output/a.png", kind: "image", name: "a.png" }],
      settings: {
        outputImages: [{ url: "/output/a.png", runMs: 1000 }],
      },
    });
    useLegacyCanvasStore.setState({ nodes: [node] });

    render(
      <OutputNodeBody node={node} onImageContextMenu={onMenu} />,
    );
    fireEvent.contextMenu(screen.getByTestId("output-image-preview-o1-0"), {
      clientX: 120,
      clientY: 80,
    });
    expect(onMenu).toHaveBeenCalledWith(
      "o1",
      "/output/a.png",
      120,
      80,
      "a.png",
    );
  });
});
