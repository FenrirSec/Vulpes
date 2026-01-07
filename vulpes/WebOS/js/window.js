
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
        this.el = document.createElement('div');
        this.el.className = 'window ' + this.app.type;
        this.el.id = this.id;
        this.el.style.left = `${this.bounds.x}px`;
        this.el.style.top = `${this.bounds.y}px`;
        this.el.style.width = `${this.bounds.width}px`;
        this.el.style.height = `${this.bounds.height}px`;
        this.el.style.zIndex = this.zIndex;

        this.el.innerHTML = `
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


        document.getElementById('workspace').appendChild(this.el);

	this.element = this.el
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
            dragOffset.y = e.clientY - rect.top;
            
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
            body: JSON.stringify({ width: 10000, height: 10000 })
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


        const iframe = document.createElement('iframe');
        iframe.src = `${API_BASE}/display/${this.displayId}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        contentDiv.appendChild(iframe);
        
        this.waitForCanvasReady(iframe, contentDiv);
        console.log('Executable loaded')
        this.hasLoaded = false;
        this.monitorCanvas(iframe);
	// We update the size directly after the original display is done
	setTimeout(async function() {
            await fetch(`${API_BASE}/resize/${displayId}/${Math.floor(contentRect.width)}/${Math.floor(contentRect.height)}`, {
		method: 'POST'
            });
	}, 1000);
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
            headers: { 'Content-Type': 'application/json', ...Vulpes.api.getAuthHeaders() },
            body: JSON.stringify({ command })
        });
        
        const data = await response.json();
        this.terminalPort = data.port;

        const iframe = document.createElement('iframe');
        iframe.src = window.location.toString() + `/term/${data.port.toString()}/`

        contentDiv.appendChild(iframe);
        this.waitForCanvasReady(iframe, contentDiv);
    }

    waitForCanvasReady(iframe, contentDiv) {
        console.log('waitForCanvasReady')

        const loading = contentDiv.querySelector('.window-loading');
        if (!loading) return;

        const checkCanvas = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                console.log('document', iframeDoc)
                if (!iframeDoc) return false;

                // Temporary fix for the resize issue
                const scrollHeight = iframe.contentDocument.body.scrollHeight
		iframe.contentDocument.body.addEventListener("resize", () => {
		    console.log('RESIZE EVENT CALLED')
		})
                console.log('scrollHeight is', scrollHeight)
                if (scrollHeight == 150) {
                    setTimeout(() => {
                    iframe.style.height = '100%'
                    iframe.style.width = '100%'
                    }, 500)
                }
                //
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
                    console.log('Canvas Loaded!')
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
            try {
		const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
		const canvas = iframeDoc.querySelector('canvas#windowImage');

                if (!iframeDoc) return;
                if (!canvas) return;

                const ctx = canvas.getContext('2d', { alpha: false,
                    willReadFrequently: true,
                    desynchronized: true 
                });

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                
                let allBlack = true;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 5 || pixels[i+1] > 5 || pixels[i+2] > 5) {
                        allBlack = false;
                        break;
                    }
                }
                
                if (allBlack && this.hasLoaded) {
                    console.log('Canvas is empty, closing window:', this.app.name);
                    clearInterval(checkInterval);
                    this.close();
                } else {
                    this.hasLoaded = true;
                }
            } catch (e) {
		console.warning(e)
            }
        }, 1000);

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

        if (this.isMaximized && this.savedBounds) {
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
                headers: Vulpes.api.getAuthHeaders()
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
            headers: { 'Content-Type': 'application/json', ...Vulpes.api.getAuthHeaders() },
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
            headers: Vulpes.api.getAuthHeaders()
        });
        console.log('Window state deleted:', windowId);
    } catch (error) {
        console.error('Failed to delete window state:', error);
    }
}

async function getSession() {
    try {
        const response = await fetch(`${APPS_API_BASE}/session`, {
            headers: Vulpes.api.getAuthHeaders()
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
        const app = Vulpes.applications.find(a => a.id === winData.app_id);
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
