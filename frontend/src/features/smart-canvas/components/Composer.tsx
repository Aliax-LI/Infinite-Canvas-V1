import { useEffect, useState } from "react";
import { AtSign, Play, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGeneration } from "../hooks/useGeneration";
import { ComposerThumbnails } from "./ComposerThumbnails";
import { MentionPicker } from "./MentionPicker";
import { ComposerEngineFields } from "./ComposerEngineFields";
import { useSmartCanvasStore } from "../core/state";
import type { EngineKind } from "../core/types";

const ENGINES: { id: EngineKind; label: string }[] = [
  { id: "api", label: "API" },
  { id: "volcengine", label: "火山" },
  { id: "modelscope", label: "ModelScope" },
  { id: "comfy", label: "ComfyUI" },
  { id: "runninghub", label: "RunningHub" },
  { id: "openai", label: "OpenAI" },
];

interface ComposerProps {
  onGenerate: (result: { url?: string; error?: string }) => void;
  onCascade?: () => void;
}

export function Composer({ onGenerate, onCascade }: ComposerProps) {
  const { t } = useTranslation("smart-canvas");
  const { composer, setComposer, running, error, loadParams, generate } =
    useGeneration();
  const activeComposerNodeId = useSmartCanvasStore((s) => s.activeComposerNodeId);
  const updateNode = useSmartCanvasStore((s) => s.updateNode);
  const [paramFields, setParamFields] = useState<
    Array<{ key: string; label?: string; type?: string; options?: Array<{ value: string; label: string }> }>
  >([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const persistToNode = (patch: Partial<typeof composer>) => {
    if (!activeComposerNodeId) return;
    const next = { ...composer, ...patch };
    updateNode(activeComposerNodeId, {
      prompt: next.prompt,
      settings: {
        engine: next.engine,
        kind: next.kind,
        params: next.params,
      },
    });
  };

  const handleComposerChange = (patch: Partial<typeof composer>) => {
    setComposer(patch);
    persistToNode(patch);
  };

  useEffect(() => {
    loadParams(composer.engine, composer.kind).then((res) => {
      setParamFields(res.fields ?? []);
    });
  }, [composer.engine, composer.kind, loadParams]);

  const handleGenerate = async () => {
    setPending(true);
    const result = await generate(refs);
    setPending(result.pending ?? false);
    onGenerate({ url: result.url, error: result.error });
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--bg)] p-4"
      data-testid="composer"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {activeComposerNodeId && (
          <span className="text-xs text-[var(--muted)] border border-[var(--border)] px-2 py-1" data-testid="composer-node-badge">
            节点 {activeComposerNodeId.slice(0, 8)}
          </span>
        )}
        <select
          value={composer.engine}
          onChange={(e) =>
            handleComposerChange({ engine: e.target.value as EngineKind })
          }
          className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
          data-testid="engine-select"
        >
          {ENGINES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={composer.kind}
          onChange={(e) =>
            handleComposerChange({
              kind: e.target.value as "image" | "video" | "text",
            })
          }
          className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
        >
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="text">文本</option>
        </select>
        <ComposerEngineFields
          engine={composer.engine}
          kind={composer.kind}
          params={composer.params}
          paramFields={paramFields}
          onChange={(params) => handleComposerChange({ params })}
        />
      </div>
      <ComposerThumbnails refs={refs} onRemove={(i) => setRefs((r) => r.filter((_, j) => j !== i))} />
      {(running || pending) && (
        <p className="text-xs text-[var(--muted)] mb-2 animate-pulse" data-testid="composer-pending">
          {composer.engine === "volcengine" ? "Jimeng 任务排队中..." : "任务处理中..."}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 mb-2" data-testid="composer-error">
          {error}
        </p>
      )}
      <div className="flex gap-2 relative">
        <button
          type="button"
          onClick={() => setMentionOpen((v) => !v)}
          className="self-end p-2 border border-[var(--border)]"
          data-testid="mention-btn"
        >
          <AtSign className="w-4 h-4" />
        </button>
        <MentionPicker
          open={mentionOpen}
          onClose={() => setMentionOpen(false)}
          onSelect={(m) =>
            handleComposerChange({ prompt: `${composer.prompt} ${m}`.trim() })
          }
        />
        <textarea
          value={composer.prompt}
          onChange={(e) => handleComposerChange({ prompt: e.target.value })}
          placeholder={t("composer.prompt")}
          className="flex-1 border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm min-h-[60px] resize-none"
          data-testid="composer-prompt"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white disabled:opacity-50"
            data-testid="generate-btn"
          >
            <Sparkles className="w-4 h-4" />
            {running ? t("composer.generating", "生成中") : t("composer.generate")}
          </button>
          {onCascade && (
            <button
              type="button"
              onClick={onCascade}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--border)]"
              data-testid="cascade-btn"
            >
              <Play className="w-4 h-4" />
              {t("composer.cascade")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
