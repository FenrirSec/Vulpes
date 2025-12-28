const API_BASE = window.location.toString() + '/webx11'
const APPS_API_BASE = window.location.toString() + '/apps'

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
