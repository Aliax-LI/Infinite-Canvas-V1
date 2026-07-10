import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ImagePlus, LayoutGrid, Save, X } from "lucide-react";
import { useLegacyCanvasStore } from "./core/state";
import { loadLegacyCanvas, saveLegacyCanvas } from "./core/persistence";
import { submitLegacyGeneration } from "./core/generation";
import { fitViewportToNodes, panViewport, screenToWorld, zoomViewport } from "./core/viewport";
import { Timeline } from "./timeline/Timeline";
import { LegacyNodeCard } from "./components/LegacyNodeCard";
import { ConnectionLayer } from "./components/ConnectionLayer";
import { Minimap } from "./components/Minimap";
import { ContextMenu } from "./components/ContextMenu";
import { usePointerDrag } from "../../shared/hooks/usePointerDrag";
import type { LegacyNodeKind } from "./core/types";

export function LegacyCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  const {
    init,
    title,
    nodes,
    connections,
    viewport,
    settings,
    generate,
    selectedNodeId,
    connectFromId,
    dirty,
    setViewport,
    addNode,
    addNodeAtKind,
    moveNode,
    selectNode,
    arrangeNodes,
    setGenerate,
    setSettings,
    markClean,
    cancelConnect,
  } = useLegacyCanvasStore();

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
      .finally(() => setLoading(false));
  }, [id, init]);

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
    } finally {
      setSaving(false);
    }
  }, [id, markClean]);

  useEffect(() => {
    if (!id || !dirty) return;
    const timer = setTimeout(handleSave, 3000);
    return () => clearTimeout(timer);
  }, [id, dirty, nodes, connections, viewport, settings, handleSave]);

  const handleTimelineChange = useCallback(
    (timeline: Record<string, unknown>) => {
      setSettings({ timeline });
    },
    [setSettings],
  );

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const refs = nodes
        .filter((n) => n.images?.[0]?.url)
        .map((n) => n.images[0].url);
      const result = await submitLegacyGeneration(generate, refs);
      if (result.url) {
        addNode({
          kind: generate.kind,
          x: 200 + nodes.length * 20,
          y: 200,
          title: "生成结果",
          prompt: generate.prompt,
          images: [{ url: result.url, kind: generate.kind }],
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const panDrag = usePointerDrag({
    onMove: (_x, _y, dx, dy) => {
      setViewport(panViewport(viewport, dx, dy));
    },
  });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setViewport(zoomViewport(viewport, e.deltaY > 0 ? -0.08 : 0.08));
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

  const handleCreateFromMenu = (kind: LegacyNodeKind, x: number, y: number) => {
    addNodeAtKind(kind, x, y);
  };

  const handleFit = () => {
    setViewport(fitViewportToNodes(nodes, size.w, size.h));
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="legacy-canvas-loading">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--stage-bg)]" data-testid="legacy-canvas-page">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)]">
        <Link to="/canvases" className="p-2 hover:bg-[var(--nav-hover-bg)]">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-medium flex-1">{title}</h1>
        {connectFromId && (
          <button
            type="button"
            onClick={cancelConnect}
            className="flex items-center gap-1 text-xs px-2 py-1 border border-[var(--border)]"
            data-testid="legacy-cancel-connect"
          >
            <X className="w-3 h-3" />
            取消连接
          </button>
        )}
        <button
          type="button"
          onClick={arrangeNodes}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          title="排列节点"
          data-testid="legacy-arrange-btn"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="p-2 hover:bg-[var(--nav-hover-bg)]"
          data-testid="legacy-save-btn"
        >
          <Save className="w-4 h-4" />
        </button>
        <span className="text-xs text-[var(--muted)]">传统画布</span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <section
          ref={containerRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
          data-testid="legacy-canvas-viewport"
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onClick={() => {
            setContextMenu(null);
            if (!connectFromId) selectNode(null);
          }}
          {...panDrag.handlers}
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
              selectedNodeId={selectedNodeId}
              connectFromId={connectFromId}
            />
            {nodes.map((node) => (
              <LegacyNodeCard
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                viewport={viewport}
                containerRef={containerRef}
              />
            ))}
          </div>
          <Minimap
            nodes={nodes}
            viewport={viewport}
            containerWidth={size.w}
            containerHeight={size.h}
          />
          {nodes.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-[var(--muted)] pointer-events-none">
              右键添加节点，或使用下方生成面板
            </p>
          )}
        </section>

        <aside className="w-80 border-l border-[var(--border)] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]" data-testid="legacy-generate-panel">
            <h3 className="text-sm font-medium mb-3">生成面板</h3>
            <textarea
              value={generate.prompt}
              onChange={(e) => setGenerate({ prompt: e.target.value })}
              placeholder="输入提示词..."
              className="w-full h-24 border border-[var(--border)] bg-[var(--bg)] p-2 text-sm mb-2"
              data-testid="legacy-prompt"
            />
            <select
              value={generate.engine}
              onChange={(e) => setGenerate({ engine: e.target.value })}
              className="w-full border border-[var(--border)] bg-[var(--bg)] p-2 text-sm mb-2"
              data-testid="legacy-engine-select"
            >
              <option value="api">API</option>
              <option value="comfy">ComfyUI</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  addNode({
                    kind: "image",
                    x: 100 + nodes.length * 30,
                    y: 100,
                    title: "上传节点",
                  })
                }
                className="flex-1 flex items-center justify-center gap-1 py-2 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)] text-sm"
                data-testid="legacy-add-node-btn"
              >
                <ImagePlus className="w-4 h-4" />
                添加
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !generate.prompt.trim()}
                className="flex-1 py-2 bg-black text-white text-sm disabled:opacity-50"
                data-testid="legacy-generate-btn"
              >
                {generating ? "生成中..." : "生成"}
              </button>
            </div>
            <button
              type="button"
              onClick={handleFit}
              className="w-full mt-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              适应视口
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <Timeline
              canvasId={id!}
              timelineSettings={settings.timeline}
              onTimelineChange={handleTimelineChange}
            />
          </div>
        </aside>
      </div>

      {contextMenu && (
        <ContextMenu
          open
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          worldX={contextMenu.worldX}
          worldY={contextMenu.worldY}
          onClose={() => setContextMenu(null)}
          onCreate={handleCreateFromMenu}
        />
      )}
    </div>
  );
}
