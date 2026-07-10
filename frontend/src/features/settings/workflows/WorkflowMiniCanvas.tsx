import {
  CircleDot,
  FileAudio,
  FileVideo,
  ImagePlus,
  Play,
  TextCursorInput,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../shared/api/client";
import { WorkflowFieldControls } from "./WorkflowFieldControls";
import { fieldKind, type PreviewValues, type WorkflowField } from "./workflowFieldUtils";
import {
  createMiniNode,
  fieldsFromMiniCanvas,
  lineBetween,
  MINI_CARD_W,
  MINI_COMFY_W,
  countFieldsByKind,
  type MiniTestNode,
  type MiniView,
} from "./workflowMiniCanvasUtils";

interface WorkflowMiniCanvasProps {
  title: string;
  fields: WorkflowField[];
  values: PreviewValues;
  onChange: (fieldId: string, value: unknown) => void;
  nodes: MiniTestNode[];
  onNodesChange: (nodes: MiniTestNode[]) => void;
  onRun: () => void;
  running?: boolean;
  runResultUrl?: string;
  runMessage?: string;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

function mediaAccept(type: string) {
  if (type === "video") return "video/*";
  if (type === "audio") return "audio/*";
  return "image/*";
}

export function WorkflowMiniCanvas({
  title,
  fields,
  values,
  onChange,
  nodes,
  onNodesChange,
  onRun,
  running,
  runResultUrl,
  runMessage,
}: WorkflowMiniCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MiniView>({ x: 24, y: 24, k: 1 });
  const dragRef = useRef<
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { kind: "card"; id: string; sx: number; sy: number; ox: number; oy: number }
    | null
  >(null);

  const fieldCounts = countFieldsByKind(fields);
  const promptFields = fields.filter((f) => fieldKind(f) === "prompt");
  const imageFields = fields.filter((f) => fieldKind(f) === "image");
  const videoFields = fields.filter((f) => fieldKind(f) === "video");
  const audioFields = fields.filter((f) => fieldKind(f) === "audio");
  const settingFields = fields.filter((f) => fieldKind(f) === "setting");

  const comfy = nodes.find((n) => n.type === "comfy");
  const output = nodes.find((n) => n.type === "output");
  const prompts = nodes.filter((n) => n.type === "prompt");
  const mediaNodes = nodes.filter((n) => ["image", "video", "audio"].includes(n.type));

  const updateNode = useCallback(
    (id: string, patch: Partial<MiniTestNode>) => {
      onNodesChange(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    },
    [nodes, onNodesChange],
  );

  const addNode = (type: "prompt" | "image" | "video" | "audio") => {
    onNodesChange([...nodes, createMiniNode(type, nodes)]);
  };

  const syncPromptPreviewValues = (nextNodes: MiniTestNode[]) => {
    const text = nextNodes
      .filter((n) => n.type === "prompt")
      .map((n) => n.text || "")
      .filter(Boolean)
      .join("\n\n");
    for (const f of promptFields) {
      onChange(f.id, text);
    }
  };

  const updatePromptText = (id: string, text: string) => {
    const nextNodes = nodes.map((n) => (n.id === id ? { ...n, text } : n));
    onNodesChange(nextNodes);
    syncPromptPreviewValues(nextNodes);
  };

  const canDeleteNode = (node: MiniTestNode) => {
    if (!node.userAdded && node.type === "prompt" && fieldCounts.prompt > 0) return false;
    if (!node.userAdded && node.type === "image" && fieldCounts.image > 0) return false;
    if (!node.userAdded && node.type === "video" && fieldCounts.video > 0) return false;
    if (!node.userAdded && node.type === "audio" && fieldCounts.audio > 0) return false;
    return node.type === "prompt" || node.type === "image" || node.type === "video" || node.type === "audio";
  };

  const removeNode = (id: string) => {
    onNodesChange(nodes.filter((n) => n.id !== id));
  };

  const uploadMiniMedia = async (node: MiniTestNode, file: File) => {
    const blob = URL.createObjectURL(file);
    const nextNodes = nodes.map((n) =>
      n.id === node.id ? { ...n, url: blob, name: file.name } : n,
    );
    onNodesChange(nextNodes);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api.upload<{ comfy_name?: string; filename?: string }>("/api/upload", form);
      const value = res.comfy_name || res.filename || file.name;
      onNodesChange(
        nextNodes.map((n) => (n.id === node.id ? { ...n, value, name: file.name } : n)),
      );
      const kindFields = fields.filter((f) => fieldKind(f) === node.type);
      const kindNodes = nextNodes.filter((n) => n.type === node.type);
      const index = kindNodes.findIndex((n) => n.id === node.id);
      if (kindFields[index]) onChange(kindFields[index].id, value);
    } catch {
      onNodesChange(
        nextNodes.map((n) => (n.id === node.id ? { ...n, value: file.name, name: file.name } : n)),
      );
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "pan") {
        setView((v) => ({
          ...v,
          x: drag.ox + e.clientX - drag.sx,
          y: drag.oy + e.clientY - drag.sy,
        }));
      } else {
        const dx = (e.clientX - drag.sx) / view.k;
        const dy = (e.clientY - drag.sy) / view.k;
        onNodesChange(
          nodes.map((n) =>
            n.id === drag.id ? { ...n, x: drag.ox + dx, y: drag.oy + dy } : n,
          ),
        );
      }
    };
    const onUp = () => {
      if (dragRef.current?.kind === "pan") {
        canvasRef.current?.classList.remove("is-panning");
      }
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [nodes, onNodesChange, view.k]);

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("textarea,input,select,button,label,.studio-mini-media-drop")) return;

    const card = target.closest("[data-mini-node]") as HTMLElement | null;
    if (card && target.closest("[data-mini-drag-handle]")) {
      const id = card.dataset.miniNode!;
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      dragRef.current = { kind: "card", id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
      return;
    }

    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    canvasRef.current?.classList.add("is-panning");
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((v) => {
      const old = v.k;
      const next = Math.max(0.45, Math.min(1.8, old * (e.deltaY > 0 ? 0.9 : 1.1)));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        k: next,
        x: mx - (mx - v.x) * (next / old),
        y: my - (my - v.y) * (next / old),
      };
    });
  };

  const lines: React.ReactNode[] = [];
  if (comfy) {
    if (fieldCounts.prompt > 0) {
      for (const n of prompts) {
        const line = lineBetween(n, comfy, MINI_CARD_W);
        lines.push(
          <div
            key={`${n.id}-${comfy.id}`}
            className="studio-mini-line"
            style={{
              left: line.x1,
              top: line.y1,
              width: line.len,
              transform: `rotate(${line.deg}deg)`,
            }}
          />,
        );
      }
    }
    for (const n of mediaNodes) {
      const kindCount = fieldCounts[n.type as keyof typeof fieldCounts];
      if (!kindCount) continue;
      const line = lineBetween(n, comfy, MINI_CARD_W);
      lines.push(
        <div
          key={`${n.id}-${comfy.id}`}
          className="studio-mini-line"
          style={{
            left: line.x1,
            top: line.y1,
            width: line.len,
            transform: `rotate(${line.deg}deg)`,
          }}
        />,
      );
    }
    if (output) {
      const line = lineBetween(comfy, output, MINI_COMFY_W);
      lines.push(
        <div
          key={`${comfy.id}-${output.id}`}
          className="studio-mini-line"
          style={{
            left: line.x1,
            top: line.y1,
            width: line.len,
            transform: `rotate(${line.deg}deg)`,
          }}
        />,
      );
    }
  }

  return (
    <div
      ref={canvasRef}
      className="studio-mini-canvas large studio-mini-canvas-interactive"
      data-testid="workflow-test-canvas"
      onMouseDown={onCanvasMouseDown}
      onWheel={onWheel}
    >
      <div className="studio-mini-toolbar">
        {fieldCounts.prompt > 0 ? (
          <button type="button" className="studio-mini-tool" onClick={() => addNode("prompt")}>
            <TextCursorInput className="w-3.5 h-3.5" />
            提示词
          </button>
        ) : null}
        {fieldCounts.image > 0 ? (
          <button type="button" className="studio-mini-tool" onClick={() => addNode("image")}>
            <ImagePlus className="w-3.5 h-3.5" />
            图片
          </button>
        ) : null}
        {fieldCounts.video > 0 ? (
          <button type="button" className="studio-mini-tool" onClick={() => addNode("video")}>
            <FileVideo className="w-3.5 h-3.5" />
            视频
          </button>
        ) : null}
        {fieldCounts.audio > 0 ? (
          <button type="button" className="studio-mini-tool" onClick={() => addNode("audio")}>
            <FileAudio className="w-3.5 h-3.5" />
            音频
          </button>
        ) : null}
      </div>
      <div
        className="studio-mini-world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        {lines}
        {prompts.map((n, i) => (
          <div
            key={n.id}
            className="studio-mini-card"
            data-mini-node={n.id}
            style={{ left: n.x, top: n.y }}
          >
            <span className="studio-mini-port out" />
            <div className="studio-mini-card-head" data-mini-drag-handle>
              <TextCursorInput className="w-3.5 h-3.5" />
              <span>提示词 {i + 1}</span>
              {canDeleteNode(n) ? (
                <button type="button" className="studio-mini-delete" onClick={() => removeNode(n.id)}>
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </div>
            <div className="studio-mini-card-body">
              <textarea
                className="studio-mini-textarea"
                value={n.text || ""}
                placeholder="输入提示词..."
                onChange={(e) => updatePromptText(n.id, e.target.value)}
              />
            </div>
          </div>
        ))}
        {mediaNodes.map((n, i) => (
          <div
            key={n.id}
            className="studio-mini-card"
            data-mini-node={n.id}
            style={{ left: n.x, top: n.y }}
          >
            <span className="studio-mini-port out" />
            <div className="studio-mini-card-head" data-mini-drag-handle>
              {n.type === "video" ? (
                <FileVideo className="w-3.5 h-3.5" />
              ) : n.type === "audio" ? (
                <FileAudio className="w-3.5 h-3.5" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5" />
              )}
              <span>
                {MEDIA_LABELS[n.type] || n.type} {i + 1}
              </span>
              {canDeleteNode(n) ? (
                <button type="button" className="studio-mini-delete" onClick={() => removeNode(n.id)}>
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </div>
            <div className="studio-mini-card-body">
              <label className="studio-mini-media-drop compact">
                <input
                  type="file"
                  accept={mediaAccept(n.type)}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadMiniMedia(n, file);
                  }}
                />
                {n.url && n.type === "image" ? (
                  <img src={n.url} alt="" className="studio-mini-media-thumb" />
                ) : n.url && n.type === "video" ? (
                  <video src={n.url} muted controls className="studio-mini-media-thumb" />
                ) : (
                  <span className="studio-mini-media-placeholder">
                    <ImagePlus className="w-3.5 h-3.5" />
                    点击上传{MEDIA_LABELS[n.type]}
                  </span>
                )}
                <span className="studio-mini-media-name">{n.name || n.value || ""}</span>
              </label>
            </div>
          </div>
        ))}
        {comfy ? (
          <div
            className="studio-mini-card comfy"
            data-mini-node={comfy.id}
            style={{ left: comfy.x, top: comfy.y }}
          >
            <span className="studio-mini-port in" />
            <span className="studio-mini-port out" />
            <div className="studio-mini-card-head" data-mini-drag-handle>
              <Workflow className="w-3.5 h-3.5" />
              <span>
                {title} · Comfy 节点
              </span>
            </div>
            <div className="studio-mini-card-body">
              <div className="studio-mini-section-label">暴露到画布的输入</div>
              <div className="studio-mini-io-summary">
                图片 {imageFields.length} · 视频 {videoFields.length} · 音频 {audioFields.length} ·{" "}
                {promptFields.length ? "接受提示词" : "无提示词字段"}
                {settingFields.length ? ` · 参数 ${settingFields.length}` : ""}
              </div>
              <div className="studio-mini-field-list">
                {settingFields.length === 0 ? (
                  <div className="studio-model-empty">其他参数将显示在这里</div>
                ) : (
                  settingFields.map((f) => (
                    <div key={f.id} className="studio-mini-field">
                      <div className="studio-mini-field-label">{f.name || f.input}</div>
                      <WorkflowFieldControls
                        field={f}
                        value={values[f.id]}
                        onChange={(v) => onChange(f.id, v)}
                        compact
                      />
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                className="studio-action-btn primary studio-mini-run"
                onClick={onRun}
                disabled={running || fields.length === 0}
                data-testid="workflow-run-test-btn"
              >
                <Play className="w-4 h-4" />
                {running ? "运行中..." : "运行测试"}
              </button>
            </div>
          </div>
        ) : null}
        {output ? (
          <div
            className="studio-mini-card"
            data-mini-node={output.id}
            style={{ left: output.x, top: output.y }}
          >
            <span className="studio-mini-port in" />
            <div className="studio-mini-card-head" data-mini-drag-handle>
              <CircleDot className="w-3.5 h-3.5" />
              <span>输出</span>
            </div>
            <div className="studio-mini-card-body">
              {runResultUrl ? (
                <div className="studio-mini-run-result" data-testid="workflow-run-result">
                  <img src={runResultUrl} alt="运行结果" />
                  <div className="studio-mini-run-message">{runMessage || "运行完成"}</div>
                </div>
              ) : (
                <div className="studio-model-empty">运行结果将显示在这里</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { fieldsFromMiniCanvas };
