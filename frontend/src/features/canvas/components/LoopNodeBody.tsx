import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, PlayCircle } from "lucide-react";
import { useLegacyCanvasStore } from "../core/state";
import type { LegacyNode } from "../core/types";
import {
  findLoopCascadeTarget,
  loopCount,
  loopInputImageRefs,
  renderLoopPrompt,
} from "../core/loop";

interface LoopNodeBodyProps {
  node: LegacyNode;
  onRunCascade?: (
    targetId: string,
    rounds: number,
    mode: "serial" | "parallel",
  ) => void;
}

export function LoopNodeBody({ node, onRunCascade }: LoopNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const nodes = useLegacyCanvasStore((s) => s.nodes);
  const connections = useLegacyCanvasStore((s) => s.connections);
  const updateNode = useLegacyCanvasStore((s) => s.updateNode);

  const settings = node.settings ?? {};
  const count = loopCount(settings);
  const mode = settings.mode === "parallel" ? "parallel" : "serial";
  const showPrompt = Boolean(settings.showPrompt);
  const imageInput = Boolean(settings.imageInput);
  const loopStart = Math.max(1, Number(settings.loopStart) || 1);
  const imageBatchSize = Math.max(1, Math.min(100, Number(settings.imageBatchSize) || 1));

  const preview = useMemo(
    () => renderLoopPrompt(node, nodes, connections, { index: 1, total: count }),
    [node, nodes, connections, count],
  );

  const imageRefCount = useMemo(
    () => loopInputImageRefs(node, nodes, connections, { index: loopStart }).length,
    [node, nodes, connections, loopStart],
  );

  const cascadeTarget = findLoopCascadeTarget(node.id, nodes, connections);

  const patch = (next: Record<string, unknown>) =>
    updateNode(node.id, { settings: { ...settings, ...next } });

  return (
    <div className="px-2 pb-2 text-xs" data-node-control="" data-testid={`loop-node-body-${node.id}`}>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-gray-500">{t("loopCount")}</label>
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => patch({ count: Math.max(1, Number(e.target.value) || 1) })}
          data-testid={`loop-count-${node.id}`}
        />
        <div className="flex border border-gray-200 rounded-lg overflow-hidden ml-auto">
          <button
            type="button"
            className={`px-2 py-1 ${mode !== "parallel" ? "bg-black text-white" : "text-gray-600"}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => patch({ mode: "serial" })}
          >
            {t("loopSerial")}
          </button>
          <button
            type="button"
            className={`px-2 py-1 ${mode === "parallel" ? "bg-black text-white" : "text-gray-600"}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => patch({ mode: "parallel" })}
          >
            {t("loopParallel")}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-2">
        <button
          type="button"
          className={`flex-1 py-1 rounded-lg border text-[10px] ${imageInput ? "border-black bg-gray-50" : "border-gray-200"}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => patch({ imageInput: !imageInput })}
        >
          {t("loopImageToggle")}
        </button>
        <button
          type="button"
          className={`flex-1 py-1 rounded-lg border text-[10px] ${showPrompt ? "border-black bg-gray-50" : "border-gray-200"}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => patch({ showPrompt: !showPrompt })}
        >
          {t("loopPromptToggle")}
        </button>
      </div>

      {imageInput ? (
        <div className="mb-2 text-[10px] text-gray-500">
          {imageRefCount
            ? t("loopImageWillOutput", { n: imageRefCount })
            : t("loopImageEmpty")}
        </div>
      ) : null}

      {showPrompt ? (
        <textarea
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs min-h-[56px] mb-2 focus:border-black outline-none"
          value={String(settings.variablePrompt || "")}
          placeholder={t("loopVariablePlaceholder")}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => patch({ variablePrompt: e.target.value })}
          data-testid={`loop-variable-${node.id}`}
        />
      ) : null}

      {preview ? (
        <p className="text-[10px] text-gray-500 mb-2 line-clamp-3" data-testid={`loop-preview-${node.id}`}>
          {preview}
        </p>
      ) : null}

      {cascadeTarget && onRunCascade ? (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 py-1.5 border border-gray-200 rounded-lg hover:border-black text-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onRunCascade(cascadeTarget, count, mode)}
          data-testid={`loop-cascade-${node.id}`}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          {t("loopCascadeStart", { nodes: 1, rounds: count })}
        </button>
      ) : null}
    </div>
  );
}
