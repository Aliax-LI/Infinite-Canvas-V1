import { useCallback, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { usePointerDrag } from "../../../shared/hooks/usePointerDrag";
import type { TimelineClip } from "./types";
import { useTimeline } from "./useTimeline";
import {
  parseTimelineFromSettings,
  serializeTimeline,
  type TimelineState,
} from "./types";

interface TimelineProps {
  canvasId: string;
  timelineSettings?: unknown;
  onTimelineChange?: (data: Record<string, unknown>) => void;
}

function ClipBlock({
  clip,
  total,
  trackIndex,
  trackCount,
  selected,
  onSelect,
  onDrag,
  onRemove,
}: {
  clip: TimelineClip;
  total: number;
  trackIndex: number;
  trackCount: number;
  selected: boolean;
  onSelect: () => void;
  onDrag: (id: string, start: number) => void;
  onRemove: (id: string) => void;
}) {
  const drag = usePointerDrag({
    onStart: onSelect,
    onMove: (_x, _y, dx) => {
      const deltaSec = (dx / 300) * total;
      onDrag(clip.id, Math.max(0, clip.start + deltaSec));
    },
  });

  const trackH = 100 / trackCount;

  return (
    <div
      className={`absolute text-white text-xs px-2 flex items-center justify-between group cursor-grab active:cursor-grabbing ${
        selected ? "bg-blue-600" : "bg-black/80"
      }`}
      style={{
        left: `${(clip.start / total) * 100}%`,
        width: `${(clip.duration / total) * 100}%`,
        top: `${trackIndex * trackH}%`,
        height: `${trackH - 4}%`,
      }}
      data-testid={`timeline-clip-${clip.id}`}
      {...drag}
    >
      <span className="truncate">{clip.label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(clip.id);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/20"
        data-testid={`timeline-remove-${clip.id}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function Timeline({
  canvasId,
  timelineSettings,
  onTimelineChange,
}: TimelineProps) {
  const initial = parseTimelineFromSettings(timelineSettings) ?? undefined;
  const {
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
  } = useTimeline(initial);

  useEffect(() => {
    onTimelineChange?.(serializeTimeline(getState()));
  }, [clips, settings, currentTime, onTimelineChange, getState]);

  const handleScrubDrag = useCallback(
    (dx: number, width: number) => {
      const delta = (dx / width) * total;
      scrubTo(currentTime + delta);
    },
    [currentTime, scrubTo, total],
  );

  const scrubDrag = usePointerDrag({
    onMove: (_x, _y, dx, _dy, _start, el) => {
      const width = el?.parentElement?.clientWidth ?? 300;
      handleScrubDrag(dx, width);
    },
  });

  const selectedClip = clips.find((c) => c.id === selectedId);

  return (
    <div data-testid="ltx-timeline" data-canvas-id={canvasId}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">LTX 时间线</h3>
        <button
          type="button"
          onClick={() => addClip(0)}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-[var(--border)] hover:bg-[var(--nav-hover-bg)]"
          data-testid="timeline-add-btn"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      <div
        className="grid grid-cols-3 gap-2 mb-3 text-xs"
        data-testid="timeline-settings"
      >
        <label className="flex flex-col gap-1">
          FPS
          <input
            type="number"
            min={1}
            max={120}
            value={settings.fps}
            onChange={(e) =>
              updateSettings({ fps: Number(e.target.value) || 24 })
            }
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            data-testid="timeline-fps-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          分辨率
          <select
            value={settings.resolution}
            onChange={(e) => updateSettings({ resolution: e.target.value })}
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            data-testid="timeline-resolution-select"
          >
            <option value="1280x720">1280×720</option>
            <option value="1920x1080">1920×1080</option>
            <option value="1024x1024">1024×1024</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Seed
          <input
            type="number"
            value={settings.seed}
            onChange={(e) =>
              updateSettings({ seed: Number(e.target.value) || 0 })
            }
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            data-testid="timeline-seed-input"
          />
        </label>
      </div>

      <div
        className="relative h-4 mb-1 border-b border-[var(--border)]"
        data-testid="timeline-frame-ruler"
      >
        {frameRuler.map((m) => (
          <span
            key={m.frame}
            className="absolute text-[10px] text-[var(--muted)] -translate-x-1/2"
            style={{ left: `${(m.time / total) * 100}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div
        className="relative h-20 border border-[var(--border)] bg-[var(--nav-hover-bg)]"
        data-testid="timeline-track"
      >
        {tracks.map((track) =>
          clips
            .filter((c) => (c.track ?? 0) === track)
            .map((clip) => (
              <ClipBlock
                key={clip.id}
                clip={clip}
                total={total}
                trackIndex={track}
                trackCount={tracks.length}
                selected={selectedId === clip.id}
                onSelect={() => setSelectedId(clip.id)}
                onDrag={moveClip}
                onRemove={removeClip}
              />
            )),
        )}
        {clips.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            暂无片段
          </p>
        )}
      </div>

      <div className="relative mt-2 h-6" data-testid="timeline-scrubber">
        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[var(--border)]" />
        <div
          className="absolute top-0 w-2 h-6 bg-black cursor-ew-resize -translate-x-1/2"
          style={{ left: `${(currentTime / total) * 100}%` }}
          data-testid="timeline-scrub-handle"
          {...scrubDrag.handlers}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.01}
          value={currentTime}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          data-testid="timeline-scrub-input"
        />
      </div>

      {selectedClip && (
        <div className="mt-3" data-testid="timeline-clip-prompt">
          <label className="text-xs text-[var(--muted)] block mb-1">
            片段提示词 · {selectedClip.label}
          </label>
          <textarea
            value={selectedClip.prompt ?? ""}
            onChange={(e) => updateClipPrompt(selectedClip.id, e.target.value)}
            className="w-full h-16 border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
            data-testid="timeline-prompt-input"
          />
        </div>
      )}

      <p className="text-xs text-[var(--muted)] mt-2">
        {currentTime.toFixed(2)}s / {total.toFixed(1)}s · {clips.length} 个片段 ·{" "}
        {tracks.length} 轨
      </p>
    </div>
  );
}

export type { TimelineState };
