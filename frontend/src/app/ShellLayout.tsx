import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import {
  Layers,
  Moon,
  Settings,
  Sun,
  MessageSquare,
  Wrench,
  FolderOpen,
  Globe,
} from "lucide-react";
import { UpdateBadge, UpdateModal } from "../features/update/UpdateUI";
import { useThemeStore } from "../shared/stores/themeStore";
import { cn } from "../shared/utils";

const SIDEBAR_PINNED_KEY = "studio_sidebar_pinned";

const navItems = [
  { to: "/canvases", labelKey: "nav.canvases", icon: Layers },
  { to: "/online", labelKey: "nav.online", icon: Globe },
  { to: "/chat", labelKey: "nav.chat", icon: MessageSquare },
  { to: "/tools", labelKey: "nav.tools", icon: Wrench },
  { to: "/assets", labelKey: "nav.assets", icon: FolderOpen },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

function readSidebarPinned(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ShellLayout() {
  const { t, i18n } = useTranslation("studio");
  const { mode, toggle } = useThemeStore();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [pinned, setPinned] = useState(readSidebarPinned);
  const [collapsing, setCollapsing] = useState(false);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_PINNED_KEY, next ? "1" : "0");
      } catch {
        /* ignore storage failures */
      }
      if (!next) {
        setCollapsing(true);
        window.setTimeout(() => setCollapsing(false), 360);
      } else {
        setCollapsing(false);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-full w-full" data-testid="shell-layout">
      <aside
        className={cn(
          "studio-shell-sidebar",
          pinned && "is-pinned",
          collapsing && "is-collapsing",
        )}
        data-testid="shell-sidebar"
        data-sidebar-pinned={pinned ? "true" : "false"}
      >
        <button
          type="button"
          className="studio-shell-logo-toggle"
          onClick={togglePinned}
          aria-pressed={pinned}
          aria-label={pinned ? t("sidebar.unpinNav") : t("sidebar.pinNav")}
          title={pinned ? t("sidebar.unpinNav") : t("sidebar.pinNav")}
          data-testid="sidebar-pin-toggle"
        >
          <span className="studio-shell-logo-ring">
            <img src="/images/logo.png" alt="" className="studio-shell-logo" />
          </span>
          <UpdateBadge />
        </button>

        <nav className="studio-shell-nav">
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={t(labelKey)}
              data-testid={`nav-${to.slice(1) || "home"}`}
              className={({ isActive }) =>
                cn("studio-shell-nav-btn", isActive && "active")
              }
            >
              <Icon className="studio-shell-nav-icon" aria-hidden />
              <span className="studio-shell-nav-label">{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="studio-shell-bottom-actions">
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
            title={t("sidebar.language")}
            aria-label={t("sidebar.language")}
            className="studio-shell-nav-btn studio-shell-bottom-btn"
            data-testid="lang-toggle"
          >
            <span className="studio-shell-lang-mark" aria-hidden>
              {i18n.language.startsWith("zh") ? "中" : "EN"}
            </span>
            <span className="studio-shell-nav-label">
              {i18n.language.startsWith("zh") ? t("sidebar.langZh") : t("sidebar.langEn")}
            </span>
          </button>
          <button
            type="button"
            onClick={toggle}
            title={mode === "dark" ? t("sidebar.themeLight") : t("sidebar.themeDark")}
            aria-label={mode === "dark" ? t("sidebar.themeLight") : t("sidebar.themeDark")}
            className="studio-shell-nav-btn studio-shell-bottom-btn"
            data-testid="theme-toggle"
          >
            {mode === "dark" ? (
              <Sun className="studio-shell-nav-icon" aria-hidden />
            ) : (
              <Moon className="studio-shell-nav-icon" aria-hidden />
            )}
            <span className="studio-shell-nav-label">
              {mode === "dark" ? t("sidebar.themeLight") : t("sidebar.themeDark")}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setUpdateOpen(true)}
          className="sr-only"
          data-testid="open-update-modal"
        >
          检查更新
        </button>
      </aside>

      <main className="flex-1 overflow-hidden bg-[var(--stage-bg)]">
        <Outlet />
      </main>

      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </div>
  );
}
