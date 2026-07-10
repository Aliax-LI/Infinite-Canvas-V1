import { useCallback, useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { canvasListApi, projectApi } from "./api";
import {
  canvasListReducer,
  filterCanvasesByProject,
  rememberedProjectId,
  rememberProjectId,
} from "./state";
import { formatTime } from "../../shared/utils";
import type { CanvasRecord } from "../../types/api";

function CanvasCard({
  canvas,
  onOpen,
  onDelete,
}: {
  canvas: CanvasRecord;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const href =
    canvas.kind === "smart" ? `/canvas/${canvas.id}` : `/legacy-canvas/${canvas.id}`;

  return (
    <div
      className="absolute w-60 border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer hover:border-black/30"
      style={{
        left: canvas.board_x ?? 0,
        top: canvas.board_y ?? 0,
      }}
      onClick={() => onOpen(canvas.id)}
      data-testid={`canvas-card-${canvas.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{canvas.icon || "🧩"}</span>
        <h3 className="font-medium truncate flex-1">{canvas.title}</h3>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {formatTime(canvas.updated_at)}
      </p>
      <div className="flex gap-2 mt-3">
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="text-xs underline"
        >
          打开
        </a>
        <button
          type="button"
          className="text-xs text-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(canvas.id);
          }}
        >
          删除
        </button>
      </div>
    </div>
  );
}

export function CanvasListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTrash, setShowTrash] = useState(false);

  const [listState, dispatch] = useReducer(canvasListReducer, {
    currentProjectId: rememberedProjectId(),
    canvases: [],
    deletedCanvases: [],
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
  });

  const { data: canvasesData, refetch } = useQuery({
    queryKey: ["canvases"],
    queryFn: async () => {
      const res = await canvasListApi.listCanvases();
      dispatch({ type: "set_canvases", canvases: res.canvases });
      return res;
    },
  });

  const { data: trashData } = useQuery({
    queryKey: ["canvases-trash"],
    queryFn: async () => {
      const res = await canvasListApi.listTrash();
      dispatch({ type: "set_deleted", deleted: res.canvases });
      return res;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      canvasListApi.createCanvas({
        title: "未命名画布",
        kind: "smart",
        project: listState.currentProjectId,
        board_x: 100 + Math.random() * 200,
        board_y: 100 + Math.random() * 200,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] });
      navigate(`/canvas/${res.canvas.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => canvasListApi.deleteCanvas(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] });
      queryClient.invalidateQueries({ queryKey: ["canvases-trash"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => canvasListApi.restoreCanvas(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] });
      queryClient.invalidateQueries({ queryKey: ["canvases-trash"] });
    },
  });

  const projects = projectsData?.projects ?? [
    { id: "default", name: "默认项目" },
  ];

  const visibleCanvases = useMemo(
    () =>
      filterCanvasesByProject(
        canvasesData?.canvases ?? listState.canvases,
        listState.currentProjectId,
      ),
    [canvasesData, listState.canvases, listState.currentProjectId],
  );

  const selectProject = useCallback((id: string) => {
    dispatch({ type: "set_project", projectId: id });
    rememberProjectId(id);
  }, []);

  const openCanvas = useCallback(
    (id: string) => {
      const canvas = visibleCanvases.find((c) => c.id === id);
      if (!canvas) return;
      navigate(
        canvas.kind === "smart"
          ? `/canvas/${id}`
          : `/legacy-canvas/${id}`,
      );
    },
    [navigate, visibleCanvases],
  );

  return (
    <div className="flex h-full" data-testid="canvas-list-page">
      <aside className="w-56 border-r border-[var(--border)] p-4 flex flex-col">
        <h2 className="text-sm font-semibold mb-4">项目</h2>
        <ul className="flex-1 space-y-1 overflow-auto">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => selectProject(p.id)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  listState.currentProjectId === p.id
                    ? "bg-[var(--nav-hover-bg)] font-medium"
                    : "hover:bg-[var(--nav-hover-bg)]"
                }`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTrash((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--nav-hover-bg)] mt-2"
        >
          <Trash2 className="w-4 h-4" />
          回收站
          {(trashData?.canvases.length ?? 0) > 0 && (
            <span className="text-xs bg-red-500 text-white px-1.5">
              {trashData?.canvases.length}
            </span>
          )}
        </button>
      </aside>

      <section className="flex-1 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h1 className="text-lg font-semibold">
              {projects.find((p) => p.id === listState.currentProjectId)?.name ??
                "画布"}
            </h1>
            <p className="text-sm text-[var(--muted)]">
              {visibleCanvases.length} 个画布
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)]"
              title="刷新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white hover:opacity-90 disabled:opacity-50"
              data-testid="new-canvas-btn"
            >
              <Plus className="w-4 h-4" />
              新建画布
            </button>
          </div>
        </header>

        {showTrash ? (
          <div className="p-6 overflow-auto" data-testid="trash-panel">
            <h2 className="font-medium mb-4">回收站</h2>
            {(trashData?.canvases ?? []).length === 0 ? (
              <p className="text-[var(--muted)]">回收站为空</p>
            ) : (
              <ul className="space-y-2">
                {(trashData?.canvases ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between border border-[var(--border)] p-3"
                  >
                    <span>{c.title}</span>
                    <button
                      type="button"
                      onClick={() => restoreMutation.mutate(c.id)}
                      className="text-sm underline"
                    >
                      恢复
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {visibleCanvases.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)]">
                暂无画布，点击「新建画布」开始
              </div>
            ) : (
              <div className="relative w-full h-full">
                {visibleCanvases.map((canvas) => (
                  <CanvasCard
                    key={canvas.id}
                    canvas={canvas}
                    onOpen={openCanvas}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
