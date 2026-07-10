import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectionBox } from "../../src/features/smart-canvas/components/SelectionBox";
import { ImageEditModal } from "../../src/features/smart-canvas/components/ImageEditModal";

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
