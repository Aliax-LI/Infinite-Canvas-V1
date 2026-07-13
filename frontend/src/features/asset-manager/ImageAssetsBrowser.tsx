import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Check,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { cn } from "../../shared/utils";
import { AssetBrowserChrome } from "./AssetBrowserChrome";
import { AssetTagEditor } from "./AssetTagEditor";
import type {
  AssetLibrary,
  AssetLibraryCategory,
  AssetLibraryItem,
  AssetLibraryResponse,
} from "./types";

type TreeFocus = "library" | "category";
type TreeEditKind =
  | "library-new"
  | "library-rename"
  | "category-new"
  | "category-rename"
  | null;

interface ImageAssetsBrowserProps {
  data: AssetLibraryResponse | undefined;
  isLoading: boolean;
  onPreview: (url: string) => void;
  onInvalidate: () => void | Promise<void>;
}

function imageCategories(lib: AssetLibrary | null | undefined): AssetLibraryCategory[] {
  return (lib?.categories ?? []).filter((c) => c.type === "image" || !c.type);
}

function libraryItemCount(lib: AssetLibrary): number {
  return imageCategories(lib).reduce((sum, cat) => sum + (cat.items?.length ?? 0), 0);
}

function itemTags(item: AssetLibraryItem): string[] {
  if (Array.isArray(item.tags) && item.tags.length) return item.tags;
  if (Array.isArray(item.classification?.tags)) return item.classification!.tags!;
  return [];
}

function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((file) => dt.items.add(file));
  return dt.files;
}

