import { hasPrimaryMod } from "../../../shared/utils/platformShortcuts";

export interface SelectedImage {
  nodeId: string;
  index: number;
}

export type ShortcutAction =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "delete"
  | "save"
  | "connect"
  | "assets"
  | "group"
  | "ungroup"
  | "selectBox";

export interface ShortcutBinding {
  key: string;
  mod?: boolean;
  shift?: boolean;
  action: ShortcutAction;
}

export const SMART_CANVAS_SHORTCUTS: ShortcutBinding[] = [
  { key: "z", mod: true, action: "undo" },
  { key: "z", mod: true, shift: true, action: "redo" },
  { key: "y", mod: true, action: "redo" },
  { key: "c", mod: true, action: "copy" },
  { key: "v", mod: true, action: "paste" },
  { key: "s", mod: true, action: "save" },
  { key: "g", mod: true, action: "group" },
  { key: "g", mod: true, shift: true, action: "ungroup" },
  { key: "Delete", action: "delete" },
  { key: "Backspace", action: "delete" },
  { key: "g", action: "connect" },
  { key: "a", action: "assets" },
  { key: "r", action: "selectBox" },
];

export function matchShortcut(e: KeyboardEvent): ShortcutAction | null {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
    return null;
  }
  const mod = hasPrimaryMod(e);
  for (const binding of SMART_CANVAS_SHORTCUTS) {
    const modMatch = binding.mod ? mod : !mod;
    const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
    if (
      modMatch &&
      shiftMatch &&
      e.key.toLowerCase() === binding.key.toLowerCase()
    ) {
      return binding.action;
    }
  }
  return null;
}

export function imageLayout(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

export function thumbGridStyle(index: number, count: number, cellW: number, cellH: number) {
  const { cols } = imageLayout(count);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    left: col * cellW,
    top: row * cellH,
    width: cellW,
    height: cellH,
  };
}
