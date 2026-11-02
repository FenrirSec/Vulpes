// Startup
let appLoadInterval = null;

async function init() {
    Vulpes.wm.init();
    await Vulpes.apps.loadApplications();
    const restored = await Vulpes.wm.restoreSession();
    if (restored) Vulpes.ui.notify(`Restored ${restored} window${restored > 1 ? 's' : ''}`);
    appLoadInterval = setInterval(Vulpes.apps.loadApplications, 30000);
}

window.addEventListener('beforeunload', () => clearInterval(appLoadInterval));

(async function start() {
    Vulpes.ui.bind();
    Vulpes.apps.bind();
    if (await Vulpes.auth.check()) await init();
    else Vulpes.auth.showLogin(init);
})();
