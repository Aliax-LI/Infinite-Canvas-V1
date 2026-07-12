import { useTranslation } from "react-i18next";
import { Film } from "lucide-react";

/**
 * LTX Director timeline — informational panel only (not mounted on LegacyCanvasPage).
 *
 * In history canvas, LTX Director is a dedicated node type with a full multi-track
 * timeline editor (ltx-director-timeline.js) that drives ComfyUI workflow
 * LTXDirectorv2-API.json for segmented video generation. That editor is not yet
 * ported to React legacy canvas; this panel explains the feature instead of showing
 * a misleading interactive scaffold or redirecting users to Smart Canvas.
 */
export function LtxTimelinePanel() {
  const { t } = useTranslation("canvas");

  return (
    <div className="p-4" data-testid="ltx-timeline-panel">
      <div className="flex items-center gap-2 mb-2">
        <Film className="w-4 h-4 text-gray-500" aria-hidden />
        <h3 className="text-sm font-medium">{t("timeline.title")}</h3>
        <span
          className="ml-auto text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-gray-200 text-gray-500"
          data-testid="ltx-timeline-badge"
        >
          {t("timeline.comingSoon")}
        </span>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed mb-3">
        {t("timeline.description")}
      </p>

      <ul className="text-xs text-gray-500 space-y-1.5 mb-3 list-disc pl-4">
        <li>{t("timeline.bulletSegments")}</li>
        <li>{t("timeline.bulletImages")}</li>
        <li>{t("timeline.bulletComfy")}</li>
      </ul>

      <p className="text-xs text-gray-500 leading-relaxed">
        {t("timeline.smartCanvasHint")}
      </p>
    </div>
  );
}
