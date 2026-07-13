import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useSmartCanvasStore } from "./core/state";
import { conflictCanvasUpdatedAt } from "../../shared/api/canvasConflict";
import { loadCanvas, saveCanvas } from "./core/persistence";
import { CanvasWorld } from "./components/CanvasWorld";
import { ConnectionLayer } from "./components/ConnectionLayer";
import { NodeCard } from "./components/NodeCard";
import { Composer } from "./components/Composer";
import { Minimap } from "./components/Minimap";
import { AssetPanel } from "./components/AssetPanel";
import { PromptLibraryPanel } from "./components/PromptLibraryPanel";
import { WorkflowPicker } from "./components/WorkflowPicker";
import { SmartCanvasToolbar } from "./components/SmartCanvasToolbar";
import { useWebSocket } from "./hooks/useWebSocket";
import { buildCascadeOrder, canRunCascade, edgeStateForStep, type CascadeEdgeState } from "./core/cascade";
import {
  collectSmartNodeInputs,
  pollUntilDone,
  smartNodeComposer,
  submitGeneration,
} from "./core/generation";
import {
  isSmartRunnableTarget,
  planApplyImageResult,
} from "./core/applyRunResult";
import {
  clearJimengPending,
  fetchJimengQuery,
  interpretJimengQuery,
  jimengQueueText,
  readJimengPending,
  resumeAllJimengPolls,
  startJimengPoll,
  withJimengPending,
} from "./core/jimeng";
import { resolveCtrlDragAutoSnap } from "./core/autoConnect";
import { exportWorkflowZip, importWorkflowFile } from "./core/workflows";
import { loadCanvasMeta } from "./core/meta";
import { computeNodeBounds, fitViewportToBounds, getGroupMembers, panViewport, screenToWorld, SMART_UI_BLOCKER, zoomViewportAt } from "./core/layout";
import { LogModal } from "./components/LogModal";
import { ShortcutModal } from "./components/ShortcutModal";
import { WorkflowTransferModal } from "./components/WorkflowTransferModal";
import { CreateMenu, createNodeByKind, type CreateKind } from "./components/CreateMenu";
import { ImageEditModal } from "./components/ImageEditModal";
import { SelectionBox } from "./components/SelectionBox";
import { GroupToolbar } from "./components/GroupToolbar";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { SmartToast } from "./components/SmartToast";
import { exportSmartCanvasGroup } from "./core/advanced";
import { uploadCanvasMediaFiles } from "../canvas/core/uploadMedia";
import { usePointerDrag } from "../../shared/hooks/usePointerDrag";
import { MAX_SCALE, MIN_SCALE } from "./core/types";

