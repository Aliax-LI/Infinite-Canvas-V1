import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashPanel } from "../../src/features/canvas-list/components/TrashPanel";
import "../../src/shared/i18n";
import type { CanvasRecord, ProjectRecord } from "../../src/types/api";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const projects: ProjectRecord[] = [{ id: "default", name: "默认项目" }];

const canvases: CanvasRecord[] = [
  {
    id: "c1",
    title: "画布一",
    kind: "smart",
    project: "default",
    deleted_at: 1_720_000_000_000,
  },
  {
    id: "c2",
    title: "画布二",
    kind: "classic",
    project: "default",
    deleted_at: 1_720_000_100_000,
  },
];

function renderTrash(overrides: Partial<ComponentProps<typeof TrashPanel>> = {}) {
  const onRestore = vi.fn();
  const onPurge = vi.fn();
  const onRestoreBatch = vi.fn();
  const onPurgeBatch = vi.fn();
  const onClose = vi.fn();
  render(
    <TrashPanel
      open
      canvases={canvases}
      projects={projects}
      retentionDays={30}
      onClose={onClose}
      onRestore={onRestore}
      onPurge={onPurge}
      onRestoreBatch={onRestoreBatch}
      onPurgeBatch={onPurgeBatch}
      {...overrides}
    />,
  );
  return { onRestore, onPurge, onRestoreBatch, onPurgeBatch, onClose };
}

describe("TrashPanel batch actions", () => {
  it("renders batch bar with select-all and disabled batch actions", () => {
    renderTrash();
    expect(screen.getByTestId("trash-batch-bar")).toBeInTheDocument();
    expect(screen.getByTestId("trash-selected-count")).toHaveTextContent("0");
    expect(screen.getByTestId("trash-restore-selected")).toBeDisabled();
    expect(screen.getByTestId("trash-purge-selected")).toBeDisabled();
  });

  it("selects all and restores selected canvases", () => {
    const { onRestoreBatch } = renderTrash();
    fireEvent.click(screen.getByTestId("trash-select-all"));
    expect(screen.getByTestId("trash-card-c1")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("trash-card-c2")).toHaveAttribute(
      "data-selected",
      "true",
    );
    fireEvent.click(screen.getByTestId("trash-restore-selected"));
    expect(onRestoreBatch).toHaveBeenCalledWith(["c1", "c2"]);
  });

  it("confirms before batch permanent delete", () => {
    const { onPurgeBatch } = renderTrash();
    fireEvent.click(screen.getByTestId("trash-checkbox-c1"));
    fireEvent.click(screen.getByTestId("trash-purge-selected"));
    expect(screen.getByTestId("trash-batch-purge-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("trash-batch-purge-yes"));
    expect(onPurgeBatch).toHaveBeenCalledWith(["c1"]);
  });

  it("keeps single-item restore and purge", () => {
    const { onRestore, onPurge } = renderTrash();
    fireEvent.click(screen.getByTestId("trash-restore-c2"));
    expect(onRestore).toHaveBeenCalledWith("c2");
    fireEvent.click(screen.getByTestId("trash-purge-c1"));
    fireEvent.click(screen.getByTestId("trash-purge-yes-c1"));
    expect(onPurge).toHaveBeenCalledWith("c1");
  });

  it("hides batch bar when trash is empty", () => {
    renderTrash({ canvases: [] });
    expect(screen.queryByTestId("trash-batch-bar")).not.toBeInTheDocument();
    expect(screen.getByText(/回收站为空|Trash is empty/)).toBeInTheDocument();
  });
});