export function ImageAssetsBrowser({
  data,
  isLoading,
  onPreview,
  onInvalidate,
}: ImageAssetsBrowserProps) {
  const { t } = useTranslation("assets");
  const fileRef = useRef<HTMLInputElement>(null);
  const libraries = data?.library?.libraries ?? [];

  const [libraryId, setLibraryId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [treeFocus, setTreeFocus] = useState<TreeFocus>("category");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [manageMode, setManageMode] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [treeEdit, setTreeEdit] = useState<{ kind: TreeEditKind; value: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const activeId =
      data?.library?.active_library_id ?? libraries[0]?.id ?? "";
    if (!libraryId || !libraries.some((l) => l.id === libraryId)) {
      setLibraryId(activeId);
    }
  }, [data, libraries, libraryId]);

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === libraryId) ?? libraries[0] ?? null,
    [libraries, libraryId],
  );

  const categories = useMemo(() => imageCategories(activeLibrary), [activeLibrary]);

  useEffect(() => {
    if (!categories.length) {
      setCategoryId("");
      return;
    }
    if (!categoryId || !categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
      setTreeFocus("category");
    }
  }, [categories, categoryId]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const items = useMemo(() => {
    const pool = (activeCategory?.items ?? []).filter((item) => item.url);
    if (!search.trim()) return pool;
    const q = search.toLowerCase();
    return pool.filter((item) => (item.name ?? item.id).toLowerCase().includes(q));
  }, [activeCategory, search]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    setEditName(selectedItem?.name ?? "");
  }, [selectedItem?.id, selectedItem?.name]);

  const refresh = useCallback(async () => {
    await onInvalidate();
  }, [onInvalidate]);

  const createLibrary = useMutation({
    mutationFn: (name: string) => api.post("/api/asset-library/libraries", { name }),
    onSuccess: async (res: { asset_library?: AssetLibrary }) => {
      setTreeEdit(null);
      await refresh();
      if (res.asset_library?.id) {
        setLibraryId(res.asset_library.id);
        setTreeFocus("library");
      }
    },
  });

  const renameLibrary = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/asset-library/libraries/${encodeURIComponent(id)}`, { name }),
    onSuccess: async () => {
      setTreeEdit(null);
      await refresh();
    },
  });

  const deleteLibrary = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/asset-library/libraries/${encodeURIComponent(id)}`),
    onSuccess: async () => {
      setPendingDelete(null);
      setLibraryId("");
      await refresh();
    },
  });

  const createCategory = useMutation({
    mutationFn: (name: string) =>
      api.post("/api/asset-library/categories", {
        name,
        type: "image",
        library_id: libraryId,
      }),
    onSuccess: async (res: { category?: AssetLibraryCategory }) => {
      setTreeEdit(null);
      await refresh();
      if (res.category?.id) {
        setCategoryId(res.category.id);
        setTreeFocus("category");
      }
    },
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/asset-library/categories/${encodeURIComponent(id)}`, {
        name,
        library_id: libraryId,
      }),
    onSuccess: async () => {
      setTreeEdit(null);
      await refresh();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) =>
      api.delete(
        `/api/asset-library/categories/${encodeURIComponent(id)}?library_id=${encodeURIComponent(libraryId)}`,
      ),
    onSuccess: async () => {
      setPendingDelete(null);
      setCategoryId("");
      await refresh();
    },
  });

  const renameItem = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/asset-library/items/${encodeURIComponent(id)}`, {
        name,
        library_id: libraryId,
      }),
    onSuccess: () => refresh(),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/asset-library/items/${encodeURIComponent(id)}`),
    onSuccess: async () => {
      setSelectedItemId(null);
      setPendingDelete(null);
      await refresh();
    },
  });

  const deleteBatch = useMutation({
    mutationFn: (ids: string[]) =>
      api.post("/api/asset-library/items/delete", {
        ids,
        library_id: libraryId || undefined,
      }),
    onSuccess: async () => {
      setBatchIds(new Set());
      setManageMode(false);
      setSelectedItemId(null);
      await refresh();
    },
  });

  const annotateBatch = useMutation({
    mutationFn: (ids: string[]) =>
      api.post("/api/asset-library/items/classify", {
        ids,
        library_id: libraryId || undefined,
      }),
    onSuccess: async () => {
      setBatchIds(new Set());
      await refresh();
    },
  });

  const tagsMutation = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      api.patch(`/api/asset-library/items/${encodeURIComponent(id)}/tags`, {
        tags,
        library_id: libraryId || undefined,
      }),
    onSuccess: async () => {
      setTagEditorOpen(false);
      await refresh();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const result = await api.upload<{ files?: Array<{ url?: string; name?: string }> }>(
        "/api/local-assets/upload",
        form,
      );
      const targetCat = activeCategory ?? categories[0];
      if (!targetCat?.id) return result;
      const uploaded = (result.files ?? []).filter((f) => f.url);
      if (!uploaded.length) return result;
      await api.post("/api/asset-library/items/batch", {
        category_id: targetCat.id,
        library_id: libraryId,
        items: uploaded.map((f) => ({ url: f.url!, name: f.name ?? "" })),
      });
      return result;
    },
    onSuccess: () => refresh(),
  });

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files?.length || !activeCategory) return;
    const list = files instanceof FileList ? files : filesToFileList(files);
    uploadMutation.mutate(list);
  };

  const saveTreeEdit = () => {
    if (!treeEdit?.kind) return;
    const name = treeEdit.value.trim();
    if (!name) return;
    if (treeEdit.kind === "library-new") createLibrary.mutate(name);
    else if (treeEdit.kind === "library-rename" && libraryId)
      renameLibrary.mutate({ id: libraryId, name });
    else if (treeEdit.kind === "category-new") createCategory.mutate(name);
    else if (treeEdit.kind === "category-rename" && categoryId)
      renameCategory.mutate({ id: categoryId, name });
  };

  const toggleBatch = (id: string) => {
    setBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmOrDelete = (key: string, action: () => void) => {
    if (pendingDelete === key) action();
    else setPendingDelete(key);
  };

  const renderTreeEdit = (placement: "library" | "category") => {
    if (!treeEdit) return null;
    const forLibrary =
      treeEdit.kind === "library-new" ||
      treeEdit.kind === "library-rename" ||
      treeEdit.kind === "category-new";
    const forCategory =
      treeEdit.kind === "category-new" || treeEdit.kind === "category-rename";
    if (placement === "library" && !forLibrary) return null;
    if (placement === "category" && !forCategory) return null;
    if (placement === "library" && treeEdit.kind === "category-rename") return null;
    if (
      placement === "category" &&
      (treeEdit.kind === "library-new" || treeEdit.kind === "library-rename")
    )
      return null;

    return (
      <div
        className={cn(
          "studio-asset-tree-edit",
          placement === "category" && "child",
        )}
        data-testid="asset-tree-edit"
      >
        <input
          value={treeEdit.value}
          onChange={(e) => setTreeEdit({ ...treeEdit, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTreeEdit();
            if (e.key === "Escape") setTreeEdit(null);
          }}
          placeholder={t("browser.namePlaceholder")}
          autoFocus
          data-testid="asset-tree-edit-input"
        />
        <button
          type="button"
          className="studio-asset-icon-btn primary"
          onClick={saveTreeEdit}
          aria-label={t("actions.create")}
          data-testid="asset-tree-edit-save"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          type="button"
          className="studio-asset-icon-btn"
          onClick={() => setTreeEdit(null)}
          aria-label={t("browser.cancel")}
          data-testid="asset-tree-edit-cancel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const renderLibraryActions = () => {
    if (treeFocus !== "library") return null;
    const deleteKey = `lib:${libraryId}`;
    if (treeEdit && ["library-new", "library-rename", "category-new"].includes(treeEdit.kind ?? "")) {
      return renderTreeEdit("library");
    }
    return (
      <div className="studio-asset-tree-actions" data-testid="asset-lib-actions">
        <button
          type="button"
          onClick={() =>
            setTreeEdit({ kind: "category-new", value: t("browser.newCategoryDefault") })
          }
          data-testid="asset-cat-new"
        >
          <FolderPlus className="w-3 h-3" />
          <span>{t("browser.newCategory")}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            setTreeEdit({
              kind: "library-rename",
              value: activeLibrary?.name ?? "",
            })
          }
          data-testid="asset-lib-rename"
        >
          <Pencil className="w-3 h-3" />
          <span>{t("browser.rename")}</span>
        </button>
        {libraries.length > 1 ? (
          <button
            type="button"
            className={cn("danger", pendingDelete === deleteKey && "confirm")}
            onClick={() =>
              confirmOrDelete(deleteKey, () => deleteLibrary.mutate(libraryId))
            }
            data-testid="asset-lib-delete"
          >
            <Trash2 className="w-3 h-3" />
            <span>
              {pendingDelete === deleteKey
                ? t("browser.confirmDelete")
                : t("browser.deleteLibrary")}
            </span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderCategoryActions = (catId: string) => {
    if (treeFocus !== "category" || categoryId !== catId) return null;
    const deleteKey = `cat:${catId}`;
    if (treeEdit?.kind === "category-rename" || treeEdit?.kind === "category-new") {
      return renderTreeEdit("category");
    }
    return (
      <div className="studio-asset-tree-actions child" data-testid="asset-cat-actions">
        <button
          type="button"
          onClick={() =>
            setTreeEdit({ kind: "category-new", value: t("browser.newCategoryDefault") })
          }
          data-testid="asset-cat-new-under"
        >
          <FolderPlus className="w-3 h-3" />
          <span>{t("browser.newCategory")}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            setTreeEdit({
              kind: "category-rename",
              value: activeCategory?.name ?? "",
            })
          }
          data-testid="asset-cat-rename"
        >
          <Pencil className="w-3 h-3" />
          <span>{t("browser.rename")}</span>
        </button>
        <button
          type="button"
          className={cn("danger", pendingDelete === deleteKey && "confirm")}
          onClick={() =>
            confirmOrDelete(deleteKey, () => deleteCategory.mutate(catId))
          }
          data-testid="asset-cat-delete"
        >
          <Trash2 className="w-3 h-3" />
          <span>
            {pendingDelete === deleteKey ? t("browser.confirmDelete") : t("actions.delete")}
          </span>
        </button>
      </div>
    );
  };

  const nav = (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.navTitle")}</strong>
          <span>{t("browser.navHint")}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("browser.newLibrary")}
            aria-label={t("browser.newLibrary")}
            onClick={() =>
              setTreeEdit({ kind: "library-new", value: t("browser.newLibraryDefault") })
            }
            data-testid="asset-lib-new"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-nav-scroll">
        {treeEdit?.kind === "library-new" ? renderTreeEdit("library") : null}
        <div className="studio-asset-tree">
          {libraries.map((lib) => {
            const isActive = lib.id === (activeLibrary?.id ?? libraryId);
            const cats = imageCategories(lib);
            const showLibActions = isActive && treeFocus === "library";
            return (
              <div
                key={lib.id}
                className={cn("studio-asset-tree-branch", isActive && "expanded")}
              >
                <button
                  type="button"
                  className={cn(
                    "studio-asset-tree-row parent",
                    isActive && "contains-active",
                    showLibActions && "active",
                  )}
                  onClick={() => {
                    setLibraryId(lib.id);
                    setTreeFocus("library");
                    setPendingDelete(null);
                    const first = imageCategories(lib)[0];
                    if (first) setCategoryId(first.id);
                  }}
                  data-testid={`asset-lib-${lib.id}`}
                >
                  <span className="studio-asset-tree-icon">
                    {isActive ? (
                      <FolderOpen className="w-3.5 h-3.5" />
                    ) : (
                      <Folder className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="studio-asset-tree-name">{lib.name ?? lib.id}</span>
                  <span className="studio-asset-tree-count">{libraryItemCount(lib)}</span>
                </button>
                {showLibActions ? renderLibraryActions() : null}
                {isActive ? (
                  <div className="studio-asset-tree-children">
                    {cats.length === 0 ? (
                      <div className="studio-asset-tree-empty">{t("browser.noCategories")}</div>
                    ) : (
                      cats.map((cat) => {
                        const active =
                          cat.id === categoryId && treeFocus === "category";
                        return (
                          <div key={cat.id}>
                            <button
                              type="button"
                              className={cn(
                                "studio-asset-tree-row child",
                                active && "active",
                              )}
                              onClick={() => {
                                setCategoryId(cat.id);
                                setTreeFocus("category");
                                setPendingDelete(null);
                                setSelectedItemId(null);
                                setBatchIds(new Set());
                              }}
                              data-testid={`asset-category-${cat.id}`}
                            >
                              <span className="studio-asset-tree-elbow" />
                              <span className="studio-asset-tree-icon">
                                <ImageIcon className="w-3 h-3" />
                              </span>
                              <span className="studio-asset-tree-name">
                                {cat.name ?? cat.id}
                              </span>
                              <span className="studio-asset-tree-count">
                                {(cat.items ?? []).length}
                              </span>
                            </button>
                            {active ? renderCategoryActions(cat.id) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  const content = (
    <>
      <div className="studio-asset-content-toolbar">
        <div className="studio-asset-content-heading">
          <strong>{activeCategory?.name ?? t("browser.allItems")}</strong>
          <span>
            {t("browser.itemCount", { count: items.length })}
            {activeLibrary?.name ? ` · ${activeLibrary.name}` : ""}
          </span>
        </div>
        <div className="studio-asset-content-tools">
          <label className="studio-asset-search-wrap">
            <Search className="w-3.5 h-3.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              data-testid="asset-search-input"
            />
          </label>
          <button
            type="button"
            className="studio-action-btn primary"
            disabled={!activeCategory || uploadMutation.isPending}
            onClick={() => fileRef.current?.click()}
            data-testid="asset-upload-btn"
          >
            <UploadCloud className="w-4 h-4" />
            {uploadMutation.isPending ? t("uploading") : t("actions.upload")}
          </button>
          <button
            type="button"
            className={cn("studio-action-btn", manageMode && "primary")}
            onClick={() => {
              setManageMode((v) => !v);
              setBatchIds(new Set());
            }}
            data-testid="asset-manage-btn"
          >
            <ListChecks className="w-4 h-4" />
            {manageMode ? t("browser.manageDone") : t("browser.manage")}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className="studio-asset-manage-bar" data-testid="asset-manage-bar">
          <span>
            {t("browser.selectedCount", { count: batchIds.size })}
          </span>
          <div className="studio-asset-content-tools">
            <button
              type="button"
              className="studio-action-btn"
              disabled={!items.length}
              onClick={() => setBatchIds(new Set(items.map((i) => i.id)))}
              data-testid="asset-select-all"
            >
              {t("browser.selectAll")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={!batchIds.size}
              onClick={() => setBatchIds(new Set())}
              data-testid="asset-clear-selection"
            >
              {t("browser.clearSelection")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={!batchIds.size || annotateBatch.isPending}
              onClick={() => annotateBatch.mutate([...batchIds])}
              data-testid="asset-classify-selected"
            >
              {t("tags.batchAnnotate", { count: batchIds.size })}
            </button>
            <button
              type="button"
              className="studio-action-btn danger"
              disabled={!batchIds.size || deleteBatch.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    t("browser.deleteSelectedConfirm", { count: batchIds.size }),
                  )
                ) {
                  deleteBatch.mutate([...batchIds]);
                }
              }}
              data-testid="asset-delete-selected"
            >
              <Trash2 className="w-4 h-4" />
              {t("browser.deleteSelected")}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="studio-asset-content-scroll"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {isLoading ? (
          <p className="studio-asset-empty-inline">{t("browser.loading")}</p>
        ) : (
          <div className={cn("studio-asset-grid", dragOver && "drag-over")}>
            <button
              type="button"
              className="studio-asset-upload-card"
              disabled={!activeCategory || uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
              data-testid="asset-drop-zone"
            >
              <span className="studio-asset-upload-thumb">
                <UploadCloud className="w-7 h-7" />
              </span>
              <span className="studio-asset-upload-body">
                <strong>{t("browser.uploadCardTitle")}</strong>
                <small>{t("browser.uploadCardHint")}</small>
              </span>
            </button>

            {items.map((item) => {
              const active = item.id === selectedItemId;
              return (
                <article
                  key={item.id}
                  className={cn("studio-asset-card", active && "active")}
                  data-testid={`asset-item-${item.id}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  {manageMode ? (
                    <input
                      type="checkbox"
                      className="studio-asset-card-check"
                      checked={batchIds.has(item.id)}
                      onChange={() => toggleBatch(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`asset-select-${item.id}`}
                    />
                  ) : null}
                  <div className="studio-asset-card-thumb">
                    {item.url ? (
                      <img src={item.url} alt={item.name ?? item.id} loading="lazy" />
                    ) : null}
                  </div>
                  <div className="studio-asset-card-body">
                    <div className="studio-asset-card-name" title={item.name ?? item.id}>
                      {item.name ?? item.id}
                    </div>
                    {itemTags(item).length > 0 ? (
                      <div className="studio-asset-tag-row">
                        {itemTags(item)
                          .slice(0, 3)
                          .map((tag) => (
                            <span key={tag} className="studio-asset-tag-chip">
                              {tag}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <div className="studio-asset-card-meta">{t("browser.noTags")}</div>
                    )}
                  </div>
                </article>
              );
            })}

            {!items.length ? (
              <div className="studio-asset-empty-state" data-testid="asset-library-empty">
                {t("browser.emptyCategory")}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid="asset-upload-input"
      />
    </>
  );

  const itemDeleteKey = selectedItem ? `item:${selectedItem.id}` : "";

  const detail = selectedItem ? (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.detailTitle")}</strong>
          <span>{selectedItem.kind ?? "image"}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("tags.edit")}
            aria-label={t("tags.edit")}
            onClick={() => setTagEditorOpen(true)}
            data-testid="asset-detail-edit-tags"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              "studio-asset-icon-btn danger",
              pendingDelete === itemDeleteKey && "confirm",
            )}
            title={
              pendingDelete === itemDeleteKey
                ? t("browser.confirmDelete")
                : t("actions.delete")
            }
            aria-label={t("actions.delete")}
            onClick={() =>
              confirmOrDelete(itemDeleteKey, () =>
                deleteItem.mutate(selectedItem.id),
              )
            }
            data-testid="asset-detail-delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <button
          type="button"
          className="studio-asset-detail-media"
          onClick={() => selectedItem.url && onPreview(selectedItem.url)}
          data-testid="asset-detail-preview"
        >
          {selectedItem.url ? (
            <img src={selectedItem.url} alt={selectedItem.name ?? selectedItem.id} />
          ) : null}
        </button>
        <input
          className="studio-asset-detail-name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => {
            const next = editName.trim();
            if (next && next !== (selectedItem.name ?? "")) {
              renameItem.mutate({ id: selectedItem.id, name: next });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          title={t("browser.rename")}
          data-testid="asset-detail-name"
        />
        <div className="studio-asset-detail-meta">
          <div>
            <span>{t("browser.metaLibrary")}</span>
            <strong>{activeLibrary?.name ?? "—"}</strong>
          </div>
          <div>
            <span>{t("browser.metaCategory")}</span>
            <strong>{activeCategory?.name ?? "—"}</strong>
          </div>
        </div>
        {selectedItem.url ? (
          <div className="studio-asset-detail-url">{selectedItem.url}</div>
        ) : null}
        <div className="studio-asset-detail-tags">
          <div className="studio-asset-detail-tags-head">
            <strong>{t("tags.editTitle")}</strong>
            <button
              type="button"
              className="studio-action-btn"
              onClick={() => setTagEditorOpen(true)}
              data-testid="asset-detail-tags-edit"
            >
              {t("tags.edit")}
            </button>
          </div>
          <div className="studio-asset-tag-row">
            {itemTags(selectedItem).length ? (
              itemTags(selectedItem).map((tag) => (
                <span key={tag} className="studio-asset-tag-chip">
                  {tag}
                </span>
              ))
            ) : (
              <span className="studio-asset-detail-empty-tags">{t("browser.noTags")}</span>
            )}
          </div>
        </div>
      </div>
      <AssetTagEditor
        open={tagEditorOpen}
        itemName={selectedItem.name}
        initialTags={itemTags(selectedItem)}
        saving={tagsMutation.isPending}
        onClose={() => setTagEditorOpen(false)}
        onSave={(tags) => tagsMutation.mutate({ id: selectedItem.id, tags })}
      />
    </>
  ) : (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.detailTitle")}</strong>
          <span>{t("browser.detailEmptyHint")}</span>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <div className="studio-asset-detail-empty" data-testid="asset-detail-empty">
          <ImageIcon className="w-7 h-7" />
          <span>{t("browser.detailEmpty")}</span>
        </div>
      </div>
    </>
  );

  return (
    <AssetBrowserChrome
      testId="asset-library-browser"
      nav={nav}
      content={content}
      detail={detail}
    />
  );
}
