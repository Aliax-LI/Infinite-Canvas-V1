import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AssetAnnotationSettingsPanel() {
  const { t } = useTranslation("api-settings");

  return (
    <section className="studio-settings-card mb-6" data-testid="asset-annotation-settings">
      <div className="studio-block-title-row">
        <div>
          <h2 className="studio-block-title">{t("assetAnnotation.title")}</h2>
          <p className="studio-block-desc">{t("assetAnnotation.movedHint")}</p>
        </div>
        <Sparkles className="w-5 h-5 text-[var(--muted)]" aria-hidden />
      </div>
      <Link
        to="/assets"
        className="inline-flex mt-4 text-sm text-black underline underline-offset-2 hover:text-gray-700"
        data-testid="asset-annotation-open-library"
      >
        {t("assetAnnotation.openLibrary")}
      </Link>
    </section>
  );
}
