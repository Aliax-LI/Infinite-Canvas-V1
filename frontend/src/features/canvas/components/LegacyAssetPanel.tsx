import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import type { AssetLibraryResponse } from "../../asset-manager/types";
import { X } from "lucide-react";

interface LegacyAssetPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

function flattenLibraryImages(data: AssetLibraryResponse | undefined) {
  const lib = data?.library;
  if (!lib) return [];
  const activeId = lib.active_library_id ?? lib.libraries?.[0]?.id ?? "";
  const active =
    lib.libraries?.find((item) => item.id === activeId) ?? lib.libraries?.[0];
  const categories = active?.categories ?? lib.categories ?? [];
  return categories
    .filter((c) => c.type !== "workflow")
    .flatMap((c) => c.items ?? [])
    .filter((item) => item.url);
}

export function LegacyAssetPanel({
  open,
  onClose,
  onSelect,
}: LegacyAssetPanelProps) {
  const { t } = useTranslation("assets");

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
    enabled: open,
  });

  const { data: localData } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () =>
      api.get<{ items?: Array<{ url: string; name?: string }> }>("/api/local-assets"),
    enabled: open,
  });

  const items = useMemo(() => {
    const libraryItems = flattenLibraryImages(libraryData);
    const localItems = (localData?.items ?? []).filter((item) => item.url);
    const seen = new Set<string>();
    return [...libraryItems, ...localItems].filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [libraryData, localData]);

  if (!open) return null;

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 w-72 border-l border-gray-200 bg-white z-30 flex flex-col shadow-lg"
      data-testid="legacy-asset-panel"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-medium text-sm">{t("title")}</h3>
        <button type="button" onClick={onClose} aria-label="close">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-2 grid grid-cols-2 gap-2 content-start">
        {items.length === 0 ? (
          <p className="col-span-2 text-sm text-gray-500 p-4">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <button
              key={item.url}
              type="button"
              onClick={() => onSelect(item.url!)}
              className="border border-gray-200 rounded-lg overflow-hidden hover:border-black transition-colors"
            >
              <img
                src={item.url}
                alt={item.name ?? ""}
                className="w-full h-auto object-cover"
                loading="lazy"
              />
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
