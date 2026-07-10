import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { X } from "lucide-react";

interface AssetPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function AssetPanel({ open, onClose, onSelect }: AssetPanelProps) {
  const { data: library } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () =>
      api.get<{ items?: Array<{ url: string; name?: string }> }>(
        "/api/asset-library",
      ),
    enabled: open,
  });

  const { data: local } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () =>
      api.get<{ assets?: Array<{ url: string; name?: string }> }>(
        "/api/local-assets",
      ),
    enabled: open,
  });

  if (!open) return null;

  const items = [
    ...(library?.items ?? []),
    ...(local?.assets ?? []),
  ];

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 w-72 border-l border-[var(--border)] bg-[var(--bg)] z-20 flex flex-col"
      data-testid="asset-panel"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-medium text-sm">素材库</h3>
        <button type="button" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-2 grid grid-cols-2 gap-2">
        {items.length === 0 ? (
          <p className="col-span-2 text-sm text-[var(--muted)] p-4">暂无素材</p>
        ) : (
          items.map((item, i) => (
            <button
              key={`${item.url}-${i}`}
              type="button"
              onClick={() => onSelect(item.url)}
              className="border border-[var(--border)] overflow-hidden hover:border-black/30"
            >
              <img src={item.url} alt={item.name ?? ""} className="w-full h-20 object-cover" />
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
