import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  Check,
  CornerDownLeft,
  FilePlus2,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import type { PromptLibrariesResponse, PromptLibraryDoc } from "../../../types/api";
import {
  BUILTIN_CATEGORY_IDS,
  DEFAULT_PROMPT_CATEGORIES,
  defaultTemplateNameFromText,
  filterPromptTemplates,
  normalizeLibraryItems,
  PROMPT_LIBRARIES_QUERY_KEY,
  templateApplyText,
  type PromptTemplateItem,
} from "../core/promptTemplates";

interface LegacyPromptTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (content: string) => void;
  currentPrompt?: string;
}

export function LegacyPromptTemplateModal({
  open,
  onClose,
  onApply,
  currentPrompt = "",
}: LegacyPromptTemplateModalProps) {
  const { t } = useTranslation("canvas");
  const { t: tc } = useTranslation("common");
  const queryClient = useQueryClient();

  const [libraryId, setLibraryId] = useState("system");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [groupEditMode, setGroupEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("custom");
  const [editPositive, setEditPositive] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: PROMPT_LIBRARIES_QUERY_KEY,
    queryFn: () => api.get<PromptLibrariesResponse>("/api/prompt-libraries"),
    enabled: open,
  });

  const libraries = data?.library?.libraries ?? [];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setEditing(false);
    setGroupEditMode(false);
    setStatus("");
    setCategory("all");
    setSelectedId("");
    setLibraryId("");
  }, [open]);

  useEffect(() => {
    if (!open || !data?.library) return;
    const libs = data.library.libraries ?? [];
    if (libraryId && libs.some((lib) => lib.id === libraryId)) return;
    const active = data.library.active_library_id || "system";
    const nextLib =
      libs.find((lib) => lib.id === active)?.id ||
      libs.find((lib) => lib.id === "system")?.id ||
      libs[0]?.id ||
      "system";
    setLibraryId(nextLib);
  }, [open, data, libraryId]);

  const activeLibrary: PromptLibraryDoc | undefined =
    libraries.find((lib) => lib.id === libraryId) || libraries[0];

  const categories = useMemo(() => {
    if (!activeLibrary || activeLibrary.id === "system") {
      const extras = (activeLibrary?.categories || []).filter(
        (cat) => cat?.id && !BUILTIN_CATEGORY_IDS.has(cat.id),
      );
      return [
        ...DEFAULT_PROMPT_CATEGORIES.map((cat) => ({
          id: cat.id,
          name: t(cat.nameKey),
        })),
        ...extras.map((cat) => ({ id: cat.id, name: cat.name })),
      ];
    }
    return (activeLibrary.categories || [])
      .filter((cat) => cat?.id && cat?.name)
      .map((cat) => ({ id: cat.id, name: cat.name }));
  }, [activeLibrary, t]);

  const items = useMemo(
    () => normalizeLibraryItems(libraries, activeLibrary?.id || libraryId),
    [libraries, activeLibrary?.id, libraryId],
  );

  const visibleItems = useMemo(
    () => filterPromptTemplates(items, category, query),
    [items, category, query],
  );

  useEffect(() => {
    if (!open) return;
    if (visibleItems.length === 0) {
      setSelectedId("");
      return;
    }
    if (!visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [open, visibleItems, selectedId]);

  const selected =
    visibleItems.find((item) => item.id === selectedId) || visibleItems[0] || null;

  useEffect(() => {
    if (!selected || !editing) return;
    setEditName(selected.name);
    setEditCategory(selected.category || "custom");
    setEditPositive(selected.positive);
  }, [selected, editing]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const item of items) {
      const key = item.category || "custom";
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [items]);

  const editable = Boolean(activeLibrary && !activeLibrary.readonly);

  const invalidate = async (nextSelectedId?: string) => {
    await queryClient.invalidateQueries({ queryKey: PROMPT_LIBRARIES_QUERY_KEY });
    if (nextSelectedId) setSelectedId(nextSelectedId);
  };

  const saveCurrentMutation = useMutation({
    mutationFn: async () => {
      const text = currentPrompt.trim();
      if (!text) throw new Error(t("promptTemplateSaveEmpty"));
      if (!activeLibrary) throw new Error(t("promptTemplateEmpty"));
      return api.post<{ item?: PromptTemplateItem }>("/api/prompt-libraries/items", {
        library_id: activeLibrary.id,
        name: defaultTemplateNameFromText(text),
        category: category === "all" ? "custom" : category,
        positive: text,
        scene: t("promptTemplateMineTemplate"),
      });
    },
    onSuccess: async (res) => {
      setEditing(false);
      setCategory(category === "all" ? "custom" : category);
      await invalidate(res.item?.id);
      setStatus("");
    },
    onError: (err: Error) => setStatus(err.message || t("promptTemplateRequired")),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeLibrary) throw new Error(t("promptTemplateEmpty"));
      const nextCategory = category === "all" ? "custom" : category;
      return api.post<{ item?: PromptTemplateItem }>("/api/prompt-libraries/items", {
        library_id: activeLibrary.id,
        name: t("promptTemplateNewName"),
        category: nextCategory,
        positive: t("promptTemplateNewContent"),
        scene: t("promptTemplateMineTemplate"),
      });
    },
    onSuccess: async (res) => {
      const nextCategory = category === "all" ? "custom" : category;
      setCategory(nextCategory);
      setEditing(true);
      await invalidate(res.item?.id);
      setStatus("");
    },
    onError: (err: Error) => setStatus(err.message || t("promptTemplateRequired")),
  });

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !activeLibrary) throw new Error(t("promptTemplateEmpty"));
      const name = editName.trim();
      const positive = editPositive.trim();
      if (!name || !positive) throw new Error(t("promptTemplateRequired"));
      return api.patch(`/api/prompt-libraries/items/${encodeURIComponent(selected.id)}`, {
        library_id: selected.libraryId || activeLibrary.id,
        name,
        category: editCategory || "custom",
        positive,
        negative: selected.negative || "",
        scene: selected.scene || "",
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await invalidate(selected?.id);
      setStatus("");
    },
    onError: (err: Error) => setStatus(err.message || t("promptTemplateRequired")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error(t("promptTemplateEmpty"));
      return api.delete(`/api/prompt-libraries/items/${encodeURIComponent(selected.id)}`);
    },
    onSuccess: async () => {
      setEditing(false);
      setSelectedId("");
      await invalidate();
      setStatus("");
    },
    onError: (err: Error) => setStatus(err.message || tc("delete")),
  });

  const addGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!activeLibrary) throw new Error(t("promptTemplateEmpty"));
      return api.post<{ category?: { id: string } }>("/api/prompt-libraries/categories", {
        library_id: activeLibrary.id,
        name,
      });
    },
    onSuccess: async (res) => {
      if (res.category?.id) setCategory(res.category.id);
      await invalidate();
    },
    onError: (err: Error) => setStatus(err.message),
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, {
        library_id: activeLibrary?.id,
        name,
      }),
    onSuccess: async () => invalidate(),
    onError: (err: Error) => setStatus(err.message),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`),
    onSuccess: async (_res, id) => {
      if (category === id) setCategory("all");
      await invalidate();
    },
    onError: (err: Error) => setStatus(err.message),
  });

  const categoryLabel = (id: string) => {
    if (id === "all") return t("promptTemplateAll");
    const found = categories.find((cat) => cat.id === id);
    if (found) return found.name;
    const builtin = DEFAULT_PROMPT_CATEGORIES.find((cat) => cat.id === id);
    return builtin ? t(builtin.nameKey) : id;
  };

  const handleApply = (mode: "positive" | "full") => {
    if (!selected) return;
    onApply(templateApplyText(selected, mode));
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-transparent"
      data-testid="legacy-prompt-template-modal"
      onClick={onClose}
    >
      <aside
        className="absolute right-[22px] top-[66px] bottom-[22px] z-[91] flex w-[620px] max-w-[calc(100vw-44px)] flex-col gap-2.5 overflow-hidden border border-[var(--border)] bg-[var(--bg)]/95 p-3 shadow-[0_22px_58px_rgba(15,23,42,0.18)] backdrop-blur-xl"
        data-testid="legacy-prompt-template-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <strong className="block text-[13px] font-extrabold leading-tight text-[var(--text)]">
              {t("promptTemplateLibrary")}
            </strong>
            <span className="mt-0.5 block text-[10.5px] font-semibold text-[var(--muted)]">
              {activeLibrary?.name || t("promptTemplateSystem")}
            </span>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text)]"
            aria-label={tc("close")}
            title={tc("close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <select
          className="h-8 w-full border border-[var(--border)] bg-[var(--nav-hover-bg)] px-2.5 text-[11px] font-extrabold text-[var(--text)] outline-none"
          value={activeLibrary?.id || libraryId}
          data-testid="prompt-template-library-select"
          onChange={(event) => {
            setLibraryId(event.target.value);
            setCategory("all");
            setEditing(false);
            setSelectedId("");
          }}
        >
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.name || lib.id}
            </option>
          ))}
        </select>

        <label className="flex h-8 items-center gap-1.5 border border-[var(--border)] bg-[var(--nav-hover-bg)] px-2.5 text-[var(--muted)]">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            type="search"
            className="min-w-0 flex-1 border-0 bg-transparent text-[11px] font-semibold text-[var(--text)] outline-none"
            placeholder={t("promptTemplateSearch")}
            value={query}
            data-testid="prompt-template-search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="shrink-0">
          {groupEditMode ? (
            <div className="flex flex-col gap-2 border border-[var(--border)] bg-[var(--nav-hover-bg)] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong className="block text-xs font-extrabold text-[var(--text)]">
                    {t("promptTemplateGroupManage")}
                  </strong>
                  <span className="mt-0.5 block text-[10px] font-semibold text-[var(--muted)]">
                    {t("promptTemplateGroupHint")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 border border-[var(--border)] bg-[var(--bg)] px-2 text-[10.5px] font-extrabold"
                    onClick={() => {
                      const name = window.prompt(
                        t("promptTemplateNewGroupPrompt"),
                        t("promptTemplateNewGroupDefault"),
                      );
                      if (name?.trim()) addGroupMutation.mutate(name.trim().slice(0, 24));
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    {t("promptTemplateAddGroup")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 border border-[var(--text)] bg-[var(--text)] px-2 text-[10.5px] font-extrabold text-[var(--bg)]"
                    onClick={() => setGroupEditMode(false)}
                  >
                    <Check className="h-3 w-3" />
                    {t("promptTemplateDone")}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {categories.map((cat) => {
                  const canDelete = !BUILTIN_CATEGORY_IDS.has(cat.id);
                  return (
                    <div
                      key={cat.id}
                      className={`grid items-center gap-1 ${canDelete ? "grid-cols-[minmax(0,1fr)_28px_28px]" : "grid-cols-[minmax(0,1fr)_28px]"}`}
                    >
                      <button
                        type="button"
                        className={`flex h-[30px] min-w-0 items-center justify-between gap-1.5 border px-2 text-[11px] font-extrabold ${
                          category === cat.id
                            ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
                            : "border-[var(--border)] bg-[var(--bg)]"
                        }`}
                        onClick={() => setCategory(cat.id)}
                      >
                        <span className="truncate">{cat.name}</span>
                        <small className="text-[9.5px] text-[var(--muted)]">
                          {counts[cat.id] || 0}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                        title={t("promptTemplateRename")}
                        onClick={() => {
                          const name = window.prompt(t("promptTemplateGroupNamePrompt"), cat.name);
                          if (name?.trim()) {
                            renameGroupMutation.mutate({
                              id: cat.id,
                              name: name.trim().slice(0, 24),
                            });
                          }
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center border border-[var(--border)] text-red-600 hover:bg-red-50"
                          title={tc("delete")}
                          onClick={() => {
                            if (window.confirm(t("promptTemplateDeleteGroupConfirm"))) {
                              deleteGroupMutation.mutate(cat.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-auto">
                <button
                  type="button"
                  className={`inline-flex h-[30px] shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-extrabold ${
                    category === "all"
                      ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                      : "border-[var(--border)] bg-[var(--nav-hover-bg)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                  }`}
                  data-testid="prompt-template-cat-all"
                  onClick={() => setCategory("all")}
                >
                  <span>{t("promptTemplateAll")}</span>
                  <small className="text-[9.5px] opacity-70">{counts.all || 0}</small>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`inline-flex h-[30px] shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-extrabold ${
                      category === cat.id
                        ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                        : "border-[var(--border)] bg-[var(--nav-hover-bg)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                    }`}
                    data-testid={`prompt-template-cat-${cat.id}`}
                    onClick={() => setCategory(cat.id)}
                  >
                    <span>{cat.name}</span>
                    <small className="text-[9.5px] opacity-70">{counts[cat.id] || 0}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="inline-flex h-[30px] shrink-0 items-center gap-1 border border-[var(--border)] bg-[var(--nav-hover-bg)] px-2.5 text-[10.5px] font-extrabold text-[var(--text)] hover:border-[var(--text)]"
                data-testid="prompt-template-manage-groups"
                onClick={() => setGroupEditMode(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>{t("promptTemplateManageGroups")}</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[216px_minmax(0,1fr)] gap-2.5 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-1.5 overflow-auto pr-1">
            <div className="sticky top-0 z-[1] grid grid-cols-2 gap-1.5 bg-[var(--bg)] pb-0.5">
              <button
                type="button"
                disabled={!editable || saveCurrentMutation.isPending}
                className="flex h-8 items-center justify-center gap-1 border border-[var(--border)] bg-[var(--nav-hover-bg)] text-[10.5px] font-extrabold disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="prompt-template-save-current"
                onClick={() => saveCurrentMutation.mutate()}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {t("promptTemplateSaveCurrent")}
              </button>
              <button
                type="button"
                disabled={!editable || createMutation.isPending}
                className="flex h-8 items-center justify-center gap-1 border border-[var(--border)] bg-[var(--nav-hover-bg)] text-[10.5px] font-extrabold disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="prompt-template-new"
                onClick={() => createMutation.mutate()}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                {t("promptTemplateNew")}
              </button>
            </div>

            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center border border-dashed border-[var(--border)] text-[11px] font-bold text-[var(--muted)]">
                {t("promptTemplateLoading")}
              </div>
            ) : isError ? (
              <div className="flex min-h-[180px] items-center justify-center border border-dashed border-[var(--border)] text-[11px] font-bold text-[var(--muted)]">
                {t("promptTemplateEmpty")}
              </div>
            ) : visibleItems.length ? (
              visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`relative block w-full min-h-[82px] border p-2.5 pb-6 text-left transition-[border-color,transform] hover:-translate-y-px hover:border-[var(--text)] ${
                    item.id === selected?.id
                      ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
                      : "border-[var(--border)] bg-[var(--nav-hover-bg)]"
                  }`}
                  data-testid={`prompt-template-${item.id}`}
                  onClick={() => {
                    setSelectedId(item.id);
                    setEditing(false);
                  }}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-extrabold text-[var(--text)]">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[9.5px] font-extrabold text-[var(--settings-faint)]">
                      {item.builtin ? t("promptTemplateBuiltin") : t("promptTemplateMineTag")}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-[10px] leading-[1.35] text-[var(--muted)]">
                    {item.scene || item.positive}
                  </span>
                  <span className="absolute bottom-1.5 left-2.5 text-[9.5px] font-extrabold text-[var(--settings-faint)]">
                    {categoryLabel(item.category || "custom")}
                  </span>
                </button>
              ))
            ) : (
              <div className="flex min-h-[180px] items-center justify-center border border-dashed border-[var(--border)] text-[11px] font-bold text-[var(--muted)]">
                {t("promptTemplateEmpty")}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden border border-[var(--border)] bg-[var(--nav-hover-bg)] p-3">
            {selected ? (
              <>
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] pb-2.5">
                  <div className="min-w-0">
                    <strong className="block text-sm font-extrabold text-[var(--text)]">
                      {selected.name}
                    </strong>
                    <span className="mt-0.5 block text-[10.5px] font-bold text-[var(--muted)]">
                      {categoryLabel(selected.category || "")} ·{" "}
                      {selected.builtin
                        ? t("promptTemplateBuiltinTemplate")
                        : t("promptTemplateMineTemplate")}
                    </span>
                  </div>
                  {!editing ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className="flex h-9 w-[42px] flex-col items-center justify-center gap-0.5 border border-[var(--border)] bg-[var(--bg)] text-[9px] font-extrabold"
                        title={t("promptTemplateEdit")}
                        data-testid="prompt-template-edit"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {tc("edit")}
                      </button>
                      <button
                        type="button"
                        className="flex h-9 w-[42px] flex-col items-center justify-center gap-0.5 border border-[var(--border)] bg-[var(--bg)] text-[9px] font-extrabold text-red-600"
                        title={t("promptTemplateDelete")}
                        data-testid="prompt-template-delete"
                        onClick={() => {
                          if (window.confirm(t("promptTemplateDeleteConfirm"))) {
                            deleteMutation.mutate();
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {tc("delete")}
                      </button>
                    </div>
                  ) : null}
                </div>

                {editing ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
                    <label className="text-[10px] font-black text-[var(--settings-faint)]">
                      {t("promptTemplateName")}
                    </label>
                    <input
                      className="h-8 border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[11px] font-semibold outline-none"
                      value={editName}
                      data-testid="prompt-template-edit-name"
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    <label className="text-[10px] font-black text-[var(--settings-faint)]">
                      {t("promptTemplateGroup")}
                    </label>
                    <select
                      className="h-8 border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[11px] font-semibold outline-none"
                      value={editCategory}
                      data-testid="prompt-template-edit-category"
                      onChange={(event) => setEditCategory(event.target.value)}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <label className="text-[10px] font-black text-[var(--settings-faint)]">
                      {t("promptTemplateContent")}
                    </label>
                    <textarea
                      className="min-h-[220px] flex-1 resize-y border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[11px] leading-[1.48] font-semibold outline-none"
                      value={editPositive}
                      data-testid="prompt-template-edit-text"
                      onChange={(event) => setEditPositive(event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto pr-1">
                    <section>
                      <label className="mb-1 block text-[10px] font-black text-[var(--settings-faint)]">
                        {t("promptTemplatePositive")}
                      </label>
                      <p
                        className="whitespace-pre-wrap text-[10.6px] leading-[1.48] text-[var(--text)]"
                        data-testid="prompt-template-positive"
                      >
                        {selected.positive}
                      </p>
                    </section>
                    {selected.negative ? (
                      <section>
                        <label className="mb-1 block text-[10px] font-black text-[var(--settings-faint)]">
                          {t("promptTemplateNegative")}
                        </label>
                        <p className="whitespace-pre-wrap text-[10.6px] leading-[1.48] text-[var(--text)]">
                          {selected.negative}
                        </p>
                      </section>
                    ) : null}
                    {Object.keys(selected.params || {}).length ? (
                      <section>
                        <label className="mb-1 block text-[10px] font-black text-[var(--settings-faint)]">
                          {t("promptTemplateParams")}
                        </label>
                        <p className="whitespace-pre-wrap text-[10.6px] leading-[1.48] text-[var(--text)]">
                          {Object.entries(selected.params || {})
                            .map(([key, value]) => `${key}: ${value}`)
                            .join("\n")}
                        </p>
                      </section>
                    ) : null}
                  </div>
                )}

                <div className="mt-auto flex shrink-0 justify-end gap-2 border-t border-[var(--border)] pt-2.5">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="flex h-10 min-w-[58px] flex-col items-center justify-center gap-0.5 border border-[var(--border)] bg-[var(--bg)] px-2 text-[9.5px] font-extrabold"
                        onClick={() => setEditing(false)}
                      >
                        <X className="h-[15px] w-[15px]" />
                        {tc("cancel")}
                      </button>
                      <button
                        type="button"
                        className="flex h-10 min-w-[58px] flex-col items-center justify-center gap-0.5 border border-[var(--border)] bg-red-50 px-2 text-[9.5px] font-extrabold text-red-600"
                        onClick={() => {
                          if (window.confirm(t("promptTemplateDeleteConfirm"))) {
                            deleteMutation.mutate();
                          }
                        }}
                      >
                        <Trash2 className="h-[15px] w-[15px]" />
                        {tc("delete")}
                      </button>
                      <button
                        type="button"
                        className="flex h-10 min-w-[78px] flex-col items-center justify-center gap-0.5 border border-[var(--text)] bg-[var(--text)] px-2 text-[9.5px] font-extrabold text-[var(--bg)]"
                        data-testid="prompt-template-edit-save"
                        onClick={() => saveEditMutation.mutate()}
                      >
                        <Save className="h-[15px] w-[15px]" />
                        {tc("save")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex h-10 min-w-[58px] flex-col items-center justify-center gap-0.5 border border-[var(--border)] bg-[var(--bg)] px-2 text-[9.5px] font-extrabold"
                        data-testid="prompt-template-apply-positive"
                        onClick={() => handleApply("positive")}
                      >
                        <CornerDownLeft className="h-[15px] w-[15px]" />
                        {t("promptTemplateApplyPositive")}
                      </button>
                      <button
                        type="button"
                        className="flex h-10 min-w-[78px] flex-col items-center justify-center gap-0.5 border border-[var(--text)] bg-[var(--text)] px-2 text-[9.5px] font-extrabold text-[var(--bg)]"
                        data-testid="prompt-template-apply-full"
                        onClick={() => handleApply("full")}
                      >
                        <WandSparkles className="h-[15px] w-[15px]" />
                        {t("promptTemplateApplyFull")}
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[220px] flex-1 items-center justify-center border border-dashed border-[var(--border)] text-xs font-bold text-[var(--muted)]">
                {t("promptTemplatePick")}
              </div>
            )}
          </div>
        </div>

        {status ? (
          <p className="shrink-0 text-[11px] font-semibold text-red-600" data-testid="prompt-template-status">
            {status}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
