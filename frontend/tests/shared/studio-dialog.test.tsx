import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StudioDialog } from "../../src/shared/ui/StudioDialog";

describe("StudioDialog", () => {
  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(
      <StudioDialog open={false} onClose={() => {}} title="标题">
        内容
      </StudioDialog>,
    );
    expect(screen.queryByTestId("studio-dialog")).toBeNull();
  });

  it("renders title and body when open", () => {
    render(
      <StudioDialog open onClose={() => {}} title="保存成功" variant="success">
        配置已写入。
      </StudioDialog>,
    );
    expect(screen.getByTestId("studio-dialog")).toBeTruthy();
    expect(screen.getByText("保存成功")).toBeTruthy();
    expect(screen.getByText("配置已写入。")).toBeTruthy();
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    render(
      <StudioDialog open onClose={onClose} title="提示">
        内容
      </StudioDialog>,
    );
    fireEvent.click(screen.getByTestId("studio-dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop click when disabled", () => {
    const onClose = vi.fn();
    render(
      <StudioDialog open onClose={onClose} title="提示" closeOnBackdropClick={false}>
        内容
      </StudioDialog>,
    );
    fireEvent.click(screen.getByTestId("studio-dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <StudioDialog open onClose={onClose} title="提示">
        内容
      </StudioDialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls action handlers from footer buttons", () => {
    const onClose = vi.fn();
    const onPrimary = vi.fn();
    render(
      <StudioDialog
        open
        onClose={onClose}
        title="确认删除"
        variant="warning"
        secondaryAction={{ label: "取消", onClick: onClose, testId: "dlg-cancel" }}
        primaryAction={{ label: "删除", onClick: onPrimary, testId: "dlg-delete" }}
      >
        此操作不可撤销。
      </StudioDialog>,
    );
    fireEvent.click(screen.getByTestId("dlg-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("dlg-delete"));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("closes via header close button", () => {
    const onClose = vi.fn();
    render(
      <StudioDialog open onClose={onClose} title="提示">
        内容
      </StudioDialog>,
    );
    fireEvent.click(screen.getByTestId("studio-dialog-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
