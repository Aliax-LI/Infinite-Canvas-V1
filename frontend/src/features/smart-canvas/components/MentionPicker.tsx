import { useSmartCanvasStore } from "../core/state";

interface MentionPickerProps {
  open: boolean;
  onSelect: (mention: string) => void;
  onClose: () => void;
}

export function MentionPicker({ open, onSelect, onClose }: MentionPickerProps) {
  const nodes = useSmartCanvasStore((s) => s.nodes);
  const mentionable = nodes.filter((n) => n.kind === "image" || n.kind === "video");

  if (!open) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-64 border border-[var(--border)] bg-[var(--bg)] max-h-40 overflow-auto z-30" data-testid="mention-picker">
      {mentionable.length === 0 ? (
        <p className="p-3 text-sm text-[var(--muted)]">无可引用节点</p>
      ) : (
        mentionable.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => { onSelect(`@${n.title || n.id}`); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--nav-hover-bg)]"
          >
            @{n.title || n.kind}
          </button>
        ))
      )}
    </div>
  );
}
