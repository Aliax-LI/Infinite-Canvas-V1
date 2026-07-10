import { useCallback, useMemo, useState } from "react";
import type { FrameMarker, TimelineClip, TimelineSettings, TimelineState } from "./types";
import { DEFAULT_TIMELINE_SETTINGS } from "./types";

function parseInitial(raw?: Partial<TimelineState>) {
  return {
    clips: raw?.clips ?? [],
    settings: { ...DEFAULT_TIMELINE_SETTINGS, ...raw?.settings },
    currentTime: raw?.currentTime ?? 0,
  };
}

export function useTimeline(initial?: Partial<TimelineState>) {
  const [clips, setClips] = useState<TimelineClip[]>(() => parseInitial(initial).clips);
  const [settings, setSettingsState] = useState<TimelineSettings>(
    () => parseInitial(initial).settings,
  );
  const [currentTime, setCurrentTime] = useState(() => parseInitial(initial).currentTime);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const total = Math.max(
    8,
    clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
  );

  const tracks = useMemo(() => {
    const trackIds = new Set(clips.map((c) => c.track ?? 0));
    if (!trackIds.size) return [0];
    return [...trackIds].sort((a, b) => a - b);
  }, [clips]);

  const frameRuler = useMemo((): FrameMarker[] => {
    const markers: FrameMarker[] = [];
    const step = total <= 10 ? 1 : total <= 30 ? 5 : 10;
    for (let t = 0; t <= total; t += step) {
      const frame = Math.round(t * settings.fps);
      markers.push({ frame, time: t, label: `${t}s` });
    }
    return markers;
  }, [total, settings.fps]);

  const getState = useCallback(
    (): TimelineState => ({ clips, settings, currentTime }),
    [clips, settings, currentTime],
  );

  const addClip = useCallback(
    (track = 0) => {
      const lastEnd = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
      const clip: TimelineClip = {
        id: crypto.randomUUID(),
        label: `片段 ${clips.length + 1}`,
        start: lastEnd,
        duration: 3,
        prompt: "",
        track,
      };
      setClips((prev) => [...prev, clip]);
      setSelectedId(clip.id);
    },
    [clips],
  );

  const removeClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const moveClip = useCallback((id: string, start: number) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, start: Math.max(0, start) } : c)),
    );
  }, []);

  const updateClipPrompt = useCallback((id: string, prompt: string) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, prompt } : c)));
  }, []);

  const updateSettings = useCallback((patch: Partial<TimelineSettings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const scrubTo = useCallback(
    (time: number) => {
      setCurrentTime(Math.max(0, Math.min(time, total)));
    },
    [total],
  );

  return {
    clips,
    total,
    settings,
    currentTime,
    selectedId,
    frameRuler,
    tracks,
    setSelectedId,
    addClip,
    removeClip,
    moveClip,
    updateClipPrompt,
    updateSettings,
    scrubTo,
    getState,
  };
}
