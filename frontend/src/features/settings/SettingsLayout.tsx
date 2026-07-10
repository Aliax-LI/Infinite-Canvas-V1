import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Boxes, Info, Link2, Terminal } from "lucide-react";
import { useCallback, useRef } from "react";
import { cn } from "../../shared/utils";

const tabs = [
  { to: "/settings/api", labelKey: "settings.tabs.api", testId: "settings-tab-api", icon: Link2 },
  { to: "/settings/workflows", labelKey: "settings.tabs.workflows", testId: "settings-tab-workflows", icon: Boxes },
  { to: "/settings/cli", labelKey: "settings.tabs.cli", testId: "settings-tab-cli", icon: Terminal },
  { to: "/settings", end: true, labelKey: "settings.tabs.about", testId: "settings-tab-about", icon: Info },
] as const;

export function SettingsLayout() {
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const location = useLocation();
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const activeIndex = tabs.findIndex((tab) =>
    tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to),
  );

  const focusTab = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (!tab) return;
      navigate(tab.to);
      tabRefs.current[index]?.focus();
    },
    [navigate],
  );

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    focusTab(next);
  };

  return (
    <div className="studio-settings-shell" data-testid="settings-layout">
      <header className="studio-settings-top">
        <div className="studio-settings-top-bar">
          <div className="studio-settings-heading">
            <h1 className="studio-settings-title">{t("settings.title")}</h1>
          </div>
          <div className="studio-settings-top-end">
            <nav className="studio-settings-tabs" aria-label={t("settings.title")} role="tablist">
              {tabs.map(({ to, end, labelKey, testId, icon: Icon }, index) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  role="tab"
                  aria-selected={index === activeIndex}
                  tabIndex={index === activeIndex ? 0 : -1}
                  data-testid={testId}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                  className={({ isActive }) =>
                    cn("studio-settings-tab", isActive && "active")
                  }
                >
                  <Icon aria-hidden />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <div className="studio-settings-body">
        <Outlet />
      </div>
    </div>
  );
}
