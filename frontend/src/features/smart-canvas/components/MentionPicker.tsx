import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import type { AssetLibraryResponse } from "../../asset-manager/types";
import { useSmartCanvasStore } from "../core/state";

export interface MentionItem {
  label: string;
  url: string;
  source: "node" | "asset";
}

interface MentionPickerProps {
  open: boolean;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
}

function flattenLibraryImages(data: AssetLibraryResponse | undefined) {
  const lib = data?.library;
  if (!lib) return [] as Array<{ url: string; name?: string }>;
  const activeId = lib.active_library_id ?? lib.libraries?.[0]?.id ?? "";
  const active =
    lib.libraries?.find((item) => item.id === activeId) ?? lib.libraries?.[0];
  const categories = active?.categories ?? lib.categories ?? [];
  return categories
    .filter((c) => c.type !== "workflow")
    .flatMap((c) => c.items ?? [])
    .filter((item) => item.url)
    .map((item) => ({ url: item.url!, name: item.name }));
}

/** Fork-first: history `@` mentions attach real image URLs as refs, not bare text. */
export function MentionPicker({ open, onSelect, onClose }: MentionPickerProps) {
  const nodes = useSmartCanvasStore((s) => s.nodes);

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library-mention"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
    enabled: open,
  });

  if (!open) return null;

  const fromNodes: MentionItem[] = nodes.flatMap((n) =>
    (n.images ?? [])
      .filter((img) => img.url)
      .map((img, index) => ({
        label: img.name || n.title || `${n.kind}-${index + 1}`,
        url: img.url,
        source: "node" as const,
      })),
  );

  const fromAssets: MentionItem[] = flattenLibraryImages(libraryData).map((item) => ({
    label: item.name || "素材",
    url: item.url,
    source: "asset" as const,
  }));

  const seen = new Set<string>();
  const items = [...fromNodes, ...fromAssets].filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  return (
    <div
      className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-auto z-40"
      data-testid="mention-picker"
      role="listbox"
      aria-label="@ 引用素材"
    >
      {items.length === 0 ? (
        <p className="p-3 text-sm text-gray-500 font-serif">无可引用素材（画布图片或素材库）</p>
      ) : (
        items.map((item) => (
          <button
            key={`${item.source}-${item.url}`}
            type="button"
            role="option"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm font-serif hover:bg-gray-50 border-b border-gray-100 last:border-0"
            data-testid="mention-item"
          >
            <img
              src={item.url}
              alt=""
              className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0"
            />
            <span className="truncate">
              @{item.label}
              <span className="ml-1 text-[10px] text-gray-400 font-mono">
                {item.source === "asset" ? "素材库" : "画布"}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
