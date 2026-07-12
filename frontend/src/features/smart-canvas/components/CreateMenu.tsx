import { useEffect, useRef } from "react";
import { Image, Layers, ListOrdered, MessageSquare } from "lucide-react";
import {
  createImageNode,
  createLoopNode,
  createPromptNode,
  createSmartGroupNode,
} from "../core/nodeFactory";

export type CreateKind = "image" | "group" | "prompt" | "loop";

interface CreateMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onCreate: (kind: CreateKind, x: number, y: number) => void;
}

const items: { kind: CreateKind; label: string; icon: typeof Image }[] = [
  { kind: "image", label: "导入节点", icon: Image },
  { kind: "group", label: "智能分组", icon: Layers },
  { kind: "prompt", label: "Prompt 节点", icon: MessageSquare },
  { kind: "loop", label: "Loop 节点", icon: ListOrdered },
];

export function createNodeByKind(kind: CreateKind, x: number, y: number) {
  switch (kind) {
    case "prompt":
      return createPromptNode(x, y);
    case "loop":
      return createLoopNode(x, y);
    case "group":
      return createSmartGroupNode(x, y);
    default:
      return createImageNode({ x, y });
  }
}

export function CreateMenu({ open, x, y, onClose, onCreate }: CreateMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] border border-[var(--border)] bg-[var(--bg)] shadow-lg py-1"
      style={{ left: x, top: y }}
      data-testid="create-menu"
    >
      {items.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--nav-hover-bg)] text-left"
          data-testid={`create-menu-${kind}`}
          onClick={() => {
            onCreate(kind, x, y);
            onClose();
          }}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
