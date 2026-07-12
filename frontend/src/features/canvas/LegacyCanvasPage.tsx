import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FolderOpen,
  GitBranch,
  Keyboard,
  LayoutGrid,
  LocateFixed,
  Save,
  Scissors,
  ScrollText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api } from "../../shared/api/client";
import type { AiConfig } from "../chat/types";
import { useLegacyCanvasStore } from "./core/state";
import { loadLegacyCanvas, saveLegacyCanvas } from "./core/persistence";
import {
  fitViewportToNodes,
  panViewport,
  screenToWorld,
  zoomViewport,
} from "./core/viewport";
import {
  uploadAndCreateLegacyNodes,
  uploadCanvasMediaFiles,
} from "./core/uploadMedia";
import {
  applyLlmResult,
  beginGenerationOutput,
  finishGenerationOutput,
  type BeginOutputSession,
} from "./core/applyGenerationResult";
import { normalizeGenerationError } from "../../shared/api/formatError";
import { runCanvasNode, type RunLoopContext } from "./core/runNodeGeneration";
import { clearRunState, stampRunStart } from "./core/runState";
import { computeCascadeOrder } from "./core/cascade";
import {
  exportWorkflowZip,
  importWorkflowZipFile,
  parseWorkflowPayload,
} from "./core/workflowTransfer";
import { outputCompareUrlFor } from "./core/pendingOutput";
import { readLtxTimeline } from "./core/ltxTimeline";
import {
  linkCreateOptions,
  createLinkedNodeAt,
  shouldAutoCreateOutputOnDrag,
  type LinkCreateState,
} from "./core/linkCreate";
import { resolveConnectDropTarget, resolveConnectSnapTarget } from "./core/connectHit";
import { LinkCreateMenu } from "./components/LinkCreateMenu";
import { QuickToolbar } from "./components/QuickToolbar";
import { LegacyPromptTemplateModal } from "./components/LegacyPromptTemplateModal";
import { createImageNodeFromUrl } from "./core/clipboard";
import {
  LEGACY_NODE_W,
  LEGACY_NODE_H,
  type LegacyNodeKind,
} from "./core/types";
import { LegacyNodeCard } from "./components/LegacyNodeCard";
import { ConnectionLayer, type TempWire } from "./components/ConnectionLayer";
import { Minimap } from "./components/Minimap";
import { ContextMenu } from "./components/ContextMenu";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { ImageEditModal } from "./components/ImageEditModal";
import { GenerationLogPanel } from "./components/GenerationLogPanel";
import { LegacyAssetPanel } from "./components/LegacyAssetPanel";
import { usePointerDrag } from "../../shared/hooks/usePointerDrag";
import { cn } from "../../shared/utils";
import { rememberCanvasId } from "./core/addResultToCanvas";
import { exportCanvasJson } from "../canvas-list/exportCanvas";

function nodeIntersectsScreenRect(
  node: { x: number; y: number; width: number; height: number },
  left: number,
  top: number,
  right: number,
  bottom: number,
  viewport: { x: number; y: number; scale: number },
): boolean {
  const x = viewport.x + node.x * viewport.scale;
  const y = viewport.y + node.y * viewport.scale;
  const w = (node.width || LEGACY_NODE_W) * viewport.scale;
  const h = (node.height || LEGACY_NODE_H) * viewport.scale;
  return x < right && x + w > left && y < bottom && y + h > top;
}

