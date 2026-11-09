// HTTP API Interactions

const api = (() => {

    // Get auth basic headers
    function getAuthHeaders() {
        if (!authCredentials) return {};
        const credentials = btoa(`${authCredentials.username}:${authCredentials.password}`);
        return { 'Authorization': `Basic ${credentials}` };
    }

    async function getSession() {
        return await fetch(`${APPS_API_BASE}/session`, {
            headers: getAuthHeaders()
        })
    }

    async function getClipboard(window_id) {
        return await fetch(`${APPS_API_BASE}/session/window/${window_id}/clipboard`, {
            header: getAuthHeaders()
        })
    }

    async function postClipboard(window_id, clipboardValue) {
        return await fetch(`${APPS_API_BASE}/session/window/${window_id}/clipboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: clipboardValue })
        });
    }

    return {
        getAuthHeaders,
        getSession,
        getClipboard,
        postClipboard
    }
})();

Vulpes.api = api