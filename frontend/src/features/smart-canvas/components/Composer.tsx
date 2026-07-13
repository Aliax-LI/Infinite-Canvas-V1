import { useEffect, useMemo, useState } from "react";
import { AtSign, Image, Film, Library, Loader2, Sparkles, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGeneration } from "../hooks/useGeneration";
import { ComposerThumbnails } from "./ComposerThumbnails";
import { MentionPicker } from "./MentionPicker";
import { ComposerEngineFields } from "./ComposerEngineFields";
import { useSmartCanvasStore } from "../core/state";
import { validateComposerForRun } from "../core/generation";
import { isSmartRunnableTarget } from "../core/applyRunResult";
import type { EngineKind, SmartNode } from "../core/types";
import { StudioSelect } from "../../../shared/ui/StudioSelect";

const ENGINES: { id: EngineKind; label: string }[] = [
  { id: "api", label: "API生成" },
  { id: "volcengine", label: "火山引擎" },
  { id: "modelscope", label: "MS生成" },
  { id: "comfy", label: "ComfyUI生成" },
  { id: "runninghub", label: "RunningHub" },
  { id: "openai", label: "OpenAI" },
];

const COMPOSER_W = 540;
const COMPOSER_GAP = 14;

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
  onOpenTemplates?: () => void;
}

function composerAnchor(node: SmartNode | null) {
  if (!node) return null;
  const w = node.width ?? 280;
  const h = node.height ?? 200;
  return {
    left: node.x + w / 2 - COMPOSER_W / 2,
    top: node.y + h + COMPOSER_GAP,
  };
}

/**
 * History-aligned floating composer: world-space card under the selected
 * runnable node (image / video / group / workflow). Not a bottom dock.
 */
