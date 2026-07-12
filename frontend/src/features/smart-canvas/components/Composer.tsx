import { useEffect, useMemo, useState } from "react";
import { AtSign, Loader2, Play, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGeneration } from "../hooks/useGeneration";
import { ComposerThumbnails } from "./ComposerThumbnails";
import { MentionPicker } from "./MentionPicker";
import { ComposerEngineFields } from "./ComposerEngineFields";
import { useSmartCanvasStore } from "../core/state";
import { validateComposerForRun } from "../core/generation";
import type { EngineKind } from "../core/types";
import { StudioSelect } from "../../../shared/ui/StudioSelect";

const ENGINES: { id: EngineKind; label: string }[] = [
  { id: "api", label: "API" },
  { id: "volcengine", label: "火山" },
  { id: "modelscope", label: "ModelScope" },
  { id: "comfy", label: "ComfyUI" },
  { id: "runninghub", label: "RunningHub" },
  { id: "openai", label: "OpenAI" },
];

const KIND_OPTIONS = [
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "text", label: "文本" },
];

interface ComposerProps {
  onBeforeGenerate?: () => void;
  onGenerate: (result: {
    url?: string;
    urls?: string[];
    text?: string;
    error?: string;
    jimengPending?: boolean;
    submitId?: string;
    queueInfo?: Record<string, unknown>;
    jimengKind?: string;
    jimengMessage?: string;
  }) => void;
  onCascade?: () => void;
}

export function Composer({ onBeforeGenerate, onGenerate, onCascade }: ComposerProps) {
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

  useEffect(() => {
    const reference = String(composer.params.reference ?? "").trim();
    if (!reference) return;
    setRefs((current) => (current.includes(reference) ? current : [...current, reference]));
  }, [composer.params.reference]);

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

  const validationHint = useMemo(
    () => validateComposerForRun(composer),
    [composer],
  );
  const busy = running || pending;
  const canGenerate = !busy && !validationHint;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    onBeforeGenerate?.();
    setPending(true);
    const result = await generate(refs);
    setPending(result.pending ?? false);
    onGenerate({
      url: result.url,
      urls: result.urls,
      text: result.text,
      error: result.error,
      jimengPending: result.jimengPending,
      submitId: result.submitId,
      queueInfo: result.queueInfo,
      jimengKind: result.jimengKind,
      jimengMessage: result.jimengMessage,
    });
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[color:var(--bg)]/95 backdrop-blur-sm px-4 py-3 shadow-[0_-8px_20px_var(--shadow)]"
      data-testid="composer"
    >
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        {activeComposerNodeId && (
          <span
            className="border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--muted)]"
            data-testid="composer-node-badge"
          >
            节点 {activeComposerNodeId.slice(0, 8)}
          </span>
        )}
        <StudioSelect
          value={composer.engine}
          onChange={(v) => handleComposerChange({ engine: v as EngineKind })}
          options={ENGINES.map((e) => ({ value: e.id, label: e.label }))}
          className="min-w-[7.5rem]"
          data-testid="engine-select"
        />
        <StudioSelect
          value={composer.kind}
          onChange={(v) =>
            handleComposerChange({ kind: v as "image" | "video" | "text" })
          }
          options={KIND_OPTIONS}
          className="min-w-[5.5rem]"
          data-testid="kind-select"
        />
        <ComposerEngineFields
          engine={composer.engine}
          kind={composer.kind}
          params={composer.params}
          paramFields={paramFields}
          onChange={(params) => handleComposerChange({ params })}
        />
      </div>
      <ComposerThumbnails refs={refs} onRemove={(i) => setRefs((r) => r.filter((_, j) => j !== i))} />
      {busy && (
        <p className="mb-2 text-xs text-[var(--muted)] animate-pulse" data-testid="composer-pending">
          {composer.engine === "volcengine" ? "Jimeng 任务排队中..." : "任务处理中..."}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 mb-2" data-testid="composer-error">
          {error}
        </p>
      )}
      {!error && validationHint && (
        <p className="text-xs text-amber-600 mb-2" data-testid="composer-hint">
          {validationHint}
        </p>
      )}
      <div className="flex gap-2 items-end relative">
        <div className="relative self-stretch flex flex-col justify-end">
          <button
            type="button"
            onClick={() => setMentionOpen((v) => !v)}
            className={`border p-2.5 transition-colors ${
              mentionOpen
                ? "border-[var(--text)] bg-[var(--nav-hover-bg)]"
                : "border-[var(--border)] hover:border-[var(--text)]"
            }`}
            data-testid="mention-btn"
            title="@ 引用素材"
            aria-label="@ 引用素材"
            aria-expanded={mentionOpen}
          >
            <AtSign className="w-4 h-4" />
          </button>
          <MentionPicker
            open={mentionOpen}
            onClose={() => setMentionOpen(false)}
            onSelect={(item) => {
              handleComposerChange({
                prompt: `${composer.prompt} @${item.label}`.trim(),
              });
              setRefs((current) =>
                current.includes(item.url) ? current : [...current, item.url],
              );
            }}
          />
        </div>
        <textarea
          value={composer.prompt}
          onChange={(e) => handleComposerChange({ prompt: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "@") setMentionOpen(true);
          }}
          placeholder={t("composer.prompt")}
          className="min-h-[72px] flex-1 resize-none border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-serif text-sm transition-colors focus:border-[var(--text)] focus:outline-none focus:ring-1 focus:ring-black/10"
          data-testid="composer-prompt"
        />
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            title={validationHint ?? undefined}
            className="flex min-w-[7.5rem] items-center justify-center gap-2 bg-[var(--text)] px-4 py-2.5 font-serif text-sm font-medium text-[var(--bg)] transition-colors hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="generate-btn"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {busy ? t("composer.generating", "生成中") : t("composer.generate")}
          </button>
          {onCascade && (
            <button
              type="button"
              onClick={onCascade}
              disabled={busy}
              className="flex items-center justify-center gap-2 border border-[var(--border)] bg-[var(--bg)] px-4 py-2 font-serif text-sm text-[var(--text)] transition-colors hover:border-[var(--text)] disabled:opacity-40"
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
