import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { api } from "../../shared/api/client";

type Tab = "images" | "workflows" | "prompts" | "canvas-assets" | "local-media";

interface LibraryCategory {
  id: string;
  type?: string;
  items?: Array<{ id: string; name?: string; url?: string }>;
}

export function AssetManagerPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("images");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newPromptName, setNewPromptName] = useState("");

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () =>
      api.get<{
        library?: { libraries?: Array<{ id: string; categories?: LibraryCategory[] }> };
      }>("/api/asset-library"),
  });

  const { data: localAssets } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () =>
      api.get<{ items?: Array<{ id: string; name?: string; url?: string }> }>("/api/local-assets"),
    enabled: tab === "local-media" || tab === "images",
  });

  const { data: prompts } = useQuery({
    queryKey: ["prompt-libraries"],
    queryFn: () =>
      api.get<{ libraries?: Array<{ id: string; name?: string }> }>("/api/prompt-libraries"),
    enabled: tab === "prompts",
  });

  const { data: canvasAssets } = useQuery({
    queryKey: ["canvas-assets"],
    queryFn: () =>
      api.get<{ items?: Array<{ id: string; name?: string; title?: string; url?: string }> }>(
        "/api/canvas-assets",
      ),
    enabled: tab === "canvas-assets",
  });

  const uploadMutation = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      return api.upload("/api/local-assets/upload", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["local-assets"] }),
  });

  const createPromptLib = useMutation({
    mutationFn: (name: string) => api.post("/api/prompt-libraries", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-libraries"] });
      setNewPromptName("");
    },
  });

  const deletePromptLib = useMutation({
    mutationFn: (id: string) => api.delete(`/api/prompt-libraries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompt-libraries"] }),
  });

  const deleteLocalAssets = useMutation({
    mutationFn: (ids: string[]) => api.post("/api/local-assets/delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-assets"] });
      setSelected(new Set());
    },
  });

  const categories = libraryData?.library?.libraries?.[0]?.categories ?? [];
  const imageItems = useMemo(
    () => categories.filter((c) => c.type === "image").flatMap((c) => c.items ?? []),
    [categories],
  );
  const workflowItems = useMemo(
    () => categories.filter((c) => c.type === "workflow").flatMap((c) => c.items ?? []),
    [categories],
  );

  const filterBySearch = <T extends { id: string; name?: string }>(items: T[]) =>
    items.filter((item) => {
      const label = item.name ?? item.id;
      return !search || label.toLowerCase().includes(search.toLowerCase());
    });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "images", label: "图片资产" },
    { id: "workflows", label: "工作流" },
    { id: "prompts", label: "提示词" },
    { id: "canvas-assets", label: "画布资产" },
    { id: "local-media", label: "本地素材" },
  ];

  return (
    <div className="h-full flex flex-col" data-testid="asset-manager-page">
      <header className="px-8 pt-8 pb-4 border-b border-[var(--border)]">
        <h1 className="text-2xl font-semibold mb-4">素材管理</h1>
        <nav className="flex flex-wrap gap-2 mb-4">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setSelected(new Set());
              }}
              data-testid={`asset-tab-${id}`}
              className={`px-4 py-2 text-sm border ${
                tab === id ? "border-black bg-[var(--nav-hover-bg)]" : "border-[var(--border)]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索"
          className="w-full max-w-md border border-[var(--border)] px-3 py-2 text-sm"
          data-testid="asset-search-input"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadMutation.mutate(e.target.files);
            e.target.value = "";
          }}
          data-testid="asset-upload-input"
        />
      </header>

      <div className="flex-1 overflow-auto p-8">
        {tab === "images" && (
          <div data-testid="asset-tab-panel-images">
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1 border border-[var(--border)] text-sm"
                data-testid="asset-upload-btn"
              >
                <Upload className="w-4 h-4" />
                上传
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {filterBySearch(imageItems).map((item) => (
                <div
                  key={item.id}
                  className={`border p-2 ${selected.has(item.id) ? "border-black" : "border-[var(--border)]"}`}
                  data-testid={`image-${item.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    data-testid={`image-select-${item.id}`}
                  />
                  {item.url ? (
                    <img src={item.url} alt="" className="w-full h-24 object-cover" />
                  ) : (
                    <div className="h-24 bg-[var(--nav-hover-bg)]" />
                  )}
                  <p className="text-xs mt-2 truncate">{item.name ?? item.id}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "workflows" && (
          <div data-testid="asset-tab-panel-workflows">
            <div className="grid grid-cols-3 gap-4">
              {filterBySearch(workflowItems).map((item) => (
                <div key={item.id} className="border border-[var(--border)] p-3" data-testid={`workflow-${item.id}`}>
                  {item.name ?? item.id}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "prompts" && (
          <div data-testid="asset-tab-panel-prompts">
            <div className="flex gap-2 mb-4">
              <input
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                placeholder="新提示词库"
                className="flex-1 border border-[var(--border)] px-3 py-2 text-sm"
                data-testid="prompt-lib-name-input"
              />
              <button
                type="button"
                onClick={() => createPromptLib.mutate(newPromptName)}
                disabled={!newPromptName.trim()}
                className="flex items-center gap-1 px-4 py-2 bg-black text-white text-sm"
                data-testid="prompt-lib-create-btn"
              >
                <Plus className="w-4 h-4" />
                创建
              </button>
            </div>
            <ul className="space-y-2">
              {filterBySearch(prompts?.libraries ?? []).map((lib) => (
                <li
                  key={lib.id}
                  className="flex items-center gap-2 border border-[var(--border)] p-3"
                  data-testid={`prompt-lib-${lib.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(lib.id)}
                    onChange={() => toggleSelect(lib.id)}
                    data-testid={`prompt-lib-select-${lib.id}`}
                  />
                  <span className="flex-1">{lib.name ?? lib.id}</span>
                  <button
                    type="button"
                    onClick={() => deletePromptLib.mutate(lib.id)}
                    className="text-red-500"
                    data-testid={`prompt-lib-delete-${lib.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "canvas-assets" && (
          <div data-testid="asset-tab-panel-canvas-assets">
            <div className="grid grid-cols-4 gap-4">
              {filterBySearch(canvasAssets?.items ?? []).map((item) => (
                <div key={item.id} className="border border-[var(--border)] p-2" data-testid={`canvas-asset-${item.id}`}>
                  <p className="text-xs">{item.name ?? item.title ?? item.id}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "local-media" && (
          <div data-testid="asset-tab-panel-local-media">
            <div className="flex justify-end gap-2 mb-4">
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => deleteLocalAssets.mutate([...selected])}
                  className="flex items-center gap-1 px-3 py-1 border border-red-300 text-red-600 text-sm"
                  data-testid="local-media-delete-selected"
                >
                  <Trash2 className="w-4 h-4" />
                  删除 ({selected.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1 border border-[var(--border)] text-sm"
                data-testid="local-media-upload-btn"
              >
                <Upload className="w-4 h-4" />
                上传
              </button>
            </div>
            <ul className="space-y-2">
              {filterBySearch(localAssets?.items ?? []).map((item) => (
                <li key={item.id} className="flex items-center gap-2 border border-[var(--border)] p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    data-testid={`local-media-select-${item.id}`}
                  />
                  <span className="text-sm">{item.name ?? item.id}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
