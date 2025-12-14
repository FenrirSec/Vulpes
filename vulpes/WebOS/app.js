const API_BASE = window.location.toString().replace('/8000', '/8080')
const APPS_API_BASE = window.location.toString().replace('/8000', '/8082')
//const APPS_API_BASE = window.location.toString().replace('/8000', '/8082') 

// Authentication
let authCredentials = null;

// Request keyboard lock on mobile
if (navigator.keyboard && navigator.keyboard.lock) {
    navigator.keyboard.lock(['Escape', 'KeyW', 'KeyT']);
}

// State
let windows = [];
let nextZIndex = 100;
let activeWindow = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let resizeState = null;
let isMobile = window.innerWidth <= 768;
let applications = [];
let appLoadInterval = null;

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

// Window class
class Window {
    constructor(app, data = {}) {
        this.id = data.id || `window-${Date.now()}-${Math.random()}`;
        this.app = app;
        this.data = data;
        this.element = null;
        this.isMaximized = data.isMaximized || false;
        this.savedBounds = data.savedBounds || null;
        this.zIndex = nextZIndex++;
        this.displayId = data.displayId || null;
        this.terminalPort = data.terminalPort || null;
        
        this.bounds = {
            x: data.x || (window.innerWidth / 2 - 400),
            y: data.y || (window.innerHeight / 2 - 300),
            width: data.width || 800,
            height: data.height || 600
        };
        
        this.create();
    }

    create() {
        const win = document.createElement('div');
        win.className = 'window';
        win.id = this.id;
        win.style.left = `${this.bounds.x}px`;
        win.style.top = `${this.bounds.y}px`;
        win.style.width = `${this.bounds.width}px`;
        win.style.height = `${this.bounds.height}px`;
        win.style.zIndex = this.zIndex;

        win.innerHTML = `
            <div class="window-titlebar" data-window-id="${this.id}">
                <div class="window-title">
                    <span class="window-icon"><img class="app-icon" src="${this.app.icon}"/></span>
                    <span>${this.app.name}</span>
                </div>
                <div class="window-controls">
                    <button class="window-control-btn window-control-close" data-action="close"></button>
                    <button class="window-control-btn window-control-minimize" data-action="minimize"></button>
                    <button class="window-control-btn window-control-maximize" data-action="maximize"></button>
                </div>
            </div>
            <div class="window-content">
                <div class="window-loading">
                    <div class="spinner"></div>
                    <div>Loading ${this.app.name}...</div>
                </div>
            </div>
            ${!isMobile ? `
                <div class="resize-handle n"></div>
                <div class="resize-handle s"></div>
                <div class="resize-handle e"></div>
                <div class="resize-handle w"></div>
                <div class="resize-handle ne"></div>
                <div class="resize-handle nw"></div>
                <div class="resize-handle se"></div>
                <div class="resize-handle sw"></div>
            ` : ''}
        `;

        document.getElementById('workspace').appendChild(win);
        this.element = win;

        this.setupEventListeners();
        
        if (!this.data.restored) {
            this.loadContent();
        } else {
            this.reconnectContent();
        }
    }

