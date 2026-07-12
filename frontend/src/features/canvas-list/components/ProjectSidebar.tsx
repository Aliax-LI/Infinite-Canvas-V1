import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ClipboardPaste,
  Folder,
  FolderOpen,
  LocateFixed,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, formatTime } from "../../../shared/utils";
import type { CanvasRecord, ProjectRecord } from "../../../types/api";

interface ProjectSidebarProps {
  projects: ProjectRecord[];
  currentProjectId: string;
  canvases: CanvasRecord[];
  trashCount: number;
  showTrash: boolean;
  onSelectProject: (id: string) => void;
  onToggleTrash: () => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
}

export function ProjectSidebar({
  projects,
  currentProjectId,
  canvases,
  trashCount,
  showTrash,
  onSelectProject,
  onToggleTrash,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}: ProjectSidebarProps) {
  const { t } = useTranslation("canvas");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const countFor = useCallback(
    (pid: string) =>
      canvases.filter((c) => (c.project || "default") === pid && !c.deleted_at)
        .length,
    [canvases],
  );

  const submitNewProject = () => {
    const name = newProjectName.trim() || t("untitled");
    onCreateProject(name);
    setNewProjectOpen(false);
    setNewProjectName("");
  };

  const startRename = (p: ProjectRecord) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const finishRename = (commit: boolean) => {
    if (renamingId && commit) {
      const v = renameValue.trim();
      if (v) onRenameProject(renamingId, v);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <aside
      className="w-[272px] shrink-0 border-r border-gray-200 bg-white flex flex-col"
      data-testid="canvas-project-sidebar"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-black">项目</h2>
        <button
          type="button"
          onClick={() => setNewProjectOpen(true)}
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-600 hover:border-black hover:text-black transition-colors"
          title={t("add")}
          aria-label={t("add")}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {newProjectOpen ? (
        <div className="mx-3 mb-2 flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white">
          <input
            type="text"
            maxLength={60}
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder={t("ownerPlaceholder")}
            className="flex-1 min-w-0 h-8 px-2 text-sm border-0 outline-none bg-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewProject();
              if (e.key === "Escape") {
                setNewProjectOpen(false);
                setNewProjectName("");
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={submitNewProject}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-black text-white"
            aria-label={t("add")}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewProjectOpen(false);
              setNewProjectName("");
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500"
            aria-label={t("reset")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}

      <ul className="flex-1 overflow-auto px-2 pb-2 space-y-1">
        {projects.map((p) => {
          if (pendingDeleteId === p.id) {
            return (
              <li
                key={p.id}
                className="p-3 border border-gray-200 rounded-lg bg-gray-50 text-sm"
              >
                <p className="mb-2">
                  {t("moveToTrashConfirm")} 「{p.name}�?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg"
                    onClick={() => {
                      onDeleteProject(p.id);
                      setPendingDeleteId(null);
                    }}
                  >
                    {t("purgeCanvas")}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg"
                    onClick={() => setPendingDeleteId(null)}
                  >
                    {t("reset")}
                  </button>
                </div>
              </li>
            );
          }

          const active = p.id === currentProjectId && !showTrash;
          const isDefault = p.id === "default";

          return (
            <li key={p.id}>
              <div
                className={cn(
                  "group flex items-center gap-2 min-h-10 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                  active
                    ? "bg-black text-white"
                    : "hover:bg-gray-50 text-black",
                )}
                onClick={() => onSelectProject(p.id)}
                data-testid={`project-row-${p.id}`}
              >
                <span className="shrink-0 opacity-70">
                  {isDefault ? (
                    <Folder className="w-4 h-4" />
                  ) : (
                    <FolderOpen className="w-4 h-4" />
                  )}
                </span>
                {renamingId === p.id ? (
                  <input
                    type="text"
                    maxLength={60}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => finishRename(true)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") finishRename(true);
                      if (e.key === "Escape") finishRename(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 text-sm font-medium bg-white text-black border border-gray-300 rounded px-1.5 py-0.5 outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 truncate text-sm font-medium">
                    {p.name}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded group-hover:hidden",
                    active ? "bg-white/15" : "bg-gray-100 text-gray-600",
                  )}
                >
                  {countFor(p.id)}
                </span>
                <span className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    type="button"
                    className={cn(
                      "p-1 rounded",
                      active ? "hover:bg-white/20" : "hover:bg-gray-200",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(p);
                    }}
                    aria-label={t("rename")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!isDefault ? (
                    <button
                      type="button"
                      className={cn(
                        "p-1 rounded",
                        active ? "hover:bg-white/20" : "hover:bg-gray-200",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(p.id);
                      }}
                      aria-label={t("purgeCanvas")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="p-3 border-t border-gray-200">
        <button
          type="button"
          onClick={onToggleTrash}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
            showTrash
              ? "bg-gray-100 font-medium"
              : "text-gray-600 hover:bg-gray-50",
          )}
          data-testid="trash-entry"
        >
          <Trash2 className="w-4 h-4" />
          <span className="flex-1 text-left">{t("trash")}</span>
          {trashCount > 0 ? (
            <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
              {trashCount}
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}
