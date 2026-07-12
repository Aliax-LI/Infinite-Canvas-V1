import { useLegacyCanvasStore } from "../core/state";
import type { LegacyNode } from "../core/types";

interface GroupNodeBodyProps {
  node: LegacyNode;
}

export function GroupNodeBody({ node }: GroupNodeBodyProps) {
  const nodes = useLegacyCanvasStore((s) => s.nodes);
  const itemIds = Array.isArray(node.settings?.items)
    ? (node.settings.items as string[])
    : [];
  const children = itemIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is LegacyNode => Boolean(n));

  return (
    <div className="px-2 pb-2" data-node-control="" data-testid={`group-node-body-${node.id}`}>
      <p className="text-xs text-gray-500 mb-2">{children.length} items</p>
      <div className="flex flex-wrap gap-1">
        {children.map((child) => (
          <span
            key={child.id}
            className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600"
          >
            {child.title || child.kind}
          </span>
        ))}
      </div>
    </div>
  );
}