    setupEventListeners() {
        const titlebar = this.element.querySelector('.window-titlebar');
        const controls = this.element.querySelectorAll('.window-control-btn');

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control-btn')) return;
            
            console.log('mousedown')
            e.preventDefault();
            e.stopPropagation();
            
            this.focus();
            isDragging = true;
            
            const rect = this.element.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;

            // dragOffset.y = e.clientY - rect.top;
            
            window.draggingWindow = this;
            
            document.body.style.cursor = 'grabbing';
            this.element.style.transition = 'none';
        });

        titlebar.addEventListener('touchstart', (e) => {
            if (e.target.closest('.window-control-btn')) return;
            
            e.preventDefault();
            this.focus();
            isDragging = true;
            
            const touch = e.touches[0];
            const rect = this.element.getBoundingClientRect();
            dragOffset.x = touch.clientX - rect.left;
            dragOffset.y = touch.clientY - rect.top;
            
            window.draggingWindow = this;
        });

        controls.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'close') this.close();
                else if (action === 'minimize') this.minimize();
                else if (action === 'maximize') this.toggleMaximize();
            });
        });

        this.element.addEventListener('mousedown', () => this.focus());

        if (!isMobile) {
            const resizeHandles = this.element.querySelectorAll('.resize-handle');
            resizeHandles.forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startResize(e, handle.classList[1]);
                });
            });
        }
    }

    async loadContent() {
        const contentDiv = this.element.querySelector('.window-content');
        const loading = contentDiv.querySelector('.window-loading');

        try {
            if (this.app.type === 'executable') {
                await this.loadExecutable(contentDiv);
            } else if (this.app.type === 'url') {
                await this.loadUrl(contentDiv);
                if (loading) loading.remove();
            } else if (this.app.type === 'tui' || this.app.type === 'terminal') {
                await this.loadTerminal(contentDiv);
                if (loading) loading.remove();
            }
            
            await saveWindowState(this);
        } catch (error) {
            console.error('Failed to load content:', error);
            if (loading) {
                loading.innerHTML = `
                    <div style="color: var(--accent-error)">Failed to load</div>
                    <div style="font-size: 11px">${error.message}</div>
                `;
            }
        }
    }

    async reconnectContent() {
        const contentDiv = this.element.querySelector('.window-content');
        const loading = contentDiv.querySelector('.window-loading');

        try {
            if (this.app.type === 'executable' && this.displayId) {
                const iframe = document.createElement('iframe');
                iframe.src = `${API_BASE}/display/${this.displayId}`;
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                contentDiv.appendChild(iframe);
                
                this.waitForCanvasReady(iframe, contentDiv);
                this.monitorCanvas(iframe);
            } else if (this.app.type === 'url') {
                await this.loadUrl(contentDiv);
                if (loading) loading.remove();
            } else if (this.app.type === 'tui' || this.app.type === 'terminal') {
                await this.loadTerminal(contentDiv);
                if (loading) loading.remove();
            }
        } catch (error) {
            console.error('Failed to reconnect content:', error);
            await this.loadContent();
        }
    }

    async loadExecutable(contentDiv) {
        const displayRes = await fetch(`${API_BASE}/display`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width: 1440, height: 3445 })
        });

        if (!displayRes.ok) throw new Error(`Failed to create display: HTTP ${displayRes.status}`);
        const displayData = await displayRes.json();
        this.displayId = displayData.display;

        const execRes = await fetch(`${API_BASE}/display/${this.displayId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executable: this.app.executable })
        });

        if (!execRes.ok) throw new Error(`Failed to launch executable: HTTP ${execRes.status}`);

        const contentRect = contentDiv.getBoundingClientRect();

        const displayId = this.displayId;
	        setTimeout(async function() {
                await fetch(`${API_BASE}/resize/${displayId}/${Math.floor(contentRect.width)}/${Math.floor(contentRect.height)}`, {
		            method: 'POST'
                    });
	        }, 1000);

        const iframe = document.createElement('iframe');
        iframe.src = `${API_BASE}/display/${this.displayId}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        contentDiv.appendChild(iframe);
        
        this.waitForCanvasReady(iframe, contentDiv);
        this.monitorCanvas(iframe);
    }

    async loadUrl(contentDiv) {
        const shouldProxy = this.app.proxy !== false;
        
        const iframe = document.createElement('iframe');
        
        if (shouldProxy) {
            const proxyUrl = `${APPS_API_BASE}/proxy/${btoa(this.app.url)}`;
            iframe.src = proxyUrl;
            iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups';
            
            window.addEventListener('message', (event) => {
                if (event.data.type === 'navigate') {
                    iframe.src = `${APPS_API_BASE}/proxy/${btoa(event.data.url)}`;
                }
            });
        } else {
            iframe.src = this.app.url;
            iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation';
        }
        
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        
        contentDiv.appendChild(iframe);
    }

    async loadTerminal(contentDiv) {
        const command = this.app.command || null;
        const response = await fetch(`${APPS_API_BASE}/terminal/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ command })
        });
        
        const data = await response.json();
        this.terminalPort = data.port;

        const iframe = document.createElement('iframe');
        iframe.src = window.location.toString().replace('/8000', `/${data.port.toString()}/term`)
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        contentDiv.appendChild(iframe);
    }

    waitForCanvasReady(iframe, contentDiv) {
        const loading = contentDiv.querySelector('.window-loading');
        if (!loading) return;

        const checkCanvas = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return false;

                const canvas = iframeDoc.querySelector('canvas#windowImage');
                return canvas && canvas.width > 100 && canvas.height > 100;
            } catch (e) {
                return false;
            }
        };

        const pollInterval = setInterval(() => {
            if (checkCanvas()) {
                clearInterval(pollInterval);
                if (loading && loading.parentNode) {
                    loading.remove();
                }
            }
        }, 50);

        setTimeout(() => {
            clearInterval(pollInterval);
            if (loading && loading.parentNode) {
                loading.remove();
            }
        }, 3000);
    }

    monitorCanvas(iframe) {
        const checkInterval = setInterval(() => {
            console.log("Checking canvas")
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return;

                const canvas = iframeDoc.querySelector('canvas#windowImage');
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                
                let allBlack = true;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 5 || pixels[i+1] > 5 || pixels[i+2] > 5) {
                        allBlack = false;
                        break;
                    }
                }
                
                if (allBlack) {
                    console.log('Canvas is empty, closing window:', this.app.name);
                    clearInterval(checkInterval);
                    this.close();
                }
            } catch (e) {
                // Ignore cross-origin errors
            }
        }, 2000);

        this.canvasMonitorInterval = checkInterval;
    }

    focus() {
        windows.forEach(w => w.element.classList.remove('active'));
        this.element.classList.add('active');
        this.zIndex = nextZIndex++;
        this.element.style.zIndex = this.zIndex;
        activeWindow = this;
        updateWindowManager();
    }

    toggleMaximize() {
        if (isMobile) return;

        if (this.isMaximized) {
            this.element.classList.remove('maximized');
            this.element.style.left = `${this.savedBounds.x}px`;
            this.element.style.top = `${this.savedBounds.y}px`;
            this.element.style.width = `${this.savedBounds.width}px`;
            this.element.style.height = `${this.savedBounds.height}px`;
            this.isMaximized = false;
        } else {
            this.savedBounds = { ...this.bounds };
            this.element.classList.add('maximized');
            this.isMaximized = true;
        }
        
        saveWindowState(this);
    }

    minimize() {
        this.element.style.display = 'none';
        showNotification(`${this.app.name} minimized`, 'success');
        saveWindowState(this);
        updateWindowManager();
    }

    async close() {
        if (this.canvasMonitorInterval) {
            clearInterval(this.canvasMonitorInterval);
        }
        
        await deleteWindowState(this.id);
        
        if (this.displayId) {
            await fetch(`${API_BASE}/display/${this.displayId}`, { method: 'DELETE' });
        }
        
        if (this.terminalPort) {
            await fetch(`${APPS_API_BASE}/terminal/${this.terminalPort}`, { 
                method: 'DELETE',
                headers: getAuthHeaders()
            });
        }
        
        this.element.remove();
        windows = windows.filter(w => w.id !== this.id);
        
        if (activeWindow === this) {
            activeWindow = windows[windows.length - 1] || null;
            if (activeWindow) activeWindow.focus();
        }
        
        updateWindowManager();
    }

    startResize(e, direction) {
        e.preventDefault();
        e.stopPropagation();
        
        this.focus();
        resizeState = {
            window: this,
            direction,
            startX: e.clientX,
            startY: e.clientY,
            startBounds: { ...this.bounds }
        };
        
        this.hideContent();
        document.body.style.cursor = window.getComputedStyle(e.target).cursor;
    }

    resize(dx, dy) {
        const { direction, startBounds } = resizeState;
        const newBounds = { ...startBounds };

        if (direction.includes('e')) {
            newBounds.width = Math.max(400, startBounds.width + dx);
        }
        if (direction.includes('w')) {
            const newWidth = Math.max(400, startBounds.width - dx);
            const widthDiff = newWidth - startBounds.width;
            newBounds.x = startBounds.x - widthDiff;
            newBounds.width = newWidth;
        }
        if (direction.includes('s')) {
            newBounds.height = Math.max(300, startBounds.height + dy);
        }
        if (direction.includes('n')) {
            const newHeight = Math.max(300, startBounds.height - dy);
            const heightDiff = newHeight - startBounds.height;
            newBounds.y = startBounds.y - heightDiff;
            newBounds.height = newHeight;
        }

        this.bounds = newBounds;
        this.element.style.left = `${newBounds.x}px`;
        this.element.style.top = `${newBounds.y}px`;
        this.element.style.width = `${newBounds.width}px`;
        this.element.style.height = `${newBounds.height}px`;
        
        const titlebar = this.element.querySelector('.window-titlebar');
        if (titlebar) {
            let resizeIndicator = titlebar.querySelector('.resize-indicator');
            if (!resizeIndicator) {
                resizeIndicator = document.createElement('div');
                resizeIndicator.className = 'resize-indicator';
                resizeIndicator.style.cssText = 'position: absolute; right: 50%; transform: translateX(50%); background: var(--bg-secondary); padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid var(--border); pointer-events: none;';
                titlebar.appendChild(resizeIndicator);
            }
            resizeIndicator.textContent = `${Math.floor(newBounds.width)} × ${Math.floor(newBounds.height)}`;
            resizeIndicator.style.display = 'block';
        }
    }

    hideContent() {
        const contentDiv = this.element.querySelector('.window-content');
        if (contentDiv) contentDiv.style.visibility = 'hidden';
    }

    showContent() {
        const contentDiv = this.element.querySelector('.window-content');
        if (contentDiv) contentDiv.style.visibility = 'visible';
    }
    
    async finishResize() {
        const resizeIndicator = this.element.querySelector('.resize-indicator');
        if (resizeIndicator) {
            resizeIndicator.style.display = 'none';
        }
        
        if (this.displayId && this.app.type === 'executable') {
            const contentDiv = this.element.querySelector('.window-content');
            const rect = contentDiv.getBoundingClientRect();
            const width = Math.floor(rect.width);
            const height = Math.floor(rect.height);
            
            try {
                await fetch(`${API_BASE}/resize/${this.displayId}/${width}/${height}`, {
                    method: 'POST'
                });
            } catch (error) {
                console.error('Failed to resize display:', error);
            }
        }
        
        this.showContent();
        await saveWindowState(this);
    }

    toJSON() {
        return {
            id: this.id,
            app_id: this.app.id,
            type: this.app.type,
            title: this.app.name,
            icon: this.app.icon,
            x: this.bounds.x,
            y: this.bounds.y,
            width: this.bounds.width,
            height: this.bounds.height,
            isMaximized: this.isMaximized,
            displayId: this.displayId,
            terminalPort: this.terminalPort,
            zIndex: this.zIndex,
            data: this.data
        };
    }
}

async function saveWindowState(window) {
    try {
        await fetch(`${APPS_API_BASE}/session/window`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(window.toJSON())
        });
        console.log('Window state saved:', window.id);
    } catch (error) {
        console.error('Failed to save window state:', error);
    }
}

async function deleteWindowState(windowId) {
    try {
        await fetch(`${APPS_API_BASE}/session/window/${windowId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        console.log('Window state deleted:', windowId);
    } catch (error) {
        console.error('Failed to delete window state:', error);
    }
}

async function getSession() {
    try {
        const response = await fetch(`${APPS_API_BASE}/session`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        console.log('Windows:', data.windows.length);
        return data.windows;
    } catch (error) {
        console.error('Failed to get session:', error);
        return [];
    }
}

async function restoreWindowsState() {
    const windowStates = await getSession();
    
    console.log('Restoring windows:', windowStates);
    
    if (!windowStates || windowStates.length === 0) {
        console.log('No windows to restore');
        return;
    }
    
    for (const winData of windowStates) {
        const app = applications.find(a => a.id === winData.app_id);
        if (!app) {
            console.warn('App not found for window:', winData.app_id);
            continue;
        }
        
        console.log('Restoring window:', winData.id, 'for app:', app.name);
        
        const win = new Window(app, {
            id: winData.id,
            x: winData.x,
            y: winData.y,
            width: winData.width,
            height: winData.height,
            isMaximized: winData.isMaximized,
            displayId: winData.displayId,
            terminalPort: winData.terminalPort,
            restored: true
        });
        windows.push(win);
    }
    
    if (windows.length > 0) {
        showNotification(`Restored ${windows.length} window(s)`, 'success');
        console.log('Successfully restored', windows.length, 'windows');
    }
    
    updateWindowManager();
}

// Constrain window position to viewport
function constrainToViewport(x, y, width, height) {
    const topbarHeight = isMobile ? 44 : 32;
    const minVisibleHeight = 34; // titlebar height
    
    // Ensure top of window (titlebar) is always visible
    const maxY = window.innerHeight - minVisibleHeight;
    const minY = topbarHeight;
    
    // Keep some of the window visible horizontally
    const minVisibleWidth = 100;
    const maxX = window.innerWidth - minVisibleWidth;
    const minX = -width + minVisibleWidth;
    
    return {
        x: Math.max(minX, Math.min(x, maxX)),
        y: Math.max(minY, Math.min(y, maxY))
    };
}

// Global mouse/touch handlers with viewport constraints
document.addEventListener('mousemove', (e) => {
    if (isDragging && window.draggingWindow) {
        e.preventDefault();
        
        const win = window.draggingWindow;
        if (win.isMaximized) return;
        
        let newX = e.clientX - dragOffset.x;
        let newY = e.clientY - dragOffset.y;
        
        // Constrain to viewport
        const constrained = constrainToViewport(newX, newY, win.bounds.width, win.bounds.height);
        newX = constrained.x;
        newY = constrained.y;
        
        win.bounds.x = newX;
        win.bounds.y = newY;
        win.element.style.left = `${newX}px`;
        win.element.style.top = `${newY}px`;
    } else if (resizeState) {
        e.preventDefault();
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        resizeState.window.resize(dx, dy);
    }
});

document.addEventListener('touchmove', (e) => {
    if (isDragging && window.draggingWindow) {
        const touch = e.touches[0];
        const win = window.draggingWindow;
        
        let newX = touch.clientX - dragOffset.x;
        let newY = touch.clientY - dragOffset.y;
        
        // Constrain to viewport
        const constrained = constrainToViewport(newX, newY, win.bounds.width, win.bounds.height);
        newX = constrained.x;
        newY = constrained.y;
        
        win.bounds.x = newX;
        win.bounds.y = newY;
        win.element.style.left = `${newX}px`;
        win.element.style.top = `${newY}px`;
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        window.draggingWindow = null;
        document.body.style.cursor = '';
        
        windows.forEach(w => {
            if (w.element) w.element.style.transition = '';
        });
        
        if (activeWindow) {
            saveWindowState(activeWindow);
        }
    }
    if (resizeState) {
        const win = resizeState.window;
        resizeState = null;
        document.body.style.cursor = '';
        
        if (win) {
            win.finishResize();
        }
    }
});

document.addEventListener('touchend', () => {
    if (isDragging) {
        isDragging = false;
        window.draggingWindow = null;
        if (activeWindow) {
            saveWindowState(activeWindow);
        }
    }
    if (resizeState) {
        const win = resizeState.window;
        resizeState = null;
        
        if (win) {
            win.finishResize();
        }
    }
});

// Application Management
async function loadApplications() {
    try {
        const response = await fetch(`${APPS_API_BASE}/applications`, {
            headers: getAuthHeaders()
        });
        const newApps = await response.json();
        
        const appsChanged = JSON.stringify(applications) !== JSON.stringify(newApps);
        
        if (appsChanged) {
            applications = newApps;
            renderApplications();
            if (applications.length > 0 && appLoadInterval) {
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

    applications.forEach(app => {
        const appItem = document.createElement('div');
        appItem.className = 'app-item';
        appItem.innerHTML = `
            <div class="app-item-icon"><img class="app-icon" src="${app.icon}"/></div>
            <div class="app-item-name">${app.name}</div>
        `;
        appItem.addEventListener('click', () => launchApp(app));
        launcher.appendChild(appItem);

        if (app.docked) {
            const dockItem = document.createElement('div');
            dockItem.className = 'dock-item';
            dockItem.innerHTML = `
                <div class="dock-item-icon"><img class="app-icon" src="${app.icon}"/></div>
                <div class="dock-item-label">${app.name}</div>
            `;
            dockItem.addEventListener('click', () => launchApp(app));
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

// Window Manager UI
function updateWindowManager() {
    const content = document.getElementById('windowManagerContent');
    
    if (!content) {
        const panel = document.getElementById('windowManagerPanel');
        if (panel) {
            const existingContent = panel.querySelector('.window-manager-content');
            if (!existingContent) {
                const newContent = document.createElement('div');
                newContent.id = 'windowManagerContent';
                newContent.className = 'window-manager-content';
                panel.appendChild(newContent);
            }
        }
        return updateWindowManager();
    }
    
    if (windows.length === 0) {
        content.innerHTML = '<div class="window-manager-empty">No windows open</div>';
        return;
    }
    
    content.innerHTML = '';
    
    windows.forEach(win => {
        const item = document.createElement('div');
        item.className = 'window-manager-item';
        if (win === activeWindow) {
            item.classList.add('active');
        }
        
        const isMinimized = win.element.style.display === 'none';
        const typeLabel = win.app.type === 'executable' ? 'App' : 
                         win.app.type === 'url' ? 'Web' : 'Terminal';
        
        item.innerHTML = `
            <div class="window-manager-item-icon"><img src="${win.app.icon}" alt="${win.app.name}"/></div>
            <div class="window-manager-item-info">
                <div class="window-manager-item-title">${win.app.name}</div>
                <div class="window-manager-item-meta">${typeLabel}${isMinimized ? ' • Minimized' : ''}</div>
            </div>
            <button class="window-manager-item-close" data-window-id="${win.id}" title="Close">×</button>
        `;
        
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('window-manager-item-close')) return;
            
            if (isMinimized) {
                win.element.style.display = 'block';
            }
            win.focus();
            document.getElementById('windowManagerPanel').classList.remove('open');
        });
        
        const closeBtn = item.querySelector('.window-manager-item-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            win.close();
        });
        
        content.appendChild(item);
    });
}

// UI Functions
function showNotification(message, type = 'success') {
    const bar = document.getElementById('notificationsBar');
    bar.textContent = message;
    bar.className = `notifications-bar show ${type}`;
    
    setTimeout(() => {
        bar.classList.remove('show');
    }, 3000);
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    document.getElementById('clock').textContent = time;
}

// Event Listeners
document.getElementById('appsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('appLauncher').classList.toggle('open');
    document.getElementById('windowManagerPanel').classList.remove('open');
});

document.getElementById('appsBtn').addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('appLauncher').classList.toggle('open');
    document.getElementById('windowManagerPanel').classList.remove('open');
});

document.getElementById('windowsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('windowManagerPanel').classList.toggle('open');
    document.getElementById('appLauncher').classList.remove('open');
});

document.getElementById('windowsBtn').addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('windowManagerPanel').classList.toggle('open');
    document.getElementById('appLauncher').classList.remove('open');
});

