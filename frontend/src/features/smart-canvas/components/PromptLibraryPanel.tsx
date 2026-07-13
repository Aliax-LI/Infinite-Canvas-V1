import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import type { PromptLibrariesResponse, PromptTemplate } from "../../../types/api";
import { X } from "lucide-react";
import {
  normalizeLibraryItems,
  templateApplyText,
  templateName,
  templatePositive,
} from "../../canvas/core/promptTemplates";

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
    queryFn: () => api.get<PromptLibrariesResponse>("/api/prompt-libraries"),
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

  const libraryItems = normalizeLibraryItems(
    libraries?.library?.libraries ?? [],
    libraries?.library?.active_library_id || "system",
  );
  const fallbackItems = (templates?.templates ?? [])
    .map((item) => ({
      ...item,
      id: item.id,
      name: templateName(item),
      positive: templatePositive(item),
    }))
    .filter((item) => item.id && item.positive);
  const items = libraryItems.length ? libraryItems : fallbackItems;

  return (
    <aside
      className="absolute left-[22px] top-[110px] bottom-[168px] w-72 border border-[var(--border)] bg-[var(--bg)]/95 z-20 flex flex-col shadow-[0_22px_58px_var(--shadow)] backdrop-blur-xl"
      data-testid="prompt-library-panel"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-medium text-sm">提示词模板</h3>
        <button type="button" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(templateApplyText(item, "positive"))}
            className="w-full text-left border border-[var(--border)] p-3 mb-2 hover:bg-[var(--nav-hover-bg)]"
          >
            <div className="font-medium text-sm mb-1">{item.name}</div>
            <div className="text-xs text-[var(--muted)] line-clamp-2">
              {item.positive}
            </div>
          </button>
        ))}
        {(libraries?.library?.libraries ?? []).length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-4 px-2">
            {libraries?.library?.libraries?.length} 个自定义库
          </p>
        )}
      </div>
    </aside>
  );
}
