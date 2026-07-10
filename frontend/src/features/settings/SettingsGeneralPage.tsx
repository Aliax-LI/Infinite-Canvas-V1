import { Download, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAppInfo, useCheckUpdate } from "../update/hooks";

export function SettingsGeneralPage() {
  const { t } = useTranslation("studio");
  const { data: appInfo } = useAppInfo();
  const { data: updateInfo, refetch, isFetching } = useCheckUpdate();

  return (
    <div className="studio-settings-native" data-testid="settings-page">
      <div className="studio-settings-about-grid">
        <section className="studio-settings-about-hero">
          <div className="studio-settings-about-mark">
            <img src="/images/logo.png" alt="" />
          </div>
          <div>
            <div className="studio-section-kicker">{t("settings.localWorkspace")}</div>
            <h2>Infinite Canvas</h2>
            <p>{t("settings.aboutDesc")}</p>
          </div>
        </section>

        <section className="studio-settings-card">
          <div className="studio-settings-card-head">
            <div>
              <div className="studio-settings-card-title">{t("settings.versionStatus")}</div>
              <p className="studio-settings-card-desc">{t("settings.versionStatusDesc")}</p>
            </div>
            <div
              className={`studio-version-pill ${updateInfo?.updateAvailable ? "has-update" : ""}`}
            >
              {updateInfo?.updateAvailable ? t("settings.updateAvailable") : t("settings.upToDate")}
            </div>
          </div>
          <div className="studio-meta-list">
            <div className="studio-meta-row">
              <span>{t("settings.currentVersion")}</span>
              <strong>v{appInfo?.version ?? "—"}</strong>
            </div>
            {updateInfo?.updateAvailable && (
              <div className="studio-meta-row">
                <span>{t("settings.remoteVersion")}</span>
                <strong>v{updateInfo.latestVersion}</strong>
              </div>
            )}
          </div>
          <div className="studio-row-actions">
            {appInfo?.repo_url && (
              <a
                href={appInfo.repo_url}
                target="_blank"
                rel="noreferrer"
                className="studio-action-btn"
              >
                <ExternalLink aria-hidden />
                {t("settings.projectHome")}
              </a>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              className="studio-action-btn"
              disabled={isFetching}
            >
              <RefreshCw aria-hidden />
              {t("settings.checkUpdate")}
            </button>
            {updateInfo?.updateAvailable && updateInfo.releaseUrl && (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="studio-action-btn primary"
              >
                <Download aria-hidden />
                {t("settings.downloadUpdate")}
              </a>
            )}
          </div>
        </section>

        <section className="studio-settings-card">
          <div className="studio-settings-card-head">
            <div>
              <div className="studio-settings-card-title">{t("settings.cliHintTitle")}</div>
              <p className="studio-settings-card-desc">{t("settings.cliHintDesc")}</p>
            </div>
            <div className="studio-settings-card-icon">
              <Terminal aria-hidden />
            </div>
          </div>
          <Link to="/settings/cli" className="studio-action-btn">
            <Terminal aria-hidden />
            {t("settings.openCliTab")}
          </Link>
        </section>
      </div>
    </div>
  );
}
