(function(){
    const VERSION = '2026.07.07.desktop.1';
    const scripts = [
        '/static/js/i18n-core.js',
        '/static/js/i18n/common.js',
        '/static/js/i18n/studio.js',
        '/static/js/i18n/api-settings.js',
        '/static/js/i18n/canvas.js',
        '/static/js/i18n/smart-canvas.js',
        '/static/js/i18n/comfyui-settings.js',
    ];

    function finish() {
        window.StudioI18n?.apply?.();
        if (typeof window._studioI18nResolveReady === 'function') {
            window._studioI18nResolveReady();
        }
        window.dispatchEvent(new CustomEvent('studio-i18n-ready'));
    }

    if (document.readyState === 'loading' && document.currentScript) {
        document.write(scripts.map(src => '<script src="' + src + '?v=' + VERSION + '"><\/script>').join(''));
        finish();
        return;
    }

    scripts.reduce((promise, src) => promise.then(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src + '?v=' + VERSION;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    })), Promise.resolve()).then(finish).catch(err => console.error('Failed to load i18n modules', err));
})();