export function LegacyCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("canvas");
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [promptTemplateOpen, setPromptTemplateOpen] = useState(false);
  const [promptTemplateNodeId, setPromptTemplateNodeId] = useState<string | null>(null);
  const [linkCreateMenu, setLinkCreateMenu] = useState<{
    state: LinkCreateState;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } | null>(null);
  const [tempWire, setTempWire] = useState<TempWire | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [knifeMode, setKnifeMode] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [zoomOverview, setZoomOverview] = useState<{
    x: number;
    y: number;
    scale: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
    nodeId?: string;
    compareUrl?: string;
  } | null>(null);
  const [runningNodeIds, setRunningNodeIds] = useState<Set<string>>(new Set());
  // React state updates are asynchronous, so it cannot be used as a synchronous
  // re-entry lock inside handleRunNode. Keep an imperative mirror for claiming a
  // run before any state update, log write, or API request starts.
  const runningNodeIdsRef = useRef<Set<string>>(new Set());
  const [nodeRunErrors, setNodeRunErrors] = useState<Record<string, string>>(
    {},
  );
  const [selectionBox, setSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const boxDragRef = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const lastMouseWorldRef = useRef({ x: 200, y: 200 });
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const genFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: config } = useQuery({
    queryKey: ["legacy-canvas-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const {
    init,
    title,
    nodes,
    connections,
    viewport,
    settings,
    selectedIds,
    connectFromId,
    connectOriginKind,
    connectFeedback,
    dirty,
    setViewport,
    addNode,
    addNodeAtKind,
    updateNode,
    removeNodes,
    selectNode,
    setSelectedIds,
    arrangeNodes,
    arrangeSelected,
    groupSelected,
    markClean,
    cancelConnect,
    addConnection,
    removeConnection,
    pushUndo,
    undo,
    copySelection,
    pasteClipboard,
    importWorkflow,
    startGenerationLog,
    updateGenerationLog,
    generationLogs,
    clearConnectFeedback,
    setConnectFeedback,
  } = useLegacyCanvasStore();

  const surfaceGenerationFailure = useCallback(
    (
      nodeId: string,
      node: { id: string; kind: string; prompt: string },
      session: BeginOutputSession | null,
      logId: string,
      startedAt: number,
      rawError: string,
    ) => {
      const message = normalizeGenerationError(rawError) || "生成失败";
      const after = useLegacyCanvasStore.getState();
      const sourceNow = after.nodes.find((n) => n.id === nodeId);
      const outputNow = session
        ? after.nodes.find((n) => n.id === session.outputId)
        : undefined;

      if (session && outputNow && sourceNow) {
        const finished = finishGenerationOutput(
          sourceNow,
          outputNow,
          session.pending.id,
          { error: message },
          startedAt,
        );
        updateNode(finished.source.id, {
          images: finished.source.images,
          settings: finished.source.settings,
        });
        updateNode(finished.output.id, {
          images: finished.output.images,
          settings: finished.output.settings,
        });
      } else if (sourceNow) {
        updateNode(nodeId, {
          settings: {
            ...clearRunState(sourceNow.settings),
            lastError: message,
          },
        });
      }

      setNodeRunErrors((prev) => ({ ...prev, [nodeId]: message }));
      setConnectFeedback(message);
      if (genFeedbackTimerRef.current) {
        window.clearTimeout(genFeedbackTimerRef.current);
      }
      genFeedbackTimerRef.current = window.setTimeout(() => {
        clearConnectFeedback();
        genFeedbackTimerRef.current = null;
      }, 12_000);

      updateGenerationLog(logId, {
        platform: node.kind,
        nodeType: node.kind,
        prompt: node.prompt,
        error: message,
        outputs: [],
        runMs: Date.now() - startedAt,
      });
    },
    [clearConnectFeedback, setConnectFeedback, updateGenerationLog, updateNode],
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadLegacyCanvas(id)
      .then((doc) => {
        init({
          canvasId: doc.id,
          title: doc.title,
          nodes: doc.nodes,
          connections: doc.connections,
          viewport: doc.viewport,
          settings: doc.settings,
          updated_at: doc.updated_at,
        });
      })
      .catch((error) => {
        setPageError(
          normalizeGenerationError(
            error instanceof Error ? error.message : "画布加载失败",
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [id, init]);

  useEffect(() => {
    if (id) rememberCanvasId(id);
  }, [id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setPageError("");
    try {
      const s = useLegacyCanvasStore.getState();
      const doc = await saveLegacyCanvas(id, {
        title: s.title,
        nodes: s.nodes,
        connections: s.connections,
        viewport: s.viewport,
        settings: s.settings,
        base_updated_at: s.baseUpdatedAt,
      });
      markClean(doc.updated_at ?? 0);
    } catch (error) {
      setPageError(
        normalizeGenerationError(
          error instanceof Error ? error.message : "画布保存失败",
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [id, markClean]);

  useEffect(() => {
    if (!id || !dirty) return;
    const timer = setTimeout(handleSave, 3000);
    return () => clearTimeout(timer);
  }, [id, dirty, nodes, connections, viewport, settings, handleSave]);

  useEffect(() => {
    // Fork history/canvas.js: gate on activeElement (not only event.target).
    const isEditable = (target: EventTarget | null) => {
      const active = document.activeElement as HTMLElement | null;
      const el = (active && active !== document.body ? active : null) ??
        (target as HTMLElement | null);
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isEditable(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setShortcutsOpen(false);
        setPreview(null);
        setLogOpen(false);
        setAssetOpen(false);
        setKnifeMode(false);
        setLinkCreateMenu(null);
        if (zoomOverview) {
          setViewport(zoomOverview);
          setZoomOverview(null);
        }
        cancelConnect();
        return;
      }
      if (e.key.toLowerCase() === "z" && !isEditable(e.target) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (zoomOverview) {
          setViewport(zoomOverview);
          setZoomOverview(null);
        } else {
          setZoomOverview({ ...viewport });
          setViewport(fitViewportToNodes(nodes, size.w, size.h));
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        copySelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        pasteClipboard(lastMouseWorldRef.current.x, lastMouseWorldRef.current.y);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        groupSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        setSelectedIds(nodes.map((n) => n.id));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isEditable(e.target)) return;
        const ids = useLegacyCanvasStore.getState().selectedIds;
        if (!ids.length) return;
        e.preventDefault();
        removeNodes(ids);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    nodes,
    removeNodes,
    setSelectedIds,
    copySelection,
    pasteClipboard,
    undo,
    groupSelected,
    viewport,
    zoomOverview,
    setViewport,
    size.w,
    size.h,
    cancelConnect,
  ]);

  const handleRunNode = useCallback(
    async (nodeId: string, loopCtx?: RunLoopContext) => {
      const state = useLegacyCanvasStore.getState();
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const logPrompt = String(node.prompt ?? "").trim() ||
        (node.kind === "ltxDirector"
          ? readLtxTimeline(node).segments
              .map((segment) => String(segment.prompt ?? "").trim())
              .filter(Boolean)
              .join("\n")
          : "");
      const logNode = { ...node, prompt: logPrompt };
      const claimKey = loopCtx?.runId
        ? `${nodeId}:${loopCtx.runId}`
        : nodeId;
      // Soft re-entry: claim synchronously. A previous implementation assigned a
      // local `claimed` flag from inside setState; React runs that updater later,
      // so the handler returned before creating a log or calling the API while
      // still leaving the UI stuck in a running state.
      if (runningNodeIdsRef.current.has(claimKey)) return;
      if (!loopCtx?.runId && [...runningNodeIdsRef.current].some(
        (key) => key === nodeId || key.startsWith(`${nodeId}:`),
      )) return;
      runningNodeIdsRef.current.add(claimKey);
      setRunningNodeIds((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });

      const startedAt = Date.now();
      setNodeRunErrors((prev) => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
      updateNode(nodeId, {
        settings: stampRunStart(node.settings, startedAt),
      });

      // Media generators: ensure Output + pending before the API call (history path).
      const session = beginGenerationOutput(
        node,
        state.nodes,
        state.connections,
        node.prompt,
        startedAt,
      );
      if (session?.newOutput) {
        addNode(session.newOutput);
        if (session.newConnection) {
          addConnection(session.newConnection.from, session.newConnection.to);
        }
      } else if (session) {
        updateNode(session.outputId, {
          images: session.output.images,
          settings: session.output.settings,
        });
      }

      const logId = startGenerationLog({
        platform: node.kind,
        nodeType: node.kind,
        model: String(node.settings?.model ?? "-"),
        prompt: logPrompt,
        nodeId: node.id,
      });

      try {
        const live = useLegacyCanvasStore.getState();
        const result = await runCanvasNode(
          live.nodes.find((n) => n.id === nodeId) ?? node,
          live.nodes,
          live.connections,
          config,
          live.viewport,
          loopCtx,
        );

        if (node.kind === "llm") {
          const latest =
            useLegacyCanvasStore.getState().nodes.find((n) => n.id === nodeId) ??
            node;
          const applied = applyLlmResult(latest, result);
          updateNode(nodeId, {
            settings: applied.settings,
          });
          if (result.error) {
            const message = normalizeGenerationError(result.error);
            setNodeRunErrors((prev) => ({ ...prev, [nodeId]: message }));
            setConnectFeedback(message);
          }
          updateGenerationLog(logId, {
            platform: node.kind,
            nodeType: node.kind,
            prompt: logPrompt,
            error: result.error ? normalizeGenerationError(result.error) : "",
            outputs: result.outputText ? [result.outputText.slice(0, 120)] : [],
            runMs: Date.now() - startedAt,
          });
          return;
        }

        if (result.error) {
          surfaceGenerationFailure(
            nodeId,
            logNode,
            session,
            logId,
            startedAt,
            result.error,
          );
          return;
        }

        const after = useLegacyCanvasStore.getState();
        const sourceNow = after.nodes.find((n) => n.id === nodeId) ?? node;
        const outputNow = session
          ? after.nodes.find((n) => n.id === session!.outputId)
          : undefined;

        if (session && outputNow) {
          const finished = finishGenerationOutput(
            sourceNow,
            outputNow,
            session.pending.id,
            result,
            startedAt,
          );
          updateNode(finished.source.id, {
            images: finished.source.images,
            settings: finished.source.settings,
          });
          updateNode(finished.output.id, {
            images: finished.output.images,
            settings: finished.output.settings,
          });
        } else {
          updateNode(nodeId, {
            images: (result.urls ?? []).map((url) => ({
              url,
              kind: sourceNow.kind,
            })),
            settings: {
              ...clearRunState(sourceNow.settings),
              lastError: "",
              generatedOutputs: (result.urls ?? []).map((url) => ({
                url,
                kind: sourceNow.kind,
              })),
            },
          });
        }

        updateGenerationLog(logId, {
          platform: node.kind,
          nodeType: node.kind,
          prompt: logPrompt,
          outputs: result.urls ?? (result.url ? [result.url] : []),
          runMs: Date.now() - startedAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        surfaceGenerationFailure(
          nodeId,
          logNode,
          session,
          logId,
          startedAt,
          message,
        );
      } finally {
        runningNodeIdsRef.current.delete(claimKey);
        const stillRunning = [...runningNodeIdsRef.current].some(
          (key) => key === nodeId || key.startsWith(`${nodeId}:`),
        );
        if (!stillRunning) {
          setRunningNodeIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
        }
        const latest = useLegacyCanvasStore
          .getState()
          .nodes.find((n) => n.id === nodeId);
        if (!stillRunning && latest?.settings?.running) {
          updateNode(nodeId, {
            settings: clearRunState(latest.settings),
          });
        }
      }
    },
    [addNode, addConnection, config, updateNode, startGenerationLog, updateGenerationLog, surfaceGenerationFailure],
  );

  const handleRunCascade = useCallback(
    async (
      nodeId: string,
      rounds = 1,
      mode: "serial" | "parallel" = "serial",
    ) => {
      const state = useLegacyCanvasStore.getState();
      const order = computeCascadeOrder(nodeId, state.nodes, state.connections);
      const targets = order.length ? order : [nodeId];
      if (mode === "parallel") {
        const runRound = async (round: number) => {
          for (const id of targets) {
            await handleRunNode(id, {
              loopIndex: round,
              loopTotal: rounds,
              runId: `parallel-${round}-${id}-${crypto.randomUUID()}`,
            });
          }
        };
        await Promise.all(
          Array.from({ length: rounds }, (_, index) => runRound(index + 1)),
        );
        return;
      }
      for (let r = 1; r <= rounds; r++) {
        for (const id of targets) {
          await handleRunNode(id, { loopIndex: r, loopTotal: rounds });
        }
      }
    },
    [handleRunNode],
  );

  const handleExportWorkflow = useCallback(() => {
    const s = useLegacyCanvasStore.getState();
    void exportWorkflowZip(s.selectedIds, s.nodes, s.connections, s.title);
  }, []);

  const handleImportWorkflowFile = useCallback(
    async (file: File) => {
      try {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          const payload = await importWorkflowZipFile(file);
          if (payload) {
            importWorkflow(
              payload,
              lastMouseWorldRef.current.x,
              lastMouseWorldRef.current.y,
            );
          }
          return;
        }
        const text = await file.text();
        const payload = parseWorkflowPayload(JSON.parse(text));
        if (!payload) {
          setPageError("工作流文件缺少有效的节点数据");
          return;
        }
        importWorkflow(
          payload,
          lastMouseWorldRef.current.x,
          lastMouseWorldRef.current.y,
        );
      } catch (error) {
        setPageError(
          error instanceof Error ? error.message : "工作流文件无效或导入失败",
        );
      }
    },
    [importWorkflow],
  );

  const handleAssetSelect = useCallback(
    (url: string) => {
      const node = createImageNodeFromUrl(
        url,
        lastMouseWorldRef.current.x,
        lastMouseWorldRef.current.y,
      );
      addNode(node);
      setAssetOpen(false);
    },
    [addNode],
  );

  const panDrag = usePointerDrag({
    onMove: (_x, _y, dx, dy) => {
      if (boxDragRef.current) return;
      setViewport(panViewport(viewport, dx, dy));
    },
  });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setViewport(zoomViewport(viewport, e.deltaY > 0 ? -0.08 : 0.08));
      return;
    }
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px - viewport.x) / viewport.scale;
    const wy = (py - viewport.y) / viewport.scale;
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const nextScale = Math.min(3, Math.max(0.2, viewport.scale + delta));
    setViewport({
      scale: nextScale,
      x: px - wx * nextScale,
      y: py - wy * nextScale,
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
    setContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      worldX: world.x,
      worldY: world.y,
    });
  };

  const handlePortDragStart = useCallback(
    (fromId: string, worldX: number, worldY: number, originKind: "in" | "out" = "out") => {
      setTempWire({ fromId, x2: worldX, y2: worldY, originKind });
    },
    [],
  );

  useEffect(() => {
    if (!connectFromId) return;
    const onMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
      const snap = resolveConnectSnapTarget(
        e.clientX,
        e.clientY,
        connectFromId,
        connectOriginKind,
        nodes,
        connections,
      );
      setTempWire({
        fromId: connectFromId,
        x2: snap ? snap.worldX : world.x,
        y2: snap ? snap.worldY : world.y,
        originKind: connectOriginKind,
      });
    };
    const onUp = (e: PointerEvent) => {
      const originKind = connectOriginKind;
      const fromId = connectFromId;
      if (!fromId) {
        setTempWire(null);
        return;
      }
      const dropId = resolveConnectDropTarget(
        e.clientX,
        e.clientY,
        fromId,
        originKind,
        nodes,
        connections,
      );
      if (dropId) {
        useLegacyCanvasStore.getState().completeConnect(dropId);
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
        if (shouldAutoCreateOutputOnDrag(fromId, originKind, nodes)) {
          pushUndo();
          const out = addNodeAtKind("output", world.x, world.y - 63);
          addConnection(fromId, out.id);
          cancelConnect();
        } else if (originKind === "out" || originKind === "in") {
          const options = linkCreateOptions(
            { originId: fromId, originKind },
            nodes,
          );
          if (options.length) {
            setLinkCreateMenu({
              state: {
                originId: fromId,
                originKind,
                worldX: world.x,
                worldY: world.y,
              },
              screenX: e.clientX,
              screenY: e.clientY,
            });
          }
          cancelConnect();
        } else {
          cancelConnect();
        }
      } else {
        cancelConnect();
      }
      setTempWire(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    connectFromId,
    connectOriginKind,
    viewport,
    nodes,
    connections,
    cancelConnect,
    pushUndo,
    addNodeAtKind,
    addConnection,
  ]);

  const handleLinkCreatePick = useCallback(
    (kind: string) => {
      if (!linkCreateMenu) return;
      const { state } = linkCreateMenu;
      pushUndo();
      createLinkedNodeAt(
        kind,
        state.originId,
        state.originKind,
        state.worldX,
        state.worldY,
        nodes,
        connections,
        (k, wx, wy) => addNodeAtKind(k, wx, wy, config),
        (from, to) => addConnection(from, to),
      );
      setLinkCreateMenu(null);
    },
    [linkCreateMenu, pushUndo, nodes, connections, addNodeAtKind, addConnection, config],
  );

  const handleCreateFromMenu = (kind: LegacyNodeKind, x: number, y: number) => {
    addNodeAtKind(kind, x, y, config);
  };

  const handleFit = () => {
    setViewport(fitViewportToNodes(nodes, size.w, size.h));
  };

  const ingestFilesAt = useCallback(
    async (files: FileList | File[], clientX: number, clientY: number) => {
      if (!containerRef.current || !files.length) return;
      setUploading(true);
      try {
        const rect = containerRef.current.getBoundingClientRect();
        const world = screenToWorld(clientX, clientY, rect, viewport);
        const created = await uploadAndCreateLegacyNodes(
          files,
          world.x,
          world.y,
        );
        created.forEach((node) => addNode(node));
      } finally {
        setUploading(false);
      }
    },
    [addNode, viewport],
  );

  const handleNodeUpload = useCallback(
    async (nodeId: string, files: FileList) => {
      setUploading(true);
      try {
        const uploaded = await uploadCanvasMediaFiles(files);
        const first = uploaded[0];
        if (!first) return;
        updateNode(nodeId, {
          images: [
            { url: first.url, kind: first.kind || "image", name: first.name },
          ],
          title: first.name || t("image"),
        });
      } finally {
        setUploading(false);
      }
    },
    [updateNode, t],
  );

  const finishBoxSelect = useCallback(() => {
    const drag = boxDragRef.current;
    boxDragRef.current = null;
    setSelectionBox(null);
    if (!drag || !containerRef.current) return;
    const left = Math.min(drag.startX, drag.x);
    const top = Math.min(drag.startY, drag.y);
    const right = Math.max(drag.startX, drag.x);
    const bottom = Math.max(drag.startY, drag.y);
    if (right - left < 4 && bottom - top < 4) return;
    const rect = containerRef.current.getBoundingClientRect();
    const hits = nodes
      .filter((node) =>
        nodeIntersectsScreenRect(
          node,
          rect.left + left,
          rect.top + top,
          rect.left + right,
          rect.top + bottom,
          viewport,
        ),
      )
      .map((n) => n.id);
    setSelectedIds(hits);
  }, [nodes, viewport, setSelectedIds]);

  const onViewportPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Chrome overlays live inside the viewport; never pan / clear selection for them.
    // (QuickToolbar delete was a no-op: pointerdown cleared selectedIds before click.)
    if (
      target.closest(
        "[data-testid='quick-toolbar'], [data-testid='legacy-minimap'], [data-testid='legacy-asset-panel'], [data-testid='legacy-upload-status']",
      )
    ) {
      return;
    }
    if (target.closest("[data-testid^='legacy-node']")) {
      return;
    }
    if (
      knifeMode ||
      target.closest("[data-testid^='legacy-connection-hit']")
    ) {
      setContextMenu(null);
      return;
    }
    setContextMenu(null);
    if (e.ctrlKey || e.metaKey) {
      boxDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
      };
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSelectionBox({
        left: e.clientX - rect.left,
        top: e.clientY - rect.top,
        width: 0,
        height: 0,
      });
      return;
    }
    if (!connectFromId) selectNode(null);
    panDrag.handlers.onPointerDown(e);
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    if (boxDragRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      boxDragRef.current.x = e.clientX;
      boxDragRef.current.y = e.clientY;
      const left = Math.min(boxDragRef.current.startX, e.clientX) - rect.left;
      const top = Math.min(boxDragRef.current.startY, e.clientY) - rect.top;
      setSelectionBox({
        left,
        top,
        width: Math.abs(e.clientX - boxDragRef.current.startX),
        height: Math.abs(e.clientY - boxDragRef.current.startY),
      });
      return;
    }
    panDrag.handlers.onPointerMove(e);
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    if (boxDragRef.current) {
      finishBoxSelect();
      return;
    }
    panDrag.handlers.onPointerUp(e);
  };

  if (loading) {
    return (
      <div
        className="h-full flex items-center justify-center text-gray-500"
        data-testid="legacy-canvas-loading"
      >
        {t("loadingCanvases")}
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-[#f7f7f8]"
      data-testid="legacy-canvas-page"
    >
      {pageError ? (
        <div
          className="flex items-center justify-between gap-3 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700"
          role="alert"
          data-testid="legacy-canvas-error"
        >
          <span>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError("")}
            className="font-medium"
          >
            关闭
          </button>
        </div>
      ) : null}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <Link
          to="/canvases"
          className="p-2 rounded-lg hover:bg-gray-50 transition-colors"
          aria-label={t("backToList")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-medium flex-1 truncate">{title}</h1>
        {dirty ? (
          <span className="text-xs text-gray-400" data-testid="legacy-dirty-badge">
            未保存
          </span>
        ) : null}
        {selectedIds.length > 1 ? (
          <span className="text-xs text-gray-500" data-testid="legacy-multi-select-count">
            {t("multiSelect.count", { count: selectedIds.length })}
          </span>
        ) : null}
        {connectFromId ? (
          <button
            type="button"
            onClick={cancelConnect}
            className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg"
            data-testid="legacy-cancel-connect"
          >
            <X className="w-3 h-3" />
            取消连接
          </button>
        ) : null}
        {connectFeedback ? (
          <span
            className="text-xs text-red-600 max-w-[220px] truncate"
            data-testid="legacy-connect-feedback"
            title={connectFeedback}
            onClick={() => clearConnectFeedback()}
          >
            {connectFeedback}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setAssetOpen((v) => !v)}
          className={cn(
            "p-2 rounded-lg",
            assetOpen ? "bg-black text-white" : "hover:bg-gray-50",
          )}
          title={t("assetLibrary")}
          data-testid="legacy-asset-btn"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("generationLogs")}
          data-testid="legacy-log-btn"
        >
          <ScrollText className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setKnifeMode((v) => !v)}
          className={cn(
            "p-2 rounded-lg",
            knifeMode ? "bg-red-600 text-white" : "hover:bg-gray-50",
          )}
          title={t("knifeMode")}
          data-testid="legacy-knife-btn"
        >
          <Scissors className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleExportWorkflow}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("exportWorkflow")}
          data-testid="legacy-export-workflow-btn"
        >
          <GitBranch className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => workflowInputRef.current?.click()}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("importWorkflow")}
          data-testid="legacy-import-workflow-btn"
        >
          <Upload className="w-4 h-4" />
        </button>
        <input
          ref={workflowInputRef}
          type="file"
          accept="application/json,.json,.zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportWorkflowFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("shortcuts.title")}
          data-testid="legacy-shortcuts-btn"
        >
          <Keyboard className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={arrangeNodes}
          className="p-2 rounded-lg hover:bg-gray-50"
          title="排列节点"
          data-testid="legacy-arrange-btn"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFit}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("generatePanel.fitViewport")}
          data-testid="legacy-fit-btn"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => id && void exportCanvasJson(id, title)}
          className="p-2 rounded-lg hover:bg-gray-50"
          title={t("download")}
          data-testid="legacy-export-btn"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm",
            dirty
              ? "bg-black text-white hover:bg-gray-900"
              : "border border-gray-200 hover:border-black",
          )}
          data-testid="legacy-save-btn"
        >
          <Save className="w-4 h-4" />
          {saving ? "保存中" : "保存"}
        </button>
        <span className="text-xs text-gray-500">{t("legacyCanvas")}</span>
        <Link
          to="/canvases"
          className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg hover:border-black transition-colors"
          title={t("smartCanvasHint")}
          data-testid="legacy-open-smart-link"
        >
          <Sparkles className="w-3 h-3" />
          {t("openSmartCanvas")}
        </Link>
      </header>

      <p
        className="px-4 py-2 text-xs text-gray-600 border-b border-gray-100 bg-white"
        data-testid="legacy-canvas-hint"
      >
        {t("hint")}
      </p>

      <div className="flex-1 flex overflow-hidden">
        <section
          ref={containerRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
          data-testid="legacy-canvas-viewport"
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-testid^='legacy-node']")) {
              return;
            }
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
            setContextMenu({
              screenX: e.clientX,
              screenY: e.clientY,
              worldX: world.x,
              worldY: world.y,
            });
          }}
          onPointerMove={(e) => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              lastMouseWorldRef.current = screenToWorld(
                e.clientX,
                e.clientY,
                rect,
                viewport,
              );
            }
            onViewportPointerMove(e);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) {
              void ingestFilesAt(
                e.dataTransfer.files,
                e.clientX,
                e.clientY,
              );
            }
          }}
          onPointerDown={onViewportPointerDown}
          onPointerUp={onViewportPointerUp}
          style={{
            backgroundImage:
              "linear-gradient(rgba(100,116,139,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.1) 1px, transparent 1px)",
            backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
        >
          <div
            className="absolute origin-top-left"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            }}
          >
            <ConnectionLayer
              nodes={nodes}
              connections={connections}
              selectedIds={selectedIds}
              connectFromId={connectFromId}
              tempWire={tempWire}
              knifeMode={knifeMode}
              onDeleteConnection={(id) => {
                pushUndo();
                removeConnection(id);
              }}
            />
            {nodes.map((node) => (
              <LegacyNodeCard
                key={node.id}
                node={node}
                selected={selectedIds.includes(node.id)}
                selectedIds={selectedIds}
                viewport={viewport}
                containerRef={containerRef}
                running={runningNodeIds.has(node.id)}
                runError={nodeRunErrors[node.id]}
                onUpload={handleNodeUpload}
                onPortDragStart={handlePortDragStart}
                onOpenPromptTemplates={(id) => {
                  setPromptTemplateNodeId(id);
                  setPromptTemplateOpen(true);
                }}
                onRunNode={(nodeId) => void handleRunNode(nodeId)}
                onCascadeRun={(nodeId, rounds, mode) =>
                  void handleRunCascade(nodeId, rounds ?? 1, mode)
                }
                onPreviewImage={(id, url) => {
                  const target = nodes.find((n) => n.id === id);
                  setPreview({
                    url,
                    title: target?.title ?? node.title,
                    nodeId: id,
                    compareUrl:
                      target?.kind === "output"
                        ? outputCompareUrlFor(url, target) ?? undefined
                        : undefined,
                  });
                }}
              />
            ))}
          </div>
          <Minimap
            nodes={nodes}
            viewport={viewport}
            containerWidth={size.w}
            containerHeight={size.h}
          />
          {selectionBox ? (
            <div
              className="absolute border border-black/40 bg-black/5 pointer-events-none z-20"
              style={{
                left: selectionBox.left,
                top: selectionBox.top,
                width: selectionBox.width,
                height: selectionBox.height,
              }}
              data-testid="legacy-selection-box"
            />
          ) : null}
          {nodes.length === 0 && !uploading ? (
            <p className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none text-sm">
              {t("dropImage")}
            </p>
          ) : null}
          {uploading ? (
            <p
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black text-white text-xs rounded-lg"
              data-testid="legacy-upload-status"
            >
              上传中…
            </p>
          ) : null}
          <LegacyAssetPanel
            open={assetOpen}
            onClose={() => setAssetOpen(false)}
            onSelect={handleAssetSelect}
          />
          <QuickToolbar
            selectedCount={selectedIds.length}
            knifeMode={knifeMode}
            onGroup={() => groupSelected()}
            onArrangeSelected={() => arrangeSelected()}
            onCopy={() => copySelection()}
            onDelete={() => {
              const ids = useLegacyCanvasStore.getState().selectedIds;
              if (ids.length) removeNodes(ids);
            }}
            onToggleKnife={() => setKnifeMode((v) => !v)}
            onFit={handleFit}
          />
        </section>

      </div>

      {contextMenu ? (
        <ContextMenu
          open
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          worldX={contextMenu.worldX}
          worldY={contextMenu.worldY}
          onClose={() => setContextMenu(null)}
          onCreate={handleCreateFromMenu}
        />
      ) : null}
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <ImageEditModal
        open={Boolean(preview)}
        url={preview?.url ?? ""}
        compareUrl={preview?.compareUrl}
        title={preview?.title}
        nodeId={preview?.nodeId}
        onClose={() => setPreview(null)}
        onImageUpdated={(nodeId, url, name) => {
          updateNode(nodeId, {
            images: [{ url, kind: "image", name }],
            title: name || preview?.title || t("image"),
          });
        }}
        onMaskCreated={(sourceNodeId, maskUrl) => {
          const source = nodes.find((n) => n.id === sourceNodeId);
          if (!source) return;
          addNode(
            createImageNodeFromUrl(
              maskUrl,
              source.x + 40,
              source.y + 40,
              `${source.title}_mask`,
            ),
          );
        }}
      />
      <GenerationLogPanel
        open={logOpen}
        logs={generationLogs}
        onClose={() => setLogOpen(false)}
      />
      {linkCreateMenu ? (
        <LinkCreateMenu
          screenX={linkCreateMenu.screenX}
          screenY={linkCreateMenu.screenY}
          options={linkCreateOptions(linkCreateMenu.state, nodes)}
          onPick={handleLinkCreatePick}
          onClose={() => setLinkCreateMenu(null)}
        />
      ) : null}
      <LegacyPromptTemplateModal
        open={promptTemplateOpen}
        onClose={() => {
          setPromptTemplateOpen(false);
          setPromptTemplateNodeId(null);
        }}
        onApply={(content) => {
          if (promptTemplateNodeId) {
            const target = nodes.find((n) => n.id === promptTemplateNodeId);
            updateNode(promptTemplateNodeId, {
              prompt: content,
              title: target?.title || t("prompt"),
            });
          }
        }}
      />
    </div>
  );
}
