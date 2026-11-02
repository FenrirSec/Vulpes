// Authentication (HTTP basic auth against apps.py)
Vulpes.auth = (() => {
    async function check() {
        const stored = Vulpes.ui.storage('authCredentials');
        if (!stored) return false;
        try {
            Vulpes.api.setCredentials(JSON.parse(stored));
            const response = await Vulpes.api.getSession();
            if (response.ok) return true;
        } catch (e) {
            console.error('Auth check failed:', e);
        }
        Vulpes.api.setCredentials(null);
        return false;
    }

    function showLogin(onSuccess) {
        const backdrop = document.createElement('div');
        backdrop.id = 'modal-backdrop';
        backdrop.innerHTML = `
            <form id="loginForm" class="login" autocomplete="on">
                <h1>Vulpes</h1>
                <p>Sign in with the credentials of this workstation.</p>
                <label>Username
                    <input type="text" id="username" autocomplete="username" required>
                </label>
                <label>Password
                    <input type="password" id="password" autocomplete="current-password" required>
                </label>
                <div id="loginError" class="login-error" role="alert" hidden></div>
                <button class="loginButton primary-btn" type="submit">Sign in</button>
            </form>`;
        document.body.appendChild(backdrop);

        const form = backdrop.querySelector('#loginForm');
        const errorDiv = backdrop.querySelector('#loginError');
        const button = backdrop.querySelector('.loginButton');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const credentials = {
                username: form.querySelector('#username').value,
                password: form.querySelector('#password').value,
            };
            Vulpes.api.setCredentials(credentials);
            button.disabled = true;
            errorDiv.hidden = true;
            try {
                const response = await Vulpes.api.getSession();
                if (response.ok) {
                    Vulpes.ui.storage('authCredentials', JSON.stringify(credentials));
                    backdrop.remove();
                    await onSuccess();
                    return;
                }
                errorDiv.textContent = response.status === 401
                    ? 'Wrong username or password.'
                    : `The workstation answered with an error (HTTP ${response.status}).`;
            } catch (error) {
                errorDiv.textContent = 'Cannot reach the workstation. Check that it is running, then try again.';
            }
            errorDiv.hidden = false;
            Vulpes.api.setCredentials(null);
            button.disabled = false;
        });

        form.querySelector('#username').focus();
    }

    return { check, showLogin };
})();
