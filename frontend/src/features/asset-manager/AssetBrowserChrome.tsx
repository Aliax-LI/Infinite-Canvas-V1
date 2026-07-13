import type { ReactNode } from "react";
import { cn } from "../../shared/utils";

interface AssetBrowserChromeProps {
  nav: ReactNode;
  content: ReactNode;
  detail: ReactNode;
  className?: string;
  testId?: string;
}

/** Shared three-column chrome matching the prompt-library / history asset-manager layout. */
export function AssetBrowserChrome({
  nav,
  content,
  detail,
  className,
  testId = "asset-browser",
}: AssetBrowserChromeProps) {
  return (
    <div className={cn("studio-asset-browser", className)} data-testid={testId}>
      <aside className="studio-asset-panel studio-asset-nav" data-testid={`${testId}-nav`}>
        {nav}
      </aside>
      <section className="studio-asset-panel studio-asset-content" data-testid={`${testId}-content`}>
        {content}
      </section>
      <aside className="studio-asset-panel studio-asset-detail" data-testid={`${testId}-detail`}>
        {detail}
      </aside>
    </div>
  );
}
