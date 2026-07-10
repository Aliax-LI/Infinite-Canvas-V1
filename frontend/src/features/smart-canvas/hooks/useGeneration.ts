import { useCallback, useState } from "react";
import { useSmartCanvasStore } from "../core/state";
import {
  fetchImageParams,
  pollUntilDone,
  submitGeneration,
  type GenerationResult,
} from "../core/generation";
import type { EngineKind } from "../core/types";

export function useGeneration() {
  const composer = useSmartCanvasStore((s) => s.composer);
  const setComposer = useSmartCanvasStore((s) => s.setComposer);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);

  const loadParams = useCallback(async (engine: EngineKind, kind: string) => {
    return fetchImageParams(engine, kind);
  }, []);

  const generate = useCallback(
    async (refs: string[] = []): Promise<GenerationResult> => {
      if (!composer.prompt.trim()) {
        const err = "请输入提示词";
        setError(err);
        return { error: err };
      }
      setRunning(true);
      setError(null);
      try {
        let result = await submitGeneration(composer, refs);
        if (result.pending && result.taskId) {
          result = await pollUntilDone(result.taskId, 60, 2000);
        }
        if (result.error) setError(result.error);
        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "生成失败";
        setError(message);
        return { error: message };
      } finally {
        setRunning(false);
      }
    },
    [composer],
  );

  return {
    composer,
    setComposer,
    running,
    error,
    lastResult,
    loadParams,
    generate,
  };
}
