import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StudioSelect } from "../../src/shared/ui/StudioSelect";

const OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
];

describe("StudioSelect", () => {
  afterEach(() => cleanup());

  it("renders selected label on trigger", () => {
    render(
      <StudioSelect
        value="openai"
        onChange={() => {}}
        options={OPTIONS}
        data-testid="proto"
      />,
    );
    expect(screen.getByTestId("proto-trigger").textContent).toContain("OpenAI");
    expect(screen.queryByTestId("proto-menu")).toBeNull();
  });

  it("opens menu on trigger click", () => {
    render(
      <StudioSelect
        value="openai"
        onChange={() => {}}
        options={OPTIONS}
        data-testid="proto"
      />,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    expect(screen.getByTestId("proto-menu")).toBeTruthy();
    expect(screen.getByTestId("proto-option-anthropic")).toBeTruthy();
  });

  it("selects option on click and calls onChange", () => {
    const onChange = vi.fn();
    render(
      <StudioSelect
        value="openai"
        onChange={onChange}
        options={OPTIONS}
        data-testid="proto"
      />,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    fireEvent.click(screen.getByTestId("proto-option-anthropic"));
    expect(onChange).toHaveBeenCalledWith("anthropic");
    expect(screen.queryByTestId("proto-menu")).toBeNull();
  });

  it("closes on Escape", () => {
    render(
      <StudioSelect
        value="openai"
        onChange={() => {}}
        options={OPTIONS}
        data-testid="proto"
      />,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    expect(screen.getByTestId("proto-menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("proto-trigger"), { key: "Escape" });
    expect(screen.queryByTestId("proto-menu")).toBeNull();
  });

  it("navigates with arrow keys and selects with Enter", () => {
    const onChange = vi.fn();
    render(
      <StudioSelect
        value="openai"
        onChange={onChange}
        options={OPTIONS}
        data-testid="proto"
      />,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    const trigger = screen.getByTestId("proto-trigger");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("anthropic");
  });

  it("closes when clicking outside", () => {
    render(
      <div>
        <StudioSelect
          value="openai"
          onChange={() => {}}
          options={OPTIONS}
          data-testid="proto"
        />
        <button type="button" data-testid="outside">
          outside
        </button>
      </div>,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    expect(screen.getByTestId("proto-menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("proto-menu")).toBeNull();
  });

  it("does not open when disabled", () => {
    render(
      <StudioSelect
        value="openai"
        onChange={() => {}}
        options={OPTIONS}
        disabled
        data-testid="proto"
      />,
    );
    fireEvent.click(screen.getByTestId("proto-trigger"));
    expect(screen.queryByTestId("proto-menu")).toBeNull();
  });
});
