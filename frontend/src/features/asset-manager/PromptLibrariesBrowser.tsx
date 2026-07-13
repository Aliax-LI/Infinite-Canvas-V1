import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  FilePlus2,
  FolderPlus,
  LayoutList,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  TextCursorInput,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { cn } from "../../shared/utils";
import type {
  PromptLibrariesResponse,
  PromptLibraryCategory,
  PromptLibraryDoc,
  PromptTemplate,
} from "../../types/api";
import { AssetBrowserChrome } from "./AssetBrowserChrome";

/** Shared with canvas `LegacyPromptTemplateModal`. */
export const PROMPT_LIBRARIES_QUERY_KEY = ["prompt-libraries"] as const;

const BUILTIN_CATEGORY_FALLBACK: PromptLibraryCategory[] = [
  { id: "view", name: "视角" },
  { id: "storyboard", name: "分镜" },
  { id: "character", name: "角色" },
  { id: "product", name: "产品" },
  { id: "lighting", name: "光影" },
  { id: "custom", name: "我的" },
];

const BUILTIN_CATEGORY_IDS = new Set(BUILTIN_CATEGORY_FALLBACK.map((c) => c.id));

type TreeFocus = "library" | "category";
type DetailMode = "view" | "edit" | "create";

function isSystemLibrary(lib: PromptLibraryDoc | null | undefined) {
  return Boolean(lib?.system || lib?.id === "system");
}

function libraryEditable(lib: PromptLibraryDoc | null | undefined) {
  return Boolean(lib && !lib.readonly);
}

function itemName(item: PromptTemplate) {
  return String(item.name || item.title || "").trim();
}

function itemPositive(item: PromptTemplate) {
  return String(item.positive || item.content || "").trim();
}

function categoriesFor(lib: PromptLibraryDoc | null | undefined): PromptLibraryCategory[] {
  const fromLib = (lib?.categories || []).filter((c) => c?.id);
  if (fromLib.length) return fromLib;
  if (!isSystemLibrary(lib)) return [];
  return BUILTIN_CATEGORY_FALLBACK;
}

function countForCategory(lib: PromptLibraryDoc | null | undefined, category: string) {
  const items = lib?.items || [];
  if (category === "all") return items.length;
  return items.filter((item) => (item.category || "custom") === category).length;
}

