// Window manager: stacking, focus, drag / resize / snap, taskbar, session
Vulpes.wm = (() => {
    const windows = [];
    let active = null;
    let topZ = 10;
    let workspace = null;
    let statsOn = false;
    const MIN_W = 320, MIN_H = 180, TITLEBAR = 24, SNAP_EDGE = 8;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = (ms) => (reducedMotion.matches ? 0 : ms);

    function workspaceRect() {
        const r = workspace.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }

    // ------------------------------------------------------------ geometry
    function geometryFor(win) {
        const ws = workspaceRect();
        const W = Math.round(ws.width), H = Math.round(ws.height);
        if (Vulpes.isMobile() || win.state === 'maximized') return { x: 0, y: 0, width: W, height: H };
        if (win.state === 'left') return { x: 0, y: 0, width: Math.floor(W / 2), height: H };
        if (win.state === 'right') return { x: Math.floor(W / 2), y: 0, width: W - Math.floor(W / 2), height: H };
        return win.bounds;
    }

    function initialBounds(app) {
        const ws = workspaceRect();
        const term = app.type === 'tui' || app.type === 'terminal';
        const width = Math.max(MIN_W, Math.min(term ? 760 : 1000, ws.width - 80));
        const height = Math.max(MIN_H, Math.min(term ? 460 : 620, ws.height - 80));
        const n = windows.filter(w => !w.minimized && w.state === 'normal').length % 7;
        const step = 30;
        const x = Math.round((ws.width - width) / 2 - 3 * step + n * step);
        const y = Math.round((ws.height - height) / 2 - 2 * step + n * step);
        return constrain({
            x: Math.max(16, Math.min(x, ws.width - width - 16)),
            y: Math.max(12, Math.min(y, ws.height - height - 12)),
            width, height,
        });
    }

    // keep at least the title bar reachable
    function constrain(b) {
        const ws = workspaceRect();
        const out = { ...b };
        out.width = Math.max(MIN_W, Math.min(out.width, ws.width));
        out.height = Math.max(MIN_H, Math.min(out.height, ws.height));
        out.y = Math.max(0, Math.min(out.y, ws.height - TITLEBAR));
        out.x = Math.max(-out.width + 120, Math.min(out.x, ws.width - 120));
        return out;
    }

    // ------------------------------------------------------- registration
    function add(win) {
        windows.push(win);
        renderTasks();
    }

    function remove(win) {
        const i = windows.indexOf(win);
        if (i >= 0) windows.splice(i, 1);
        if (active === win) {
            active = null;
            const next = topmostVisible();
            if (next) focus(next);
        }
        renderTasks();
    }

    function topmostVisible(except) {
        return windows.filter(w => !w.minimized && w !== except).sort((a, b) => b.zIndex - a.zIndex)[0] || null;
    }

    // -------------------------------------------------------------- focus
    function raise(win) {
        if (win.zIndex === topZ && win.el.style.zIndex) return;
        topZ += 1;
        if (topZ > 5000) {
            windows.slice().sort((a, b) => a.zIndex - b.zIndex).forEach((w, i) => {
                w.zIndex = 10 + i; w.el.style.zIndex = w.zIndex;
            });
            topZ = 10 + windows.length;
        }
        win.zIndex = topZ;
        win.el.style.zIndex = topZ;
    }

    function focus(win, { fromContent = false } = {}) {
        if (!win || win.closed) return;
        if (win.minimized) win.restore();
        const changed = active !== win;
        raise(win);
        if (changed) {
            if (active) {
                active.el.classList.remove('active');
                active.post({ type: 'webx11:release_all' });
            }
            active = win;
            win.el.classList.add('active');
            renderTasks();
            win.save();
        }
        if (!fromContent) win.focusContent();
    }

    function onMinimize(win) {
        if (active === win) {
            win.el.classList.remove('active');
            active = null;
            const next = topmostVisible(win);
            if (next) focus(next);
        }
        renderTasks();
    }

    // Clicks inside an iframe never reach this document. When focus moves into
    // a window's iframe, raise that window.
    let lastFocusedFrame = null;
    function watchIframeFocus() {
        const el = document.activeElement;
        if (el && el.tagName === 'IFRAME') {
            if (el !== lastFocusedFrame) {
                lastFocusedFrame = el;
                const win = windows.find(w => w.iframe === el);
                if (win && win !== active) focus(win, { fromContent: true });
                Vulpes.ui.closeAll();
            }
        } else {
            lastFocusedFrame = null;
        }
    }

    // ------------------------------------------------------ drag and snap
    const preview = () => document.getElementById('snapPreview');

    function showSnap(kind, win) {
        const p = preview();
        if (!kind) { p.classList.remove('show'); p.dataset.kind = ''; return; }
        // same z-index as the dragged window but earlier in the DOM: drawn just below it
        if (win) p.style.zIndex = win.zIndex;
        if (p.dataset.kind === kind && p.classList.contains('show')) return;
        const g = geometryFor({ state: kind, bounds: {} });
        Object.assign(p.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.width}px`, height: `${g.height}px` });
        p.dataset.kind = kind;
        p.classList.add('show');
    }

    function beginGesture(target, e, cursor) {
        try { target.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.classList.add('wm-busy');
        document.body.style.cursor = cursor;
    }

    function endGesture() {
        document.body.classList.remove('wm-busy');
        document.body.style.cursor = '';
        showSnap(null);
    }

    function startDrag(win, e) {
        if (e.button !== 0 || Vulpes.isMobile()) return;
        e.preventDefault();
        focus(win);
        const target = e.currentTarget;
        const ws = workspaceRect();
        const start = geometryFor(win);
        let grabX = e.clientX - ws.left - start.x;
        let grabY = e.clientY - ws.top - start.y;
        const sx = e.clientX, sy = e.clientY;
        let moved = false, snap = null, frame = 0;
        try { target.setPointerCapture(e.pointerId); } catch (_) {}

        const move = (ev) => {
            if (!moved) {
                if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
                moved = true;
                beginGesture(target, e, 'grabbing');
                if (win.state !== 'normal') {
                    // tear a maximized / snapped window off: keep the grab point proportional
                    const ratio = grabX / start.width;
                    win.state = 'normal';
                    grabX = Math.round(win.bounds.width * ratio);
                    grabY = Math.min(grabY, TITLEBAR / 2);
                    win.updateMaximizeButton();
                }
            }
            const nx = ev.clientX - ws.left - grabX;
            const ny = ev.clientY - ws.top - grabY;
            Object.assign(win.bounds, constrain({ ...win.bounds, x: nx, y: ny }));
            snap = ev.clientY <= ws.top + 2 ? 'maximized'
                : ev.clientX <= ws.left + SNAP_EDGE ? 'left'
                : ev.clientX >= ws.right - SNAP_EDGE ? 'right' : null;
            if (!frame) frame = requestAnimationFrame(() => { frame = 0; win.applyGeometry(); showSnap(snap, win); });
        };
        const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            cancelAnimationFrame(frame);
            if (!moved) return;
            endGesture();
            if (snap) win.setState(snap, true);
            else { win.applyGeometry(); win.save(); }
            win.focusContent();
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }

    function startResize(win, dir, e) {
        if (e.button !== 0 || Vulpes.isMobile()) return;
        e.preventDefault();
        e.stopPropagation();
        focus(win);
        if (win.state !== 'normal') {
            win.bounds = { ...geometryFor(win) };
            win.state = 'normal';
            win.updateMaximizeButton();
        }
        const target = e.currentTarget;
        const ws = workspaceRect();
        const start = { ...win.bounds };
        const sx = e.clientX, sy = e.clientY;
        const indicator = win.el.querySelector('.resize-indicator');
        let frame = 0;
        beginGesture(target, e, getComputedStyle(target).cursor);
        win.el.classList.add('resizing');

        const move = (ev) => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            const b = { ...start };
            if (dir.includes('e')) b.width = Math.min(Math.max(MIN_W, start.width + dx), ws.width - start.x);
            if (dir.includes('s')) b.height = Math.min(Math.max(MIN_H, start.height + dy), ws.height - start.y);
            if (dir.includes('w')) {
                const w = Math.max(MIN_W, start.width - dx);
                b.x = start.x + start.width - w;
                b.width = w;
            }
            if (dir.includes('n')) {
                const h = Math.max(MIN_H, Math.min(start.height - dy, start.y + start.height));
                b.y = start.y + start.height - h;
                b.height = h;
            }
            win.bounds = b;
            if (!frame) frame = requestAnimationFrame(() => {
                frame = 0;
                win.applyGeometry();
                indicator.hidden = false;
                indicator.textContent = `${Math.round(b.width)} × ${Math.round(b.height - TITLEBAR)}`;
            });
        };
        const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            cancelAnimationFrame(frame);
            endGesture();
            win.el.classList.remove('resizing');
            indicator.hidden = true;
            win.applyGeometry();
            win.save();
            win.focusContent();
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }

    // ------------------------------------------------------------ taskbar
    function taskButton(win) {
        return document.querySelector(`.task[data-id="${CSS.escape(win.id)}"]`);
    }

    function renderTasks() {
        const bar = document.getElementById('tasks');
        if (!bar) return;
        const existing = new Map([...bar.children].map(el => [el.dataset.id, el]));
        windows.forEach((win, i) => {
            let btn = existing.get(win.id);
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'task';
                btn.dataset.id = win.id;
                btn.appendChild(Vulpes.apps.iconElement(win.app));
                const label = document.createElement('span');
                label.textContent = win.name;
                btn.appendChild(label);
                btn.addEventListener('click', () => {
                    if (win === active && !win.minimized) win.minimize();
                    else focus(win);
                });
                btn.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); win.close(); } });
            }
            existing.delete(win.id);
            btn.title = `${win.name}${win.minimized ? ' (minimized)' : ''}. Middle-click to close.`;
            btn.classList.toggle('active', win === active && !win.minimized);
            btn.classList.toggle('minimized', win.minimized);
            if (bar.children[i] !== btn) bar.insertBefore(btn, bar.children[i] || null);
        });
        existing.forEach(el => el.remove());
        document.getElementById('emptyHint').hidden = windows.length > 0;
        Vulpes.apps && Vulpes.apps.markRunning(new Set(windows.map(w => w.app.id)));
    }

    // ------------------------------------------------- messages from apps
    function onMessage(e) {
        const d = e.data;
        if (!d || typeof d.type !== 'string' || !d.type.startsWith('webx11:')) return;
        const win = windows.find(w => w.iframe && w.iframe.contentWindow === e.source);
        if (!win) return;
        switch (d.type) {
            case 'webx11:ready': win.setReady(); break;
            case 'webx11:focus': if (win !== active) focus(win, { fromContent: true }); break;
            case 'webx11:app_exit':
                Vulpes.ui.notify(`${win.name} was closed`);
                win.close();
                break;
            case 'webx11:gone':
                win.showProblem(`${win.name} is no longer running`,
                    'The display server was restarted or the application ended. Start it again to continue.', true);
                break;
            case 'webx11:clipboard':
                Vulpes.ui.notify('Copied to your clipboard', 'info', 1400);
                break;
        }
    }

    function setStats(on) {
        statsOn = on;
        windows.filter(w => w.isExecutable).forEach(w => w.post({ type: 'webx11:hud', show: on }));
    }

    // ------------------------------------------------------------ session
    async function restoreSession() {
        let states = [];
        try {
            const r = await Vulpes.api.getSession();
            states = (await r.json()).windows || [];
        } catch (e) {
            console.error('Failed to get session:', e);
        }
        states.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        for (const s of states) {
            const app = Vulpes.applications.find(a => a.id === s.app_id);
            if (!app) continue;
            const win = new Window(app, {
                id: s.id, x: s.x, y: s.y, width: s.width, height: s.height,
                isMaximized: s.isMaximized, isMinimized: s.isMinimized, snap: s.snap,
                displayId: s.displayId, terminalPort: s.terminalPort, restored: true,
            });
            add(win);
            raise(win);
        }
        const top = topmostVisible();
        if (top) focus(top);
        renderTasks();
        return windows.length;
    }

    function open(app) {
        const win = new Window(app);
        add(win);
        focus(win);
        return win;
    }

    function onViewportResize() {
        windows.forEach(w => {
            if (w.state === 'normal') w.bounds = constrain(w.bounds);
            w.applyGeometry();
        });
    }

    // re-fit every window's content after a zoom/DPI change
    function refitAll() {
        windows.forEach(w => {
            if (w.isTerminal && w.autofitTerminal) w.autofitTerminal();
            else if (w.iframe && w.iframe.contentWindow) {
                try { w.iframe.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
            }
        });
    }

    // push a stream (JPEG) quality to every streamed WebX11 window
    function setStreamQuality(q) {
        windows.forEach(w => w.isExecutable && w.post({ type: 'webx11:quality', value: Number(q) }));
    }

    function init() {
        workspace = document.getElementById('workspace');
        window.addEventListener('message', onMessage);
        window.addEventListener('blur', () => setTimeout(watchIframeFocus, 0));
        setInterval(watchIframeFocus, 250);
        let t = null;
        window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(onViewportResize, 60); });
        statsOn = Vulpes.ui.showStats();
        renderTasks();
    }

    return {
        init, open, add, remove, focus, raise, onMinimize, startDrag, startResize,
        geometryFor, initialBounds, workspaceRect, taskButton, renderTasks, restoreSession, refitAll, setStreamQuality,
        setStats, motion, windows,
        get workspace() { return workspace; },
        get active() { return active; },
    };
})();
