// A desktop window hosting one application (X11 app, web page or terminal)
class Window {
    constructor(app, data = {}) {
        this.id = data.id || `window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.app = app;
        this.data = data;
        this.displayId = data.displayId ?? null;
        this.terminalPort = data.terminalPort ?? null;
        this.state = data.isMaximized ? 'maximized' : (data.snap || 'normal'); // normal | maximized | left | right
        this.minimized = !!data.isMinimized;
        this.zIndex = data.zIndex || 0;
        this.ready = false;
        this.closed = false;
        this.iframe = null;
        this.tabs = [];
        this.activeTab = null;
        this.bounds = (data.width && data.height)
            ? { x: data.x ?? 40, y: data.y ?? 40, width: data.width, height: data.height }
            : Vulpes.wm.initialBounds(app);
        this.build();
    }

    get name() { return this.app.name; }
    get icon() { return Vulpes.apps.iconUrl(this.app); }
    get isExecutable() { return this.app.type === 'executable'; }
    get isTerminal() { return this.app.type === 'tui' || this.app.type === 'terminal'; }

    // ---------------------------------------------------------------- DOM
    build() {
        const el = document.createElement('div');
        el.className = `window type-${this.app.type}`;
        el.id = this.id;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', this.name);
        el.innerHTML = `
            <div class="window-titlebar">
                <span class="window-icon"></span>
                <span class="window-title"></span>
                <span class="resize-indicator" hidden></span>
                <div class="window-controls">
                    <button class="wc" data-action="minimize" title="Minimize" tabindex="-1"><svg><use href="#i-min"/></svg></button>
                    <button class="wc" data-action="maximize" title="Maximize" tabindex="-1"><svg><use href="#i-max"/></svg></button>
                    <button class="wc close" data-action="close" title="Close" tabindex="-1"><svg><use href="#i-close"/></svg></button>
                </div>
            </div>
            <div class="window-content">
                <div class="window-loading"><div class="spinner"></div><span></span></div>
            </div>
            ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<div class="resize-handle ${d}" data-dir="${d}"></div>`).join('')}
        `;
        el.querySelector('.window-icon').appendChild(Vulpes.apps.iconElement(this.app));
        el.querySelector('.window-title').textContent = this.name;
        el.querySelector('.window-loading span').textContent = `Starting ${this.name}…`;

        this.el = this.element = el;
        this.titlebar = el.querySelector('.window-titlebar');
        this.content = el.querySelector('.window-content');
        this.loading = el.querySelector('.window-loading');

        this.titlebar.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.wc')) return;
            Vulpes.wm.startDrag(this, e);
        });
        this.titlebar.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.wc')) this.toggleMaximize();
        });
        el.querySelectorAll('.wc').forEach(btn => {
            btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'close') this.close();
                else if (action === 'minimize') this.minimize();
                else this.toggleMaximize();
            });
        });
        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', (e) => Vulpes.wm.startResize(this, h.dataset.dir, e));
        });
        el.addEventListener('pointerdown', () => Vulpes.wm.focus(this), true);

        Vulpes.wm.workspace.appendChild(el);
        this.applyGeometry();
        this.updateMaximizeButton();
        if (this.minimized) el.classList.add('minimized');
        else el.animate?.([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }],
            { duration: Vulpes.wm.motion(140), easing: 'cubic-bezier(.2,.8,.2,1)' });

        if (this.data.restored) this.reconnectContent(); else this.loadContent();
    }

    applyGeometry(animate = false) {
        const g = Vulpes.wm.geometryFor(this);
        const s = this.el.style;
        if (animate && Vulpes.wm.motion(1)) {
            this.el.classList.add('animating');
            clearTimeout(this._animTimer);
            this._animTimer = setTimeout(() => this.el.classList.remove('animating'), 200);
        }
        s.left = `${g.x}px`;
        s.top = `${g.y}px`;
        s.width = `${g.width}px`;
        s.height = `${g.height}px`;
        this.el.classList.toggle('maximized', this.state === 'maximized' || Vulpes.isMobile());
        this.el.classList.toggle('snapped', this.state === 'left' || this.state === 'right');
    }

    rect() { return Vulpes.wm.geometryFor(this); }

    updateMaximizeButton() {
        const btn = this.el.querySelector('[data-action="maximize"]');
        const full = this.state !== 'normal';
        btn.title = full ? 'Restore' : 'Maximize';
        btn.querySelector('use').setAttribute('href', full ? '#i-restore' : '#i-max');
    }

    // ------------------------------------------------------------ content
    async loadContent() {
        this.setLoading(`Starting ${this.name}…`);
        try {
            if (this.isExecutable) await this.loadExecutable();
            else if (this.app.type === 'url') this.loadUrl();
            else if (this.isTerminal) await this.loadTerminal();
            else throw new Error(`Unknown application type "${this.app.type}"`);
            this.save();
        } catch (error) {
            console.error('Failed to load content:', error);
            this.showProblem(`${this.name} could not start`, error.message, true);
        }
    }

    async reconnectContent() {
        try {
            if (this.isExecutable && this.displayId) {
                this.attachDisplay();
            } else if (this.isTerminal && this.terminalPort) {
                const r = await Vulpes.api.terminalStatus(this.terminalPort);
                const status = r.ok ? (await r.json()).status : 'not_found';
                if (status === 'running') { this.ensureTabBar(); await this.openTab(null, { port: this.terminalPort }); }
                else { this.terminalPort = null; await this.loadContent(); }
            } else {
                await this.loadContent();
            }
        } catch (error) {
            console.error('Failed to reconnect content:', error);
            await this.loadContent();
        }
    }

    makeFrame(src, extra = {}) {
        if (this.iframe) this.iframe.remove();
        const iframe = document.createElement('iframe');
        iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
        Object.entries(extra).forEach(([k, v]) => iframe.setAttribute(k, v));
        iframe.src = src;
        this.content.appendChild(iframe);
        this.iframe = iframe;
        return iframe;
    }

    async loadExecutable() {
        const ws = Vulpes.wm.workspaceRect();
        // the display is the largest this window may ever get: the screen
        const width = Math.ceil(Math.max(window.screen.width || 0, ws.width));
        const height = Math.ceil(Math.max(window.screen.height || 0, ws.height));
        const displayRes = await Vulpes.api.createDisplay(width, height);
        if (!displayRes.ok) throw new Error(`The display server refused to create a display (HTTP ${displayRes.status}).`);
        this.displayId = (await displayRes.json()).display;
        this.save();
        const execRes = await Vulpes.api.runInDisplay(this.displayId, this.app.executable);
        if (!execRes.ok) throw new Error(`The display server could not run "${this.app.executable}" (HTTP ${execRes.status}).`);
        this.attachDisplay();
    }

    attachDisplay() {
        this.makeFrame(`${Vulpes.API_BASE}/display/${this.displayId}`);
        // WebX11 posts 'webx11:ready' after its first frame; this is only a safety net
        clearTimeout(this._readyTimer);
        this._readyTimer = setTimeout(() => this.setReady(), 12000);
    }

    loadUrl() {
        const proxy = this.app.proxy !== false;
        const toSrc = (url) => proxy ? `${Vulpes.APPS_API_BASE}/proxy/${btoa(url)}` : url;
        // Proxied external sites are sandboxed; our own same-origin web apps
        // (e.g. code-server) get the extra permissions an IDE needs.
        const iframe = this.makeFrame(toSrc(this.app.url), {
            sandbox: proxy
                ? 'allow-same-origin allow-scripts allow-forms allow-popups'
                : 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-top-navigation',
        });
        if (proxy) {
            this._onNavigate = (event) => {
                if (event.source === iframe.contentWindow && event.data && event.data.type === 'navigate') {
                    iframe.src = toSrc(event.data.url);
                }
            };
            window.addEventListener('message', this._onNavigate);
        }
        iframe.addEventListener('load', () => this.setReady(), { once: true });
    }

    // ------------------------------------------------------- terminal (tabbed)
    async loadTerminal() {
        this.ensureTabBar();
        await this.openTab(this.app.command || null);
    }

    ensureTabBar() {
        if (this.tabBar) return;
        const bar = document.createElement('div');
        bar.className = 'terminal-tabs';
        bar.innerHTML = '<div class="tabstrip" role="tablist"></div>'
            + '<button class="tab-add" title="New tab" aria-label="New terminal tab" tabindex="-1">+</button>';
        this.titlebar.after(bar);
        this.tabBar = bar;
        this.tabStrip = bar.querySelector('.tabstrip');
        bar.querySelector('.tab-add').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTab(this.app.command || null).catch(err => {
                console.error('New terminal tab failed:', err);
                Vulpes.ui.notify('Could not open a new terminal tab', 'error');
            });
        });
    }

    // Open a terminal session (its own xterm.rs port) as a new tab. Pass
    // { port } to re-attach an already-running session (session restore).
    async openTab(command, { port = null } = {}) {
        this.setLoading(`Starting ${this.name}…`);
        if (port === null) {
            const response = await Vulpes.api.startTerminal(command || null);
            if (!response.ok) throw new Error(`The terminal service answered HTTP ${response.status}.`);
            port = (await response.json()).port;
        }
        const tab = { port, iframe: null, btn: null, title: `Terminal ${this.tabs.length + 1}` };
        this.tabs.push(tab);
        this.renderTab(tab);
        this.attachTab(tab);
        this.activateTab(tab);
    }

    renderTab(tab) {
        const btn = document.createElement('button');
        btn.className = 'term-tab';
        btn.setAttribute('role', 'tab');
        btn.innerHTML = '<span class="term-tab-label"></span><span class="term-tab-close" title="Close tab">×</span>';
        btn.querySelector('.term-tab-label').textContent = tab.title;
        btn.addEventListener('click', (e) => {
            if (e.target.closest('.term-tab-close')) { e.stopPropagation(); this.closeTab(tab); }
            else this.activateTab(tab);
        });
        tab.btn = btn;
        this.tabStrip.appendChild(btn);
    }

    attachTab(tab, attempt = 0) {
        // Load the terminal page directly. xterm.rs needs a moment to start
        // listening; until then nginx returns a 502 page, which we detect and
        // retry instead of showing a dead terminal.
        const url = `${Vulpes.BASE}/term/${tab.port}/`;
        if (tab.iframe) tab.iframe.remove();
        const iframe = document.createElement('iframe');
        iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
        iframe.className = 'term-frame';
        iframe.src = url;
        this.content.appendChild(iframe);
        tab.iframe = iframe;
        if (this.activeTab === tab) this.iframe = iframe;
        iframe.addEventListener('load', () => {
            if (this.closed) return;
            let notReady = false;
            try {
                const doc = iframe.contentDocument;
                const text = doc && doc.body ? doc.body.innerText : '';
                if (/\b502\b|Bad Gateway|nginx\//i.test(text) || (doc && doc.body && doc.body.children.length === 0 && !text.trim())) {
                    notReady = true;
                }
            } catch (e) { /* same-origin read failed: assume it loaded */ }
            if (notReady && attempt < 30) {
                setTimeout(() => { if (!this.closed) this.attachTab(tab, attempt + 1); }, 250);
            } else if (notReady) {
                this.showProblem('Terminal did not start',
                    'The terminal backend did not respond. Start it again to retry.', true);
            } else {
                setTimeout(() => this.setReady(), 120);
                this.enableTerminalAutofit();
                if (this.activeTab === tab) this.autofitTerminal();
            }
        }, { once: true });
    }

    activateTab(tab) {
        this.activeTab = tab;
        this.terminalPort = tab.port;
        this.iframe = tab.iframe;
        this.tabs.forEach(t => {
            const on = t === tab;
            if (t.iframe) t.iframe.classList.toggle('hidden', !on);
            if (t.btn) t.btn.classList.toggle('active', on);
        });
        this.save();
        // a tab that was hidden has stale dimensions; re-fit once it is shown
        requestAnimationFrame(() => this.autofitTerminal());
        this.focusContent();
    }

    async closeTab(tab) {
        const i = this.tabs.indexOf(tab);
        if (i === -1) return;
        this.tabs.splice(i, 1);
        if (tab.iframe) tab.iframe.remove();
        if (tab.btn) tab.btn.remove();
        Vulpes.api.stopTerminal(tab.port).catch(() => {});
        if (!this.tabs.length) { this.close(); return; }
        if (this.activeTab === tab) this.activateTab(this.tabs[Math.max(0, i - 1)]);
    }

    // The xterm.rs page fits itself on load and on its own window 'resize', but
    // the first fit runs before the iframe is laid out (the loading overlay is
    // still up), so it keeps the 80x24 default until the user types `resize`.
    // The iframe is same-origin, so we dispatch a resize into it once it has a
    // real size, and on every later size change.
    // plain re-fit: ask the same-origin xterm.js page to fit() and push its
    // size to the PTY. Enough when the iframe size really changed (user resize).
    refitTerminal() {
        const w = this.iframe && this.iframe.contentWindow;
        if (!w) return;
        try { w.dispatchEvent(new Event('resize')); } catch (e) {}
    }

    // forced re-fit for startup / tab-show: a synthetic resize can be a no-op
    // if xterm already holds the right cols/rows while the PTY is still at its
    // 80x24 default, so we briefly change the iframe height by ~2 rows to
    // guarantee an onResize (which is what sends {cols,rows} to the PTY).
    autofitTerminal() {
        const f = this.iframe;
        if (!f || !f.clientHeight) { this.refitTerminal(); return; }
        const prev = f.style.height;
        f.style.height = Math.max(40, f.clientHeight - 40) + 'px';
        this.refitTerminal();
        void f.offsetHeight;               // force reflow so the inner window sees the change
        requestAnimationFrame(() => {
            if (this.iframe !== f) return;
            f.style.height = prev || '';
            this.refitTerminal();
        });
    }

    enableTerminalAutofit() {
        // forced re-fits spread out to beat web-font / ws-connect timing
        [150, 450, 900, 1500].forEach(ms => setTimeout(() => this.autofitTerminal(), ms));
        if (this._termAutofit || typeof ResizeObserver === 'undefined') return;
        let t = 0;
        this._termAutofit = new ResizeObserver(() => {
            // real size change already fires the inner resize; a plain fit is enough
            clearTimeout(t);
            t = setTimeout(() => this.refitTerminal(), 80);
        });
        this._termAutofit.observe(this.content);
    }

    setLoading(text) {
        this.ready = false;
        this.loading.innerHTML = '<div class="spinner"></div><span></span>';
        this.loading.querySelector('span').textContent = text;
        this.loading.hidden = false;
    }

    setReady() {
        clearTimeout(this._readyTimer);
        if (this.ready) return;
        this.ready = true;
        this.loading.hidden = true;
        if (Vulpes.wm.active === this) this.focusContent();
        if (this.isExecutable) {
            if (Vulpes.ui.showStats()) this.post({ type: 'webx11:hud', show: true });
            this.post({ type: 'webx11:quality', value: Number(Vulpes.ui.streamQuality()) });
        }
    }

    showProblem(title, detail, canRetry) {
        this.loading.hidden = false;
        this.loading.innerHTML = `
            <div class="problem">
                <strong></strong>
                <p></p>
                <div class="problem-actions">
                    ${canRetry ? '<button class="primary-btn" data-do="retry">Try again</button>' : ''}
                    <button class="ghost-btn" data-do="close">Close window</button>
                </div>
            </div>`;
        this.loading.querySelector('strong').textContent = title;
        this.loading.querySelector('p').textContent = detail || '';
        this.loading.querySelector('[data-do="close"]').addEventListener('click', () => this.close());
        const retry = this.loading.querySelector('[data-do="retry"]');
        if (retry) retry.addEventListener('click', () => this.relaunch());
    }

    async relaunch() {
        if (this.displayId) Vulpes.api.closeDisplay(this.displayId).catch(() => {});
        (this.tabs || []).forEach(t => {
            Vulpes.api.stopTerminal(t.port).catch(() => {});
            if (t.iframe) t.iframe.remove();
            if (t.btn) t.btn.remove();
        });
        this.tabs = [];
        this.activeTab = null;
        if (this.terminalPort) Vulpes.api.stopTerminal(this.terminalPort).catch(() => {});
        if (this.iframe) { this.iframe.remove(); this.iframe = null; }
        this.displayId = null;
        this.terminalPort = null;
        await this.loadContent();
    }

    post(message) {
        try { this.iframe && this.iframe.contentWindow && this.iframe.contentWindow.postMessage(message, '*'); } catch (e) {}
    }

    focusContent() {
        if (!this.iframe || this.minimized) return;
        try { this.iframe.focus({ preventScroll: true }); } catch (e) {}
        try { this.iframe.contentWindow && this.iframe.contentWindow.focus(); } catch (e) {}
        if (this.isExecutable) {
            this.post({ type: 'webx11:focus' });
        } else if (this.isTerminal) {
            // focus the terminal's own input so keystrokes land without an
            // extra click when the window is focused from the taskbar
            try {
                const doc = this.iframe.contentDocument;
                const el = doc && (doc.querySelector('textarea, input, [contenteditable], canvas') || doc.body);
                if (el && el.focus) el.focus({ preventScroll: true });
            } catch (e) { /* cross-origin or not ready */ }
        }
    }

    // ------------------------------------------------------------ actions
    focus() { Vulpes.wm.focus(this); }

    setState(state, animate = true) {
        // this.bounds always holds the floating geometry, so restoring is exact
        this.state = state;
        this.applyGeometry(animate);
        this.updateMaximizeButton();
        this.save();
    }

    toggleMaximize() {
        if (Vulpes.isMobile()) return;
        this.setState(this.state === 'normal' ? 'maximized' : 'normal');
    }

    minimize() {
        if (this.minimized) return;
        this.minimized = true;
        this.post({ type: 'webx11:release_all' });
        const target = Vulpes.wm.taskButton(this);
        const done = () => { this.el.classList.add('minimized'); };
        if (target && this.el.animate && Vulpes.wm.motion(1)) {
            const a = this.el.getBoundingClientRect(), b = target.getBoundingClientRect();
            const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
            const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
            this.el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 }],
                { duration: 190, easing: 'cubic-bezier(.4,0,.6,1)' }).finished.then(done, done);
        } else done();
        Vulpes.wm.onMinimize(this);
        this.save();
    }

    restore() {
        if (!this.minimized) return;
        this.minimized = false;
        this.el.classList.remove('minimized');
        const target = Vulpes.wm.taskButton(this);
        if (target && this.el.animate && Vulpes.wm.motion(1)) {
            const a = this.el.getBoundingClientRect(), b = target.getBoundingClientRect();
            const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
            const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
            this.el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
        this.save();
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this._readyTimer);
        clearTimeout(this._saveTimer);
        if (this._termAutofit) { this._termAutofit.disconnect(); this._termAutofit = null; }
        if (this._onNavigate) window.removeEventListener('message', this._onNavigate);
        Vulpes.wm.remove(this);
        const finish = () => this.el.remove();
        if (this.el.animate && Vulpes.wm.motion(1) && !this.minimized) {
            this.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }],
                { duration: 120, easing: 'ease-in' }).finished.then(finish, finish);
        } else finish();

        // backend cleanup happens after the window is gone from the screen
        const jobs = [Vulpes.api.deleteWindow(this.id)];
        if (this.displayId) jobs.push(Vulpes.api.closeDisplay(this.displayId));
        if (this.tabs && this.tabs.length) this.tabs.forEach(t => jobs.push(Vulpes.api.stopTerminal(t.port)));
        else if (this.terminalPort) jobs.push(Vulpes.api.stopTerminal(this.terminalPort));
        await Promise.allSettled(jobs);
    }

    // -------------------------------------------------------- persistence
    save() {
        if (this.closed) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            Vulpes.api.saveWindow(this.toJSON()).catch(e => console.error('Failed to save window state:', e));
        }, 250);
    }

    toJSON() {
        return {
            id: this.id,
            app_id: this.app.id,
            type: this.app.type,
            title: this.app.name,
            icon: this.app.id,
            x: this.bounds.x,
            y: this.bounds.y,
            width: this.bounds.width,
            height: this.bounds.height,
            isMaximized: this.state === 'maximized',
            isMinimized: this.minimized,
            snap: (this.state === 'left' || this.state === 'right') ? this.state : null,
            displayId: this.displayId,
            terminalPort: this.terminalPort,
            zIndex: this.zIndex,
            data: {},
        };
    }
}
