import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GroupToolbar } from "../../src/features/smart-canvas/components/GroupToolbar";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";

describe("GroupToolbar", () => {
  afterEach(() => cleanup());

  const group = normalizeNode({ id: "g1", kind: "group", x: 100, y: 200, title: "测试组" });

  it("renders member count and actions", () => {
    render(
      <GroupToolbar
        group={group}
        memberCount={3}
        onLayout={() => {}}
        onPreview={() => {}}
        onGrid={() => {}}
        onDownload={() => {}}
        onUngroup={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId("group-toolbar-g1")).toBeTruthy();
    expect(screen.getByTestId("group-layout-btn")).toBeTruthy();
    expect(screen.getByTestId("group-download-btn")).toBeTruthy();
    expect(screen.getByTestId("group-delete-btn")).toBeTruthy();
    expect(screen.getByText(/测试组/)).toBeTruthy();
    expect(screen.getByText(/\(3\)/)).toBeTruthy();
  });

  it("calls onDelete when trash clicked", () => {
    let deleted = false;
    render(
      <GroupToolbar
        group={group}
        memberCount={1}
        onLayout={() => {}}
        onPreview={() => {}}
        onGrid={() => {}}
        onDownload={() => {}}
        onUngroup={() => {}}
        onDelete={() => {
          deleted = true;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("group-delete-btn"));
    expect(deleted).toBe(true);
  });
});
