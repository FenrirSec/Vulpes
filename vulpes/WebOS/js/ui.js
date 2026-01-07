

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

document.getElementById('input-color').addEventListener('change', (e) => {
    document.body.style.setProperty('--primary', e.target.value);
    localStorage.setItem('mainColor', e.target.value);
})

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
