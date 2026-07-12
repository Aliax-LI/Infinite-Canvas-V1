import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectionBox } from "../../src/features/smart-canvas/components/SelectionBox";
import { SelectionToolbar } from "../../src/features/smart-canvas/components/SelectionToolbar";
import { ImageEditModal } from "../../src/features/smart-canvas/components/ImageEditModal";
import { NodeCard } from "../../src/features/smart-canvas/components/NodeCard";
import { LogModal } from "../../src/features/smart-canvas/components/LogModal";
import { ShortcutModal } from "../../src/features/smart-canvas/components/ShortcutModal";
import { WorkflowTransferModal } from "../../src/features/smart-canvas/components/WorkflowTransferModal";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";

describe("SelectionBox", () => {
  afterEach(() => cleanup());

  it("renders when visible with dimensions", () => {
    render(<SelectionBox x={10} y={20} width={100} height={50} visible />);
    const box = screen.getByTestId("selection-box");
    expect(box).toBeTruthy();
    expect(box.style.left).toBe("10px");
    expect(box.style.top).toBe("20px");
    expect(box.style.width).toBe("100px");
    expect(box.style.height).toBe("50px");
  });

  it("hides when not visible", () => {
    render(<SelectionBox x={0} y={0} width={100} height={50} visible={false} />);
    expect(screen.queryByTestId("selection-box")).toBeNull();
  });

  it("handles negative width/height", () => {
    render(<SelectionBox x={110} y={70} width={-100} height={-50} visible />);
    const box = screen.getByTestId("selection-box");
    expect(box.style.left).toBe("10px");
    expect(box.style.top).toBe("20px");
  });
});

describe("ImageEditModal", () => {
  afterEach(() => cleanup());

  it("shows modes and canvas when open", () => {
    render(
      <ImageEditModal
        open
        images={["https://example.com/a.png"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("image-edit-modal")).toBeTruthy();
    expect(screen.getByTestId("image-edit-mode-preview")).toBeTruthy();
    expect(screen.getByTestId("image-edit-mode-crop")).toBeTruthy();
    expect(screen.getByTestId("image-edit-canvas")).toBeTruthy();
  });

  it("calls onClose when cancel clicked", () => {
    let closed = false;
    render(
      <ImageEditModal
        open
        images={["https://example.com/a.png"]}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("image-edit-cancel"));
    expect(closed).toBe(true);
  });
});

describe("smart canvas dialogs", () => {
  afterEach(() => cleanup());

  it.each([
    ["log", (onClose: () => void) => <LogModal open onClose={onClose} logs={[]} />],
    ["shortcuts", (onClose: () => void) => <ShortcutModal open onClose={onClose} />],
    ["workflow", (onClose: () => void) => <WorkflowTransferModal open onClose={onClose} onImport={() => {}} onExport={() => {}} />],
  ])("closes the %s dialog from its backdrop and Escape", (_name, renderDialog) => {
    let closed = 0;
    const { unmount } = render(renderDialog(() => { closed += 1; }));
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(2);
    unmount();
  });
});

describe("SelectionToolbar", () => {
  afterEach(() => cleanup());

  it("hides for single selection (count < 2)", () => {
    render(
      <SelectionToolbar x={10} y={40} count={1} onDelete={() => {}} />,
    );
    expect(screen.queryByTestId("selection-toolbar")).toBeNull();
  });

  it("renders count and delete only for multi-select", () => {
    let deleted = false;
    render(
      <SelectionToolbar
        x={10}
        y={40}
        count={2}
        onDelete={() => {
          deleted = true;
        }}
      />,
    );
    expect(screen.getByTestId("selection-toolbar")).toBeTruthy();
    expect(screen.getByText(/已选 2/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("selection-toolbar-delete"));
    expect(deleted).toBe(true);
  });
});

describe("NodeCard delete", () => {
  afterEach(() => cleanup());

  it("shows header delete for non-group nodes", () => {
    let deletedId = "";
    const node = normalizeNode({ id: "n1", kind: "image", x: 0, y: 0, title: "导入" });
    render(
      <NodeCard
        node={node}
        selected
        onSelect={() => {}}
        onDrag={() => {}}
        onDelete={(id) => {
          deletedId = id;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("node-delete-n1"));
    expect(deletedId).toBe("n1");
  });

  it("hides header delete for group cards", () => {
    const node = normalizeNode({ id: "g1", kind: "group", x: 0, y: 0 });
    render(
      <NodeCard
        node={node}
        selected
        onSelect={() => {}}
        onDrag={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByTestId("node-delete-g1")).toBeNull();
  });

  it("does not begin a drag when using the upload control", () => {
    let drags = 0;
    let uploads = 0;
    const node = normalizeNode({ id: "upload", kind: "image", x: 0, y: 0 });
    render(
      <NodeCard
        node={node}
        selected={false}
        onSelect={() => {}}
        onDrag={() => {}}
        onDragStart={() => { drags += 1; }}
        onUpload={() => { uploads += 1; }}
      />,
    );
    const zone = screen.getByTestId("node-upload-zone-upload");
    fireEvent.pointerDown(zone);
    fireEvent.click(zone);
    expect(drags).toBe(0);
    expect(uploads).toBe(1);
  });

  it("shows group member imagery and both connection ports", () => {
    const node = normalizeNode({ id: "group", kind: "group", x: 0, y: 0 });
    render(
      <NodeCard
        node={node}
        selected={false}
        onSelect={() => {}}
        onDrag={() => {}}
        onConnect={() => {}}
        groupImages={[{ url: "https://example.com/member.png" }]}
      />,
    );
    expect(screen.getByTestId("group-preview-group")).toBeTruthy();
    expect(screen.getByTestId("connect-input-group")).toBeTruthy();
    expect(screen.getByTestId("connect-port-group")).toBeTruthy();
  });
});