document.getElementById('settingsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('settingsPanel').classList.add('open');
});

document.getElementById('settingsBtn').addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('settingsPanel').classList.add('open');
});

document.getElementById('settingsClose').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('settingsPanel').classList.remove('open');
});

document.getElementById('settingsClose').addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('settingsPanel').classList.remove('open');
});

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
        
        localStorage.setItem('theme', theme);
    });
});

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    const launcher = document.getElementById('appLauncher');
    const appsBtn = document.getElementById('appsBtn');
    const windowManager = document.getElementById('windowManagerPanel');
    const windowsBtn = document.getElementById('windowsBtn');
    
    if (!launcher.contains(e.target) && !appsBtn.contains(e.target)) {
        launcher.classList.remove('open');
    }
    
    if (!windowManager.contains(e.target) && !windowsBtn.contains(e.target)) {
        windowManager.classList.remove('open');
    }
});

// Initialize
async function init() {
    updateClock();
    setInterval(updateClock, 1000);
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('light-button').classList.add('active');
        document.getElementById('dark-button').classList.remove('active');
    }
    
    // Initial app load
    await loadApplications();
    
    // Restore windows after applications are loaded
    await restoreWindowsState();
    
    // Poll for application changes every 10 seconds
    appLoadInterval = setInterval(loadApplications, 10000);
    
    showNotification('Vulpes Desktop ready', 'success');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (appLoadInterval) {
        clearInterval(appLoadInterval);
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;
    
    if (wasMobile !== isMobile) {
        location.reload();
    }
});

// Start application
(async function() {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        showLoginModal();
    } else {
        await init();
    }
})()
