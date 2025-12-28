// Authentication
let authCredentials = null;
 
// Get auth headers
function getAuthHeaders() {
    if (!authCredentials) return {};
    const credentials = btoa(`${authCredentials.username}:${authCredentials.password}`);
    return { 'Authorization': `Basic ${credentials}` };
}

// Check if authenticated
async function checkAuth() {
    const stored = localStorage.getItem('authCredentials');
    if (stored) {
        try {
            authCredentials = JSON.parse(stored);
            // Verify credentials still work
            const response = await fetch(`${APPS_API_BASE}/session`, {
                headers: getAuthHeaders()
            });
            if (response.ok) {
                return true;
            }
        } catch (e) {
            console.error('Auth check failed:', e);
        }
    }
    return false;
}

// Show login modal
function showLoginModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(13, 17, 23, 0.95);
        backdrop-filter: blur(20px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 32px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 60px -15px var(--shadow);
        ">
            <h2 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600; color: var(--text-primary);">
                Vulpes Desktop Login
            </h2>
            <form id="loginForm">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 12px; font-weight: 500; color: var(--text-secondary);">
                        Username
                    </label>
                    <input 
                        type="text" 
                        id="username" 
                        required
                        style="
                            width: 100%;
                            padding: 12px;
                            background: var(--bg-tertiary);
                            border: 1px solid var(--border);
                            border-radius: var(--radius-sm);
                            color: var(--text-primary);
                            font-size: 14px;
                        "
                    />
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 12px; font-weight: 500; color: var(--text-secondary);">
                        Password
                    </label>
                    <input 
                        type="password" 
                        id="password" 
                        required
                        style="
                            width: 100%;
                            padding: 12px;
                            background: var(--bg-tertiary);
                            border: 1px solid var(--border);
                            border-radius: var(--radius-sm);
                            color: var(--text-primary);
                            font-size: 14px;
                        "
                    />
                </div>
                <div id="loginError" style="
                    display: none;
                    margin-bottom: 16px;
                    padding: 12px;
                    background: var(--accent-error);
                    border-radius: var(--radius-sm);
                    color: white;
                    font-size: 12px;
                "></div>
                <button 
                    type="submit"
                    style="
                        width: 100%;
                        padding: 12px;
                        background: var(--accent);
                        border: none;
                        border-radius: var(--radius-sm);
                        color: white;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.15s ease;
                    "
                >
                    Login
                </button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        authCredentials = { username, password };
        
        try {
            const response = await fetch(`${APPS_API_BASE}/session`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                localStorage.setItem('authCredentials', JSON.stringify(authCredentials));
                modal.remove();
                await init();
            } else {
                errorDiv.textContent = 'Invalid username or password';
                errorDiv.style.display = 'block';
                authCredentials = null;
            }
        } catch (error) {
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
            authCredentials = null;
        }
    });
    
    document.getElementById('username').focus();
}