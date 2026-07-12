import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, LocateFixed, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canvasListApi, projectApi } from "./api";
import {
  applyLayoutPatches,
  findAvailableCardPosition,
  layoutPatchesForNullPositions,
} from "./autoLayout";
import {
  boardCenterWorld,
  resetViewToCards,
  screenToWorld,
  zoomAtPoint,
  type BoardViewport,
} from "./boardViewport";
import {
  CanvasCard,
  CardContextMenu,
  CreateCanvasPopover,
  RenameCanvasInline,
  type CardContextMenuState,
} from "./components/CanvasCard";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TrashPanel } from "./components/TrashPanel";
import { exportCanvasJson, exportCanvasWithAssets } from "./exportCanvas";
import {
  canvasListReducer,
  filterCanvasesByProject,
  rememberedProjectId,
  rememberProjectId,
  sortProjects,
} from "./state";
import type { CanvasRecord, ProjectRecord } from "../../types/api";

const CARD_W = 248;
const CARD_H = 150;

export function CanvasListPage() {
  const { t } = useTranslation("canvas");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);

  const [showTrash, setShowTrash] = useState(false);
  const [viewport, setViewport] = useState<BoardViewport>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);
  const [createAt, setCreateAt] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [cardMenu, setCardMenu] = useState<CardContextMenuState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameCanvasId, setRenameCanvasId] = useState<string | null>(null);
  const [clipboardCanvasId, setClipboardCanvasId] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);

  const [listState, dispatch] = useReducer(canvasListReducer, {
    currentProjectId: rememberedProjectId(),
    canvases: [],
    deletedCanvases: [],
  });

  const toast = useCallback((text: string) => {
    setStatus(text);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 2200);
  }, []);

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

  const projects: ProjectRecord[] = useMemo(() => {
    const raw = projectsData?.projects ?? [{ id: "default", name: "默认项目" }];
    return sortProjects(raw);
  }, [projectsData]);

  const allCanvases = canvasesData?.canvases ?? listState.canvases;

  const visibleCanvases = useMemo(() => {
    const filtered = filterCanvasesByProject(
      allCanvases,
      listState.currentProjectId,
    );
    const patches = layoutPatchesForNullPositions(filtered);
    return applyLayoutPatches(filtered, patches);
  }, [allCanvases, listState.currentProjectId]);

  const layoutPersisted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const filtered = filterCanvasesByProject(
      allCanvases,
      listState.currentProjectId,
    );
    const patches = layoutPatchesForNullPositions(filtered).filter(
      (p) => !layoutPersisted.current.has(p.id),
    );
    if (!patches.length) return;
    patches.forEach((p) => layoutPersisted.current.add(p.id));
    void Promise.all(
      patches.map((p) =>
        canvasListApi.updateMeta(p.id, {
          board_x: p.board_x,
          board_y: p.board_y,
        }),
      ),
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] });
    });
  }, [allCanvases, listState.currentProjectId, queryClient]);

  const projectIdForView = listState.currentProjectId;
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const cards = filterCanvasesByProject(allCanvases, projectIdForView).map(
      (c) => ({
        x: c.board_x ?? 0,
        y: c.board_y ?? 0,
        width: CARD_W,
        height: CARD_H,
      }),
    );
    setViewport(resetViewToCards(cards, board.clientWidth, board.clientHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when switching project
  }, [projectIdForView]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["canvases"] });
    queryClient.invalidateQueries({ queryKey: ["canvases-trash"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      kind: "smart" | "classic";
      board_x: number;
      board_y: number;
    }) =>
      canvasListApi.createCanvas({
        title: payload.title,
        icon: payload.kind === "smart" ? "sparkles" : "🧩",
        kind: payload.kind,
        project: listState.currentProjectId,
        board_x: payload.board_x,
        board_y: payload.board_y,
      }),
    onSuccess: (res) => {
      invalidateAll();
      navigate(
        res.canvas.kind === "smart"
          ? `/canvas/${res.canvas.id}`
          : `/legacy-canvas/${res.canvas.id}`,
      );
    },
    onError: () => toast(t("createFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => canvasListApi.deleteCanvas(id),
    onSuccess: () => {
      invalidateAll();
      toast(t("movedToTrash"));
    },
    onError: () => toast(t("moveToTrashFailed")),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => canvasListApi.restoreCanvas(id),
    onSuccess: () => {
      invalidateAll();
      refetch();
      toast(t("restored"));
    },
    onError: () => toast(t("restoreFailed")),
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => canvasListApi.purgeCanvas(id),
    onSuccess: () => {
      invalidateAll();
      toast(t("purged"));
    },
    onError: () => toast(t("purgeFailed")),
  });

  const metaMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CanvasRecord>;
    }) => canvasListApi.updateMeta(id, patch),
    onSuccess: () => invalidateAll(),
    onError: () => toast(t("metaSaveFailed")),
  });

  const createProjectMutation = useMutation({
    mutationFn: (name: string) => projectApi.create(name),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      dispatch({ type: "set_project", projectId: res.project.id });
      rememberProjectId(res.project.id);
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      projectApi.update(id, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["canvases"] });
      if (listState.currentProjectId !== "default") {
        dispatch({ type: "set_project", projectId: "default" });
        rememberProjectId("default");
      }
    },
  });

  const selectProject = useCallback((id: string) => {
    dispatch({ type: "set_project", projectId: id });
    rememberProjectId(id);
    setShowTrash(false);
    setCreateAt(null);
    setCardMenu(null);
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

  const screenToWorldFn = useCallback(
    (clientX: number, clientY: number) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToWorld(clientX, clientY, rect, viewport);
    },
    [viewport],
  );

  const handleResetView = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const cards = visibleCanvases.map((c) => ({
      x: c.board_x ?? 0,
      y: c.board_y ?? 0,
      width: CARD_W,
      height: CARD_H,
    }));
    setViewport(resetViewToCards(cards, board.clientWidth, board.clientHeight));
  }, [visibleCanvases]);

  const onBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-testid^='canvas-card']"))
      return;
    if ((e.target as HTMLElement).closest("[data-testid='create-canvas-popover']"))
      return;
    setCardMenu(null);
    setCreateAt(null);
    setPanState({
      startX: e.clientX,
      startY: e.clientY,
      ox: viewport.x,
      oy: viewport.y,
    });
  };

  useEffect(() => {
    if (!panState) return;
    const onMove = (e: MouseEvent) => {
      setViewport((v) => ({
        ...v,
        x: panState.ox + (e.clientX - panState.startX),
        y: panState.oy + (e.clientY - panState.startY),
      }));
    };
    const onUp = () => setPanState(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [panState]);

  const onBoardWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setViewport((v) => zoomAtPoint(v, px, py, e.deltaY));
  };

  const onBoardDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-testid^='canvas-card']"))
      return;
    setCreateAt(screenToWorldFn(e.clientX, e.clientY));
  };

  const defaultCanvasTitle = (kind: "smart" | "classic") => {
    const time = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return kind === "smart"
      ? `${t("smartCanvas")} ${time}`
      : `${t("newCanvas")} ${time}`;
  };

  const handleCreateCanvas = (title: string, kind: "smart" | "classic") => {
    const board = boardRef.current;
    const desired = createAt ?? (board ? boardCenterWorld(board.clientWidth, board.clientHeight, viewport) : { x: 100, y: 100 });
    const pt = findAvailableCardPosition(desired, visibleCanvases);
    createMutation.mutate({
      title: title || defaultCanvasTitle(kind),
      kind,
      board_x: Math.round(pt.x),
      board_y: Math.round(pt.y),
    });
    setCreateAt(null);
  };

  const pasteCanvas = () => {
    if (!clipboardCanvasId) return;
    const c = allCanvases.find((x) => x.id === clipboardCanvasId);
    if (!c) {
      setClipboardCanvasId(null);
      return;
    }
    if ((c.project || "default") === listState.currentProjectId) {
      toast(t("noCanvas"));
      return;
    }
    metaMutation.mutate({
      id: c.id,
      patch: { project: listState.currentProjectId },
    });
    setClipboardCanvasId(null);
    toast(t("restored"));
  };

  const currentProject =
    projects.find((p) => p.id === listState.currentProjectId) ??
    projects[0];

  const gridBg = {
    backgroundImage:
      "linear-gradient(rgba(100,116,139,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.12) 1px, transparent 1px)",
    backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };

  return (
    <div className="flex h-full" data-testid="canvas-list-page">
      <ProjectSidebar
        projects={projects}
        currentProjectId={listState.currentProjectId}
        canvases={allCanvases}
        trashCount={trashData?.canvases.length ?? 0}
        showTrash={showTrash}
        onSelectProject={selectProject}
        onToggleTrash={() => setShowTrash((v) => !v)}
        onCreateProject={(name) => createProjectMutation.mutate(name)}
        onRenameProject={(id, name) =>
          renameProjectMutation.mutate({ id, name })
        }
        onDeleteProject={(id) => deleteProjectMutation.mutate(id)}
      />

      <section className="flex-1 flex flex-col min-w-0 relative bg-[#f7f7f8]">
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div>
            <h1 className="text-lg font-semibold text-black">
              {currentProject?.name ?? t("title")}
            </h1>
            <p className="text-sm text-gray-500">
              {visibleCanvases.length} {t("countSuffix")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {clipboardCanvasId &&
            allCanvases.some((c) => c.id === clipboardCanvasId) ? (
              <button
                type="button"
                onClick={pasteCanvas}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-black"
                data-testid="paste-canvas-btn"
              >
                <ClipboardPaste className="w-4 h-4" />
                Paste
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleResetView}
              className="p-2 border border-gray-200 rounded-lg hover:border-black transition-colors"
              title="Reset view"
              aria-label="Reset view"
            >
              <LocateFixed className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 border border-gray-200 rounded-lg hover:border-black transition-colors"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const board = boardRef.current;
                if (!board) return;
                setCreateAt(
                  boardCenterWorld(
                    board.clientWidth,
                    board.clientHeight,
                    viewport,
                  ),
                );
              }}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
              data-testid="new-canvas-btn"
            >
              <Plus className="w-4 h-4" />
              {t("newCanvas")}
            </button>
          </div>
        </header>

        <div
          ref={boardRef}
          className={`flex-1 relative overflow-hidden ${panState ? "cursor-grabbing" : "cursor-grab"}`}
          style={gridBg}
          onMouseDown={onBoardMouseDown}
          onWheel={onBoardWheel}
          onDoubleClick={onBoardDoubleClick}
          data-testid="canvas-board"
        >
          <div
            className="absolute inset-0 origin-top-left"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            }}
          >
            {visibleCanvases.map((canvas) => (
              <CanvasCard
                key={canvas.id}
                canvas={canvas}
                cutId={clipboardCanvasId}
                confirmingDelete={confirmDeleteId === canvas.id}
                onOpen={openCanvas}
                onMenu={(canvasId, rect) => {
                  setCardMenu({
                    canvasId,
                    x: Math.min(rect.left, window.innerWidth - 200),
                    y: rect.bottom + 6,
                  });
                }}
                onDragEnd={(id, board_x, board_y) =>
                  metaMutation.mutate({ id, patch: { board_x, board_y } })
                }
                onConfirmDelete={(id) => {
                  deleteMutation.mutate(id);
                  setConfirmDeleteId(null);
                }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                screenToWorld={screenToWorldFn}
                scale={viewport.scale}
              />
            ))}

            {createAt ? (
              <CreateCanvasPopover
                worldX={createAt.x}
                worldY={createAt.y}
                onCreate={handleCreateCanvas}
                onCancel={() => setCreateAt(null)}
              />
            ) : null}
          </div>

          {visibleCanvases.length === 0 && !createAt ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none">
              <p className="font-medium mb-1">{t("noCanvas")}</p>
              <p className="text-sm mb-4">{t("startWithNewCanvas")}</p>
              <button
                type="button"
                className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm"
                onClick={() => {
                  const board = boardRef.current;
                  if (!board) return;
                  setCreateAt(
                    boardCenterWorld(
                      board.clientWidth,
                      board.clientHeight,
                      viewport,
                    ),
                  );
                }}
              >
                <Plus className="w-4 h-4" />
                {t("newCanvas")}
              </button>
            </div>
          ) : null}

          <TrashPanel
            open={showTrash}
            canvases={trashData?.canvases ?? []}
            projects={projects}
            retentionDays={trashData?.retention_days ?? 30}
            onClose={() => setShowTrash(false)}
            onRestore={(id) => restoreMutation.mutate(id)}
            onPurge={(id) => purgeMutation.mutate(id)}
          />
        </div>

        {status ? (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black text-white text-sm rounded-lg shadow-lg z-30"
            data-testid="canvas-list-status"
          >
            {status}
          </div>
        ) : null}
      </section>

      <CardContextMenu
        menu={cardMenu}
        onClose={() => setCardMenu(null)}
        onRename={(id) => setRenameCanvasId(id)}
        onExport={async (id) => {
          const c = allCanvases.find((x) => x.id === id);
          try {
            await exportCanvasJson(id, c?.title);
            toast(t("success"));
          } catch {
            toast(t("failed"));
          }
        }}
        onExportWithAssets={async (id) => {
          const c = allCanvases.find((x) => x.id === id);
          try {
            setStatus(t("exportCollectingAssets"));
            const { included, skipped } = await exportCanvasWithAssets(id, c?.title);
            toast(
              skipped
                ? t("exportWithAssetsSkipped", { included, skipped })
                : t("exportWithAssetsDone", { included }),
            );
            setStatus("");
          } catch {
            toast(t("failed"));
            setStatus("");
          }
        }}
        onCut={(id) => {
          setClipboardCanvasId(id);
          toast("Cut �?switch project and paste");
        }}
        onDelete={(id) => setConfirmDeleteId(id)}
      />

      {renameCanvasId ? (
        <RenameCanvasInline
          canvasId={renameCanvasId}
          initialTitle={
            allCanvases.find((c) => c.id === renameCanvasId)?.title ?? ""
          }
          onSave={(title) => {
            if (title) {
              metaMutation.mutate({
                id: renameCanvasId,
                patch: { title },
              });
            }
            setRenameCanvasId(null);
          }}
          onCancel={() => setRenameCanvasId(null)}
        />
      ) : null}
    </div>
  );
}