export function SmartCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOriginsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const boxDragRef = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const didPanRef = useRef(false);
  const emptyPointerActiveRef = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [createMenu, setCreateMenu] = useState<{
    x: number;
    y: number;
    worldX?: number;
    worldY?: number;
  } | null>(null);
  const [imageEdit, setImageEdit] = useState<{ nodeId: string; index: number } | null>(null);
  const [groupPreview, setGroupPreview] = useState<string[]>([]);
  const [cascadeEdges, setCascadeEdges] = useState<Record<string, CascadeEdgeState>>({});
  const [selection, setSelection] = useState<{
    active: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState("");

  const store = useSmartCanvasStore();
  const {
    init,
    title,
    nodes,
    connections,
    viewport,
    selectedNodeId,
    dirty,
    setViewport,
    addNode,
    moveNode,
    selectNode,
    updateNode,
    setComposer,
    undo,
    redo,
    addLog,
    commitHistory,
    markClean,
    connectNodes,
    removeConnection,
    arrangeNodes,
    copySelectedNodes,
    pasteNodes,
    removeNodes,
    toggleSelectNode,
    selectedIds,
    setSelectedIds,
    clearSelection,
    layoutGroup,
    toggleGroupCollapse,
    ungroupGroup,
    appendWorkflow,
  } = store;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadCanvas(id)
      .then(async (doc) => {
        init({
          canvasId: doc.id,
          title: doc.title,
          icon: doc.icon,
          nodes: doc.nodes as typeof nodes,
          connections: doc.connections,
          viewport: doc.viewport,
          logs: doc.logs,
          settings: doc.settings,
          updated_at: doc.updated_at,
        });
        try {
          const meta = await loadCanvasMeta(id);
          if (meta?.title) {
            useSmartCanvasStore.setState({ title: meta.title, dirty: false });
          }
        } catch {
          /* meta optional */
        }
      })
      .catch((error) => {
        setPageError(error instanceof Error ? error.message : "画布加载失败");
      })
      .finally(() => setLoading(false));
  }, [id, init]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useWebSocket(id ?? "", {
    onNewImage: (url, nodeId) => {
      if (nodeId) {
        const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === nodeId);
        if (node) {
          updateNode(nodeId, {
            images: [...(node.images ?? []), { url, kind: "image" }],
            status: "done",
          });
        }
      } else {
        addNode({
          kind: "image",
          x: 200,
          y: 200,
          title: "远程结果",
          images: [{ url, kind: "image" }],
        });
      }
    },
    onCanvasUpdated: async (updatedAt) => {
      if (!id) return;
      const s = useSmartCanvasStore.getState();
      if (updatedAt <= s.baseUpdatedAt) return;
      try {
        const doc = await loadCanvas(id);
        useSmartCanvasStore.getState().mergeRemoteCanvas({
          nodes: doc.nodes as typeof nodes,
          connections: doc.connections,
          updatedAt: doc.updated_at ?? updatedAt,
        });
      } catch {
        /* ignore */
      }
    },
    onAssetLibraryUpdated: () => setAssetRefreshKey((k) => k + 1),
  });

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const handleSave = useCallback(async (_opts?: { silent?: boolean }) => {
    if (!id) return;
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    savingRef.current = true;
    saveAgainRef.current = false;
    setPageError("");
    let retryDelayMs = 0;
    try {
      const s = useSmartCanvasStore.getState();
      const doc = await saveCanvas(id, {
        title: s.title,
        icon: s.icon,
        nodes: s.nodes,
        connections: s.connections,
        viewport: s.viewport,
        logs: s.logs,
        settings: s.settings,
        base_updated_at: s.baseUpdatedAt,
      });
      if (saveAgainRef.current) {
        useSmartCanvasStore.setState({ baseUpdatedAt: doc.updated_at ?? 0 });
      } else {
        markClean(doc.updated_at ?? 0);
      }
    } catch (error) {
      const conflictAt = conflictCanvasUpdatedAt(error);
      if (conflictAt != null) {
        useSmartCanvasStore.setState({ baseUpdatedAt: conflictAt });
        saveAgainRef.current = true;
      } else {
        const message = error instanceof Error ? error.message : "画布保存失败";
        setPageError(message);
        showToast(message);
        if (useSmartCanvasStore.getState().dirty) {
          saveAgainRef.current = true;
          retryDelayMs = 5000;
        }
      }
    } finally {
      savingRef.current = false;
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        window.setTimeout(() => {
          void handleSave({ silent: true });
        }, retryDelayMs);
      }
    }
  }, [id, markClean, showToast]);

  useEffect(() => {
    if (!id || !dirty) return;
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void handleSave({ silent: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [id, dirty, nodes, connections, viewport, handleSave]);

  const handleUploadToNode = useCallback(
    async (nodeId: string, files?: FileList | null) => {
      try {
        let list = files;
        if (!list?.length) {
          list = await new Promise<FileList | null>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*,video/*,audio/*";
            input.multiple = true;
            input.onchange = () => resolve(input.files);
            input.click();
          });
        }
        if (!list?.length) return;
        const uploaded = await uploadCanvasMediaFiles(list);
        if (!uploaded.length) {
          setPageError("上传失败：没有返回文件");
          return;
        }
        const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === nodeId);
        updateNode(nodeId, {
          images: [
            ...(node?.images ?? []),
            ...uploaded.map((f) => ({
              url: f.url,
              kind: f.kind || "image",
              name: f.name,
            })),
          ],
          title: uploaded.length > 1 ? "Group" : uploaded[0]?.name || "Image",
        });
        selectNode(nodeId);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "上传失败");
      }
    },
    [selectNode, updateNode],
  );

  const handleCreateNode = useCallback(
    (kind: CreateKind, worldX?: number, worldY?: number) => {
      const hasWorldPosition = Number.isFinite(worldX) && Number.isFinite(worldY);
      const x = hasWorldPosition
        ? Number(worldX)
        : 150 + nodes.length * 24;
      const y = hasWorldPosition
        ? Number(worldY)
        : 150;
      const built = createNodeByKind(kind, x, y);
      const node = addNode({
        kind: built.kind,
        x: built.x,
        y: built.y,
        title: kind === "image" ? "导入节点" : built.title,
        prompt: built.prompt,
        width: built.width,
        height: built.height,
        settings: built.settings,
        member_ids:
          kind === "group" && selectedIds.length
            ? [...selectedIds]
            : built.member_ids,
      });
      if (kind === "group" && selectedIds.length) {
        selectedIds.forEach((id) => updateNode(id, { group_id: node.id }));
        layoutGroup(node.id);
      }
      selectNode(node.id);
    },
    [addNode, layoutGroup, nodes.length, selectNode, selectedIds, updateNode],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAssetOpen(false);
        setLogOpen(false);
        setShortcutOpen(false);
        setTransferOpen(false);
        setTemplateOpen(false);
        setWorkflowOpen(false);
        setCreateMenu(null);
        setConnectMode(false);
        setConnectFrom(null);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        void handleSave({ silent: true });
      } else if (mod && key === "g" && e.shiftKey) {
        const selected = useSmartCanvasStore.getState().selectedNodeId;
        const group = useSmartCanvasStore.getState().nodes.find(
          (node) => node.id === selected && node.kind === "group",
        );
        if (group) {
          e.preventDefault();
          ungroupGroup(group.id);
        }
      } else if (mod && key === "g") {
        const selected = useSmartCanvasStore.getState().selectedIds;
        if (selected.length) {
          e.preventDefault();
          handleCreateNode("group");
        }
      } else if (!mod && key === "g") {
        e.preventDefault();
        setConnectMode((value) => !value);
        setConnectFrom(null);
      } else if (!mod && key === "a") {
        e.preventDefault();
        setLogOpen(false);
        setShortcutOpen(false);
        setTransferOpen(false);
        setAssetOpen((value) => !value);
      } else if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && key === "c") {
        e.preventDefault();
        const current = useSmartCanvasStore.getState();
        const ids = current.selectedIds.length
          ? current.selectedIds
          : current.selectedNodeId
            ? [current.selectedNodeId]
            : [];
        if (ids.length) {
          copySelectedNodes();
          showToast("已复制到剪贴板");
        }
      } else if (mod && key === "v") {
        e.preventDefault();
        const before = useSmartCanvasStore.getState().clipboard.length;
        pasteNodes();
        if (before) showToast("已粘贴");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const current = useSmartCanvasStore.getState();
        const ids = current.selectedIds.length
          ? current.selectedIds
          : current.selectedNodeId
            ? [current.selectedNodeId]
            : [];
        if (ids.length) {
          e.preventDefault();
          removeNodes(ids);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copySelectedNodes,
    handleCreateNode,
    handleSave,
    pasteNodes,
    redo,
    removeNodes,
    showToast,
    undo,
    ungroupGroup,
  ]);

  const handlePan = (dx: number, dy: number) => {
    const vp = useSmartCanvasStore.getState().viewport;
    setViewport(panViewport(vp, dx, dy));
  };

  const handleWheelZoom = (screenX: number, screenY: number, deltaY: number) => {
    const vp = useSmartCanvasStore.getState().viewport;
    setViewport(zoomViewportAt(vp, screenX, screenY, deltaY, MIN_SCALE, MAX_SCALE));
  };

  const handleArrange = useCallback(() => {
    arrangeNodes();
    requestAnimationFrame(() => {
      const bounds = computeNodeBounds(useSmartCanvasStore.getState().nodes);
      const rect = containerRef.current?.getBoundingClientRect();
      if (bounds && rect) setViewport(fitViewportToBounds(bounds, rect.width, rect.height));
    });
  }, [arrangeNodes, setViewport]);

  const panDrag = usePointerDrag({
    onMove: (_x, _y, dx, dy) => {
      if (boxDragRef.current) return;
      if (Math.abs(dx) + Math.abs(dy) > 0) didPanRef.current = true;
      handlePan(dx, dy);
    },
  });

  const finishBoxSelect = useCallback(() => {
    const box = boxDragRef.current;
    boxDragRef.current = null;
    setSelection(null);
    if (!box || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const left = Math.min(box.startX, box.x) - rect.left;
    const top = Math.min(box.startY, box.y) - rect.top;
    const right = Math.max(box.startX, box.x) - rect.left;
    const bottom = Math.max(box.startY, box.y) - rect.top;
    if (right - left < 4 && bottom - top < 4) return;
    const vp = useSmartCanvasStore.getState().viewport;
    const liveNodes = useSmartCanvasStore.getState().nodes;
    const hits = liveNodes.filter((n) => {
      const nx = n.x * vp.scale + vp.x;
      const ny = n.y * vp.scale + vp.y;
      const nw = (n.width ?? 280) * vp.scale;
      const nh = (n.height ?? 200) * vp.scale;
      return nx < right && nx + nw > left && ny < bottom && ny + nh > top;
    });
    setSelectedIds(hits.map((n) => n.id));
    if (hits.length === 1) selectNode(hits[0].id);
  }, [selectNode, setSelectedIds]);

  const onViewportPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(SMART_UI_BLOCKER)) return;
    if (target.closest("[data-testid='asset-panel'],[data-testid='prompt-library'],[data-testid='image-edit-modal'],[data-testid='minimap']")) {
      return;
    }
    setCreateMenu(null);
    emptyPointerActiveRef.current = true;
    // History: Ctrl/⌘+drag empty = rubber-band select (not pan)
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      didPanRef.current = false;
      boxDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
      };
      setSelection({
        active: true,
        x: e.clientX,
        y: e.clientY,
        w: 0,
        h: 0,
      });
      return;
    }
    // Left or middle button on empty = pan
    if (e.button !== 0 && e.button !== 1) return;
    didPanRef.current = false;
    panDrag.handlers.onPointerDown(e);
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    if (boxDragRef.current) {
      boxDragRef.current.x = e.clientX;
      boxDragRef.current.y = e.clientY;
      setSelection({
        active: true,
        x: boxDragRef.current.startX,
        y: boxDragRef.current.startY,
        w: e.clientX - boxDragRef.current.startX,
        h: e.clientY - boxDragRef.current.startY,
      });
      return;
    }
    panDrag.handlers.onPointerMove(e);
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    if (boxDragRef.current) {
      finishBoxSelect();
      emptyPointerActiveRef.current = false;
      return;
    }
    const wasEmpty = emptyPointerActiveRef.current;
    const wasPanning = didPanRef.current;
    panDrag.handlers.onPointerUp(e);
    emptyPointerActiveRef.current = false;
    // History shell.onclick: clear selection only when clicking empty without pan
    if (wasEmpty && !wasPanning && e.button === 0) {
      clearSelection();
    }
    didPanRef.current = false;
  };

  const handleGenerate = (result: {
    url?: string;
    urls?: string[];
    text?: string;
    error?: string;
    jimengPending?: boolean;
    submitId?: string;
    queueInfo?: Record<string, unknown>;
    jimengKind?: string;
    jimengMessage?: string;
  }) => {
    const live = useSmartCanvasStore.getState();
    if (result.error && !result.jimengPending) {
      setPageError(result.error);
      const targetId = live.activeComposerNodeId ?? live.selectedNodeId;
      if (targetId) updateNode(targetId, { status: "error" });
      addLog({
        id: crypto.randomUUID(),
        ts: Date.now(),
        prompt: live.composer.prompt,
        kind: live.composer.kind,
        engine: live.composer.engine,
        status: "failed",
        error: result.error,
      });
      return;
    }

    if (result.jimengPending && result.submitId) {
      const candidateId = live.activeComposerNodeId ?? live.selectedNodeId;
      let target = live.nodes.find((n) => n.id === candidateId);
      if (!target || !isSmartRunnableTarget(target)) {
        target = addNode({
          kind: live.composer.kind === "video" ? "video" : "image",
          x: 300,
          y: 200,
          title: "即梦排队",
          prompt: live.composer.prompt,
          status: "running",
        });
      }
      const patch = withJimengPending(target, {
        submitId: result.submitId,
        kind: result.jimengKind || live.composer.kind,
        queueInfo: result.queueInfo,
        message: result.jimengMessage,
      });
      updateNode(target.id, patch);
      selectNode(target.id);
      setPageError(result.jimengMessage || jimengQueueText(result.queueInfo));
      attachJimengPoll(target.id, result.submitId);
      addLog({
        id: crypto.randomUUID(),
        ts: Date.now(),
        prompt: live.composer.prompt,
        kind: live.composer.kind,
        engine: live.composer.engine,
        status: "failed",
        error: "即梦排队中（可手动查询）",
      });
      return;
    }

    const urls = result.urls?.length ? result.urls : result.url ? [result.url] : [];
    if (result.text) {
      const promptTarget = live.nodes.find(
        (n) => n.id === (live.activeComposerNodeId ?? live.selectedNodeId) && n.kind === "prompt",
      );
      if (promptTarget) {
        updateNode(promptTarget.id, {
          prompt: result.text,
          settings: { ...promptTarget.settings, outputText: result.text },
          status: "done",
        });
        selectNode(promptTarget.id);
      } else {
        const node = addNode({
          kind: "text",
          x: 300,
          y: 200,
          title: "文本结果",
          prompt: result.text,
          status: "done",
        });
        selectNode(node.id);
      }
      addLog({
        id: crypto.randomUUID(),
        ts: Date.now(),
        prompt: live.composer.prompt,
        kind: "text",
        engine: live.composer.engine,
        status: "success",
      });
      return;
    }
    if (!urls.length) {
      setPageError("生成完成但没有返回结果");
      return;
    }

    const candidateId = live.activeComposerNodeId ?? live.selectedNodeId;
    const candidate = live.nodes.find((n) => n.id === candidateId) ?? null;
    const source = isSmartRunnableTarget(candidate) ? candidate : null;
    const plan = planApplyImageResult(source, urls, live.composer);

    if (plan.mode === "update" && plan.sourceId && plan.targetPatch) {
      const existing = live.nodes.find((n) => n.id === plan.sourceId);
      updateNode(plan.sourceId, {
        ...plan.targetPatch,
        ...(existing ? clearJimengPending(existing) : {}),
      });
      selectNode(plan.sourceId);
    } else if (plan.createPartial) {
      const node = addNode(plan.createPartial);
      if (plan.connectFrom) {
        connectNodes(plan.connectFrom, node.id);
      }
      selectNode(node.id);
    }

    addLog({
      id: crypto.randomUUID(),
      ts: Date.now(),
      prompt: live.composer.prompt,
      kind: live.composer.kind,
      url: urls[0],
      engine: live.composer.engine,
      status: "success",
    });
  };

  const attachJimengPoll = useCallback(
    (nodeId: string, submitId: string) => {
      startJimengPoll(nodeId, submitId, {
        getNode: (id) => useSmartCanvasStore.getState().nodes.find((n) => n.id === id),
        onUpdate: (id, patch) => updateNode(id, patch),
        onDone: (id, urls, kind) => {
          const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === id);
          if (!node) return;
          updateNode(id, {
            images: urls.map((url) => ({ url, kind })),
            title: urls.length > 1 ? "Group" : "Image",
            status: "done",
            ...clearJimengPending(node),
          });
          setPageError("");
        },
        onFail: (id, error) => {
          const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === id);
          if (node) updateNode(id, { status: "error", ...clearJimengPending(node) });
          setPageError(error);
        },
      });
    },
    [updateNode],
  );

  const handleJimengQuery = useCallback(
    async (nodeId: string) => {
      const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === nodeId);
      const pending = readJimengPending(node);
      if (!node || !pending?.submitId || pending.querying) return;
      updateNode(nodeId, {
        settings: {
          ...node.settings,
          jimengPending: { ...pending, querying: true },
        },
      });
      try {
        const data = await fetchJimengQuery(pending.submitId, pending.kind || "image");
        const outcome = interpretJimengQuery(data, pending.kind || "image");
        if (outcome.done && "failed" in outcome && outcome.failed) {
          updateNode(nodeId, { status: "error", ...clearJimengPending(node) });
          setPageError(outcome.error);
          return;
        }
        if (outcome.done && "urls" in outcome) {
          updateNode(nodeId, {
            images: outcome.urls.map((url) => ({ url, kind: outcome.kind })),
            title: outcome.urls.length > 1 ? "Group" : "Image",
            status: "done",
            ...clearJimengPending(node),
          });
          setPageError("");
          return;
        }
        updateNode(nodeId, {
          settings: {
            ...node.settings,
            jimengPending: {
              ...pending,
              querying: false,
              queueInfo: outcome.queueInfo || pending.queueInfo,
              message: outcome.message || pending.message,
              updatedAt: Date.now(),
            },
          },
        });
        setPageError(outcome.message || jimengQueueText(outcome.queueInfo));
      } catch (error) {
        updateNode(nodeId, {
          settings: {
            ...node.settings,
            jimengPending: { ...pending, querying: false },
          },
        });
        setPageError(error instanceof Error ? error.message : "查询失败");
      }
    },
    [updateNode],
  );

  // Resume Jimeng polls after canvas load
  useEffect(() => {
    if (loading) return;
    resumeAllJimengPolls(useSmartCanvasStore.getState().nodes, {
      getNode: (id) => useSmartCanvasStore.getState().nodes.find((n) => n.id === id),
      onUpdate: (id, patch) => updateNode(id, patch),
      onDone: (id, urls, kind) => {
        const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === id);
        if (!node) return;
        updateNode(id, {
          images: urls.map((url) => ({ url, kind })),
          title: urls.length > 1 ? "Group" : "Image",
          status: "done",
          ...clearJimengPending(node),
        });
      },
      onFail: (id, error) => {
        const node = useSmartCanvasStore.getState().nodes.find((n) => n.id === id);
        if (node) updateNode(id, { status: "error", ...clearJimengPending(node) });
        setPageError(error);
      },
    });
  }, [loading, updateNode]);

  const handleBeforeGenerate = () => {
    setPageError("");
    const live = useSmartCanvasStore.getState();
    const targetId = live.activeComposerNodeId ?? live.selectedNodeId;
    const target = live.nodes.find((n) => n.id === targetId);
    if (!isSmartRunnableTarget(target)) {
      // History requires a subject card; auto-create empty import node for beginners.
      const created = addNode({
        kind: live.composer.kind === "video" ? "video" : "image",
        x: 150 + live.nodes.length * 24,
        y: 150,
        title: "导入节点",
        status: "running",
        settings: {
          engine: live.composer.engine,
          kind: live.composer.kind,
          params: live.composer.params,
        },
        prompt: live.composer.prompt,
      });
      selectNode(created.id);
      return;
    }
    const hasMedia =
      target!.kind === "group" ||
      (target!.images ?? []).some((img) => Boolean(img.url));
    // Branch runs keep the source visual; only empty cards show running state in-place.
    if (!hasMedia) {
      updateNode(target!.id, { status: "running" });
    }
  };

  const handleCascade = async () => {
    const s = useSmartCanvasStore.getState();
    const steps = buildCascadeOrder(s.nodes, s.connections, selectedNodeId ?? undefined);
    if (!steps.length) {
      setPageError("没有可运行的节点；请检查节点连线是否形成了循环");
      return;
    }
    const completed = new Set<string>();
    const running = new Set<string>();
    const errors = new Set<string>();
    setCascadeEdges({});
    while (true) {
      const step = canRunCascade(steps, completed, errors);
      if (!step) break;
      const node = s.nodes.find((n) => n.id === step.nodeId);
      if (!node) {
        completed.add(step.nodeId);
        continue;
      }
      if (["prompt", "export"].includes(node.kind)) {
        completed.add(step.nodeId);
        setCascadeEdges((prev) => ({
          ...prev,
          ...edgeStateForStep(step, completed, running, errors),
        }));
        continue;
      }
      running.add(step.nodeId);
      setCascadeEdges((prev) => ({
        ...prev,
        ...edgeStateForStep(step, completed, running, errors),
      }));
      updateNode(node.id, { status: "running" });
      const live = useSmartCanvasStore.getState();
      const inputs = collectSmartNodeInputs(node.id, live.nodes, live.connections);
      const nodeComposer = smartNodeComposer(node, live.composer);
      const prompt = node.prompt || inputs.prompt || nodeComposer.prompt;
      const request = { ...nodeComposer, prompt };
      setComposer(request);
      const rounds = node.kind === "loop"
        ? Math.max(1, Math.min(20, Number(node.settings?.count ?? 1)))
        : 1;
      const resultUrls: string[] = [];
      let resultText = "";
      let resultError = "";
      for (let round = 0; round < rounds; round += 1) {
        let result = await submitGeneration(request, inputs.refs);
        if (result.pending && result.taskId) {
          result = await pollUntilDone(result.taskId, 30, 1000, result.taskType);
        }
        const urls = result.urls?.length ? result.urls : result.url ? [result.url] : [];
        if (!urls.length && !result.text) {
          resultError = result.error || "级联节点没有返回结果";
          break;
        }
        resultUrls.push(...urls);
        resultText = result.text || resultText;
      }
      running.delete(step.nodeId);
      if ((resultUrls.length || resultText) && !resultError) {
        updateNode(node.id, {
          ...(resultUrls.length
            ? { images: resultUrls.map((url) => ({ url, kind: request.kind })) }
            : { prompt: resultText, settings: { ...node.settings, outputText: resultText } }),
          status: "done",
        });
        addLog({
          id: crypto.randomUUID(),
          ts: Date.now(),
          prompt,
          kind: request.kind,
          url: resultUrls[0],
          engine: request.engine,
          status: "success",
        });
        completed.add(step.nodeId);
      } else {
        updateNode(node.id, {
          ...(resultUrls.length
            ? { images: resultUrls.map((url) => ({ url, kind: request.kind })) }
            : {}),
          status: "error",
        });
        addLog({
          id: crypto.randomUUID(),
          ts: Date.now(),
          prompt,
          kind: request.kind,
          engine: request.engine,
          status: "failed",
        error: resultError || "级联节点没有返回结果",
      });
        setPageError(resultError || "级联节点没有返回结果");
        errors.add(step.nodeId);
        completed.add(step.nodeId);
      }
      setCascadeEdges((prev) => ({
        ...prev,
        ...edgeStateForStep(step, completed, running, errors),
      }));
    }
    commitHistory();
    setTimeout(() => setCascadeEdges({}), 2000);
  };

  const handleExport = async () => {
    if (nodes.length) {
      try {
        const blob = await exportWorkflowZip({
          name: title,
          filename: `${title || "canvas"}.zip`,
          nodes,
          connections,
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${title || "canvas"}.zip`;
        a.click();
        return;
      } catch {
        /* fallback to json */
      }
    }
    const data = { title, nodes, connections, viewport };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title || "canvas"}.json`;
    a.click();
  };

  const handleConnect = useCallback(
    (nodeId: string) => {
      if (!connectFrom) {
        setConnectFrom(nodeId);
        selectNode(nodeId);
        return;
      }
      const connected = connectNodes(connectFrom, nodeId);
      if (!connected) {
        setPageError("这两个节点类型不兼容，无法建立连线");
      }
      setConnectFrom(null);
    },
    [connectFrom, connectNodes, selectNode],
  );

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.name.endsWith(".zip")) {
        try {
          const data = await importWorkflowFile(file);
          if (Array.isArray(data.nodes)) {
            const live = useSmartCanvasStore.getState().viewport;
            appendWorkflow(data.nodes, data.connections ?? [], {
              x: (size.w / 2 - live.x) / live.scale,
              y: (size.h / 2 - live.y) / live.scale,
            });
            return;
            init({
              canvasId: id!,
              title: data.name ?? title,
              icon: "🧩",
              nodes: data.nodes,
              connections: data.connections ?? [],
              viewport,
            });
            commitHistory();
            useSmartCanvasStore.setState({ dirty: true });
          }
        } catch (error) {
          setPageError(error instanceof Error ? error.message : "工作流导入失败");
        }
        return;
      }
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data.nodes)) {
          const live = useSmartCanvasStore.getState().viewport;
          appendWorkflow(data.nodes, data.connections ?? [], {
            x: (size.w / 2 - live.x) / live.scale,
            y: (size.h / 2 - live.y) / live.scale,
          });
          return;
          init({
            canvasId: id!,
            title: data.title ?? title,
            icon: "🧩",
            nodes: data.nodes,
            connections: data.connections ?? [],
            viewport: data.viewport ?? viewport,
          });
          commitHistory();
          useSmartCanvasStore.setState({ dirty: true });
        }
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "画布 JSON 导入失败");
      }
    };
    input.click();
  };

  const selectedGroup = selectedNodeId
    ? nodes.find((node) => node.id === selectedNodeId && node.kind === "group")
    : undefined;
  const selectedGroupMembers = selectedGroup
    ? getGroupMembers(selectedGroup, nodes)
    : [];
  const selectedGroupPreviewUrls = selectedGroupMembers.flatMap((member) =>
    (member.images ?? []).map((image) => image.url).filter(Boolean),
  );

  const handleDeleteSelected = useCallback(() => {
    const current = useSmartCanvasStore.getState();
    const ids = current.selectedIds.length
      ? current.selectedIds
      : current.selectedNodeId
        ? [current.selectedNodeId]
        : [];
    if (ids.length) removeNodes(ids);
  }, [removeNodes]);

  const selectionToolbarAnchor = (() => {
    // Bulk chrome only for multi-select (≥2). Single node → header trash only.
    if (selectedIds.length < 2) return null;
    const selected = nodes.filter((n) => selectedIds.includes(n.id));
    if (selected.length < 2) return null;
    const minX = Math.min(...selected.map((n) => n.x));
    const minY = Math.min(...selected.map((n) => n.y));
    return { x: minX, y: minY, count: selected.length };
  })();

  const handleGroupExport = async () => {
    if (!selectedGroup) return;
    try {
      await exportSmartCanvasGroup({
        group_name: selectedGroup.title || "group",
        items: selectedGroupMembers.flatMap((member) => {
          const media = (member.images ?? []).map((image) => ({
            kind: image.kind || member.kind,
            url: image.url,
            name: image.name,
          }));
          return member.prompt
            ? [
                ...media,
                {
                  kind: "text",
                  url: "",
                  text: member.prompt,
                  name: member.title,
                },
              ]
            : media;
        }),
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "分组导出失败");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="smart-canvas-loading">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[var(--stage-bg)]" data-testid="smart-canvas-page">
      {pageError ? (
        <div className="absolute left-0 right-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert" data-testid="smart-canvas-error">
          <span>{pageError}</span>
          <button type="button" onClick={() => setPageError("")} className="font-medium">关闭</button>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden touch-none"
        data-testid="smart-canvas-viewport"
        onContextMenu={(e) => {
          // History: no create menu on nodes / chrome
          const target = e.target as HTMLElement;
          if (target.closest(SMART_UI_BLOCKER)) {
            e.preventDefault();
            return;
          }
          if (target.closest("[data-testid^='node-card']")) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
          setCreateMenu({
            x: e.clientX,
            y: e.clientY,
            worldX: world.x,
            worldY: world.y,
          });
        }}
        onDoubleClick={(e) => {
          // History shell.ondblclick → openCreateMenu on empty
          const target = e.target as HTMLElement;
          if (target.closest(SMART_UI_BLOCKER)) return;
          if (target.closest("[data-testid^='node-card']")) return;
          e.preventDefault();
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
          setCreateMenu({
            x: e.clientX,
            y: e.clientY,
            worldX: world.x,
            worldY: world.y,
          });
        }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerLeave={onViewportPointerUp}
      >
        <SmartCanvasToolbar
          title={title}
          dirty={dirty}
          assetOpen={assetOpen}
          onToggleAssets={() => {
            if (assetOpen) {
              setAssetOpen(false);
              return;
            }
            setAssetOpen(true);
            setLogOpen(false);
            setShortcutOpen(false);
            setTransferOpen(false);
          }}
          onOpenTransfer={() => {
            if (transferOpen) {
              setTransferOpen(false);
              return;
            }
            setTransferOpen(true);
            setAssetOpen(false);
            setLogOpen(false);
            setShortcutOpen(false);
          }}
          onOpenLogs={() => {
            if (logOpen) {
              setLogOpen(false);
              return;
            }
            setLogOpen(true);
            setAssetOpen(false);
            setTransferOpen(false);
            setShortcutOpen(false);
          }}
          onOpenShortcuts={() => {
            if (shortcutOpen) {
              setShortcutOpen(false);
              return;
            }
            setShortcutOpen(true);
            setAssetOpen(false);
            setLogOpen(false);
            setTransferOpen(false);
          }}
        />
        <SmartToast message={toastMessage} onClear={() => setToastMessage("")} />

        <CanvasWorld
          width={size.w}
          height={size.h}
          onWheelZoom={handleWheelZoom}
        >
          {(visible) => (
            <>
              <ConnectionLayer
                nodes={nodes}
                connections={connections}
                selectedNodeId={selectedNodeId}
                selectedIds={selectedIds}
                edgeStates={cascadeEdges}
                onRemove={removeConnection}
              />
              {visible.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selectedIds.includes(node.id)}
                  viewportScale={viewport.scale}
                  memberCount={
                    node.kind === "group"
                      ? getGroupMembers(node, nodes).length
                      : 0
                  }
                  groupImages={
                    node.kind === "group"
                      ? getGroupMembers(node, nodes).flatMap((member) => member.images ?? [])
                      : []
                  }
                  onSelect={(nid, ev) => {
                    if (ev?.shiftKey || ev?.metaKey || ev?.ctrlKey) {
                      toggleSelectNode(nid, true);
                      return;
                    }
                    // Plain click on a card already in a multi-selection: keep multi for drag.
                    if (selectedIds.length > 1 && selectedIds.includes(nid)) {
                      return;
                    }
                    selectNode(nid);
                  }}
                  onDragStart={(nid) => {
                    commitHistory();
                    const live = useSmartCanvasStore.getState();
                    const ids =
                      live.selectedIds.includes(nid) && live.selectedIds.length > 1
                        ? live.selectedIds
                        : [nid];
                    if (!live.selectedIds.includes(nid)) {
                      selectNode(nid);
                    }
                    dragOriginsRef.current = Object.fromEntries(
                      ids.map((id) => {
                        const n = live.nodes.find((item) => item.id === id);
                        return [id, { x: n?.x ?? 0, y: n?.y ?? 0 }];
                      }),
                    );
                  }}
                  onDrag={(nid, x, y) => {
                    const origins = dragOriginsRef.current;
                    if (!origins?.[nid]) {
                      moveNode(nid, x, y);
                      return;
                    }
                    const dx = x - origins[nid].x;
                    const dy = y - origins[nid].y;
                    for (const [id, origin] of Object.entries(origins)) {
                      moveNode(id, origin.x + dx, origin.y + dy);
                    }
                  }}
                  onDragEnd={(info) => {
                    dragOriginsRef.current = null;
                    const live = useSmartCanvasStore.getState();
                    const source = live.nodes.find((n) => n.id === info.id);
                    if (!source) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    const world = rect
                      ? screenToWorld(
                          info.clientX,
                          info.clientY,
                          rect,
                          live.viewport,
                        )
                      : undefined;
                    const snap = resolveCtrlDragAutoSnap(
                      source,
                      live.nodes,
                      info.ctrlKey,
                      world,
                    );
                    if (snap.connected && snap.targetId) {
                      const ok = connectNodes(info.id, snap.targetId);
                      if (ok && snap.restorePosition) {
                        moveNode(info.id, info.originX, info.originY);
                      }
                      if (ok) setPageError("");
                    }
                  }}
                  onConnect={connectMode ? handleConnect : undefined}
                  onEditImage={(nid, idx) => setImageEdit({ nodeId: nid, index: idx })}
                  onPreviewImage={(nid, idx) => setImageEdit({ nodeId: nid, index: idx })}
                  onUpload={(nid, files) => void handleUploadToNode(nid, files)}
                  onJimengQuery={(nid) => void handleJimengQuery(nid)}
                  onDelete={(nid) => removeNodes([nid])}
                />
              ))}
              {selectionToolbarAnchor ? (
                <SelectionToolbar
                  x={selectionToolbarAnchor.x}
                  y={selectionToolbarAnchor.y}
                  count={selectionToolbarAnchor.count}
                  onDelete={handleDeleteSelected}
                />
              ) : selectedGroup ? (
                <GroupToolbar
                  group={selectedGroup}
                  memberCount={selectedGroupMembers.length}
                  onLayout={() => layoutGroup(selectedGroup.id)}
                  onPreview={() => setGroupPreview(selectedGroupPreviewUrls)}
                  onGrid={() => toggleGroupCollapse(selectedGroup.id)}
                  onDownload={() => void handleGroupExport()}
                  onUngroup={() => ungroupGroup(selectedGroup.id)}
                  onDelete={() => removeNodes([selectedGroup.id])}
                />
              ) : null}
              <Composer
                onBeforeGenerate={handleBeforeGenerate}
                onGenerate={handleGenerate}
                onCascade={handleCascade}
                onOpenTemplates={() => setTemplateOpen(true)}
              />
            </>
          )}
        </CanvasWorld>

        <Minimap
          nodes={nodes}
          viewport={viewport}
          containerWidth={size.w}
          containerHeight={size.h}
          selectedCount={selectedIds.length}
          onArrangeSelected={handleArrange}
        />

        <AssetPanel
          key={assetRefreshKey}
          open={assetOpen}
          onClose={() => setAssetOpen(false)}
          onToast={showToast}
          onSelect={(url) => {
            setComposer({ params: { ...store.composer.params, reference: url } });
            setAssetOpen(false);
          }}
        />

        <PromptLibraryPanel
          open={templateOpen}
          onClose={() => setTemplateOpen(false)}
          onSelect={(content) => {
            setComposer({ prompt: content });
            setTemplateOpen(false);
          }}
        />

        {workflowOpen && (
          <div className="absolute top-[66px] right-[22px] w-72 border border-[var(--border)] bg-[var(--bg)] p-4 z-20 max-h-80 overflow-auto shadow-lg" data-testid="workflow-picker-panel" onPointerDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">RunningHub 工作流</span>
              <button type="button" aria-label="关闭工作流选择" className="rounded p-1 text-[var(--muted)] hover:bg-[var(--nav-hover-bg)]" onClick={() => setWorkflowOpen(false)}>×</button>
            </div>
            <WorkflowPicker
              onSelect={(wf) => {
                addNode({
                  kind: "workflow",
                  x: 250,
                  y: 250,
                  title: wf.name,
                  settings: {
                    workflowId: wf.id,
                    engine: "runninghub",
                    kind: "image",
                    params: { workflow_id: wf.id },
                  },
                });
                setWorkflowOpen(false);
              }}
            />
          </div>
        )}
        <LogModal open={logOpen} onClose={() => setLogOpen(false)} logs={store.logs} />
        <ShortcutModal open={shortcutOpen} onClose={() => setShortcutOpen(false)} />
        <WorkflowTransferModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          onImport={handleImport}
          onExport={handleExport}
        />
        <CreateMenu
          open={createMenu != null}
          x={createMenu?.x ?? 0}
          y={createMenu?.y ?? 0}
          onClose={() => setCreateMenu(null)}
          onCreate={(kind) =>
            handleCreateNode(kind, createMenu?.worldX, createMenu?.worldY)
          }
        />
        <SelectionBox
          x={selection?.x ?? 0}
          y={selection?.y ?? 0}
          width={selection?.w ?? 0}
          height={selection?.h ?? 0}
          visible={selection?.active ?? false}
        />
        <ImageEditModal
          open={imageEdit != null || groupPreview.length > 0}
          images={
            groupPreview.length
              ? groupPreview
              : imageEdit
              ? (nodes.find((n) => n.id === imageEdit.nodeId)?.images ?? []).map(
                  (img) => img.url,
                )
              : []
          }
          initialIndex={imageEdit?.index ?? 0}
          onClose={() => {
            setImageEdit(null);
            setGroupPreview([]);
          }}
          onApply={(idx, dataUrl) => {
            if (!imageEdit) return;
            const node = nodes.find((n) => n.id === imageEdit.nodeId);
            if (!node) return;
            const next = [...(node.images ?? [])];
            if (next[idx]) next[idx] = { ...next[idx], url: dataUrl };
            updateNode(imageEdit.nodeId, { images: next });
          }}
        />
      </div>
    </div>
  );
}
