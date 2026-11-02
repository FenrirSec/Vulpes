// Applications: launcher, pinned apps, icons
Vulpes.apps = (() => {
    const $ = (id) => document.getElementById(id);
    let lastJson = '';

    function iconUrl(app) {
        if (!app.icon) return null;
        if (app.icon.startsWith('data:') || /^https?:/.test(app.icon)) return app.icon;
        return null; // icon names need auth to fetch: apps.py inlines found icons as data URIs
    }

    // Icon element with a lettered fallback when the app has no usable icon
    function iconElement(app) {
        const url = iconUrl(app);
        const fallback = () => {
            const span = document.createElement('span');
            span.className = 'app-icon monogram';
            span.textContent = (app.name || '?').trim().charAt(0).toUpperCase();
            return span;
        };
        if (!url) return fallback();
        const img = document.createElement('img');
        img.className = 'app-icon';
        img.alt = '';
        img.draggable = false;
        img.src = url;
        img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
        return img;
    }

    async function loadApplications() {
        try {
            const response = await Vulpes.api.getApplications();
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            if (text === lastJson) return;
            const first = lastJson === '';
            lastJson = text;
            Vulpes.applications = JSON.parse(text).sort((a, b) => a.name.localeCompare(b.name));
            render();
            if (!first) Vulpes.ui.notify('Applications updated');
        } catch (error) {
            console.error('Failed to load applications:', error);
        }
    }

    const TYPE_LABEL = { executable: 'Desktop app', url: 'Web page', tui: 'Terminal', terminal: 'Terminal' };

    function render() {
        const grid = $('launcherGrid');
        const dock = $('dock');
        grid.innerHTML = '';
        dock.innerHTML = '';

        Vulpes.applications.forEach(app => {
            const item = document.createElement('button');
            item.className = 'app-item';
            item.dataset.id = app.id;
            item.dataset.search = `${app.name} ${app.category || ''} ${app.description || ''} ${TYPE_LABEL[app.type] || ''}`.toLowerCase();
            item.title = app.description || app.name;
            item.appendChild(iconElement(app));
            const name = document.createElement('span');
            name.className = 'app-item-name';
            name.textContent = app.name;
            item.appendChild(name);
            item.addEventListener('click', () => launchApp(app));
            grid.appendChild(item);

            if (app.docked) {
                const pin = document.createElement('button');
                pin.className = 'pin';
                pin.dataset.id = app.id;
                pin.title = `Open ${app.name}`;
                pin.appendChild(iconElement(app));
                pin.addEventListener('click', () => launchApp(app));
                dock.appendChild(pin);
            }
        });
        if (!Vulpes.applications.length) {
            grid.innerHTML = '<p class="launcher-empty">No applications found. Add .desktop files to ~/.local/share/applications or entries to applications.json.</p>';
        }
        Vulpes.wm && markRunning(new Set(Vulpes.wm.windows.map(w => w.app.id)));
    }

    function filterLauncher(query) {
        const q = query.trim().toLowerCase();
        let shown = 0;
        $('launcherGrid').querySelectorAll('.app-item').forEach(el => {
            const ok = !q || el.dataset.search.includes(q);
            el.hidden = !ok;
            if (ok) shown++;
        });
        let empty = $('launcherGrid').querySelector('.launcher-none');
        if (!shown && q) {
            if (!empty) {
                empty = document.createElement('p');
                empty.className = 'launcher-none';
                $('launcherGrid').appendChild(empty);
            }
            empty.textContent = `Nothing matches “${query.trim()}”.`;
        } else if (empty) empty.remove();
    }

    function markRunning(ids) {
        document.querySelectorAll('#dock .pin, #launcherGrid .app-item').forEach(el => {
            el.classList.toggle('running', ids.has(el.dataset.id));
        });
    }

    function launchApp(app) {
        Vulpes.ui.closeAll();
        return Vulpes.wm.open(app);
    }

    function bind() {
        const search = $('launcherSearch');
        search.addEventListener('input', () => filterLauncher(search.value));
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = [...$('launcherGrid').querySelectorAll('.app-item')].find(el => !el.hidden);
                if (first) first.click();
            } else if (e.key === 'ArrowDown') {
                const first = [...$('launcherGrid').querySelectorAll('.app-item')].find(el => !el.hidden);
                if (first) { e.preventDefault(); first.focus(); }
            }
        });
        $('launcherGrid').addEventListener('keydown', (e) => {
            const items = [...$('launcherGrid').querySelectorAll('.app-item')].filter(el => !el.hidden);
            const i = items.indexOf(document.activeElement);
            if (i < 0) return;
            const cols = Math.max(1, Math.round($('launcherGrid').clientWidth / items[0].offsetWidth));
            const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
            if (move === undefined) return;
            e.preventDefault();
            const next = items[i + move];
            if (next) next.focus(); else if (move < 0) search.focus();
        });
    }

    return { loadApplications, launchApp, iconUrl, iconElement, filterLauncher, markRunning, bind };
})();
