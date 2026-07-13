import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Download,
  FolderOpen,
  FolderPlus,
  ListChecks,
  Pencil,
  Search,
  Trash2,
  UploadCloud,
  Workflow,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { cn } from "../../shared/utils";
import { AssetBrowserChrome } from "./AssetBrowserChrome";
import type {
  AssetLibraryCategory,
  AssetLibraryItem,
  AssetLibraryResponse,
} from "./types";

interface WorkflowsBrowserProps {
  data: AssetLibraryResponse | undefined;
  isLoading: boolean;
  onInvalidate: () => void | Promise<void>;
}

type WorkflowCat = AssetLibraryCategory & { libraryId: string };

function workflowCategories(data: AssetLibraryResponse | undefined): WorkflowCat[] {
  const libraries = data?.library?.libraries ?? [];
  return libraries.flatMap((lib) =>
    (lib.categories ?? [])
      .filter((cat) => cat.type === "workflow")
      .map((cat) => ({ ...cat, libraryId: lib.id })),
  );
}

function workflowCount(cats: WorkflowCat[]) {
  return cats.reduce((sum, cat) => sum + (cat.items?.length ?? 0), 0);
}

function kindLabel(item: AssetLibraryItem, t: (key: string) => string) {
  const url = String(item.url || "").toLowerCase();
  if (url.endsWith(".zip") || item.kind === "zip") return t("workflows.kindZip");
  return t("workflows.kindJson");
}

