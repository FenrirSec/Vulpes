
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