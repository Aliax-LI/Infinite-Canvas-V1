import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SmartCanvasToolbar } from "../../src/features/smart-canvas/components/SmartCanvasToolbar";

const baseProps = {
  title: "测试画布",
  dirty: true,
  saving: false,
  connectMode: false,
  assetOpen: false,
  templateOpen: false,
  workflowOpen: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onArrange: vi.fn(),
  onToggleConnect: vi.fn(),
  onToggleAssets: vi.fn(),
  onToggleTemplates: vi.fn(),
  onToggleWorkflowPicker: vi.fn(),
  onOpenTransfer: vi.fn(),
  onAddImportNode: vi.fn(),
  onOpenCreateMenu: vi.fn(),
  onOpenLogs: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onSave: vi.fn(),
};

describe("SmartCanvasToolbar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders distinct actions without duplicate upload icons", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("smart-canvas-toolbar")).toBeTruthy();
    expect(screen.getByTestId("undo-btn")).toBeTruthy();
    expect(screen.getByTestId("redo-btn")).toBeTruthy();
    expect(screen.getByTestId("arrange-btn")).toBeTruthy();
    expect(screen.getByTestId("connect-mode-btn")).toBeTruthy();
    expect(screen.getByTestId("assets-btn")).toBeTruthy();
    expect(screen.getByTestId("templates-btn")).toBeTruthy();
    expect(screen.getByTestId("workflow-picker-btn")).toBeTruthy();
    expect(screen.getByTestId("workflow-transfer-btn")).toBeTruthy();
    expect(screen.getByTestId("add-node-btn")).toBeTruthy();
    expect(screen.getByTestId("logs-btn")).toBeTruthy();
    expect(screen.getByTestId("shortcuts-btn")).toBeTruthy();
    expect(screen.getByTestId("save-btn")).toBeTruthy();
    expect(screen.getByTestId("smart-dirty-badge")).toBeTruthy();
    // No standalone import/export icon buttons — merged into transfer
    expect(screen.queryByTitle("导入")).toBeNull();
    expect(screen.queryByTitle("导出")).toBeNull();
  });

  it("wires transfer and save handlers", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("workflow-transfer-btn"));
    expect(baseProps.onOpenTransfer).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("save-btn"));
    expect(baseProps.onSave).toHaveBeenCalled();
  });

  it("marks connect mode active", () => {
    render(
      <MemoryRouter>
        <SmartCanvasToolbar {...baseProps} connectMode />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("connect-mode-btn").getAttribute("aria-pressed")).toBe("true");
  });
});
