import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SmartCanvasToolbar } from "../../src/features/smart-canvas/components/SmartCanvasToolbar";

const baseProps = {
  title: "测试画布",
  dirty: true,
  assetOpen: false,
  onToggleAssets: vi.fn(),
  onOpenTransfer: vi.fn(),
  onOpenLogs: vi.fn(),
  onOpenShortcuts: vi.fn(),
};

describe("SmartCanvasToolbar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders history floating chrome without bottom edit cluster", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("smart-canvas-toolbar")).toBeTruthy();
    expect(screen.getByTestId("assets-btn")).toBeTruthy();
    expect(screen.getByTestId("workflow-transfer-btn")).toBeTruthy();
    expect(screen.getByTestId("logs-btn")).toBeTruthy();
    expect(screen.getByTestId("shortcuts-btn")).toBeTruthy();
    expect(screen.getByTestId("smart-dirty-badge")).toBeTruthy();
    expect(screen.queryByTestId("smart-edit-cluster")).toBeNull();
    expect(screen.queryByTestId("undo-btn")).toBeNull();
    expect(screen.queryByTestId("legacy-save-btn")).toBeNull();
    expect(screen.queryByTitle("导入")).toBeNull();
    expect(screen.queryByTitle("导出")).toBeNull();
  });

  it("wires transfer and asset handlers", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("workflow-transfer-btn"));
    expect(baseProps.onOpenTransfer).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("assets-btn"));
    expect(baseProps.onToggleAssets).toHaveBeenCalled();
  });

  it("marks asset library active", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} assetOpen />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("assets-btn").getAttribute("aria-pressed")).toBe("true");
  });
});