export function WorkflowsBrowser({
  data,
  isLoading,
  onInvalidate,
}: WorkflowsBrowserProps) {
  const { t } = useTranslation("assets");
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => workflowCategories(data), [data]);

  const [libraryId, setLibraryId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [manageMode, setManageMode] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!cats.length) {
      setLibraryId("");
      setCategoryId("");
      return;
    }
    const stillValid = cats.some(
      (cat) => cat.id === categoryId && cat.libraryId === libraryId,
    );
    if (stillValid) return;
    setLibraryId(cats[0].libraryId);
    setCategoryId(cats[0].id);
  }, [cats, categoryId, libraryId]);

  const activeCategory =
    cats.find((cat) => cat.id === categoryId && cat.libraryId === libraryId) ||
    cats[0] ||
    null;

  const items = useMemo(() => {
    const raw = activeCategory?.items ?? [];
    const q = search.trim().toLowerCase();
    return raw.filter((item) => {
      if (!item?.id) return false;
      if (!q) return true;
      return String(item.name || item.id)
        .toLowerCase()
        .includes(q);
    });
  }, [activeCategory, search]);

  useEffect(() => {
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    setSelectedId(items[0]?.id || "");
  }, [items, selectedId]);

  const selected = items.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    setEditName(selected?.name || "");
  }, [selected]);

  const uploadMutation = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      form.append("library_id", activeCategory?.libraryId || "");
      form.append("category_id", activeCategory?.id || "");
      return api.upload("/api/asset-library/workflows/upload", form);
    },
    onSuccess: async (res: { items?: AssetLibraryItem[] }) => {
      if (res.items?.[0]?.id) setSelectedId(res.items[0].id);
      await onInvalidate();
    },
  });

  const createCategory = useMutation({
    mutationFn: (name: string) => {
      const libraries = data?.library?.libraries ?? [];
      const libId =
        libraryId ||
        data?.library?.active_library_id ||
        libraries[0]?.id ||
        "";
      return api.post<{ category?: AssetLibraryCategory }>(
        "/api/asset-library/categories",
        { library_id: libId, name, type: "workflow" },
      );
    },
    onSuccess: async (res) => {
      if (res.category?.id) setCategoryId(res.category.id);
      await onInvalidate();
    },
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/asset-library/categories/${encodeURIComponent(id)}`, {
        name,
        library_id: libraryId,
      }),
    onSuccess: () => onInvalidate(),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) =>
      api.delete(
        `/api/asset-library/categories/${encodeURIComponent(id)}?library_id=${encodeURIComponent(libraryId)}`,
      ),
    onSuccess: async () => {
      setPendingDelete(null);
      await onInvalidate();
    },
  });

  const renameItem = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/asset-library/items/${encodeURIComponent(id)}`, {
        name,
        library_id: libraryId,
      }),
    onSuccess: () => onInvalidate(),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/asset-library/items/${encodeURIComponent(id)}`),
    onSuccess: async () => {
      setPendingDelete(null);
      await onInvalidate();
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
      await onInvalidate();
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || !activeCategory) return;
    uploadMutation.mutate(files);
  };

  const downloadItem = (item: AssetLibraryItem) => {
    if (!item.url) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.name || "workflow";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const nav = (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("workflows.navTitle")}</strong>
          <span>{t("workflows.navHint")}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("workflows.newCategory")}
            aria-label={t("workflows.newCategory")}
            data-testid="workflow-cat-new"
            onClick={() => {
              const name = window.prompt(
                t("workflows.categoryNamePrompt"),
                t("workflows.newCategoryDefault"),
              );
              if (name?.trim()) createCategory.mutate(name.trim());
            }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-nav-scroll">
        <div className="studio-asset-tree">
          <div className="studio-asset-tree-branch expanded">
            <button
              type="button"
              className="studio-asset-tree-row parent contains-active"
              data-testid="workflow-root"
            >
              <span className="studio-asset-tree-icon">
                <FolderOpen className="w-3.5 h-3.5" />
              </span>
              <span className="studio-asset-tree-name">
                {t("workflows.rootName")}
              </span>
              <span className="studio-asset-tree-count">{workflowCount(cats)}</span>
            </button>
            <div className="studio-asset-tree-children">
              {cats.length === 0 ? (
                <div className="studio-asset-tree-empty">
                  {t("workflows.noCategories")}
                </div>
              ) : (
                cats.map((cat) => {
                  const active =
                    cat.id === activeCategory?.id &&
                    cat.libraryId === activeCategory?.libraryId;
                  const deleteKey = `cat:${cat.libraryId}:${cat.id}`;
                  return (
                    <div key={`${cat.libraryId}:${cat.id}`}>
                      <button
                        type="button"
                        className={cn(
                          "studio-asset-tree-row child",
                          active && "active",
                        )}
                        data-testid={`workflow-cat-${cat.id}`}
                        onClick={() => {
                          setLibraryId(cat.libraryId);
                          setCategoryId(cat.id);
                          setPendingDelete(null);
                        }}
                      >
                        <span className="studio-asset-tree-elbow" />
                        <span className="studio-asset-tree-icon">
                          <Workflow className="w-3.5 h-3.5" />
                        </span>
                        <span className="studio-asset-tree-name">
                          {cat.name || t("workflows.categoryFallback")}
                        </span>
                        <span className="studio-asset-tree-count">
                          {(cat.items || []).length}
                        </span>
                      </button>
                      {active ? (
                        <div className="studio-asset-tree-actions">
                          <button
                            type="button"
                            className="studio-asset-tree-action"
                            data-testid="workflow-cat-rename"
                            onClick={() => {
                              const name = window.prompt(
                                t("workflows.categoryNamePrompt"),
                                cat.name || "",
                              );
                              if (name?.trim()) {
                                renameCategory.mutate({
                                  id: cat.id,
                                  name: name.trim(),
                                });
                              }
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>{t("browser.rename")}</span>
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "studio-asset-tree-action danger",
                              pendingDelete === deleteKey && "confirm",
                            )}
                            data-testid="workflow-cat-delete"
                            onClick={() => {
                              if (pendingDelete !== deleteKey) {
                                setPendingDelete(deleteKey);
                                return;
                              }
                              deleteCategory.mutate(cat.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>
                              {pendingDelete === deleteKey
                                ? t("browser.confirmDelete")
                                : t("actions.delete")}
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const content = (
    <>
      <div className="studio-asset-panel-head studio-asset-content-head">
        <div className="studio-asset-content-heading">
          <strong>
            {activeCategory?.name || t("tabs.workflows")}
          </strong>
          <span>
            {t("workflows.itemCount", { count: items.length })}
          </span>
        </div>
        <div className="studio-asset-content-tools">
          <label className="studio-asset-search-wrap">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("workflows.searchPlaceholder")}
              data-testid="workflow-search"
            />
          </label>
          <button
            type="button"
            className={cn("studio-action-btn", manageMode && "primary")}
            data-testid="workflow-manage-btn"
            onClick={() => {
              setManageMode((v) => !v);
              setBatchIds(new Set());
            }}
          >
            <ListChecks className="w-4 h-4" />
            {manageMode ? t("browser.manageDone") : t("browser.manage")}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className="studio-asset-manage-bar" data-testid="workflow-manage-bar">
          <span>{t("workflows.selectedCount", { count: batchIds.size })}</span>
          <div className="studio-asset-content-tools">
            <button
              type="button"
              className="studio-action-btn"
              disabled={!items.length}
              onClick={() => setBatchIds(new Set(items.map((i) => i.id)))}
            >
              {t("browser.selectAll")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={!batchIds.size}
              onClick={() => setBatchIds(new Set())}
            >
              {t("browser.clearSelection")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={!batchIds.size}
              onClick={() => {
                const selectedItems = items.filter((item) => batchIds.has(item.id));
                selectedItems.forEach(downloadItem);
              }}
            >
              <Download className="w-4 h-4" />
              {t("workflows.exportSelected")}
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
            >
              <Trash2 className="w-4 h-4" />
              {t("browser.deleteSelected")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-asset-content-scroll">
        {isLoading ? (
          <p className="studio-asset-empty-inline">{t("browser.loading")}</p>
        ) : (
          <div className="studio-asset-grid">
            <button
              type="button"
              className="studio-asset-upload-card"
              disabled={!activeCategory || uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
              data-testid="workflow-drop-zone"
            >
              <span className="studio-asset-upload-thumb">
                <UploadCloud className="w-7 h-7" />
              </span>
              <span className="studio-asset-upload-body">
                <strong>{t("workflows.uploadTitle")}</strong>
                <small>{t("workflows.uploadHint")}</small>
              </span>
            </button>
            {items.map((item) => (
              <article
                key={item.id}
                className={cn(
                  "studio-asset-card",
                  item.id === selectedId && "active",
                )}
                data-testid={`workflow-item-${item.id}`}
                onClick={() => setSelectedId(item.id)}
              >
                {manageMode ? (
                  <input
                    type="checkbox"
                    className="studio-asset-card-check"
                    checked={batchIds.has(item.id)}
                    onChange={() => {
                      setBatchIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                <div className="studio-asset-card-thumb studio-asset-workflow-thumb">
                  <Workflow className="w-7 h-7" />
                </div>
                <div className="studio-asset-card-body">
                  <div className="studio-asset-card-name" title={item.name}>
                    {item.name || item.id}
                  </div>
                  <div className="studio-asset-card-meta">
                    {kindLabel(item, t)}
                  </div>
                </div>
              </article>
            ))}
            {!items.length ? (
              <div className="studio-asset-empty-state col-span-full" data-testid="workflow-empty">
                {t("workflows.empty")}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        multiple
        className="hidden"
        data-testid="workflow-upload-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  const detail = selected ? (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("workflows.detailTitle")}</strong>
          <span>{kindLabel(selected, t)}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("workflows.export")}
            aria-label={t("workflows.export")}
            data-testid="workflow-detail-download"
            onClick={() => downloadItem(selected)}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              "studio-asset-icon-btn danger",
              pendingDelete === selected.id && "confirm",
            )}
            title={
              pendingDelete === selected.id
                ? t("browser.confirmDelete")
                : t("actions.delete")
            }
            aria-label={t("actions.delete")}
            data-testid="workflow-detail-delete"
            onClick={() => {
              if (pendingDelete !== selected.id) {
                setPendingDelete(selected.id);
                return;
              }
              deleteItem.mutate(selected.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-detail-scroll" data-testid="workflow-detail">
        <div className="studio-asset-detail-media">
          <div className="studio-asset-workflow-thumb large">
            <Workflow className="w-10 h-10" />
          </div>
        </div>
        <input
          className="studio-asset-detail-name"
          value={editName}
          data-testid="workflow-detail-name"
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => {
            const name = editName.trim();
            if (name && name !== selected.name) {
              renameItem.mutate({ id: selected.id, name });
            }
          }}
        />
        <div className="studio-asset-detail-meta">
          <div>
            <span>{t("workflows.metaType")}</span>
            <strong>{kindLabel(selected, t)}</strong>
          </div>
          <div>
            <span>{t("workflows.metaCategory")}</span>
            <strong>{activeCategory?.name || "—"}</strong>
          </div>
        </div>
        <div className="studio-asset-detail-url">{selected.url || ""}</div>
      </div>
    </>
  ) : (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("workflows.detailTitle")}</strong>
          <span>{t("workflows.detailEmptyHint")}</span>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <div className="studio-asset-detail-empty" data-testid="workflow-detail-empty">
          <Workflow className="w-8 h-8 opacity-40" />
          <span>{t("workflows.detailEmpty")}</span>
        </div>
      </div>
    </>
  );

  return (
    <AssetBrowserChrome
      testId="workflows-browser"
      nav={nav}
      content={content}
      detail={detail}
    />
  );
}
