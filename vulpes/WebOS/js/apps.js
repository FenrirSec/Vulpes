const apps = (() => {

    // Application Management
    async function loadApplications() {
        try {
            const response = await fetch(`${APPS_API_BASE}/applications`, {
                headers: Vulpes.api.getAuthHeaders()
            });
            const newApps = await response.json();

            const appsChanged = JSON.stringify(Vulpes.applications) !== JSON.stringify(newApps);

            if (appsChanged) {
                Vulpes.applications = newApps;
                renderApplications();
                if (Vulpes.applications.length > 0 && appLoadInterval) {
                    showNotification('Applications updated', 'success');
                }
            }
        } catch (error) {
            console.error('Failed to load applications:', error);
        }
    }

    function renderApplications() {
        const launcher = document.getElementById('appLauncher');
        const dock = document.getElementById('dock');

        launcher.innerHTML = '';
        dock.innerHTML = '';

        Vulpes.applications.forEach(app => {
            const appItem = document.createElement('div');
            appItem.className = 'app-item';
            appItem.innerHTML = `
                <div class="dock-item-icon"><img class="app-icon" src="${app.icon.includes("base64") ? app.icon : '/apps/icon/' + app.icon}"/></div>
            <div class="app-item-name">${app.name}</div>
        `;
            appItem.addEventListener('click', () => Vulpes.apps.launchApp(app));
            launcher.appendChild(appItem);

            if (app.docked) {
                const dockItem = document.createElement('div');
                dockItem.className = 'dock-item';
                dockItem.innerHTML = `
                <div class="dock-item-icon"><img class="app-icon" src="${app.icon.includes("base64") ? app.icon : '/apps/icon/' + app.icon}"/></div>
                <div class="dock-item-label">${app.name}</div>
            `;
                dockItem.addEventListener('click', () => Vulpes.apps.launchApp(app));
                dock.appendChild(dockItem);
            }
        });
    }

    function launchApp(app) {
        const win = new Window(app);
        windows.push(win);
        win.focus();

        document.getElementById('appLauncher').classList.remove('open');
        showNotification(`Launching ${app.name}...`, 'success');
        updateWindowManager();
    }

    return {
        loadApplications,
        launchApp
    }
})();

Vulpes.apps = apps;