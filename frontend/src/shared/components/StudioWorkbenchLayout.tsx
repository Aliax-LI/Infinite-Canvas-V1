import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { cn } from "../utils";

export type WorkbenchSidebarWidth = "narrow" | "medium" | "wide";

export interface StudioWorkbenchLayoutProps {
  /** Page title (header). */
  title: ReactNode;
  /** Left column: form / controls. */
  sidebar: ReactNode;
  /** Right column: canvas / results — grows to fill remaining width. */
  main: ReactNode;
  /** Full-width section below the workbench grid (e.g. archives). */
  footer?: ReactNode;
  /** Optional back link destination. */
  backTo?: string;
  /** Extra header actions (right side of title row). */
  headerEnd?: ReactNode;
  /** Sidebar column width preset. Default `medium` (~380px). */
  sidebarWidth?: WorkbenchSidebarWidth;
  /** When true, grid row height follows the sidebar; main stage is capped (Online result preview). */
  matchSidebarHeight?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Full-bleed adaptive workbench shell (Settings-style gutters, no centered max-width).
 *
 * Reuse on other tool pages:
 * ```tsx
 * import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";
 *
 * <StudioWorkbenchLayout
 *   title="…"
 *   backTo="/canvases"
 *   sidebar={<Form />}
 *   main={<Results />}
 *   footer={<Archives />}
 * />
 * ```
 */
export function StudioWorkbenchLayout({
  title,
  sidebar,
  main,
  footer,
  backTo,
  headerEnd,
  sidebarWidth = "medium",
  matchSidebarHeight = false,
  testId = "studio-workbench",
  className,
}: StudioWorkbenchLayoutProps) {
  const { t } = useTranslation("studio");

  return (
    <div className={cn("studio-workbench-shell", className)} data-testid={testId}>
      <div className="studio-workbench-inner">
        <header className="studio-workbench-header">
          <div className="studio-workbench-heading">
            {backTo && (
              <Link
                to={backTo}
                className="studio-workbench-back"
                data-testid={`${testId}-back`}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("common.back")}
              </Link>
            )}
            <h1 className="studio-workbench-title">{title}</h1>
          </div>
          {headerEnd ? <div className="studio-workbench-header-end">{headerEnd}</div> : null}
        </header>

        <div
          className={cn(
            "studio-workbench-layout",
            sidebarWidth === "narrow" && "studio-workbench-layout--narrow",
            sidebarWidth === "wide" && "studio-workbench-layout--wide",
            matchSidebarHeight && "studio-workbench-layout--sidebar-height",
          )}
          data-testid={`${testId}-grid`}
        >
          <aside className="studio-workbench-sidebar" data-testid={`${testId}-sidebar`}>
            {sidebar}
          </aside>
          <section className="studio-workbench-main" data-testid={`${testId}-main`}>
            {main}
          </section>
        </div>

        {footer ? (
          <footer className="studio-workbench-footer" data-testid={`${testId}-footer`}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
