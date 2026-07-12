import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Image,
  Globe,
  FolderOpen,
  Zap,
  PenLine,
  Box,
} from "lucide-react";

const tools = [
  {
    to: "/zimage",
    labelKey: "tools.zimage",
    descKey: "textToImageDesc",
    icon: Image,
    tagKeys: ["tagLocal", "tagCloud"] as const,
  },
  {
    to: "/enhance",
    labelKey: "tools.enhance",
    descKey: "enhanceDesc",
    icon: Zap,
    tagKeys: ["tagLocal"] as const,
  },
  {
    to: "/klein",
    labelKey: "tools.klein",
    descKey: "imageEditDesc",
    icon: PenLine,
    tagKeys: ["tagLocal", "tagCloud"] as const,
  },
  {
    to: "/angle",
    labelKey: "tools.angle",
    descKey: "angleDesc",
    icon: Box,
    tagKeys: ["tagLocal", "tagCloud"] as const,
  },
  {
    to: "/online",
    labelKey: "tools.online",
    descKey: "tools.onlineDesc",
    icon: Globe,
    tagKeys: ["tagCloud"] as const,
    useStudioNs: true,
  },
] as const;

export function ToolsHubPage() {
  const { t: tStudio } = useTranslation("studio");
  const { t: tTools } = useTranslation("tools");

  return (
    <div className="studio-tools-hub" data-testid="tools-hub-page">
      <header className="studio-tools-hub-head">
        <h1 className="studio-tools-hub-title">{tTools("title")}</h1>
        <p className="studio-tools-hub-sub">{tTools("subtitle")}</p>
      </header>

      <div className="studio-tools-grid">
        {tools.map(({ to, labelKey, descKey, icon: Icon, tagKeys, useStudioNs }) => (
          <Link
            key={to}
            to={to}
            className="studio-tool-card"
            data-testid={`tool-link-${to.slice(1)}`}
          >
            <div className="studio-tool-card-icon">
              <Icon className="w-5 h-5" />
            </div>
            <div className="studio-tool-card-name">
              {useStudioNs ? tStudio(labelKey) : tStudio(labelKey)}
            </div>
            <p className="studio-tool-card-desc">
              {useStudioNs ? tStudio(descKey) : tTools(descKey)}
            </p>
            <div className="studio-tool-card-tags" data-testid={`tool-tags-${to.slice(1)}`}>
              {tagKeys.map((tagKey) => (
                <span key={tagKey} className="studio-tool-card-tag">
                  {tTools(tagKey)}
                </span>
              ))}
            </div>
          </Link>
        ))}

        <Link to="/assets" className="studio-tool-card" data-testid="tool-link-assets">
          <div className="studio-tool-card-icon">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="studio-tool-card-name">{tStudio("assets.title")}</div>
          <p className="studio-tool-card-desc">{tStudio("tools.assetLibraryDesc")}</p>
          <div className="studio-tool-card-tags" data-testid="tool-tags-assets">
            <span className="studio-tool-card-tag">{tTools("tagLibrary")}</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
