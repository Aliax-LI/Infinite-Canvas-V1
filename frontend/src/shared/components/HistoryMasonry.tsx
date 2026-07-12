import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderPlus, ImagePlus, Trash2 } from "lucide-react";
import { STUDIO_IMAGE_URL_MIME } from "../../features/tools/pages/onlineRefs";
import { api } from "../api/client";
import { useAssetLibrarySync } from "../hooks/useAssetLibrarySync";

export interface HistoryItem {
  timestamp: number;
  prompt?: string;
  images?: string[];
  type?: string;
}

export type HistoryPreviewContext = { urls: string[]; index: number };

interface HistoryMasonryProps {
  type?: string;
  onSelect?: (item: HistoryItem) => void;
  /** Second arg carries full gallery when the history item has multiple images. */
  onPreview?: (url: string, context?: HistoryPreviewContext) => void;
  /** Add an archive image to the caller's reference list (e.g. OnlinePage). */
  onAddReference?: (url: string, item: HistoryItem) => void;
  testId?: string;
}

function itemKey(item: HistoryItem): string {
  return String(item.timestamp);
}

export function HistoryMasonry({
  type,
  onSelect,
  onPreview,
  onAddReference,
  testId = "history-masonry",
}: HistoryMasonryProps) {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const { addToLibrary, isAdding, statusText, canAddToLibrary } = useAssetLibrarySync();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryKey = type ? ["history", type] : ["history"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = type ? `?type=${encodeURIComponent(type)}` : "";
      return api.get<HistoryItem[]>(`/api/history${qs}`);
    },
  });

  const items = useMemo(
    () => (data ?? []).filter((item) => (item.images ?? []).some(Boolean)),
    [data],
  );

  const invalidateHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const deleteMutation = useMutation({
    mutationFn: (timestamps: number[]) => {
      if (timestamps.length === 1) {
        return api.post<{ success: boolean }>("/api/history/delete", {
          timestamp: timestamps[0],
        });
      }
      return api.post<{ success: boolean }>("/api/history/delete-batch", {
        timestamps,
      });
    },
    onSuccess: async () => {
      setSelected(new Set());
      setSelectMode(false);
      await invalidateHistory();
    },
  });

  const handleDeleteOne = useCallback(
    (event: MouseEvent, item: HistoryItem) => {
      event.stopPropagation();
      event.preventDefault();
      if (!window.confirm(t("studio.deleteArchiveConfirm"))) return;
      deleteMutation.mutate([item.timestamp]);
    },
    [deleteMutation, t],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selected.size) return;
    const message = t("studio.deleteSelectedConfirm", { count: selected.size });
    if (!window.confirm(message)) return;
    const timestamps = items
      .filter((item) => selected.has(itemKey(item)))
      .map((item) => item.timestamp);
    deleteMutation.mutate(timestamps);
  }, [deleteMutation, items, selected, t]);

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map(itemKey)));
  }, [items]);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-loading`}>
        {t("studio.loadingArchives")}
      </p>
    );
  }

  if (!items.length) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-empty`}>
        {t("studio.archivesEmpty")}
      </p>
    );
  }

  return (
    <div className="studio-history-root" data-testid={testId}>
      <div className="studio-history-toolbar" data-testid={`${testId}-toolbar`}>
        {!selectMode ? (
          <button
            type="button"
            className="studio-history-btn"
            onClick={() => setSelectMode(true)}
            data-testid={`${testId}-select-mode`}
          >
            {t("studio.selectMode")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="studio-history-btn"
              onClick={selectAll}
              data-testid={`${testId}-select-all`}
            >
              {t("studio.selectAll")}
            </button>
            <button
              type="button"
              className="studio-history-btn studio-history-btn--primary"
              disabled={!selected.size || deleteMutation.isPending}
              onClick={handleDeleteSelected}
              data-testid={`${testId}-delete-selected`}
            >
              {t("studio.deleteSelected", { count: selected.size })}
            </button>
            <button
              type="button"
              className="studio-history-btn"
              onClick={exitSelectMode}
              data-testid={`${testId}-cancel-select`}
            >
              {t("studio.cancelSelect")}
            </button>
          </>
        )}
      </div>

      <div className="studio-history-masonry" data-testid={`${testId}-grid`}>
        {items.map((item) => {
          const urls = (item.images ?? []).filter(Boolean);
          const url = urls[0];
          if (!url) return null;
          const key = itemKey(item);
          const isBroken = broken[key];
          const multi = urls.length > 1;
          const isSelected = selected.has(key);

          const handleAddReference = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            if (isBroken || !url) return;
            onAddReference?.(url, item);
          };

          const handleAddToLibrary = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            if (isBroken || !urls.length || !canAddToLibrary || isAdding) return;
            addToLibrary({
              urls,
              name: item.prompt?.slice(0, 80) ?? "",
            });
          };

          const handleDragStart = (event: DragEvent<HTMLImageElement>) => {
            if (isBroken || !url) return;
            event.dataTransfer.setData(STUDIO_IMAGE_URL_MIME, url);
            event.dataTransfer.setData("text/plain", url);
            event.dataTransfer.effectAllowed = "copy";
          };

          const handleCardClick = () => {
            if (selectMode) {
              toggleSelected(key);
              return;
            }
            if (isBroken) return;
            onSelect?.(item);
            onPreview?.(url, multi ? { urls, index: 0 } : undefined);
          };

          return (
            <div
              key={key}
              className={`studio-history-item group${selectMode && isSelected ? " is-selected" : ""}`}
            >
              <button
                type="button"
                className="studio-history-item-trigger"
                onClick={handleCardClick}
                data-testid={`history-item-${item.timestamp}`}
              >
                {isBroken ? (
                  <div
                    className="studio-history-item-missing"
                    data-testid={`history-item-missing-${item.timestamp}`}
                  >
                    {t("studio.missingAsset")}
                  </div>
                ) : multi ? (
                  <div
                    className={`w-full aspect-square grid gap-0.5 bg-[var(--border)] ${
                      urls.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"
                    }`}
                    data-testid={`history-item-multi-${item.timestamp}`}
                  >
                    {urls.slice(0, 4).map((thumb, idx) => (
                      <img
                        key={`${thumb}-${idx}`}
                        src={thumb}
                        alt=""
                        className="w-full h-full object-cover min-h-0"
                        loading="lazy"
                        draggable={Boolean(onAddReference) && idx === 0 && !selectMode}
                        onDragStart={idx === 0 ? handleDragStart : undefined}
                        onError={() => {
                          if (idx === 0) setBroken((prev) => ({ ...prev, [key]: true }));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <img
                    src={url}
                    alt={item.prompt ?? ""}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                    draggable={Boolean(onAddReference) && !selectMode}
                    onDragStart={handleDragStart}
                    onError={() => setBroken((prev) => ({ ...prev, [key]: true }))}
                  />
                )}
                {onAddReference && !isBroken && !selectMode && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="studio-history-add-ref"
                    aria-label={t("online.addRef")}
                    data-testid={`history-add-ref-${item.timestamp}`}
                    onClick={handleAddReference}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleAddReference(event as unknown as MouseEvent);
                      }
                    }}
                  >
                    <ImagePlus className="w-3 h-3" />
                    {t("online.addRef")}
                  </span>
                )}
                {canAddToLibrary && !isBroken && !selectMode && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="studio-history-add-library"
                    aria-label={t("studio.addToLibrary")}
                    data-testid={`history-add-library-${item.timestamp}`}
                    onClick={handleAddToLibrary}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleAddToLibrary(event as unknown as MouseEvent);
                      }
                    }}
                  >
                    <FolderPlus className="w-3 h-3" />
                    {t("studio.addToLibrary")}
                  </span>
                )}
                {multi && (
                  <span className="studio-history-multi-badge">×{urls.length}</span>
                )}
                {item.prompt && (
                  <p className="studio-history-item-prompt">{item.prompt}</p>
                )}
              </button>

              {selectMode && (
                <span
                  className={`studio-history-checkbox${isSelected ? " is-selected" : ""}`}
                  data-testid={`history-select-${item.timestamp}`}
                  aria-hidden
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
              )}

              {!selectMode && (
                <button
                  type="button"
                  className="studio-history-delete-btn"
                  aria-label={t("studio.deleteArchive")}
                  data-testid={`history-delete-${item.timestamp}`}
                  onClick={(event) => handleDeleteOne(event, item)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {statusText ? (
        <p className="studio-history-status" data-testid={`${testId}-status`} role="status">
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
