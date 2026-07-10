import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FolderOpen,
  ImagePlus,
  Library,
  Redo2,
  Save,
  Undo2,
  Upload,
  Download,
  LayoutGrid,
  Link2,
  Keyboard,
  ScrollText,
} from "lucide-react";
import { useSmartCanvasStore } from "./core/state";
import { loadCanvas, saveCanvas, scheduleTouch } from "./core/persistence";
import { CanvasWorld } from "./components/CanvasWorld";
import { ConnectionLayer } from "./components/ConnectionLayer";
import { NodeCard } from "./components/NodeCard";
import { Composer } from "./components/Composer";
import { Minimap } from "./components/Minimap";
import { AssetPanel } from "./components/AssetPanel";
import { PromptLibraryPanel } from "./components/PromptLibraryPanel";
import { WorkflowPicker } from "./components/WorkflowPicker";
import { useWebSocket } from "./hooks/useWebSocket";
import { buildCascadeOrder, canRunCascade, edgeStateForStep, type CascadeEdgeState } from "./core/cascade";
import { submitGeneration, pollUntilDone } from "./core/generation";
import { exportWorkflowZip, importWorkflowFile } from "./core/workflows";
import { loadCanvasMeta } from "./core/meta";
import { getGroupMembers } from "./core/layout";
import { LogModal } from "./components/LogModal";
import { ShortcutModal } from "./components/ShortcutModal";
import { WorkflowTransferModal } from "./components/WorkflowTransferModal";
import { CreateMenu, createNodeByKind, type CreateKind } from "./components/CreateMenu";
import { ImageEditModal } from "./components/ImageEditModal";
import { SelectionBox } from "./components/SelectionBox";
import { clamp } from "../../shared/utils";
import { MAX_SCALE, MIN_SCALE } from "./core/types";

