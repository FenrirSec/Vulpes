// HTTP API helpers
Vulpes.api = (() => {
    let credentials = null;

    function setCredentials(c) { credentials = c; }
    function getCredentials() { return credentials; }

    function getAuthHeaders() {
        if (!credentials) return {};
        return { 'Authorization': 'Basic ' + btoa(`${credentials.username}:${credentials.password}`) };
    }

    async function apps(path, options = {}) {
        const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
        if (options.json !== undefined) {
            headers['Content-Type'] = 'application/json';
            options = { ...options, body: JSON.stringify(options.json) };
        }
        return fetch(Vulpes.APPS_API_BASE + path, { ...options, headers });
    }

    async function x11(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.json !== undefined) {
            headers['Content-Type'] = 'application/json';
            options = { ...options, body: JSON.stringify(options.json) };
        }
        return fetch(Vulpes.API_BASE + path, { ...options, headers });
    }

    const getSession = () => apps('/session');
    const getApplications = () => apps('/applications');
    const saveWindow = (state) => apps('/session/window', { method: 'POST', json: state });
    const deleteWindow = (id) => apps(`/session/window/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const startTerminal = (command) => apps('/terminal/start', { method: 'POST', json: { command } });
    const stopTerminal = (port) => apps(`/terminal/${port}`, { method: 'DELETE' });
    const terminalStatus = (port) => apps(`/terminal/${port}/status`);

    const createDisplay = (width, height) => x11('/display', { method: 'POST', json: { width, height } });
    const runInDisplay = (id, executable) => x11(`/display/${id}/run`, { method: 'POST', json: { executable } });
    const closeDisplay = (id) => x11(`/display/${id}`, { method: 'DELETE' });
    const listDisplays = () => x11('/displays');

    return {
        setCredentials, getCredentials, getAuthHeaders,
        getSession, getApplications, saveWindow, deleteWindow,
        startTerminal, stopTerminal, terminalStatus,
        createDisplay, runInDisplay, closeDisplay, listDisplays,
    };
})();
