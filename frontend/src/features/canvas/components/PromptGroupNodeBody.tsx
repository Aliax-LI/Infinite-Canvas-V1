import { useTranslation } from "react-i18next";
import { useLegacyCanvasStore } from "../core/state";
import type { LegacyNode } from "../core/types";

interface PromptGroupNodeBodyProps {
  node: LegacyNode;
}

export function PromptGroupNodeBody({ node }: PromptGroupNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const nodes = useLegacyCanvasStore((s) => s.nodes);
  const itemIds = Array.isArray(node.settings?.items)
    ? (node.settings.items as string[])
    : [];
  const prompts = itemIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is LegacyNode => Boolean(n));

  return (
    <div className="px-2 pb-2" data-node-control="" data-testid={`prompt-group-body-${node.id}`}>
      <p className="text-[11px] text-gray-400 mb-2">
        {t("promptGroupCount", { count: prompts.length })}
      </p>
      <div className="space-y-1 max-h-32 overflow-auto">
        {prompts.map((p) => (
          <div
            key={p.id}
            className="text-[10px] text-gray-600 border border-gray-100 rounded px-2 py-1 line-clamp-2"
          >
            {p.prompt || p.title || p.id}
          </div>
        ))}
      </div>
    </div>
  );
}
