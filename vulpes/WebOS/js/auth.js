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
    modal.id = 'modal-backdrop'
    modal.innerHTML = `
        <div id="modal">
            <h2 class="modalTitle">
                Vulpes Login
            </h2>
<p class="modalText">Login onto your Vulpes instance with your provided credentials.</p>
            <form id="loginForm">
                <div class="loginInput">
                    <input 
                        type="text" 
                        id="username"
			placeholder="Username"
                        required
                    />
                </div>

                <div class="loginInput">
                    <input 
                        type="password" 
                        id="password"
			placeholder="Password"
                        required
                    />
                </div>
                <div id="loginError" style="display: none;"></div>
                <button class="loginButton" type="submit">
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
