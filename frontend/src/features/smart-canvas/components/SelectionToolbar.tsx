import { Trash2 } from "lucide-react";

interface SelectionToolbarProps {
  /** World-space top-left of the selection bbox. */
  x: number;
  y: number;
  count: number;
  onDelete: () => void;
}

/** Floating bulk bar — only for multi-select (≥2). Single-node delete = node header trash. */
export function SelectionToolbar({ x, y, count, onDelete }: SelectionToolbarProps) {
  if (count < 2) return null;
  return (
    <div
      className="absolute z-20 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-sm text-xs"
      style={{ left: x, top: y - 40 }}
      data-testid="selection-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1 text-gray-600 font-serif">已选 {count}</span>
      <button
        type="button"
        title="删除选中 (Delete)"
        data-testid="selection-toolbar-delete"
        onClick={onDelete}
        className="rounded-lg p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
