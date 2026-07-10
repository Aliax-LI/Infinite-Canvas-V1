import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Image,
  Layers,
  RotateCw,
  Globe,
  Wrench,
  FolderOpen,
} from "lucide-react";

const tools = [
  { to: "/enhance", labelKey: "tools.enhance", icon: Sparkles, descKey: "tools.enhanceDesc" },
  { to: "/klein", labelKey: "tools.klein", icon: Image, descKey: "tools.kleinDesc" },
  { to: "/zimage", labelKey: "tools.zimage", icon: Layers, descKey: "tools.zimageDesc" },
  { to: "/angle", labelKey: "tools.angle", icon: RotateCw, descKey: "tools.angleDesc" },
  { to: "/online", labelKey: "tools.online", icon: Globe, descKey: "tools.onlineDesc" },
] as const;

export function ToolsHubPage() {
  const { t } = useTranslation("studio");

  return (
    <div className="h-full overflow-auto p-8" data-testid="tools-hub-page">
      <div className="flex items-center gap-3 mb-8">
        <Wrench className="w-6 h-6" />
        <h1 className="text-2xl font-semibold">{t("tools.title")}</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl">
        {tools.map(({ to, labelKey, icon: Icon, descKey }) => (
          <Link
            key={to}
            to={to}
            className="border border-[var(--border)] p-6 hover:bg-[var(--nav-hover-bg)]"
            data-testid={`tool-link-${to.slice(1)}`}
          >
            <Icon className="w-8 h-8 mb-3" />
            <h2 className="font-medium">{t(labelKey)}</h2>
            <p className="text-sm text-[var(--muted)] mt-1">{t(descKey)}</p>
          </Link>
        ))}
        <Link
          to="/assets"
          className="border border-[var(--border)] p-6 hover:bg-[var(--nav-hover-bg)]"
          data-testid="tool-link-assets"
        >
          <FolderOpen className="w-8 h-8 mb-3" />
          <h2 className="font-medium">{t("assets.title")}</h2>
          <p className="text-sm text-[var(--muted)] mt-1">{t("tools.assetLibraryDesc")}</p>
        </Link>
      </div>
    </div>
  );
}
