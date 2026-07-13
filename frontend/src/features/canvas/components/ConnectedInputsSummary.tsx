import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";
import type { GeneratorSource } from "../core/nodeSources";

interface ConnectedInputsSummaryProps {
  sources: GeneratorSource[];
  nodeId: string;
  /** Show empty hint when no image inputs (history generator always shows list). */
  showEmptyImagesHint?: boolean;
  /** When false, omit the IMAGES block entirely (e.g. ZImage tab). */
  showImagesSection?: boolean;
  /** Dashed empty drop-zone styling (history MS / Klein). */
  emptyImagesDashed?: boolean;
}

function promptLabel(src: GeneratorSource): string {
  const text = (src.prompt || "").trim();
  if (!text) return src.id;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function imageLabel(src: GeneratorSource, index: number): string {
  const name = src.refs[0]?.name?.trim();
  if (name) return name;
  return `图${index + 1}`;
}

/** Fork-first UI from history `renderPromptPreview` + `renderImageInputList`. */
export function ConnectedInputsSummary({
  sources,
  nodeId,
  showEmptyImagesHint = true,
  showImagesSection = true,
  emptyImagesDashed = false,
}: ConnectedInputsSummaryProps) {
  const { t } = useTranslation("canvas");
  const promptInputs = sources.filter((s) => s.prompt && !s.refs.length);
  const imageInputs = sources.filter((s) => s.refs.some((r) => r.url));

  if (
    !promptInputs.length &&
    !imageInputs.length &&
    !(showEmptyImagesHint && showImagesSection)
  ) {
    return null;
  }

  return (
    <div
      className="space-y-1.5"
      data-testid={`legacy-connected-inputs-${nodeId}`}
      data-node-control=""
    >
      {promptInputs.length > 0 ? (
        <div data-testid={`legacy-prompt-list-${nodeId}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
            {t("connectedPrompts", {
              defaultValue: "Prompts",
              count: promptInputs.length,
            })}{" "}
            · {promptInputs.length}
          </div>
          <div className="flex flex-col gap-1">
            {promptInputs.map((src) => (
              <div
                key={src.id}
                className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 line-clamp-2"
                title={src.prompt}
                data-testid={`legacy-wired-prompt-${src.id}`}
              >
                {promptLabel(src)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showImagesSection ? (
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
          {t("images")}
          {imageInputs.length > 0 ? ` · ${imageInputs.length}` : ""}
        </div>
        {imageInputs.length === 0 ? (
          showEmptyImagesHint ? (
            <div
              className={
                emptyImagesDashed
                  ? "text-[11px] text-gray-300 py-4 px-2 text-center border border-dashed border-gray-200 bg-gray-50/60"
                  : "text-[11px] text-gray-300 py-1"
              }
              data-testid={`legacy-input-images-empty-${nodeId}`}
            >
              {t("inputImagesEmpty")}
            </div>
          ) : null
        ) : (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`legacy-input-list-${nodeId}`}
          >
            {imageInputs.map((src, i) => {
              const url = src.refs.find((r) => r.url)?.url || "";
              const preview = url ? canvasMediaPreviewUrl(url) : "";
              return (
                <div
                  key={src.id}
                  className="relative w-[72px] flex-none"
                  title={imageLabel(src, i)}
                  data-testid={`legacy-wired-image-${src.id}`}
                >
                  <div className="relative h-[72px] border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                    <span className="absolute top-0.5 left-0.5 z-10 text-[9px] font-bold bg-black/70 text-white px-1">
                      {i + 1}
                    </span>
                    {preview ? (
                      <img
                        src={preview}
                        alt={imageLabel(src, i)}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-400" aria-hidden />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[9px] font-bold text-slate-500">
                    {imageLabel(src, i)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      ) : null}
    </div>
  );
}