export function Composer({
  onBeforeGenerate,
  onGenerate,
  onCascade,
  onOpenTemplates,
}: ComposerProps) {
  const { t } = useTranslation("smart-canvas");
  const { composer, setComposer, running, error, loadParams, generate } =
    useGeneration();
  const selectedNodeId = useSmartCanvasStore((s) => s.selectedNodeId);
  const nodes = useSmartCanvasStore((s) => s.nodes);
  const activeComposerNodeId = useSmartCanvasStore((s) => s.activeComposerNodeId);
  const updateNode = useSmartCanvasStore((s) => s.updateNode);
  const [paramFields, setParamFields] = useState<
    Array<{ key: string; label?: string; type?: string; options?: Array<{ value: string; label: string }> }>
  >([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const subject = useMemo(() => {
    const id = activeComposerNodeId ?? selectedNodeId;
    const node = nodes.find((n) => n.id === id) ?? null;
    return isSmartRunnableTarget(node) ? node : null;
  }, [activeComposerNodeId, selectedNodeId, nodes]);

  const open = Boolean(subject);
  const pos = composerAnchor(subject);

  useEffect(() => {
    const reference = String(composer.params.reference ?? "").trim();
    if (!reference) return;
    setRefs((current) => (current.includes(reference) ? current : [...current, reference]));
  }, [composer.params.reference]);

  const persistToNode = (patch: Partial<typeof composer>) => {
    if (!subject) return;
    const next = { ...composer, ...patch };
    updateNode(subject.id, {
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
  const showKindToggle = composer.engine === "api" || composer.engine === "openai";

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

  if (!open || !pos) return null;

  return (
    <div
      className="absolute z-30 w-[540px] transition-[opacity,transform] duration-150"
      style={{ left: pos.left, top: pos.top }}
      data-testid="composer"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border border-[var(--border)] bg-[var(--bg)]/95 p-2.5 shadow-[0_20px_56px_var(--shadow)] backdrop-blur-xl"
        style={{
          gridTemplateAreas: `"head head" "thumbs thumbs" "prompt prompt" "params run"`,
        }}
      >
        {/* Head: engine + kind toggle */}
        <div className="flex items-center justify-between gap-2" style={{ gridArea: "head" }}>
          <div className="flex min-w-0 items-center gap-1.5">
            <StudioSelect
              value={composer.engine}
              onChange={(v) => handleComposerChange({ engine: v as EngineKind })}
              options={ENGINES.map((e) => ({ value: e.id, label: e.label }))}
              className="min-w-[7.5rem] text-[11px]"
              data-testid="engine-select"
            />
            {showKindToggle ? (
              <div className="flex border border-[var(--border)]" data-testid="kind-toggle">
                <button
                  type="button"
                  className={`flex h-[26px] items-center gap-1 px-2 text-[10.5px] font-semibold ${
                    composer.kind === "image"
                      ? "bg-[var(--text)] text-[var(--bg)]"
                      : "text-[var(--muted)] hover:bg-[var(--nav-hover-bg)]"
                  }`}
                  data-testid="kind-image"
                  onClick={() => handleComposerChange({ kind: "image" })}
                >
                  <Image className="h-3 w-3" />
                  图片
                </button>
                <button
                  type="button"
                  className={`flex h-[26px] items-center gap-1 px-2 text-[10.5px] font-semibold ${
                    composer.kind === "video"
                      ? "bg-[var(--text)] text-[var(--bg)]"
                      : "text-[var(--muted)] hover:bg-[var(--nav-hover-bg)]"
                  }`}
                  data-testid="kind-video"
                  onClick={() => handleComposerChange({ kind: "video" })}
                >
                  <Film className="h-3 w-3" />
                  视频
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ gridArea: "thumbs" }}>
          <ComposerThumbnails refs={refs} onRemove={(i) => setRefs((r) => r.filter((_, j) => j !== i))} />
        </div>

        {/* Prompt */}
        <div className="relative" style={{ gridArea: "prompt" }}>
          <textarea
            value={composer.prompt}
            onChange={(e) => handleComposerChange({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "@") setMentionOpen(true);
            }}
            placeholder={t("promptPlaceholder", {
              defaultValue: "描述你想生成或编辑的图片...",
            })}
            className="min-h-[124px] w-full resize-y border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 pr-12 text-sm transition-colors focus:border-[var(--text)] focus:outline-none"
            data-testid="composer-prompt"
          />
          <button
            type="button"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center border border-[var(--border)] bg-[var(--soft,var(--nav-hover-bg))] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
            title={t("promptTemplateLibrary", { defaultValue: "模板库" })}
            data-testid="composer-template-btn"
            onClick={() => onOpenTemplates?.()}
          >
            <Library className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMentionOpen((v) => !v)}
            className={`absolute bottom-2 left-2 border p-1.5 ${
              mentionOpen
                ? "border-[var(--text)] bg-[var(--nav-hover-bg)]"
                : "border-[var(--border)] hover:border-[var(--text)]"
            }`}
            data-testid="mention-btn"
            title="@ 引用素材"
            aria-label="@ 引用素材"
            aria-expanded={mentionOpen}
          >
            <AtSign className="h-3.5 w-3.5" />
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

        {/* Params */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" style={{ gridArea: "params" }}>
          <ComposerEngineFields
            engine={composer.engine}
            kind={composer.kind}
            params={composer.params}
            paramFields={paramFields}
            onChange={(params) => handleComposerChange({ params })}
          />
          {busy ? (
            <p className="w-full text-[10.5px] text-[var(--muted)] animate-pulse" data-testid="composer-pending">
              {composer.engine === "volcengine" ? "Jimeng 任务排队中..." : "任务处理中..."}
            </p>
          ) : null}
          {error ? (
            <p className="w-full text-[10.5px] text-red-600" data-testid="composer-error">
              {error}
            </p>
          ) : null}
          {!error && validationHint ? (
            <p className="w-full text-[10.5px] text-amber-600" data-testid="composer-hint">
              {validationHint}
            </p>
          ) : null}
        </div>

        {/* Run */}
        <div className="flex flex-col items-stretch justify-end gap-1.5" style={{ gridArea: "run" }}>
          {onCascade ? (
            <button
              type="button"
              onClick={onCascade}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold hover:border-[var(--text)] disabled:opacity-40"
              data-testid="cascade-btn"
            >
              <Workflow className="h-3.5 w-3.5" />
              一键运行
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            title={validationHint ?? undefined}
            className="flex min-w-[5.5rem] items-center justify-center gap-1.5 bg-[var(--text)] px-3 py-2 text-[11px] font-extrabold text-[var(--bg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="generate-btn"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {busy ? t("composer.generating", "生成中") : t("run", { defaultValue: "运行" })}
          </button>
        </div>
      </div>
    </div>
  );
}
