import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import type { PromptTemplate } from "../../../types/api";
import { X } from "lucide-react";

interface PromptLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
}

export function PromptLibraryPanel({
  open,
  onClose,
  onSelect,
}: PromptLibraryPanelProps) {
  const { data: libraries } = useQuery({
    queryKey: ["prompt-libraries"],
    queryFn: () =>
      api.get<{ libraries?: Array<{ id: string; name: string }> }>(
        "/api/prompt-libraries",
      ),
    enabled: open,
  });

  const { data: templates } = useQuery({
    queryKey: ["smart-canvas-prompt-templates"],
    queryFn: () =>
      api.get<{ templates: PromptTemplate[] }>(
        "/api/smart-canvas/prompt-templates",
      ),
    enabled: open,
  });

  if (!open) return null;

  return (
    <aside
      className="absolute left-0 top-14 bottom-0 w-72 border-r border-[var(--border)] bg-[var(--bg)] z-20 flex flex-col"
      data-testid="prompt-library-panel"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-medium text-sm">提示词模板</h3>
        <button type="button" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-2">
        {(templates?.templates ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.content)}
            className="w-full text-left border border-[var(--border)] p-3 mb-2 hover:bg-[var(--nav-hover-bg)]"
          >
            <div className="font-medium text-sm mb-1">{t.title}</div>
            <div className="text-xs text-[var(--muted)] line-clamp-2">
              {t.content}
            </div>
          </button>
        ))}
        {(libraries?.libraries ?? []).length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-4 px-2">
            {libraries?.libraries?.length} 个自定义库
          </p>
        )}
      </div>
    </aside>
  );
}