export function PromptLibrariesBrowser() {
  const { t } = useTranslation("assets");
  const queryClient = useQueryClient();

  const [libraryId, setLibraryId] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [treeFocus, setTreeFocus] = useState<TreeFocus>("category");
  const [selectedId, setSelectedId] = useState("");
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);
  const [search, setSearch] = useState("");
  const [detailMode, setDetailMode] = useState<DetailMode>("view");
  const [editName, setEditName] = useState("");
  const [editScene, setEditScene] = useState("");
  const [editPositive, setEditPositive] = useState("");
  const [editNegative, setEditNegative] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: PROMPT_LIBRARIES_QUERY_KEY,
    queryFn: () => api.get<PromptLibrariesResponse>("/api/prompt-libraries"),
  });

  const libraries = data?.library?.libraries ?? [];

  useEffect(() => {
    if (!libraries.length) {
      setLibraryId("");
      return;
    }
    if (libraryId && libraries.some((lib) => lib.id === libraryId)) return;
    const preferred =
      libraries.find((lib) => lib.id === data?.library?.active_library_id) ||
      libraries.find((lib) => lib.id === "system") ||
      libraries[0];
    setLibraryId(preferred?.id || "");
  }, [libraries, libraryId, data?.library?.active_library_id]);

  const activeLibrary =
    libraries.find((lib) => lib.id === libraryId) || libraries[0] || null;
  const categories = useMemo(() => categoriesFor(activeLibrary), [activeLibrary]);
  const canEdit = libraryEditable(activeLibrary);
  const canDeleteLibrary =
    canEdit && !isSystemLibrary(activeLibrary) && libraries.length > 1;

  useEffect(() => {
    if (categoryId !== "all" && !categories.some((cat) => cat.id === categoryId)) {
      setCategoryId("all");
    }
  }, [categories, categoryId]);

  const items = useMemo(() => {
    const raw = activeLibrary?.items ?? [];
    const q = search.trim().toLowerCase();
    return raw.filter((item) => {
      if (!item?.id) return false;
      if (categoryId !== "all" && (item.category || "custom") !== categoryId) {
        return false;
      }
      if (!q) return true;
      return [itemName(item), item.scene, itemPositive(item), item.negative, item.category]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [activeLibrary, categoryId, search]);

  useEffect(() => {
    if (detailMode === "create") return;
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    setSelectedId(items[0]?.id || "");
    setDetailMode("view");
  }, [items, selectedId, detailMode]);

  const selected = items.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    if (detailMode !== "edit" || !selected) return;
    setEditName(itemName(selected));
    setEditScene(String(selected.scene || ""));
    setEditPositive(itemPositive(selected));
    setEditNegative(String(selected.negative || ""));
  }, [detailMode, selected]);

  const categoryLabel = (id: string) => {
    if (id === "all") return t("prompts.allItems");
    const found = categories.find((cat) => cat.id === id);
    if (found?.name) return found.name;
    const fallback = BUILTIN_CATEGORY_FALLBACK.find((cat) => cat.id === id);
    return fallback?.name || id;
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: PROMPT_LIBRARIES_QUERY_KEY });
  };

  const createLibrary = useMutation({
    mutationFn: (name: string) =>
      api.post<{ prompt_library?: PromptLibraryDoc }>("/api/prompt-libraries", {
        name,
      }),
    onSuccess: async (res) => {
      if (res.prompt_library?.id) {
        setLibraryId(res.prompt_library.id);
        setCategoryId("all");
        setTreeFocus("library");
      }
      await invalidate();
    },
  });

  const renameLibrary = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/prompt-libraries/${encodeURIComponent(id)}`, { name }),
    onSuccess: () => invalidate(),
  });

  const deleteLibrary = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ library?: PromptLibrariesResponse["library"] }>(
        `/api/prompt-libraries/${encodeURIComponent(id)}`,
      ),
    onSuccess: async (res) => {
      setLibraryId(
        res.library?.active_library_id ||
          res.library?.libraries?.find((lib) => lib.id !== "system")?.id ||
          "system",
      );
      setCategoryId("all");
      setBatchIds(new Set());
      await invalidate();
    },
  });

  const addCategory = useMutation({
    mutationFn: (name: string) =>
      api.post<{ category?: PromptLibraryCategory }>("/api/prompt-libraries/categories", {
        library_id: activeLibrary?.id,
        name,
      }),
    onSuccess: async (res) => {
      if (res.category?.id) {
        setCategoryId(res.category.id);
        setTreeFocus("category");
      }
      await invalidate();
    },
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, {
        library_id: activeLibrary?.id,
        name,
      }),
    onSuccess: () => invalidate(),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`),
    onSuccess: async (_res, id) => {
      if (categoryId === id) setCategoryId("all");
      await invalidate();
    },
  });

  const saveItem = useMutation({
    mutationFn: async () => {
      if (!activeLibrary) throw new Error(t("prompts.emptyLibrary"));
      const name = editName.trim();
      const positive = editPositive.trim();
      if (!name || !positive) throw new Error(t("prompts.required"));
      const category = categoryId === "all" ? "custom" : categoryId;
      if (detailMode === "create") {
        return api.post<{ item?: PromptTemplate }>("/api/prompt-libraries/items", {
          library_id: activeLibrary.id,
          name,
          positive,
          negative: editNegative.trim(),
          scene: editScene.trim(),
          category,
        });
      }
      if (!selected) throw new Error(t("prompts.emptyItems"));
      return api.patch<{ item?: PromptTemplate }>(
        `/api/prompt-libraries/items/${encodeURIComponent(selected.id)}`,
        {
          library_id: activeLibrary.id,
          name,
          positive,
          negative: editNegative.trim(),
          scene: editScene.trim(),
          category: selected.category || category,
        },
      );
    },
    onSuccess: async (res) => {
      const nextId = res.item?.id || selectedId;
      setDetailMode("view");
      setSelectedId(nextId);
      if (categoryId === "all" && detailMode === "create") setCategoryId("custom");
      await invalidate();
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/prompt-libraries/items/${encodeURIComponent(id)}`),
    onSuccess: async (_res, id) => {
      setBatchIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setPendingDelete(null);
      setDetailMode("view");
      await invalidate();
    },
  });

  const deleteSelected = useMutation({
    mutationFn: (ids: string[]) =>
      api.post("/api/prompt-libraries/items/delete", { ids }),
    onSuccess: async () => {
      setBatchIds(new Set());
      setPendingDelete(null);
      await invalidate();
    },
  });

  const startCreate = () => {
    setDetailMode("create");
    setEditName(t("prompts.newItemName"));
    setEditScene("");
    setEditPositive(t("prompts.newItemContent"));
    setEditNegative("");
  };

  const renderLibraryActions = () => {
    if (!activeLibrary || treeFocus !== "library") return null;
    const deleteKey = `lib:${activeLibrary.id}`;
    return (
      <div className="studio-asset-tree-actions">
        <button
          type="button"
          disabled={!canEdit}
          data-testid="prompt-cat-new"
          onClick={() => {
            const name = window.prompt(
              t("prompts.newCategoryPrompt"),
              t("prompts.newCategoryDefault"),
            );
            if (name?.trim()) addCategory.mutate(name.trim().slice(0, 24));
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>{t("prompts.newCategory")}</span>
        </button>
        <button
          type="button"
          disabled={!canEdit || isSystemLibrary(activeLibrary)}
          data-testid="prompt-lib-rename"
          onClick={() => {
            if (!activeLibrary || isSystemLibrary(activeLibrary)) return;
            const name = window.prompt(
              t("prompts.libraryNamePrompt"),
              activeLibrary.name || "",
            );
            if (name?.trim()) {
              renameLibrary.mutate({ id: activeLibrary.id, name: name.trim() });
            }
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>{t("browser.rename")}</span>
        </button>
        {!isSystemLibrary(activeLibrary) ? (
          <button
            type="button"
            className={cn("danger", pendingDelete === deleteKey && "confirm")}
            disabled={!canDeleteLibrary}
            data-testid="prompt-lib-delete"
            onClick={() => {
              if (pendingDelete !== deleteKey) {
                setPendingDelete(deleteKey);
                return;
              }
              deleteLibrary.mutate(activeLibrary.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
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
    if (treeFocus !== "category" || categoryId !== catId || catId === "all") {
      return null;
    }
    if (BUILTIN_CATEGORY_IDS.has(catId) && isSystemLibrary(activeLibrary)) {
      return (
        <div className="studio-asset-tree-actions child muted">
          <span>{t("prompts.builtinCategoryLocked")}</span>
        </div>
      );
    }
    const deleteKey = `cat:${catId}`;
    return (
      <div className="studio-asset-tree-actions child">
        <button
          type="button"
          disabled={!canEdit}
          data-testid={`prompt-cat-rename-${catId}`}
          onClick={() => {
            const name = window.prompt(
              t("prompts.categoryNamePrompt"),
              categoryLabel(catId),
            );
            if (name?.trim()) {
              renameCategory.mutate({ id: catId, name: name.trim().slice(0, 24) });
            }
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>{t("browser.rename")}</span>
        </button>
        <button
          type="button"
          className={cn("danger", pendingDelete === deleteKey && "confirm")}
          disabled={!canEdit}
          data-testid={`prompt-cat-delete-${catId}`}
          onClick={() => {
            if (pendingDelete !== deleteKey) {
              setPendingDelete(deleteKey);
              return;
            }
            deleteCategory.mutate(catId);
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
    );
  };

  const nav = (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("prompts.navTitle")}</strong>
          <span>{t("prompts.navHint")}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("actions.newPromptLib")}
            aria-label={t("actions.newPromptLib")}
            data-testid="prompt-lib-new"
            onClick={() => {
              const name = window.prompt(
                t("prompts.libraryNamePrompt"),
                t("actions.newPromptLib"),
              );
              if (name?.trim()) createLibrary.mutate(name.trim());
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-nav-scroll">
        <div className="studio-asset-tree">
          {libraries.map((lib) => {
            const isActive = lib.id === (activeLibrary?.id ?? libraryId);
            const cats = categoriesFor(lib);
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
                  data-testid={`prompt-lib-${lib.id}`}
                  onClick={() => {
                    setLibraryId(lib.id);
                    setTreeFocus("library");
                    setPendingDelete(null);
                    setDetailMode("view");
                  }}
                >
                  <span className="studio-asset-tree-icon">
                    {lib.id === "system" ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <BookOpen className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="studio-asset-tree-name">{lib.name || lib.id}</span>
                  <span className="studio-asset-tree-count">
                    {(lib.items || []).length}
                  </span>
                </button>
                {showLibActions ? renderLibraryActions() : null}
                {isActive ? (
                  <div className="studio-asset-tree-children">
                    <button
                      type="button"
                      className={cn(
                        "studio-asset-tree-row child",
                        categoryId === "all" && treeFocus === "category" && "active",
                      )}
                      data-testid="prompt-cat-all"
                      onClick={() => {
                        setCategoryId("all");
                        setTreeFocus("category");
                        setPendingDelete(null);
                        setDetailMode("view");
                      }}
                    >
                      <span className="studio-asset-tree-elbow" />
                      <span className="studio-asset-tree-icon">
                        <LayoutList className="w-3.5 h-3.5" />
                      </span>
                      <span className="studio-asset-tree-name">
                        {t("prompts.allItems")}
                      </span>
                      <span className="studio-asset-tree-count">
                        {countForCategory(lib, "all")}
                      </span>
                    </button>
                    {cats.map((cat) => {
                      const active =
                        categoryId === cat.id && treeFocus === "category";
                      return (
                        <div key={cat.id}>
                          <button
                            type="button"
                            className={cn(
                              "studio-asset-tree-row child",
                              active && "active",
                            )}
                            data-testid={`prompt-cat-${cat.id}`}
                            onClick={() => {
                              setCategoryId(cat.id);
                              setTreeFocus("category");
                              setPendingDelete(null);
                              setDetailMode("view");
                            }}
                          >
                            <span className="studio-asset-tree-elbow" />
                            <span className="studio-asset-tree-icon">
                              <Tag className="w-3.5 h-3.5" />
                            </span>
                            <span className="studio-asset-tree-name">
                              {cat.name || categoryLabel(cat.id)}
                            </span>
                            <span className="studio-asset-tree-count">
                              {countForCategory(lib, cat.id)}
                            </span>
                          </button>
                          {active ? renderCategoryActions(cat.id) : null}
                        </div>
                      );
                    })}
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
      <div className="studio-asset-panel-head studio-asset-content-head">
        <div className="studio-asset-content-heading">
          <strong>{activeLibrary?.name || t("tabs.prompts")}</strong>
          <span>{t("prompts.itemCount", { count: items.length })}</span>
        </div>
        <div className="studio-asset-content-tools">
          <label className="studio-asset-search-wrap">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("prompts.searchPlaceholder")}
              data-testid="prompt-item-search"
            />
          </label>
          <button
            type="button"
            className="studio-action-btn primary"
            disabled={!canEdit || saveItem.isPending}
            data-testid="prompt-item-new"
            onClick={startCreate}
          >
            <FilePlus2 className="w-4 h-4" />
            {t("prompts.newItem")}
          </button>
          <button
            type="button"
            className={cn("studio-action-btn", manageMode && "primary")}
            data-testid="prompt-manage-btn"
            onClick={() => {
              setManageMode((v) => !v);
              setBatchIds(new Set());
              setPendingDelete(null);
            }}
          >
            <ListChecks className="w-4 h-4" />
            {manageMode ? t("browser.manageDone") : t("browser.manage")}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className="studio-asset-manage-bar" data-testid="prompt-manage-bar">
          <span>{t("prompts.selectedCount", { count: batchIds.size })}</span>
          <div className="studio-asset-content-tools">
            <button
              type="button"
              className="studio-action-btn"
              disabled={!items.length || !canEdit}
              onClick={() => setBatchIds(new Set(items.map((i) => i.id)))}
              data-testid="prompt-select-all"
            >
              {t("browser.selectAll")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={!batchIds.size}
              onClick={() => setBatchIds(new Set())}
              data-testid="prompt-clear-selection"
            >
              {t("browser.clearSelection")}
            </button>
            <button
              type="button"
              className={cn(
                "studio-action-btn danger",
                pendingDelete === "batch" && "confirm",
              )}
              disabled={!canEdit || !batchIds.size || deleteSelected.isPending}
              data-testid="prompt-delete-selected"
              onClick={() => {
                if (pendingDelete !== "batch") {
                  setPendingDelete("batch");
                  return;
                }
                deleteSelected.mutate([...batchIds]);
              }}
            >
              <Trash2 className="w-4 h-4" />
              {pendingDelete === "batch"
                ? t("browser.confirmDelete")
                : t("browser.deleteSelected")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-asset-content-scroll">
        {isLoading ? (
          <p className="studio-asset-empty-inline">{t("browser.loading")}</p>
        ) : items.length === 0 ? (
          <div className="studio-asset-empty-state" data-testid="prompt-items-empty">
            {(activeLibrary?.items || []).length
              ? t("prompts.emptyFiltered")
              : t("prompts.emptyItems")}
          </div>
        ) : (
          <div className="studio-asset-prompt-list">
            {items.map((item) => {
              const active = item.id === selected?.id && detailMode !== "create";
              return (
                <article
                  key={item.id}
                  className={cn("studio-asset-prompt-row", active && "active")}
                  data-testid={`prompt-item-${item.id}`}
                  onClick={() => {
                    setSelectedId(item.id);
                    setDetailMode("view");
                  }}
                >
                  {manageMode ? (
                    <input
                      type="checkbox"
                      className="studio-asset-prompt-row-check"
                      checked={batchIds.has(item.id)}
                      disabled={!canEdit}
                      onChange={() => {
                        setBatchIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`prompt-item-select-${item.id}`}
                    />
                  ) : null}
                  <div className="studio-asset-prompt-row-main">
                    <div className="studio-asset-prompt-row-title">
                      <strong>{itemName(item) || t("prompts.itemFallback")}</strong>
                      <span className="studio-asset-prompt-tag">
                        {categoryLabel(item.category || "custom")}
                      </span>
                    </div>
                    <div className="studio-asset-prompt-row-scene">
                      {item.scene || t("prompts.noScene")}
                    </div>
                    <div className="studio-asset-prompt-row-text">
                      {itemPositive(item)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const detail =
    detailMode === "create" || (detailMode === "edit" && selected) ? (
      <>
        <div className="studio-asset-panel-head">
          <div className="studio-asset-panel-title">
            <strong>
              {detailMode === "create"
                ? t("prompts.createTitle")
                : t("prompts.editTitle")}
            </strong>
            <span>
              {detailMode === "create"
                ? t("prompts.createHint")
                : t("prompts.editHint")}
            </span>
          </div>
          <div className="studio-asset-panel-actions">
            <button
              type="button"
              className="studio-action-btn primary"
              disabled={saveItem.isPending}
              data-testid="prompt-detail-save"
              onClick={() => saveItem.mutate()}
            >
              <Check className="w-4 h-4" />
              {t("prompts.save")}
            </button>
            <button
              type="button"
              className="studio-asset-icon-btn"
              aria-label={t("browser.cancel")}
              data-testid="prompt-detail-cancel"
              onClick={() => setDetailMode("view")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="studio-asset-detail-scroll">
          <div className="studio-asset-prompt-form">
            <label>
              <span>{t("prompts.fieldName")}</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="prompt-edit-name"
              />
            </label>
            <label>
              <span>{t("prompts.fieldScene")}</span>
              <textarea
                value={editScene}
                onChange={(e) => setEditScene(e.target.value)}
                data-testid="prompt-edit-scene"
              />
            </label>
            <label>
              <span>{t("prompts.fieldPositive")}</span>
              <textarea
                value={editPositive}
                onChange={(e) => setEditPositive(e.target.value)}
                rows={8}
                data-testid="prompt-edit-positive"
              />
            </label>
            <label>
              <span>{t("prompts.fieldNegative")}</span>
              <textarea
                value={editNegative}
                onChange={(e) => setEditNegative(e.target.value)}
                rows={4}
                data-testid="prompt-edit-negative"
              />
            </label>
          </div>
        </div>
      </>
    ) : selected ? (
      <>
        <div className="studio-asset-panel-head">
          <div className="studio-asset-panel-title">
            <strong>{t("prompts.detailTitle")}</strong>
            <span>{categoryLabel(selected.category || "custom")}</span>
          </div>
          <div className="studio-asset-panel-actions">
            <button
              type="button"
              className="studio-asset-icon-btn"
              disabled={!canEdit}
              title={t("prompts.edit")}
              aria-label={t("prompts.edit")}
              data-testid="prompt-detail-edit"
              onClick={() => setDetailMode("edit")}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                "studio-asset-icon-btn danger",
                pendingDelete === selected.id && "confirm",
              )}
              disabled={!canEdit}
              title={
                pendingDelete === selected.id
                  ? t("browser.confirmDelete")
                  : t("actions.delete")
              }
              aria-label={t("actions.delete")}
              data-testid="prompt-detail-delete"
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
        <div className="studio-asset-detail-scroll" data-testid="prompt-detail-preview">
          <div className="studio-asset-prompt-detail-head">
            <div className="studio-asset-prompt-detail-title">
              {itemName(selected) || t("prompts.itemFallback")}
            </div>
            <div className="studio-asset-prompt-detail-scene">
              {selected.scene || t("prompts.noScene")}
            </div>
          </div>
          <section className="studio-asset-prompt-block">
            <div className="studio-asset-prompt-block-head">
              <span>{t("prompts.fieldPositive")}</span>
              <span>
                {t("prompts.charCount", {
                  count: itemPositive(selected).length,
                })}
              </span>
            </div>
            <textarea
              className="studio-asset-prompt-block-body"
              readOnly
              value={itemPositive(selected) || t("prompts.emptyField")}
              data-testid="prompt-detail-positive"
            />
          </section>
          <section className="studio-asset-prompt-block">
            <div className="studio-asset-prompt-block-head">
              <span>{t("prompts.fieldNegative")}</span>
              <span>
                {t("prompts.charCount", {
                  count: String(selected.negative || "").length,
                })}
              </span>
            </div>
            <textarea
              className="studio-asset-prompt-block-body negative"
              readOnly
              value={selected.negative || t("prompts.emptyField")}
              data-testid="prompt-detail-negative"
            />
          </section>
        </div>
      </>
    ) : (
      <>
        <div className="studio-asset-panel-head">
          <div className="studio-asset-panel-title">
            <strong>{t("prompts.detailTitle")}</strong>
            <span>{t("prompts.detailEmptyHint")}</span>
          </div>
        </div>
        <div className="studio-asset-detail-scroll">
          <div className="studio-asset-detail-empty" data-testid="prompt-detail-empty">
            <TextCursorInput className="w-8 h-8 opacity-40" />
            <span>{t("prompts.detailEmpty")}</span>
          </div>
        </div>
      </>
    );

  return (
    <AssetBrowserChrome
      testId="prompt-libraries-browser"
      nav={nav}
      content={content}
      detail={detail}
    />
  );
}
