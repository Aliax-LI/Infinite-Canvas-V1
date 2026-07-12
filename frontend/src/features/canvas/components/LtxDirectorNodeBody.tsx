import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLegacyCanvasStore } from "../core/state";
import type { LegacyNode } from "../core/types";

interface LtxDirectorNodeBodyProps {
  node: LegacyNode;
}

export function LtxDirectorNodeBody({ node }: LtxDirectorNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const connections = useLegacyCanvasStore((s) => s.connections);
  const nodes = useLegacyCanvasStore((s) => s.nodes);

  const wiredImages = useMemo(() => {
    return connections
      .filter((c) => c.to === node.id)
      .map((c) => nodes.find((n) => n.id === c.from))
      .filter((n): n is LegacyNode => Boolean(n))
      .filter((n) => n.kind === "image" || n.kind === "group" || n.kind === "output")
      .map((n) => ({
        id: n.id,
        title: n.title,
        url: n.images?.[0]?.url ?? "",
      }));
  }, [connections, node.id, nodes]);

  const segments = Array.isArray(node.settings?.segments)
    ? (node.settings.segments as unknown[])
    : [];

  return (
    <div className="px-2 pb-2 text-xs text-gray-600" data-node-control="" data-testid={`ltx-body-${node.id}`}>
      <p className="mb-2 text-gray-500">{t("timeline.description")}</p>
      <div className="flex gap-3 mb-2">
        <span data-testid={`ltx-wired-count-${node.id}`}>
          {t("ltxWiredImages", { count: wiredImages.length })}
        </span>
        <span data-testid={`ltx-segment-count-${node.id}`}>
          {t("ltxSegments", { count: segments.length })}
        </span>
      </div>
      {wiredImages.length ? (
        <ul className="space-y-1 max-h-20 overflow-auto">
          {wiredImages.map((img) => (
            <li key={img.id} className="truncate text-[10px] text-gray-500">
              {img.title || img.id}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-gray-400">{t("ltxNoWiredImages")}</p>
      )}
      <p className="mt-2 text-[10px] text-gray-400">{t("timeline.comingSoon")}</p>
    </div>
  );
}
