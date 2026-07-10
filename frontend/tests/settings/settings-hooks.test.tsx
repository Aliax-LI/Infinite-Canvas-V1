import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, fireEvent, act } from "@testing-library/react";
import { useEscapeKey } from "../../src/shared/hooks/useEscapeKey";

function EscapeProbe({ active, onClose }: { active: boolean; onClose: () => void }) {
  useEscapeKey(active, onClose);
  return null;
}

describe("useEscapeKey", () => {
  afterEach(() => cleanup());

  it("calls onClose when Escape is pressed while active", () => {
    const onClose = vi.fn();
    render(<EscapeProbe active onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when inactive", () => {
    const onClose = vi.fn();
    render(<EscapeProbe active={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("useStatusToast", () => {
  afterEach(() => cleanup());

  it("clears status after timeout", async () => {
    vi.useFakeTimers();
    const { useStatusToast: hook } = await import("../../src/shared/hooks/useStatusToast");

    function StatusProbe() {
      const { statusText, setStatusText } = hook(1000);
      return (
        <div>
          <span data-testid="status">{statusText}</span>
          <button type="button" onClick={() => setStatusText("saved")}>
            set
          </button>
        </div>
      );
    }

    const { getByTestId, getByText } = render(<StatusProbe />);
    fireEvent.click(getByText("set"));
    expect(getByTestId("status").textContent).toBe("saved");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByTestId("status").textContent).toBe("");
    vi.useRealTimers();
  });
});
