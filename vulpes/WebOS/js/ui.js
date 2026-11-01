// Panel, popovers, toasts, theme and other desktop chrome
Vulpes.ui = (() => {
    const $ = (id) => document.getElementById(id);

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
    const root = document.documentElement;

    function syncAccentPicker() {
        const stored = storage('mainColor');
        const cur = (stored || getComputedStyle(root).getPropertyValue('--primary')).trim();
        const inp = $('input-color');
        if (inp && /^#[0-9a-f]{6}$/i.test(cur)) inp.value = cur;
    }

    function applyTheme(name) {
        root.dataset.theme = name;
        const sel = $('themeSelect');
        if (sel) sel.value = name;
        syncAccentPicker();
    }

    // empty/null accent -> fall back to the theme's own --primary
    function applyColor(color) {
        if (color) root.style.setProperty('--primary', color);
        else root.style.removeProperty('--primary');
        syncAccentPicker();
    }

    function applyBackground(value) {
        value = (value || '').trim();
        if (!value) root.style.removeProperty('--wallpaper');
        else if (/^(#|rgb|hsl)/i.test(value) || (/^[a-z]+$/i.test(value) && !value.includes('/')))
            root.style.setProperty('--wallpaper', value);            // a colour
        else
            root.style.setProperty('--wallpaper', `url("${value.replace(/"/g, '\\"')}")`);
        const inp = $('bgInput');
        if (inp && !value.startsWith('data:')) inp.value = value;
    }

    function applyCustomCss(css) {
        let el = document.getElementById('user-css');
        if (!el) { el = document.createElement('style'); el.id = 'user-css'; document.head.appendChild(el); }
        el.textContent = css || '';
        const ta = $('customCss');
        if (ta && ta.value !== (css || '')) ta.value = css || '';
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

        $('themeSelect').addEventListener('change', (e) => {
            applyTheme(e.target.value);
            storage('theme', e.target.value);
        });
        $('input-color').addEventListener('input', (e) => {
            applyColor(e.target.value);
            storage('mainColor', e.target.value);
        });
        $('resetColor').addEventListener('click', () => {
            applyColor(null);
            storage('mainColor', null);
        });

        // background / wallpaper
        $('bgApply').addEventListener('click', () => {
            const v = $('bgInput').value.trim();
            applyBackground(v);
            storage('wallpaper', v || null);
        });
        $('bgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bgApply').click(); });
        $('bgClear').addEventListener('click', () => {
            $('bgInput').value = '';
            applyBackground('');
            storage('wallpaper', null);
        });
        $('bgFile').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const data = reader.result;
                applyBackground(data);
                try {
                    localStorage.setItem('wallpaper', data);
                } catch (err) {
                    notify('Image is too large to save; it will reset on reload', 'error');
                }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        // custom CSS
        $('cssApply').addEventListener('click', () => {
            const css = $('customCss').value;
            applyCustomCss(css);
            storage('customCss', css || null);
            notify('Custom CSS applied');
        });
        $('cssClear').addEventListener('click', () => {
            $('customCss').value = '';
            applyCustomCss('');
            storage('customCss', null);
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

        applyTheme(storage('theme') || 'mocha');
        applyColor(storage('mainColor') || null);
        applyBackground(storage('wallpaper') || '');
        applyCustomCss(storage('customCss') || '');
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
