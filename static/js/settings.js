(function () {
    const TAB_IDS = ['api', 'workflow', 'cli', 'about'];
    const TAB_KEY = 'studio_settings_tab';
    const IFRAME_VERSION = '2026.07.7.desktop-flat';

    let activeTab = 'api';
    let updateInfo = { version: '', remoteVersion: '', available: false };

    function tr(key, fallback) {
        return window.StudioI18n?.t?.(key) || fallback || key;
    }

    function normalizeTab(tab) {
        if (tab === 'appearance') return 'api';
        return TAB_IDS.includes(tab) ? tab : 'api';
    }

    function setTab(tab, options = {}) {
        tab = normalizeTab(tab);
        activeTab = tab;
        if (!options.skipRemember) {
            try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
        }
        document.querySelectorAll('.settings-tab').forEach(btn => {
            const on = btn.dataset.tab === tab;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.settings-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tab);
        });
        ensureIframe(tab);
        if (tab === 'cli') focusCliPanel();
    }

    function ensureIframe(tab) {
        const map = {
            api: 'settings-frame-api',
            workflow: 'settings-frame-workflow',
            cli: 'settings-frame-cli'
        };
        const id = map[tab];
        if (!id) return;
        const frame = document.getElementById(id);
        if (!frame || frame.src) return;
        const srcMap = {
            api: `/static/api-settings.html?v=${IFRAME_VERSION}`,
            workflow: `/static/comfyui-settings.html?v=2026.07.7.desktop-flat`,
            cli: `/static/api-settings.html?v=${IFRAME_VERSION}`
        };
        frame.src = srcMap[tab] || srcMap.api;
    }

    function focusCliPanel() {
        const frame = document.getElementById('settings-frame-cli');
        if (!frame) return;
        const send = () => {
            try { frame.contentWindow?.postMessage({ type: 'settings-focus-cli' }, '*'); } catch (e) {}
        };
        if (frame.contentWindow) send();
        else frame.addEventListener('load', send, { once: true });
    }

    function postParent(action, payload) {
        try { window.parent?.postMessage({ type: 'studio-settings-action', action, ...payload }, '*'); } catch (e) {}
    }

    function isFramed() {
        try { return window.self !== window.top; } catch (e) { return true; }
    }

    function refreshToolbarIcons() {
        const theme = window.StudioTheme?.get?.() || 'light';
        const dark = theme === 'dark';
        const themeBtn = document.getElementById('settings-theme-toggle');
        const themeIcon = document.getElementById('settings-theme-icon');
        if (themeBtn) {
            const title = tr(dark ? 'common.lightMode' : 'common.darkMode', dark ? '白天模式' : '黑夜模式');
            themeBtn.title = title;
            themeBtn.setAttribute('aria-label', title);
        }
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', dark ? 'sun' : 'moon');
            if (window.lucide) window.lucide.createIcons();
        }
        const lang = window.StudioI18n?.lang?.() || 'zh';
        const label = document.getElementById('settings-lang-label');
        const langBtn = document.getElementById('settings-lang-toggle');
        if (label) label.textContent = lang === 'en' ? 'EN' : '中';
        if (langBtn) {
            const title = tr('settings.switchLanguage', '切换语言');
            langBtn.title = title;
            langBtn.setAttribute('aria-label', title);
        }
    }

    function toggleTheme() {
        if (isFramed()) {
            postParent('toggleTheme');
            return;
        }
        const current = window.StudioTheme?.get?.() || 'light';
        window.StudioTheme?.set?.(current === 'dark' ? 'light' : 'dark');
        refreshToolbarIcons();
    }

    function toggleLanguage() {
        if (!window.StudioI18n) return;
        if (isFramed()) {
            postParent('toggleLanguage');
            return;
        }
        window.StudioI18n.toggle();
        window.StudioI18n.apply();
        refreshToolbarIcons();
        refreshAboutPanel();
    }

    function bindAppearanceControls() {
        document.getElementById('settings-theme-toggle')?.addEventListener('click', toggleTheme);
        document.getElementById('settings-lang-toggle')?.addEventListener('click', toggleLanguage);
        window.addEventListener('studio-theme-change', refreshToolbarIcons);
        window.addEventListener('studio-lang-change', () => {
            refreshToolbarIcons();
            refreshAboutPanel();
        });
    }

    function refreshAboutPanel() {
        const localEl = document.getElementById('settings-local-version');
        const remoteEl = document.getElementById('settings-remote-version');
        const pill = document.getElementById('settings-version-pill');
        const updateBtn = document.getElementById('settings-update-btn');
        const local = updateInfo.version || '—';
        const remote = updateInfo.remoteVersion || '';
        if (localEl) localEl.textContent = local ? `v${String(local).replace(/^v/i, '')}` : '—';
        if (remoteEl) {
            remoteEl.textContent = remote
                ? tr('settings.latestVersion', '最新 {v}').replace('{v}', `v${String(remote).replace(/^v/i, '')}`)
                : tr('settings.checkingVersion', '检测中…');
            remoteEl.hidden = !remote && !updateInfo.available;
        }
        if (pill) {
            pill.classList.toggle('has-update', !!updateInfo.available);
            pill.textContent = updateInfo.available
                ? tr('update.available', '发现更新')
                : tr('settings.upToDate', '已是最新');
        }
        if (updateBtn) {
            updateBtn.hidden = !updateInfo.available;
            updateBtn.textContent = remote
                ? tr('settings.updateTo', '更新到 {v}').replace('{v}', `v${String(remote).replace(/^v/i, '')}`)
                : tr('update.oneClick', '一键更新');
        }
    }

    function applyUpdateInfo(data) {
        if (!data || typeof data !== 'object') return;
        updateInfo = {
            version: data.version || updateInfo.version,
            remoteVersion: data.remoteVersion || '',
            available: !!data.available
        };
        refreshAboutPanel();
    }

    function initTabs() {
        document.querySelectorAll('.settings-tab').forEach(btn => {
            btn.addEventListener('click', () => setTab(btn.dataset.tab));
        });
    }

    function bindActions() {
        document.getElementById('settings-github-btn')?.addEventListener('click', () => postParent('openProject'));
        document.getElementById('settings-check-btn')?.addEventListener('click', () => postParent('checkUpdates'));
        document.getElementById('settings-update-btn')?.addEventListener('click', () => postParent('runUpdate'));
        document.getElementById('settings-open-api-cli')?.addEventListener('click', () => setTab('cli'));
    }

    function restoreTabFromRequest() {
        try {
            const params = new URLSearchParams(window.location.search);
            const queryTab = params.get('tab');
            const hashTab = (window.location.hash || '').replace(/^#/, '');
            const saved = localStorage.getItem(TAB_KEY);
            const legacy = window.__STUDIO_SETTINGS_TAB__;
            const tab = normalizeTab([queryTab, hashTab, legacy, saved].find(t => t) || 'api');
            setTab(tab, { skipRemember: true });
        } catch (e) {
            setTab('api', { skipRemember: true });
        }
    }

    window.setSettingsTab = setTab;

    window.addEventListener('message', (event) => {
        if (event.origin && event.origin !== location.origin) return;
        const data = event.data || {};
        if (data.type === 'studio-theme' && window.StudioTheme) {
            window.StudioTheme.set(data.theme);
            refreshToolbarIcons();
        }
        if (data.type === 'studio-lang') {
            window.StudioI18n?.set?.(data.lang);
            window.StudioI18n?.apply?.();
            refreshToolbarIcons();
            refreshAboutPanel();
        }
        if (data.type === 'studio-settings-info') applyUpdateInfo(data);
        if (data.type === 'studio-settings-set-tab') setTab(data.tab);
    });

    window.addEventListener('DOMContentLoaded', () => {
        initTabs();
        bindActions();
        bindAppearanceControls();
        restoreTabFromRequest();
        if (window.StudioI18n) window.StudioI18n.apply();
        refreshToolbarIcons();
        refreshAboutPanel();
        postParent('requestInfo');
    });
})();
