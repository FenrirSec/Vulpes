// Global namespace and URL helpers.
// Vulpes can be served from a sub path (e.g. behind the hack.courses proxy),
// so every URL is built from the page location instead of from "/".
const Vulpes = (() => {
    const base = (location.origin + location.pathname).replace(/\/(index\.html)?$/, '');
    return {
        BASE: base,
        API_BASE: base + '/webx11',      // WebX11 (X11 apps)
        APPS_API_BASE: base + '/apps',   // apps.py (applications, session, terminals)
        applications: [],
        isMobile: () => window.matchMedia('(max-width: 768px)').matches,
        escape(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        },
    };
})();

// Kept for scripts that still reference the old globals
const API_BASE = Vulpes.API_BASE;
const APPS_API_BASE = Vulpes.APPS_API_BASE;
