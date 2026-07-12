const SHORTCUTS = [
  { keys: "Ctrl+Z", action: "撤销" },
  { keys: "Ctrl+Shift+Z", action: "重做" },
  { keys: "Ctrl+S", action: "保存画布" },
  { keys: "Delete", action: "删除选中节点" },
  { keys: "Ctrl+G", action: "将选中节点分组" },
  { keys: "Ctrl+Shift+G", action: "解散选中分组" },
  { keys: "G", action: "切换连线模式" },
  { keys: "A", action: "打开素材面板" },
];

interface ShortcutModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutModal({ open, onClose }: ShortcutModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="shortcut-modal" role="dialog" aria-modal="true" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-md p-6" onPointerDown={(event) => event.stopPropagation()}>
        <h2 className="font-medium mb-4">快捷键</h2>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex justify-between text-sm">
              <span>{s.action}</span>
              <kbd className="border border-[var(--border)] px-2 py-0.5">{s.keys}</kbd>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="mt-4 px-4 py-2 border border-[var(--border)]">
          关闭
        </button>
      </div>
    </div>
  );
}
import { useEffect } from "react";
