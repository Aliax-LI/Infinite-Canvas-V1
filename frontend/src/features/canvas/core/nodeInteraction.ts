/**
 * Fork-first from history/static/js/canvas.js `isNodeControl` / `isNodeDragSurface`.
 * Controls must receive clicks; node drag only starts on chrome/empty surface.
 */
export function isNodeControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        "textarea",
        "input",
        "select",
        "option",
        "button",
        "a",
        "label",
        "audio",
        "video",
        '[contenteditable="true"]',
        '[role="listbox"]',
        '[role="option"]',
        '[role="combobox"]',
        ".studio-select",
        ".studio-select-menu",
        ".studio-select-trigger",
        ".studio-select-option",
        "[data-node-control]",
      ].join(", "),
    ),
  );
}

export function isNodeDragSurface(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (isNodeControl(target)) return false;
  // Ports / hit pads / resize — never start node drag (magnetic connect UX).
  if (
    target.closest(
      [
        "[data-testid^='legacy-port-']",
        "[data-port]",
        "[data-port-hit]",
        "[data-testid^='legacy-resize-']",
        ".resize-handle",
      ].join(", "),
    )
  ) {
    return false;
  }
  return true;
}

/** True when event originated on a connection port (or its hit pad). */
export function isPortElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "[data-testid^='legacy-port-'], [data-port], [data-port-hit]",
    ),
  );
}
