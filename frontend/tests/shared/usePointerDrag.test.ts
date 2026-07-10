import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePointerDrag } from "../../src/shared/hooks/usePointerDrag";

describe("usePointerDrag", () => {
  it("returns pointer handlers", () => {
    const { result } = renderHook(() =>
      usePointerDrag(() => {}),
    );
    expect(result.current.onPointerDown).toBeTypeOf("function");
    expect(result.current.onPointerMove).toBeTypeOf("function");
    expect(result.current.onPointerUp).toBeTypeOf("function");
  });

  it("calls onMove when dragging", () => {
    const moves: Array<[number, number]> = [];
    const { result } = renderHook(() =>
      usePointerDrag((dx, dy) => moves.push([dx, dy])),
    );
    const el = document.createElement("div");
    const down = {
      button: 0,
      clientX: 10,
      clientY: 20,
      pointerId: 1,
      currentTarget: el,
      stopPropagation: () => {},
      nativeEvent: {} as PointerEvent,
    } as unknown as React.PointerEvent;
    el.setPointerCapture = () => {};
    act(() => result.current.onPointerDown(down));
    act(() =>
      result.current.onPointerMove({
        clientX: 15,
        clientY: 25,
        nativeEvent: {} as PointerEvent,
      } as React.PointerEvent),
    );
    expect(moves).toEqual([[5, 5]]);
  });
});