export function SmartCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const [imageEdit, setImageEdit] = useState<{ nodeId: string; index: number } | null>(null);
  const [cascadeEdges, setCascadeEdges] = useState<Record<string, CascadeEdgeState>>({});
  const [selection, setSelection] = useState<{
    active: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

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
    arrangeNodes,
    copySelectedNodes,
    pasteNodes,
    removeNode,
    toggleSelectNode,
    selectedIds,
    setSelectedIds,
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
          if (meta?.title) useSmartCanvasStore.getState().setTitle(meta.title);
        } catch {
          /* meta optional */
        }
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

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
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
      markClean(doc.updated_at ?? 0);
    } finally {
      setSaving(false);
    }
  }, [id, markClean]);

  useEffect(() => {
    if (!id || !dirty) return;
    const timer = setTimeout(() => {
      handleSave();
      scheduleTouch(id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [id, dirty, nodes, connections, viewport, handleSave]);

  const handleCreateNode = useCallback(
    (kind: CreateKind) => {
      const built = createNodeByKind(kind, 150 + nodes.length * 24, 150);
      const node = addNode({
        kind: built.kind,
        x: built.x,
        y: built.y,
        title: built.title,
        prompt: built.prompt,
        width: built.width,
        height: built.height,
        settings: built.settings,
        member_ids: built.member_ids,
      });
      selectNode(node.id);
    },
    [addNode, nodes.length, selectNode],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === "c") {
        e.preventDefault();
        copySelectedNodes();
      } else if (mod && e.key === "v") {
        e.preventDefault();
        pasteNodes();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const sid = useSmartCanvasStore.getState().selectedNodeId;
        if (sid) {
          e.preventDefault();
          removeNode(sid);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, copySelectedNodes, pasteNodes, removeNode]);

  const handlePan = (dx: number, dy: number) => {
    setViewport({ x: viewport.x + dx, y: viewport.y + dy });
  };

  const handleZoom = (delta: number) => {
    const next = clamp(viewport.scale + delta, MIN_SCALE, MAX_SCALE);
    setViewport({ scale: next });
  };

  const handleGenerate = (result: { url?: string; error?: string }) => {
    if (result.error) {
      addLog({
        id: crypto.randomUUID(),
        ts: Date.now(),
        prompt: store.composer.prompt,
        kind: store.composer.kind,
        engine: store.composer.engine,
      });
      return;
    }
    if (result.url) {
      const node = addNode({
        kind: store.composer.kind,
        x: 300,
        y: 200,
        title: "生成结果",
        prompt: store.composer.prompt,
        images: [{ url: result.url, kind: store.composer.kind }],
      });
      addLog({
        id: crypto.randomUUID(),
        ts: Date.now(),
        prompt: store.composer.prompt,
        kind: store.composer.kind,
        url: result.url,
        engine: store.composer.engine,
      });
      selectNode(node.id);
    }
  };

  const handleCascade = async () => {
    const s = useSmartCanvasStore.getState();
    const steps = buildCascadeOrder(s.nodes, s.connections, selectedNodeId ?? undefined);
    const completed = new Set<string>();
    const running = new Set<string>();
    const errors = new Set<string>();
    setCascadeEdges({});
    while (true) {
      const step = canRunCascade(steps, completed);
      if (!step) break;
      const node = s.nodes.find((n) => n.id === step.nodeId);
      if (!node) {
        completed.add(step.nodeId);
        continue;
      }
      running.add(step.nodeId);
      setCascadeEdges((prev) => ({
        ...prev,
        ...edgeStateForStep(step, completed, running, errors),
      }));
      updateNode(node.id, { status: "running" });
      const prompt = node.prompt || s.composer.prompt;
      setComposer({ prompt });
      let result = await submitGeneration({ ...s.composer, prompt });
      if (result.pending && result.taskId) {
        result = await pollUntilDone(result.taskId, 30, 1000);
      }
      running.delete(step.nodeId);
      if (result.url) {
        updateNode(node.id, {
          images: [{ url: result.url, kind: s.composer.kind }],
          status: "done",
        });
        completed.add(step.nodeId);
      } else {
        updateNode(node.id, { status: "error" });
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
      connectNodes(connectFrom, nodeId);
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
            init({
              canvasId: id!,
              title: data.name ?? title,
              icon: "🧩",
              nodes: data.nodes,
              connections: data.connections ?? [],
              viewport,
            });
            commitHistory();
          }
        } catch {
          /* ignore */
        }
        return;
      }
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data.nodes)) {
          init({
            canvasId: id!,
            title: data.title ?? title,
            icon: "🧩",
            nodes: data.nodes,
            connections: data.connections ?? [],
            viewport: data.viewport ?? viewport,
          });
          commitHistory();
        }
      } catch {
        /* ignore */
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="smart-canvas-loading">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--stage-bg)]" data-testid="smart-canvas-page">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)]">
        <Link to="/canvases" className="p-2 hover:bg-[var(--nav-hover-bg)]">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-medium flex-1 truncate">{title}</h1>
        <button type="button" onClick={undo} title="撤销" className="p-2 hover:bg-[var(--nav-hover-bg)]" data-testid="undo-btn">
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={redo} title="重做" className="p-2 hover:bg-[var(--nav-hover-bg)]" data-testid="redo-btn">
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTemplateOpen((v) => !v)}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="模板库"
        >
          <Library className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => arrangeNodes()}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="自动排列"
          data-testid="arrange-btn"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setConnectMode((v) => {
              const next = !v;
              if (!next) setConnectFrom(null);
              return next;
            });
          }}
          className={`p-2 hover:bg-[var(--nav-hover-bg)] ${connectMode ? "bg-[var(--nav-hover-bg)]" : ""}`}
          title="连线"
          data-testid="connect-mode-btn"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setLogOpen(true)} className="p-2 hover:bg-[var(--nav-hover-bg)]" title="日志">
          <ScrollText className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setShortcutOpen(true)} className="p-2 hover:bg-[var(--nav-hover-bg)]" title="快捷键">
          <Keyboard className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setTransferOpen(true)} className="p-2 hover:bg-[var(--nav-hover-bg)]" title="工作流传输">
          <Upload className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setAssetOpen((v) => !v)}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="素材"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setWorkflowOpen((v) => !v)}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="工作流"
        >
          <Upload className="w-4 h-4" />
        </button>
        <button type="button" onClick={handleImport} className="p-2 hover:bg-[var(--nav-hover-bg)]" title="导入">
          <Download className="w-4 h-4" />
        </button>
        <button type="button" onClick={handleExport} className="p-2 hover:bg-[var(--nav-hover-bg)]" title="导出">
          <Upload className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleCreateNode("image")}
          onContextMenu={(e) => {
            e.preventDefault();
            setCreateMenu({ x: e.clientX, y: e.clientY });
          }}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="添加节点"
          data-testid="add-node-btn"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-black text-white text-sm disabled:opacity-50"
          data-testid="save-btn"
        >
          <Save className="w-4 h-4" />
          {saving ? "保存中" : dirty ? "保存*" : "已保存"}
        </button>
      </header>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onContextMenu={(e) => {
          e.preventDefault();
          setCreateMenu({ x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
          const target = e.target as HTMLElement;
          if (target.closest("[data-testid^='node-card-']")) return;
          const sx = e.clientX;
          const sy = e.clientY;
          setSelection({ active: true, x: sx, y: sy, w: 0, h: 0 });
          const onMove = (ev: PointerEvent) => {
            setSelection({
              active: true,
              x: sx,
              y: sy,
              w: ev.clientX - sx,
              h: ev.clientY - sy,
            });
          };
          const onUp = (ev: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) {
              setSelection(null);
              return;
            }
            const left = Math.min(sx, ev.clientX) - rect.left;
            const top = Math.min(sy, ev.clientY) - rect.top;
            const right = Math.max(sx, ev.clientX) - rect.left;
            const bottom = Math.max(sy, ev.clientY) - rect.top;
            const vp = useSmartCanvasStore.getState().viewport;
            const hits = nodes.filter((n) => {
              const nx = n.x * vp.scale + vp.x;
              const ny = n.y * vp.scale + vp.y;
              const nw = (n.width ?? 280) * vp.scale;
              const nh = (n.height ?? 200) * vp.scale;
              return nx < right && nx + nw > left && ny < bottom && ny + nh > top;
            });
            setSelectedIds(hits.map((n) => n.id));
            setSelection(null);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      >
        <CanvasWorld
          width={size.w}
          height={size.h}
          onBackgroundPan={handlePan}
          onZoom={handleZoom}
        >
          {(visible) => (
            <>
              <ConnectionLayer
                nodes={nodes}
                connections={connections}
                selectedNodeId={selectedNodeId}
                selectedIds={selectedIds}
                edgeStates={cascadeEdges}
              />
              {visible.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selectedIds.includes(node.id)}
                  memberCount={
                    node.kind === "group"
                      ? getGroupMembers(node, nodes).length
                      : 0
                  }
                  onSelect={(nid, ev) => {
                    if (ev?.shiftKey || ev?.metaKey || ev?.ctrlKey) {
                      toggleSelectNode(nid, true);
                    } else {
                      selectNode(nid);
                    }
                  }}
                  onDragStart={() => commitHistory()}
                  onDrag={(nid, x, y) => moveNode(nid, x, y)}
                  onConnect={connectMode ? handleConnect : undefined}
                  onEditImage={(nid, idx) => setImageEdit({ nodeId: nid, index: idx })}
                  onPreviewImage={(nid, idx) => setImageEdit({ nodeId: nid, index: idx })}
                />
              ))}
            </>
          )}
        </CanvasWorld>

        <Minimap
          nodes={nodes}
          viewport={viewport}
          containerWidth={size.w}
          containerHeight={size.h}
        />

        <Composer onGenerate={handleGenerate} onCascade={handleCascade} />

        <AssetPanel
          key={assetRefreshKey}
          open={assetOpen}
          onClose={() => setAssetOpen(false)}
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
          <div className="absolute top-14 right-4 w-64 border border-[var(--border)] bg-[var(--bg)] p-4 z-20 max-h-80 overflow-auto">
            <WorkflowPicker
              onSelect={(wf) => {
                addNode({
                  kind: "workflow",
                  x: 250,
                  y: 250,
                  title: wf.name,
                  settings: { workflowId: wf.id },
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
          onCreate={(kind) => handleCreateNode(kind)}
        />
        <SelectionBox
          x={selection?.x ?? 0}
          y={selection?.y ?? 0}
          width={selection?.w ?? 0}
          height={selection?.h ?? 0}
          visible={selection?.active ?? false}
        />
        <ImageEditModal
          open={imageEdit != null}
          images={
            imageEdit
              ? (nodes.find((n) => n.id === imageEdit.nodeId)?.images ?? []).map(
                  (img) => img.url,
                )
              : []
          }
          initialIndex={imageEdit?.index ?? 0}
          onClose={() => setImageEdit(null)}
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
