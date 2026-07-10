import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildGraphLayout,
  GRAPH_NODE_SIZE,
  type ComfyWorkflow,
} from "./workflowGraph";

interface WorkflowGraphViewProps {
  workflow: ComfyWorkflow;
  fields: { node: string }[];
  onNodeClick: (nodeId: string) => void;
  activeNodeId?: string | null;
}

export function WorkflowGraphView({
  workflow,
  fields,
  onNodeClick,
  activeNodeId,
}: WorkflowGraphViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const layout = buildGraphLayout(workflow, fields);

  const applyFit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !layout.width) return;
    const pad = 20;
    const kx = (wrap.clientWidth - pad * 2) / layout.width;
    const ky = (wrap.clientHeight - pad * 2) / layout.height;
    const k = Math.max(0.2, Math.min(2, Math.min(kx, ky)));
    setView({
      k,
      x: (wrap.clientWidth - layout.width * k) / 2,
      y: (wrap.clientHeight - layout.height * k) / 2,
    });
  }, [layout.width, layout.height]);

  useEffect(() => {
    applyFit();
  }, [applyFit, workflow]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pan = panRef.current;
      if (!pan) return;
      setView((prev) => ({
        ...prev,
        x: pan.ox + (e.clientX - pan.sx),
        y: pan.oy + (e.clientY - pan.sy),
      }));
    };
    const onUp = () => {
      panRef.current = null;
      setPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const zoom = (dir: 1 | -1) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const factor = dir > 0 ? 1.2 : 1 / 1.2;
    setView((prev) => {
      const newK = Math.max(0.2, Math.min(3, prev.k * factor));
      const cx = wrap.clientWidth / 2;
      const cy = wrap.clientHeight / 2;
      return {
        k: newK,
        x: cx - (cx - prev.x) * (newK / prev.k),
        y: cy - (cy - prev.y) * (newK / prev.k),
      };
    });
  };

  if (!layout.nodes.length) {
    return (
      <div className="studio-graph-empty" data-testid="workflow-graph-empty">
        工作流 JSON 为空或无效
      </div>
    );
  }

  const { w: NODE_W, h: NODE_H } = GRAPH_NODE_SIZE;

  return (
    <div className="studio-graph-card" data-testid="workflow-graph-card">
      <div
        ref={wrapRef}
        className={`studio-graph-wrap${panning ? " is-panning" : ""}`}
        onWheel={(e) => {
          e.preventDefault();
          const wrap = wrapRef.current;
          if (!wrap) return;
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          setView((prev) => {
            const newK = Math.max(0.2, Math.min(3, prev.k * factor));
            const rect = wrap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            return {
              k: newK,
              x: mx - (mx - prev.x) * (newK / prev.k),
              y: my - (my - prev.y) * (newK / prev.k),
            };
          });
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest(".studio-gnode")) return;
          e.preventDefault();
          panRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
          setPanning(true);
        }}
      >
        <svg className="studio-graph-svg" data-testid="workflow-graph-svg">
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {layout.edges.map(({ from, to }) => {
              const a = layout.nodes.find((n) => n.id === from);
              const b = layout.nodes.find((n) => n.id === to);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const cx = (x1 + x2) / 2;
              return (
                <path
                  key={`${from}-${to}`}
                  className="studio-gedge"
                  d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                />
              );
            })}
            {layout.nodes.map((node) => (
              <g
                key={node.id}
                className={`studio-gnode${node.exposedCount > 0 ? " has-exposed" : ""}${activeNodeId === node.id ? " is-active" : ""}`}
                transform={`translate(${node.x},${node.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeClick(node.id);
                }}
                data-testid={`workflow-graph-node-${node.id}`}
              >
                <rect width={NODE_W} height={NODE_H} rx={8} />
                <text className="studio-gnode-title" x={10} y={20}>
                  {node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label}
                </text>
                <text className="studio-gnode-sub" x={10} y={35}>
                  {node.sub.length > 16 ? `${node.sub.slice(0, 16)}…` : node.sub}
                </text>
                <text className="studio-gnode-id" x={NODE_W - 8} y={20} textAnchor="end">
                  #{node.id}
                </text>
                {node.exposedCount > 0 && (
                  <text className="studio-gnode-badge" x={NODE_W - 8} y={42} textAnchor="end">
                    {node.exposedCount} 项
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
        <div className="studio-graph-controls">
          <button type="button" className="studio-graph-ctrl" onClick={() => zoom(-1)} title="缩小">
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="studio-graph-zoom-pill">{Math.round(view.k * 100)}%</div>
          <button type="button" className="studio-graph-ctrl" onClick={() => zoom(1)} title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button type="button" className="studio-graph-ctrl" onClick={applyFit} title="适应窗口">
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
