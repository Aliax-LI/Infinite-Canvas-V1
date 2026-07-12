import { useMutation } from "@tanstack/react-query";
import { useCallback, useState, type DragEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { AssetTagEditor } from "../../features/asset-manager/AssetTagEditor";
import { STUDIO_IMAGE_URL_MIME } from "../../features/tools/pages/onlineRefs";
import { api } from "../api/client";
import { useStatusToast } from "../hooks/useStatusToast";

export interface AssetItem {
  id: string;
  name?: string;
  url?: string;
  kind?: string;
  created_at?: number;
  tags?: string[];
  caption?: string;
  classification?: { summary?: string; tags?: string[] };
}

interface AssetMasonryProps {
  items: AssetItem[];
  isLoading?: boolean;
  libraryId?: string;
  onPreview?: (url: string) => void;
  onSelect?: (item: AssetItem) => void;
  onDragStart?: (url: string, item: AssetItem) => void;
  onDeleted?: () => void | Promise<void>;
  onLibraryUpdated?: () => void | Promise<void>;
  deleteOne?: (id: string) => Promise<unknown>;
  deleteMany?: (ids: string[]) => Promise<unknown>;
  readOnly?: boolean;
  enableTagging?: boolean;
  testId?: string;
  emptyLabel?: string;
}

function itemKey(item: AssetItem): string {
  return item.id;
}

function itemTags(item: AssetItem): string[] {
  if (Array.isArray(item.tags) && item.tags.length) return item.tags;
  if (Array.isArray(item.classification?.tags)) return item.classification!.tags!;
  return [];
}

export function AssetMasonry({
  items,
  isLoading = false,
  libraryId = "",
  onPreview,
  onSelect,
  onDragStart,
  onDeleted,
  onLibraryUpdated,
  deleteOne,
  deleteMany,
  readOnly = false,
  enableTagging = false,
  testId = "asset-masonry",
  emptyLabel,
}: AssetMasonryProps) {
  const { t } = useTranslation("studio");
  const { t: tAssets } = useTranslation("assets");
  const { statusText, setStatusText } = useStatusToast();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagEditorItem, setTagEditorItem] = useState<AssetItem | null>(null);

  const refreshLibrary = useCallback(async () => {
    await onLibraryUpdated?.();
    await onDeleted?.();
  }, [onDeleted, onLibraryUpdated]);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (deleteMany) return deleteMany(ids);
      if (ids.length === 1 && deleteOne) return deleteOne(ids[0]);
      if (ids.length === 1) {
        return api.delete(`/api/asset-library/items/${encodeURIComponent(ids[0])}`);
      }
      return api.post<{ removed: number }>("/api/asset-library/items/delete", {
        ids,
        library_id: libraryId || undefined,
      });
    },
    onSuccess: async () => {
      setSelected(new Set());
      setSelectMode(false);
      await refreshLibrary();
    },
  });

  const tagsMutation = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      api.patch(`/api/asset-library/items/${encodeURIComponent(id)}/tags`, {
        tags,
        library_id: libraryId || undefined,
      }),
    onSuccess: async () => {
      setTagEditorItem(null);
      setStatusText(tAssets("tags.saved"));
      await refreshLibrary();
    },
    onError: () => setStatusText(tAssets("tags.saveFailed")),
  });

  const annotateOneMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/asset-library/items/${encodeURIComponent(id)}/annotate`, {
        library_id: libraryId || undefined,
      }),
    onSuccess: async () => {
      setStatusText(tAssets("tags.annotateSuccess"));
      await refreshLibrary();
    },
    onError: () => setStatusText(tAssets("tags.annotateFailed")),
  });

  const annotateBatchMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post("/api/asset-library/items/classify", {
        ids,
        library_id: libraryId || undefined,
      }),
    onSuccess: async (result: { count?: number }) => {
      setSelected(new Set());
      setSelectMode(false);
      setStatusText(tAssets("tags.batchAnnotateSuccess", { count: result.count ?? 0 }));
      await refreshLibrary();
    },
    onError: () => setStatusText(tAssets("tags.annotateFailed")),
  });

  const handleDeleteOne = useCallback(
    (event: MouseEvent, item: AssetItem) => {
      event.stopPropagation();
      event.preventDefault();
      if (!window.confirm(t("studio.deleteAssetConfirm"))) return;
      deleteMutation.mutate([item.id]);
    },
    [deleteMutation, t],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selected.size) return;
    const message = t("studio.deleteSelectedAssetsConfirm", { count: selected.size });
    if (!window.confirm(message)) return;
    deleteMutation.mutate([...selected]);
  }, [deleteMutation, selected, t]);

  const handleAnnotateSelected = useCallback(() => {
    if (!selected.size) return;
    annotateBatchMutation.mutate([...selected]);
  }, [annotateBatchMutation, selected]);

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

  const taggingBusy =
    tagsMutation.isPending || annotateOneMutation.isPending || annotateBatchMutation.isPending;

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-loading`}>
        {t("studio.loadingAssets")}
      </p>
    );
  }

  if (!items.length) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-empty`}>
        {emptyLabel ?? tAssets("empty")}
      </p>
    );
  }

  return (
    <div className="studio-history-root" data-testid={testId}>
      {!readOnly && (
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
              {enableTagging ? (
                <button
                  type="button"
                  className="studio-history-btn"
                  disabled={!selected.size || taggingBusy}
                  onClick={handleAnnotateSelected}
                  data-testid={`${testId}-annotate-selected`}
                >
                  {tAssets("tags.batchAnnotate", { count: selected.size })}
                </button>
              ) : null}
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
      )}

      <div className="studio-history-masonry" data-testid={`${testId}-grid`}>
        {items.map((item) => {
          const url = item.url ?? "";
          const key = itemKey(item);
          const isBroken = broken[key];
          const isSelected = selected.has(key);
          const tags = itemTags(item);

          const handleDragStart = (event: DragEvent<HTMLImageElement>) => {
            if (isBroken || !url || selectMode) return;
            event.dataTransfer.setData(STUDIO_IMAGE_URL_MIME, url);
            event.dataTransfer.setData("text/plain", url);
            event.dataTransfer.effectAllowed = "copy";
            onDragStart?.(url, item);
          };

          const handleCardClick = () => {
            if (selectMode) {
              toggleSelected(key);
              return;
            }
            if (isBroken || !url) return;
            onSelect?.(item);
            onPreview?.(url);
          };

          const handleAnnotate = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            if (taggingBusy) return;
            annotateOneMutation.mutate(item.id);
          };

          const handleEditTags = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            setTagEditorItem(item);
          };

          return (
            <div
              key={key}
              className={`studio-history-item group${selectMode && isSelected ? " is-selected" : ""}`}
              data-testid={`asset-item-${item.id}`}
            >
              <button
                type="button"
                className="studio-history-item-trigger"
                onClick={handleCardClick}
              >
                {isBroken ? (
                  <div className="studio-history-item-missing">{t("studio.missingAsset")}</div>
                ) : (
                  <img
                    src={url}
                    alt={item.name ?? ""}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                    draggable={Boolean(onDragStart) && !selectMode}
                    onDragStart={handleDragStart}
                    onError={() => setBroken((prev) => ({ ...prev, [key]: true }))}
                  />
                )}
                {item.name ? <p className="studio-history-item-prompt">{item.name}</p> : null}
                {enableTagging && tags.length > 0 ? (
                  <div className="studio-asset-tag-row" data-testid={`asset-tags-${item.id}`}>
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="studio-asset-tag-chip">
                        {tag}
                      </span>
                    ))}
                    {tags.length > 4 ? (
                      <span className="studio-asset-tag-chip studio-asset-tag-more">
                        +{tags.length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>

              {enableTagging && !isBroken && !selectMode && !readOnly ? (
                <>
                  <span
                    role="button"
                    tabIndex={0}
                    className="studio-history-add-ref"
                    aria-label={tAssets("tags.annotate")}
                    data-testid={`asset-annotate-${item.id}`}
                    onClick={handleAnnotate}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleAnnotate(event as unknown as MouseEvent);
                      }
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    {tAssets("tags.annotate")}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="studio-history-add-library"
                    aria-label={tAssets("tags.edit")}
                    data-testid={`asset-edit-tags-${item.id}`}
                    onClick={handleEditTags}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleEditTags(event as unknown as MouseEvent);
                      }
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                    {tAssets("tags.edit")}
                  </span>
                </>
              ) : null}

              {selectMode && !readOnly && (
                <span
                  className={`studio-history-checkbox${isSelected ? " is-selected" : ""}`}
                  data-testid={`asset-select-${item.id}`}
                  aria-hidden
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
              )}

              {!selectMode && !readOnly && (
                <button
                  type="button"
                  className="studio-history-delete-btn"
                  aria-label={t("studio.deleteAsset")}
                  data-testid={`asset-delete-${item.id}`}
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

      {enableTagging && tagEditorItem ? (
        <AssetTagEditor
          open={Boolean(tagEditorItem)}
          itemName={tagEditorItem.name}
          initialTags={itemTags(tagEditorItem)}
          saving={tagsMutation.isPending}
          onClose={() => setTagEditorItem(null)}
          onSave={(tags) => tagsMutation.mutate({ id: tagEditorItem.id, tags })}
        />
      ) : null}
    </div>
  );
}
