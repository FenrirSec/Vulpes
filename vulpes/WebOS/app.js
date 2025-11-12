const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;
const APPS_API_BASE = `${window.location.protocol}//${window.location.hostname}:8082`;

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
let sessionId = null;

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
        
        // Only load content if this is a new window (no displayId/terminalPort from restore)
        if (!this.data.restored) {
            this.loadContent();
        } else {
            // Window was restored, reconnect to existing session
            this.reconnectContent();
        }
    }

    setupEventListeners() {
        const titlebar = this.element.querySelector('.window-titlebar');
        const controls = this.element.querySelectorAll('.window-control-btn');

        // Calculate offset to prevent window jump
        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control-btn')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            this.focus();
            isDragging = true;
            
            // Calculate offset from mouse to window top-left corner
            const rect = this.element.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            // Store reference to dragging window
            window.draggingWindow = this;
            
            document.body.style.cursor = 'grabbing';
            this.element.style.transition = 'none';
        });

        // Touch support for mobile
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
                // Don't remove loading here - waitForCanvasReady will handle it
            } else if (this.app.type === 'url') {
                await this.loadUrl(contentDiv);
                if (loading) loading.remove();
            } else if (this.app.type === 'tui' || this.app.type === 'terminal') {
                await this.loadTerminal(contentDiv);
                if (loading) loading.remove();
            }
            
            // Save window state after content is loaded
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
                // Reconnect to existing display
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
                // Always start fresh terminal session on reconnect
                await this.loadTerminal(contentDiv);
                if (loading) loading.remove();
            }
        } catch (error) {
            console.error('Failed to reconnect content:', error);
            await this.loadContent();
        }
    }

    async loadExecutable(contentDiv) {
        // Request a display from the X11 display API
        const displayRes = await fetch(`${API_BASE}/display`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width: 1440, height: 3445 })
        });

        if (!displayRes.ok) throw new Error(`Failed to create display: HTTP ${displayRes.status}`);
        const displayData = await displayRes.json();
        this.displayId = displayData.display;

        // Launch the executable on the display
        const execRes = await fetch(`${API_BASE}/display/${this.displayId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executable: this.app.executable })
        });

        if (!execRes.ok) throw new Error(`Failed to launch executable: HTTP ${execRes.status}`);

        // Resize display to match window content area
        const contentRect = contentDiv.getBoundingClientRect();
        await fetch(`${API_BASE}/resize/${this.displayId}/${Math.floor(contentRect.width)}/${Math.floor(contentRect.height)}`, {
            method: 'POST'
        });

        // Create iframe pointing to the display viewer
        const iframe = document.createElement('iframe');
        iframe.src = `${API_BASE}/display/${this.displayId}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        contentDiv.appendChild(iframe);
        
        // Wait for canvas to appear and monitor for closure
        this.waitForCanvasReady(iframe, contentDiv);
        this.monitorCanvas(iframe);
    }

    async loadUrl(contentDiv) {
        // Check if app should be proxied (default: true for compatibility)
        const shouldProxy = this.app.proxy !== false;
        
        const iframe = document.createElement('iframe');
        
        if (shouldProxy) {
            const proxyUrl = `${APPS_API_BASE}/proxy?url=${encodeURIComponent(this.app.url)}`;
            iframe.src = proxyUrl;
            iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups';
            
            // Handle navigation for proxied URLs
            window.addEventListener('message', (event) => {
                if (event.data.type === 'navigate') {
                    iframe.src = `${APPS_API_BASE}/proxy?url=${encodeURIComponent(event.data.url)}`;
                }
            });
        } else {
            // Direct URL without proxy
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        const data = await response.json();
        this.terminalPort = data.port;

        const iframe = document.createElement('iframe');
        iframe.src = data.url;
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
                // Just check if canvas exists with reasonable dimensions
                return canvas && canvas.width > 100 && canvas.height > 100;
            } catch (e) {
                return false;
            }
        };

        // Faster polling for quicker detection
        const pollInterval = setInterval(() => {
            if (checkCanvas()) {
                clearInterval(pollInterval);
                if (loading && loading.parentNode) {
                    loading.remove();
                }
            }
        }, 50);

        // Shorter timeout - remove loading after 3 seconds
        setTimeout(() => {
            clearInterval(pollInterval);
            if (loading && loading.parentNode) {
                loading.remove();
            }
        }, 3000);
    }

    monitorCanvas(iframe) {
        // Monitor canvas for app closure (all black/empty)
        const checkInterval = setInterval(() => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return;

                const canvas = iframeDoc.querySelector('canvas#windowImage');
                if (!canvas) return;

                // Check if canvas is completely empty/black
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                
                // Check if all pixels are black (or empty)
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
        }, 2000); // Check every 2 seconds

        // Clean up interval when window closes
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
        // Clean up canvas monitor
        if (this.canvasMonitorInterval) {
            clearInterval(this.canvasMonitorInterval);
        }
        
        // Remove from server session first
        await deleteWindowState(this.id);
        
        // Close display if it's an executable
        if (this.displayId) {
            await fetch(`${API_BASE}/display/${this.displayId}`, { method: 'DELETE' });
        }
        
        // Close terminal if it's a terminal/tui
        if (this.terminalPort) {
            await fetch(`${APPS_API_BASE}/terminal/${this.terminalPort}`, { method: 'DELETE' });
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
        
        // Hide content during resize
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
        
        // Show resize dimensions overlay
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
        // Remove resize indicator
        const resizeIndicator = this.element.querySelector('.resize-indicator');
        if (resizeIndicator) {
            resizeIndicator.style.display = 'none';
        }
        
        // Send resize to display API if this is an executable
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
        
        // Show content after resize is complete
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

// Server-side window state management
async function saveWindowState(window) {
    if (!sessionId) return;
    
    try {
        await fetch(`${APPS_API_BASE}/session/window`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(window.toJSON())
        });
        console.log('Window state saved:', window.id);
    } catch (error) {
        console.error('Failed to save window state:', error);
    }
}

async function deleteWindowState(windowId) {
    if (!sessionId) return;
    
    try {
        await fetch(`${APPS_API_BASE}/session/window/${windowId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        console.log('Window state deleted:', windowId);
    } catch (error) {
        console.error('Failed to delete window state:', error);
    }
}

async function getSession() {
    try {
        const response = await fetch(`${APPS_API_BASE}/session`, {
            credentials: 'include'
        });
        const data = await response.json();
        sessionId = data.session_id;
        console.log('Session loaded:', sessionId, 'Windows:', data.windows.length);
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

// Global mouse/touch handlers with proper offset tracking
document.addEventListener('mousemove', (e) => {
    if (isDragging && window.draggingWindow) {
        e.preventDefault();
        
        const win = window.draggingWindow;
        if (win.isMaximized) return;
        
        // Use the stored offset to maintain relative position
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
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
        
        const newX = touch.clientX - dragOffset.x;
        const newY = touch.clientY - dragOffset.y;
        
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
        const response = await fetch(`${APPS_API_BASE}/applications`);
        const newApps = await response.json();
        
        // Check if applications have changed
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
        // App launcher item
        const appItem = document.createElement('div');
        appItem.className = 'app-item';
        appItem.innerHTML = `
            <div class="app-item-icon"><img class="app-icon" src="${app.icon}"/></div>
            <div class="app-item-name">${app.name}</div>
        `;
        appItem.addEventListener('click', () => launchApp(app));
        launcher.appendChild(appItem);

        // Dock item (only for pinned/common apps)
        if (['firefox', 'terminal', 'thunar', 'code', 'burp', 'hacktricks'].includes(app.id)) {
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

init();