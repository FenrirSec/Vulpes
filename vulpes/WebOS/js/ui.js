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
    const popovers = { launcher: ['appLauncher', 'appsBtn'], settings: ['settingsPanel', 'settingsBtn'], vpn: ['vpnPanel', 'vpnBtn'] };

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
        if (name === 'vpn') loadVpn();
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

    const THEMES = ['mocha', 'latte', 'nord', 'gruvbox'];
    function applyTheme(name) {
        // Coerce unknown/empty values (e.g. a stale key from an older build) to the
        // default, so dataset.theme and the dropdown always land on a real option
        // instead of leaving the <select> with no selection (an empty theme picker).
        if (THEMES.indexOf(name) < 0) { name = 'mocha'; storage('theme', null); }
        root.dataset.theme = name;
        const sel = $('themeSelect');
        if (sel) { sel.value = name; sel.__csSync && sel.__csSync(); }
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
        if (!value) { root.style.removeProperty('--wallpaper'); delete root.dataset.bg; }  // back to themed gradient + wave
        else {
            if (/^(#|rgb|hsl)/i.test(value) || (/^[a-z]+$/i.test(value) && !value.includes('/')))
                root.style.setProperty('--wallpaper', value);        // a colour
            else
                root.style.setProperty('--wallpaper', `url("${value.replace(/"/g, '\\"')}")`);
            root.dataset.bg = '1';                                   // hide the default wave texture
        }
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
        if (sel) { sel.value = String(zoom); sel.__csSync && sel.__csSync(); }
        // re-fit terminals and nudge streamed apps so content reflows to the new scale
        if (Vulpes.wm && Vulpes.wm.refitAll) Vulpes.wm.refitAll();
    }

    function applyQuality(q) {
        const sel = $('qualitySelect');
        if (sel) { sel.value = String(q); sel.__csSync && sel.__csSync(); }
        if (Vulpes.wm && Vulpes.wm.setStreamQuality) Vulpes.wm.setStreamQuality(q);
    }

    // ------------------------------------------------------ custom <select>
    // Firefox renders a native <select> dropdown as a separate OS window and
    // mis-handles it when an ancestor has backdrop-filter (our popovers do):
    // the dropdown detaches and dismisses on the first mouse move, so options
    // can't be picked. Replace it with a DOM dropdown we control. The native
    // <select> stays in the DOM (hidden) as the value + 'change' source, so
    // every existing listener keeps working; the menu is portaled to <body>
    // so the panel's overflow can't clip it and no backdrop-filter affects it.
    function enhanceSelect(sel) {
        if (!sel || sel.dataset.enhanced) return;
        sel.dataset.enhanced = '1';
        sel.style.display = 'none';
        sel.setAttribute('aria-hidden', 'true');
        sel.tabIndex = -1;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cs field';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        if (sel.id) btn.setAttribute('aria-label', sel.id);
        const labelOf = (v) => { const o = [...sel.options].find(o => o.value === v); return o ? o.textContent : (sel.options[0] ? sel.options[0].textContent : ''); };
        const sync = () => { btn.textContent = labelOf(sel.value); };
        sel.__csSync = sync;
        sync();
        sel.after(btn);

        let menu = null;
        function closeMenu() {
            if (!menu) return;
            menu.remove(); menu = null;
            btn.setAttribute('aria-expanded', 'false');
            window.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('resize', closeMenu);
            document.removeEventListener('pointerdown', onDocDown, true);
        }
        function onDocDown(e) { if (menu && !menu.contains(e.target) && e.target !== btn) closeMenu(); }
        function choose(v) {
            if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
            sync(); closeMenu(); btn.focus();
        }
        function openMenu() {
            if (menu) { closeMenu(); return; }
            menu = document.createElement('div');
            menu.className = 'cs-menu';
            menu.setAttribute('role', 'listbox');
            [...sel.options].forEach((o) => {
                const it = document.createElement('div');
                it.className = 'cs-opt' + (o.value === sel.value ? ' sel' : '');
                it.setAttribute('role', 'option');
                it.textContent = o.textContent;
                it.addEventListener('click', () => choose(o.value));
                menu.appendChild(it);
            });
            document.body.appendChild(menu);
            const r = btn.getBoundingClientRect();
            menu.style.left = r.left + 'px';
            menu.style.width = r.width + 'px';
            const mh = menu.offsetHeight;
            const below = r.bottom + 4;
            menu.style.top = (below + mh > window.innerHeight && r.top - 4 - mh > 0 ? r.top - 4 - mh : below) + 'px';
            btn.setAttribute('aria-expanded', 'true');
            window.addEventListener('scroll', closeMenu, true);
            window.addEventListener('resize', closeMenu);
            document.addEventListener('pointerdown', onDocDown, true);
        }

        btn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
            else if (e.key === 'Escape') closeMenu();
        });
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

    // ------------------------------------------------------------- VPN helper
    // Shows the equivalent of `wg show` and downloads the active interface's
    // config so the same tunnel can be brought up on another machine.
    async function loadVpn() {
        const out = $('vpnOut'), badge = $('vpnBadge'), dl = $('vpnDownload');
        out.textContent = 'Loading…';
        badge.textContent = 'checking…'; badge.dataset.up = '0';
        dl.disabled = true;
        try {
            const r = await fetch(Vulpes.APPS_API_BASE + '/vpn/status', { headers: Vulpes.api.getAuthHeaders() });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const s = await r.json();
            if (s.up) {
                badge.dataset.up = '1';
                badge.textContent = s.interface + ' · up';
                out.textContent = s.output || '(no output)';
                dl.disabled = false;
                dl.dataset.iface = s.interface || '';
            } else {
                badge.dataset.up = '0';
                badge.textContent = 'not connected';
                out.textContent = 'No active WireGuard interface.\nBring one up with:  sudo wg-quick up <name>';
            }
        } catch (e) {
            badge.dataset.up = '0';
            badge.textContent = 'error';
            out.textContent = 'Could not reach the VPN helper: ' + e.message;
        }
    }

    async function downloadVpn() {
        const dl = $('vpnDownload'), iface = dl.dataset.iface || '';
        try {
            const q = iface ? ('?iface=' + encodeURIComponent(iface)) : '';
            const r = await fetch(Vulpes.APPS_API_BASE + '/vpn/config' + q, { headers: Vulpes.api.getAuthHeaders() });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = (iface || 'wireguard') + '.conf';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {
            notify('Could not download config: ' + e.message, 'error');
        }
    }

    // -------------------------------------------------------------- setup
    function bind() {
        $('appsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle('launcher'); });
        $('emptyLaunch').addEventListener('click', (e) => { e.stopPropagation(); open('launcher'); });
        $('settingsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle('settings'); });
        $('vpnBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle('vpn'); });
        $('vpnRefresh').addEventListener('click', loadVpn);
        $('vpnDownload').addEventListener('click', downloadVpn);
        $('fullscreenBtn').addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', onFullscreenChange);

        document.addEventListener('pointerdown', (e) => {
            // custom-select menus are portaled to <body>; treat them as "inside"
            if (e.target.closest && e.target.closest('.cs-menu')) return;
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

        // swap the native <select>s for the custom dropdown (Firefox popup bug)
        ['themeSelect', 'zoomSelect', 'qualitySelect'].forEach(id => enhanceSelect($(id)));

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
