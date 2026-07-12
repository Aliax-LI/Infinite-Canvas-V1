import { useEffect, useRef } from "react";
import { LEGACY_NODE_KINDS, LEGACY_NODE_LABELS, type LegacyNodeKind } from "../core/types";

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  onClose: () => void;
  onCreate: (kind: LegacyNodeKind, x: number, y: number) => void;
}

export function ContextMenu({
  open,
  x,
  y,
  worldX,
  worldY,
  onClose,
  onCreate,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] max-h-80 overflow-auto border border-gray-200 bg-white rounded-lg shadow-lg py-1"
      style={{ left: x, top: y }}
      data-testid="legacy-context-menu"
    >
      <p className="px-3 py-1 text-xs text-gray-500 border-b border-gray-100">
        添加节点
      </p>
      {LEGACY_NODE_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
          data-testid={`legacy-context-menu-${kind}`}
          onClick={() => {
            onCreate(kind, worldX, worldY);
            onClose();
          }}
        >
          {LEGACY_NODE_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
