import { ExternalLink, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StudioTabs } from "../../../shared/ui/StudioTabs";
import type { KeyRegion, ProviderKeyLinkGroup } from "./providerKeyLinks";
import { VOLCENGINE_KEY_URLS } from "./providerKeyLinks";

interface KeyRegionTabsProps {
  region: KeyRegion;
  onRegionChange: (region: KeyRegion) => void;
  testIdPrefix: string;
  className?: string;
}

export function KeyRegionTabs({
  region,
  onRegionChange,
  testIdPrefix,
  className,
}: KeyRegionTabsProps) {
  const { t } = useTranslation("api-settings");

  const regionTabs = [
    {
      id: "cn" as const,
      label: t("keyRegionDomestic"),
      testId: `${testIdPrefix}-tab-cn`,
    },
    {
      id: "global" as const,
      label: t("keyRegionGlobal"),
      testId: `${testIdPrefix}-tab-global`,
    },
  ];

  return (
    <StudioTabs
      tabs={regionTabs}
      active={region}
      onChange={onRegionChange}
      className={`studio-key-region-tabs${className ? ` ${className}` : ""}`}
      data-testid={`${testIdPrefix}-tabs`}
    />
  );
}

function KeyActionButton({
  href,
  testId,
  label,
}: {
  href: string;
  testId: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="studio-key-action-btn"
      data-testid={testId}
    >
      <KeyRound className="w-3 h-3" />
      {label}
    </a>
  );
}

interface KeyAcquisitionActionsProps {
  groups: ProviderKeyLinkGroup[];
  region: KeyRegion;
  testIdPrefix: string;
}

export function KeyAcquisitionActions({
  groups,
  region,
  testIdPrefix,
}: KeyAcquisitionActionsProps) {
  const { t } = useTranslation("api-settings");

  if (!groups.length) return null;

  return (
    <>
      {groups.map((group, index) => {
        const href = region === "global" ? group.links.global : group.links.cn;
        const label = group.title ? `${group.title} · ${t("getKey")}` : t("getKey");
        return (
          <KeyActionButton
            key={group.title ?? index}
            href={href}
            testId={`${testIdPrefix}-${index}-${region}`}
            label={label}
          />
        );
      })}
    </>
  );
}

export function VolcengineKeyActions() {
  const { t } = useTranslation("api-settings");

  return (
    <>
      <KeyActionButton
        href={VOLCENGINE_KEY_URLS.ark}
        testId="provider-key-link-volc-ark"
        label={t("volcengineArkKey")}
      />
      <KeyActionButton
        href={VOLCENGINE_KEY_URLS.iam}
        testId="provider-key-link-volc-iam"
        label={t("volcengineAssetKeys")}
      />
    </>
  );
}

export function RecommendRegisterLinks({
  registerUrl,
  registerUrlCn,
  presetId,
}: {
  registerUrl: string;
  registerUrlCn?: string;
  presetId: string;
}) {
  const { t } = useTranslation("api-settings");

  if (registerUrlCn) {
    return (
      <div className="studio-recommend-links">
        <a
          href={registerUrl}
          target="_blank"
          rel="noreferrer"
          className="studio-recommend-link"
          data-testid={`recommend-register-global-${presetId}`}
          onClick={(e) => e.stopPropagation()}
        >
          <KeyRound className="w-3 h-3" />
          {t("getKeyGlobal")}
        </a>
        <span className="studio-recommend-link-sep">·</span>
        <a
          href={registerUrlCn}
          target="_blank"
          rel="noreferrer"
          className="studio-recommend-link"
          data-testid={`recommend-register-cn-${presetId}`}
          onClick={(e) => e.stopPropagation()}
        >
          <KeyRound className="w-3 h-3" />
          {t("getKeyCn")}
        </a>
      </div>
    );
  }

  return (
    <div className="studio-recommend-links">
      <a
        href={registerUrl}
        target="_blank"
        rel="noreferrer"
        className="studio-recommend-link"
        data-testid={`recommend-register-${presetId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="w-3 h-3" />
        {t("getKey")}
      </a>
    </div>
  );
}
