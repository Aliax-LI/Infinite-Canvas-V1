import { GripVertical, Image, Key, KeyRound, Sparkles, Terminal } from "lucide-react";
import type { DragEvent } from "react";
import { useThemeStore } from "../../../shared/stores/themeStore";
import { cn } from "../../../shared/utils";

export const FIXED_PROVIDER_IDS = new Set(["modelscope", "runninghub", "volcengine"]);
const CLI_PROTOCOLS = new Set(["jimeng", "codex", "gemini-cli"]);

export interface ProviderListItem {
  id: string;
  name: string;
  base_url?: string;
  protocol?: string;
  enabled?: boolean;
  has_key?: boolean;
  has_wallet_key?: boolean;
}

export function isFixedProvider(id: string) {
  return FIXED_PROVIDER_IDS.has(id);
}

export function providerDisplayName(item: ProviderListItem) {
  if (item.id === "modelscope") return "ModelScope";
  if (item.id === "runninghub") return "RunningHub";
  if (item.id === "volcengine") return "火山引擎";
  return item.name || item.id;
}

export function providerSubline(item: ProviderListItem) {
  const protocol = String(item.protocol ?? "openai").toLowerCase();
  if (CLI_PROTOCOLS.has(protocol)) return "CLI 本地工具";
  if (item.base_url) return item.base_url;
  if (item.id === "modelscope") return "https://api-inference.modelscope.cn/v1";
  if (item.id === "runninghub") return "https://www.runninghub.cn";
  if (item.id === "volcengine") return "https://ark.cn-beijing.volces.com/api/v3";
  return "未配置地址";
}

export function providerBadge(item: ProviderListItem) {
  const protocol = String(item.protocol ?? "openai").toLowerCase();
  if (CLI_PROTOCOLS.has(protocol)) return "CLI";
  if (item.id === "runninghub") return "RH";
  if (item.id === "volcengine") return "Ark";
  if (item.id === "modelscope") return "OpenAI";
  const label = protocol.toUpperCase();
  return label.length > 6 ? label.slice(0, 6) : label;
}

function providerStateClass(item: ProviderListItem) {
  const protocol = String(item.protocol ?? "openai").toLowerCase();
  if (item.enabled === false) return "is-disabled";
  if (item.has_key || item.has_wallet_key || CLI_PROTOCOLS.has(protocol)) return "has-key";
  return "missing-key";
}

export function ProviderIcon({ item }: { item: ProviderListItem }) {
  const dark = useThemeStore((s) => s.mode === "dark");

  if (item.id === "modelscope") {
    return (
      <span className="studio-provider-icon studio-provider-icon--brand">
        <img
          src={dark ? "/images/modelscope-1.gif" : "/images/modelscope.gif"}
          alt=""
          className="studio-provider-brand-img"
        />
      </span>
    );
  }
  if (item.id === "runninghub") {
    return (
      <span className="studio-provider-icon studio-provider-icon--brand">
        <img
          src={dark ? "/images/RunningHub-W.png" : "/images/RunningHub-B.png"}
          alt=""
          className="studio-provider-brand-img studio-provider-brand-img--rh"
        />
      </span>
    );
  }
  if (item.id === "volcengine") {
    return (
      <span className="studio-provider-icon studio-provider-icon--brand">
        <img
          src={dark ? "/images/volcengine-theme-dark.svg" : "/images/volcengine-theme-light.svg"}
          alt=""
          className="studio-provider-brand-img studio-provider-brand-img--volc"
        />
      </span>
    );
  }

  const protocol = String(item.protocol ?? "openai").toLowerCase();
  if (CLI_PROTOCOLS.has(protocol)) {
    const Icon = protocol === "codex" ? Terminal : protocol === "gemini-cli" ? Sparkles : Image;
    return (
      <span className="studio-provider-icon">
        <Icon className="w-4 h-4" />
      </span>
    );
  }

  const KeyIcon = item.has_key || item.has_wallet_key ? KeyRound : Key;
  return (
    <span className="studio-provider-icon">
      <KeyIcon className="w-4 h-4" />
    </span>
  );
}

interface ProviderCardProps {
  item: ProviderListItem;
  active: boolean;
  sortable: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onSelect: () => void;
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void;
  onDrop: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}

export function ProviderCard({
  item,
  active,
  sortable,
  dragging,
  dropTarget,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ProviderCardProps) {
  return (
    <button
      type="button"
      className={cn(
        "studio-provider-card-v2",
        active && "active",
        sortable && "sortable",
        dragging && "is-dragging",
        dropTarget && "drop-target",
        providerStateClass(item),
      )}
      data-testid={`provider-row-${item.id}`}
      draggable={sortable}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="studio-provider-drag-gutter" aria-hidden>
        <span className="studio-provider-drag-handle">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      </span>
      <ProviderIcon item={item} />
      <span className="studio-provider-info">
        <span className="studio-provider-name">{providerDisplayName(item)}</span>
        <span className="studio-provider-meta">{providerSubline(item)}</span>
      </span>
      <span className="studio-provider-badge">{providerBadge(item)}</span>
    </button>
  );
}
