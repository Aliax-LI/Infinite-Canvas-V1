import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  defaultLtxTimelineJson,
  ltxDirectorSyncSeconds,
  parseLtxTimeline,
  readLtxTimeline,
  syncConnectedImagesToTimeline,
  type LtxSegment,
} from "../core/ltxTimeline";
import { useLegacyCanvasStore } from "../core/state";
import type { LegacyNode } from "../core/types";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";

interface LtxDirectorTimelineProps {
  node: LegacyNode;
  onUpdateSettings: (patch: Record<string, unknown>) => void;
}

export function LtxDirectorTimeline({
  node,
  onUpdateSettings,
}: LtxDirectorTimelineProps) {
  const { t } = useTranslation("canvas");
  const nodes = useLegacyCanvasStore((s) => s.nodes);
  const connections = useLegacyCanvasStore((s) => s.connections);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const settings = node.settings ?? {};
  const timeline = useMemo(() => readLtxTimeline(node), [node.settings?.ltxTimelineData]);
  const totalFrames = Math.max(1, Number(settings.durationFrames) || 120);

  useEffect(() => {
    if (!settings.ltxTimelineData) {
      onUpdateSettings({
        ltxTimelineData: defaultLtxTimelineJson(Number(settings.frameRate) || 24),
        durationFrames: 120,
        durationSeconds: 5,
        frameRate: 24,
      });
    }
  }, [settings.ltxTimelineData, settings.frameRate, onUpdateSettings]);

  const selected = timeline.segments.find((s) => s.id === selectedId) ?? null;

  const writeTimeline = (segments: LtxSegment[], audioSegments = timeline.audioSegments) => {
    onUpdateSettings({
      ltxTimelineData: JSON.stringify({ segments, audioSegments }),
    });
  };

  const patchParams = (patch: Record<string, unknown>) => {
    const next = ltxDirectorSyncSeconds({ ...settings, ...patch });
    onUpdateSettings(next);
  };

  const handleSyncImages = () => {
    const synced = syncConnectedImagesToTimeline(node, nodes, connections);
    onUpdateSettings(synced.settings);
  };

  const addSegment = (type: "text" | "image") => {
    const lastEnd = timeline.segments.reduce(
      (m, s) => Math.max(m, (Number(s.start) || 0) + (Number(s.length) || 0)),
      0,
    );
    const seg: LtxSegment = {
      id: crypto.randomUUID(),
      start: lastEnd,
      length: Math.max(6, Number(settings.frameRate) || 24),
      prompt: "",
      type,
    };
    const next = [...timeline.segments, seg];
    writeTimeline(next);
    setSelectedId(seg.id);
  };

  const updateSegment = (id: string, patch: Partial<LtxSegment>) => {
    writeTimeline(
      timeline.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const removeSegment = (id: string) => {
    writeTimeline(timeline.segments.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="px-2 pb-2" data-testid={`ltx-timeline-editor-${node.id}`}>
      <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">{t("ltxDurationSec")}</span>
          <input
            type="number"
            className="border border-gray-200 rounded-lg px-2 py-1"
            value={Number(settings.durationSeconds) || 5}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              patchParams({
                durationSeconds: Number(e.target.value) || 5,
                durationFrames: Math.round(
                  (Number(e.target.value) || 5) * (Number(settings.frameRate) || 24),
                ),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">{t("ltxFps")}</span>
          <input
            type="number"
            className="border border-gray-200 rounded-lg px-2 py-1"
            value={Number(settings.frameRate) || 24}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => patchParams({ frameRate: Number(e.target.value) || 24 })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">{t("ltxDurationFrames")}</span>
          <input
            type="number"
            className="border border-gray-200 rounded-lg px-2 py-1"
            value={Number(settings.durationFrames) || 120}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => patchParams({ durationFrames: Number(e.target.value) || 120 })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">{t("width")}</span>
          <input
            type="number"
            className="border border-gray-200 rounded-lg px-2 py-1"
            value={Number(settings.customWidth) || 0}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => patchParams({ customWidth: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="flex gap-1 mb-2">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-200 rounded-lg hover:border-black"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleSyncImages}
          data-testid={`ltx-sync-images-${node.id}`}
        >
          <RefreshCw className="w-3 h-3" />
          {t("ltxSyncImages")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-200 rounded-lg hover:border-black"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => addSegment("text")}
        >
          <Plus className="w-3 h-3" />
          {t("ltxAddTextSeg")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-200 rounded-lg hover:border-black"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => addSegment("image")}
        >
          <Plus className="w-3 h-3" />
          {t("ltxAddImageSeg")}
        </button>
      </div>

      <div
        className="relative h-16 border border-gray-200 rounded-lg bg-gray-50 mb-2 overflow-hidden"
        data-testid={`ltx-segment-track-${node.id}`}
      >
        {timeline.segments.map((seg) => {
          const left = ((Number(seg.start) || 0) / totalFrames) * 100;
          const width = (Math.max(1, Number(seg.length) || 1) / totalFrames) * 100;
          return (
            <button
              key={seg.id}
              type="button"
              className={`absolute top-1 bottom-1 rounded text-[9px] px-1 truncate border ${
                selectedId === seg.id
                  ? "border-black bg-black text-white"
                  : "border-gray-300 bg-white text-gray-600"
              }`}
              style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
              title={seg.prompt || seg.type}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelectedId(seg.id)}
              data-testid={`ltx-seg-${seg.id}`}
            >
              {seg.type === "image" ? "IMG" : "TXT"}
            </button>
          );
        })}
        {!timeline.segments.length ? (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
            {t("ltxNoSegments")}
          </span>
        ) : null}
      </div>

      {selected ? (
        <div className="border border-gray-200 rounded-lg p-2 mb-2" data-testid="ltx-segment-editor">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 uppercase">{selected.type}</span>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-red-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeSegment(selected.id)}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <label className="text-[10px] text-gray-500 block mb-1">{t("ltxSegLength")}</label>
          <input
            type="number"
            min={1}
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs mb-2"
            value={selected.length}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              updateSegment(selected.id, { length: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <label className="text-[10px] text-gray-500 block mb-1">{t("prompt")}</label>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs min-h-[48px]"
            value={selected.prompt}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => updateSegment(selected.id, { prompt: e.target.value })}
          />
          {selected.type === "image" && selected.imageB64 ? (
            <img
              src={canvasMediaPreviewUrl(selected.imageB64)}
              alt=""
              className="mt-2 h-16 object-cover rounded border border-gray-200"
            />
          ) : null}
        </div>
      ) : null}

      <p className="text-[10px] text-gray-400">
        {t("ltxSegments", { count: timeline.segments.length })}
      </p>
    </div>
  );
}
