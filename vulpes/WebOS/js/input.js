

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
