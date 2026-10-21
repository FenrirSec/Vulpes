// Panel, popovers, toasts, theme and other desktop chrome
Vulpes.ui = (() => {
    const $ = (id) => document.getElementById(id);
    const DEFAULT_COLOR = '#88c0d0';

    function storage(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key);
            if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
        } catch (e) { return null; }
    }

    // ------------------------------------------------------------- toasts
    function notify(message, type = 'info', timeout = 3200) {
        const box = $('toasts');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        box.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 250);
        }, timeout);
        while (box.children.length > 4) box.firstChild.remove();
    }

    // ------------------------------------------------------------- clock
    function updateClock() {
        const now = new Date();
        const el = $('clock');
        el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        el.dateTime = now.toISOString();
        el.title = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    // ----------------------------------------------------------- popovers
    const popovers = { launcher: ['appLauncher', 'appsBtn'], settings: ['settingsPanel', 'settingsBtn'] };

    function isOpen(name) { return !$(popovers[name][0]).hidden; }

    function open(name) {
        Object.keys(popovers).forEach(n => n !== name && close(n));
        const [panel, btn] = popovers[name];
        $(panel).hidden = false;
        $(btn).setAttribute('aria-expanded', 'true');
        $(btn).classList.add('on');
        if (name === 'launcher') {
            const s = $('launcherSearch');
            s.value = '';
            Vulpes.apps && Vulpes.apps.filterLauncher('');
            setTimeout(() => s.focus(), 0);
        }
    }

    function close(name) {
        const [panel, btn] = popovers[name];
        $(panel).hidden = true;
        $(btn).setAttribute('aria-expanded', 'false');
        $(btn).classList.remove('on');
    }

    function closeAll() { Object.keys(popovers).forEach(close); }

    function toggle(name) { isOpen(name) ? close(name) : open(name); }

    // -------------------------------------------------------- appearance
    function applyTheme(theme) {
        document.body.classList.toggle('light-theme', theme === 'light');
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    }

    function applyColor(color) {
        document.body.style.setProperty('--primary', color);
        $('input-color').value = color;
    }

    function applyZoom(zoom) {
        document.body.style.setProperty('--win-zoom', zoom);
        const sel = $('zoomSelect');
        if (sel) sel.value = String(zoom);
        // re-fit terminals and nudge streamed apps so content reflows to the new scale
        if (Vulpes.wm && Vulpes.wm.refitAll) Vulpes.wm.refitAll();
    }

    function applyQuality(q) {
        const sel = $('qualitySelect');
        if (sel) sel.value = String(q);
        if (Vulpes.wm && Vulpes.wm.setStreamQuality) Vulpes.wm.setStreamQuality(q);
    }

    // ---------------------------------------------------------- fullscreen
    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                if (navigator.keyboard && navigator.keyboard.lock) {
                    await navigator.keyboard.lock().catch(() => {});
                }
            } else {
                await document.exitFullscreen();
            }
        } catch (e) {
            notify('Full screen is not available in this browser', 'error');
        }
    }

    function onFullscreenChange() {
        const on = !!document.fullscreenElement;
        $('fullscreenBtn').querySelector('use').setAttribute('href', on ? '#i-unfull' : '#i-full');
        $('fullscreenBtn').classList.toggle('on', on);
        if (!on && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    }

    // -------------------------------------------------------------- setup
    function bind() {
        $('appsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle('launcher'); });
        $('emptyLaunch').addEventListener('click', (e) => { e.stopPropagation(); open('launcher'); });
        $('settingsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle('settings'); });
        $('fullscreenBtn').addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', onFullscreenChange);

        document.addEventListener('pointerdown', (e) => {
            for (const [name, [panel, btn]] of Object.entries(popovers)) {
                if (!$(panel).contains(e.target) && !$(btn).contains(e.target)) close(name);
            }
        });
        // clicking into an app iframe does not reach this document: close popovers on blur too
        window.addEventListener('blur', () => setTimeout(() => {
            if (document.activeElement && document.activeElement.tagName === 'IFRAME') closeAll();
        }, 0));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAll();
        });

        document.querySelectorAll('.theme-btn').forEach(btn => btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            storage('theme', btn.dataset.theme);
        }));
        $('input-color').addEventListener('input', (e) => {
            applyColor(e.target.value);
            storage('mainColor', e.target.value);
        });
        $('resetColor').addEventListener('click', () => {
            applyColor(DEFAULT_COLOR);
            storage('mainColor', null);
        });
        $('zoomSelect').addEventListener('change', (e) => {
            applyZoom(e.target.value);
            storage('winZoom', e.target.value === '1' ? null : e.target.value);
        });
        $('qualitySelect').addEventListener('change', (e) => {
            applyQuality(e.target.value);
            storage('streamQuality', e.target.value);
        });
        $('statsToggle').addEventListener('change', (e) => {
            storage('showStats', e.target.checked ? '1' : null);
            Vulpes.wm && Vulpes.wm.setStats(e.target.checked);
        });
        $('logoutBtn').addEventListener('click', () => {
            storage('authCredentials', null);
            location.reload();
        });

        applyTheme(storage('theme') || 'dark');
        applyColor(storage('mainColor') || DEFAULT_COLOR);
        applyZoom(storage('winZoom') || '1');
        applyQuality(storage('streamQuality') || '80');
        $('statsToggle').checked = storage('showStats') === '1';

        updateClock();
        setInterval(updateClock, 10_000);
    }

    return { bind, notify, open, close, closeAll, toggle, isOpen, storage,
             showStats: () => storage('showStats') === '1',
             streamQuality: () => storage('streamQuality') || '80' };
})();

// Backwards compatible helper used across the codebase
function showNotification(message, type = 'info') { Vulpes.ui.notify(message, type); }
