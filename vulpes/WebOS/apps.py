from fastapi import FastAPI, HTTPException, Cookie, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response as FastAPIResponse, HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import httpx
import subprocess
import json
import uuid
import os
from pathlib import Path
import configparser
import base64
import mimetypes

HOST = "0.0.0.0"

app = FastAPI(title="WebOS Applications API")

# Enable CORS with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track running xterm.rs processes and their ports
running_terminals = {}  # {port: process}
next_port = 10000

# Session management
sessions = {}  # {session_id: {windows: [{type, id, data}]}}

# Applications configuration file
APPS_CONFIG_FILE = "applications.json"

# Standard .desktop file locations
DESKTOP_FILE_PATHS = [
    Path.home() / ".local/share/applications",
    "/var/lib/vulpkg/applications",
]

# Standard icon paths
ICON_PATHS = [
    Path.home() / ".local/share/icons",
    Path.home() / ".local/share/pixmaps",
    "/usr/share/icons",
    "/usr/share/pixmaps",
    "/usr/share/icons/hicolor",
    "/var/lib/vulpkg/icons"
]

# Cache for applications with file modification tracking
applications_cache = {
    "data": None,
    "mtime": None
}

class TermRequest(BaseModel):
    command: Optional[str]

class Application(BaseModel):
    id: str
    name: str
    icon: str  # Can be emoji, icon name, or base64 data URI
    iconPath: Optional[str] = None  # Actual path to icon file
    type: str  # "executable", "url", "terminal", "tui"
    executable: Optional[str] = None
    url: Optional[str] = None
    command: Optional[str] = None  # for TUI apps
    category: Optional[str] = "utility"
    description: Optional[str] = None

class WindowState(BaseModel):
    type: str  # "executable", "url", "terminal", "tui"
    id: str  # display_id or port or url_id
    app_id: str
    title: str
    icon: str
    iconPath: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    isMaximized: Optional[bool] = False
    displayId: Optional[int] = None
    terminalPort: Optional[int] = None
    zIndex: Optional[int] = None
    data: Optional[dict] = None  # Additional data (url, command, etc.)

def find_icon_file(icon_name: str) -> Optional[str]:
    """Find an icon file by name in standard icon directories"""
    if not icon_name:
        return None
    
    # If it's already an absolute path and exists, return it
    if os.path.isabs(icon_name) and os.path.exists(icon_name):
        return icon_name
    
    # Common icon extensions
    extensions = ['.png', '.svg', '.xpm', '.jpg', '.jpeg', '.ico']
    
    # If the icon_name already has an extension, just use that
    if any(icon_name.endswith(ext) for ext in extensions):
        search_names = [icon_name]
    else:
        search_names = [f"{icon_name}{ext}" for ext in extensions]
        # Also search without extension for theme icons
        search_names.append(icon_name)
    
    # Search in icon paths
    for icon_dir in ICON_PATHS:
        if not os.path.exists(icon_dir):
            continue
        
        # Search recursively for the icon
        for root, dirs, files in os.walk(icon_dir):
            for search_name in search_names:
                if search_name in files:
                    full_path = os.path.join(root, search_name)
                    return full_path
    
    return None

def icon_to_data_uri(icon_path: str) -> Optional[str]:
    """Convert an icon file to a data URI"""
    try:
        if not icon_path or not os.path.exists(icon_path):
            print('Error: Invalid icon path provided', icon_path)
            return None
        
        # Get MIME type
        mime_type, _ = mimetypes.guess_type(icon_path)
        if not mime_type:
            # Default to png if cannot determine
            mime_type = "image/png"
        
        # Read and encode the file
        with open(icon_path, 'rb') as f:
            icon_data = f.read()
        
        base64_data = base64.b64encode(icon_data).decode('utf-8')
        return f"data:{mime_type};base64,{base64_data}"
    
    except Exception as e:
        print(f"Error converting icon to data URI: {e}")
        return None

def parse_desktop_file(filepath: str) -> Optional[dict]:
    """Parse a .desktop file and extract application information"""
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(filepath, encoding='utf-8')
        
        if 'Desktop Entry' not in config:
            return None
        
        entry = config['Desktop Entry']
        
        # Skip if not an application or is hidden/no display
        if entry.get('Type', '') != 'Application':
            return None
        if entry.get('NoDisplay', 'false').lower() == 'true':
            return None
        if entry.get('Hidden', 'false').lower() == 'true':
            return None
        
        # Extract basic info
        name = entry.get('Name', '')
        if not name:
            return None
        
        exec_cmd = entry.get('Exec', '')
        if not exec_cmd:
            return None
        
        # Clean up Exec command (remove %f, %F, %u, %U, etc.)
        exec_cmd = ' '.join([part for part in exec_cmd.split() if not part.startswith('%')])
        
        # Get icon
        icon_name = entry.get('Icon', '')
        icon_path = find_icon_file(icon_name) if icon_name else None
        
        # Convert icon to data URI if found
        icon_data_uri = icon_to_data_uri(icon_path) if icon_path else None
        
        # Determine category
        categories = entry.get('Categories', '').split(';')
        category = 'utility'
        
        category_map = {
            'Development': 'development',
            'Network': 'internet',
            'WebBrowser': 'internet',
            'AudioVideo': 'media',
            'Graphics': 'media',
            'Office': 'productivity',
            'Game': 'games',
            'System': 'system',
            'Utility': 'utility',
            'Settings': 'settings',
        }
        
        for cat in categories:
            if cat in category_map:
                category = category_map[cat]
                break
        
        # Create application ID from filename
        app_id = os.path.splitext(os.path.basename(filepath))[0]
        
        # Check if it should be terminal
        terminal = entry.get('Terminal', 'false').lower() == 'true'
        
        return {
            'id': app_id,
            'name': name,
            'icon': icon_data_uri if icon_data_uri else "",
            'iconPath': icon_path,
            'type': 'tui' if terminal else 'executable',
            'executable': exec_cmd if not terminal else None,
            'command': exec_cmd if terminal else None,
            'category': category,
            'description': entry.get('Comment', '')
        }
     
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return None

def load_desktop_files() -> List[dict]:
    """Load all .desktop files from standard locations"""
    apps = []
    seen_ids = set()
    
    for desktop_dir in DESKTOP_FILE_PATHS:
        if not os.path.exists(desktop_dir):
            continue
        
        desktop_files = Path(desktop_dir).glob('*.desktop')
        
        for desktop_file in desktop_files:
            app_data = parse_desktop_file(str(desktop_file))
            
            if app_data and app_data['id'] not in seen_ids:
                apps.append(app_data)
                seen_ids.add(app_data['id'])
    
    return apps

def load_manual_applications() -> List[dict]:
    """Load manually configured applications from JSON file"""
    if not os.path.exists(APPS_CONFIG_FILE):
        print('Error: No applications.json file provided')
    
    try:
        with open(APPS_CONFIG_FILE, 'r') as f:
            manual_apps = json.load(f)
            
        # Convert icon paths to data URIs for manual apps
        for app in manual_apps:
            # Get icon
            icon_name = app.get('icon', '')
            icon_path = find_icon_file(icon_name) if icon_name else None
        
            # Convert icon to data URI if found
            icon_data_uri = icon_to_data_uri(icon_path) if icon_path else None
            if icon_data_uri:
                    app['icon'] = icon_data_uri
        
        return manual_apps
    except Exception as e:
        print(f"Error loading manual applications: {e}")
        return []

def load_applications() -> List[Application]:
    """Load applications from both .desktop files and manual configuration"""
    # Load from .desktop files
    desktop_apps = load_desktop_files()
    
    # Load from manual configuration
    manual_apps = load_manual_applications()
    
    # Combine both, with manual apps taking precedence
    all_apps = {}
    
    # Add desktop apps first
    for app in desktop_apps:
        all_apps[app['id']] = app
    
    # Override/add manual apps
    for app in manual_apps:
        all_apps[app['id']] = app
    
    # Convert to Application objects
    applications = [Application(**app) for app in all_apps.values()]
    
    print(f"✓ Loaded {len(applications)} applications ({len(desktop_apps)} from .desktop files, {len(manual_apps)} manual)")
    return applications

def get_or_create_session(session_id: Optional[str]) -> str:
    """Get or create a session ID"""
    if not session_id or session_id not in sessions:
        session_id = str(uuid.uuid4())
        sessions[session_id] = {"windows": []}
        print(f"Created new session: {session_id}")
    else:
        print(f"Using existing session: {session_id}")
    return session_id

def get_next_port():
    global next_port
    port = next_port
    next_port += 1
    return port

def cleanup_terminal(port: int):
    """Clean up a terminal process"""
    if port in running_terminals:
        try:
            running_terminals[port].terminate()
            running_terminals[port].wait(timeout=3)
        except:
            running_terminals[port].kill()
        finally:
            del running_terminals[port]

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up all running terminals on shutdown"""
    for port in list(running_terminals.keys()):
        cleanup_terminal(port)

@app.get("/")
async def root():
    return {"message": "WebOS Applications API", "version": "2.1"}

@app.get("/session")
async def get_session(session_id: Optional[str] = Cookie(None), response: Response = None):
    """Get or create a session and return saved windows"""
    new_session_id = get_or_create_session(session_id)
    if response:
        # Set cookie with proper settings for persistence
        response.set_cookie(
            key="session_id", 
            value=new_session_id, 
            httponly=False,  # Allow JavaScript to read it for debugging
            samesite="lax",
            max_age=86400*30  # 30 days
        )
    
    windows = sessions[new_session_id]["windows"]
    print(f"Session {new_session_id} has {len(windows)} windows")
    
    return {"session_id": new_session_id, "windows": windows}

@app.get("/applications", response_model=List[Application])
async def get_applications():
    """Get list of all available applications"""
    return load_applications()

@app.get("/applications/{app_id}", response_model=Application)
async def get_application(app_id: str):
    """Get a specific application by ID"""
    apps = load_applications()
    app = next((app for app in apps if app.id == app_id), None)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app

@app.get("/applications/category/{category}", response_model=List[Application])
async def get_applications_by_category(category: str):
    """Get applications filtered by category"""
    apps = load_applications()
    return [app for app in apps if app.category == category]

@app.get("/icon/{app_id}")
async def get_application_icon(app_id: str):
    """Get the icon file for an application"""
    apps = load_applications()
    app = next((app for app in apps if app.id == app_id), None)
    
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    
    # If the icon is already a data URI, extract and return it
    if app.icon.startswith('data:'):
        try:
            # Extract the base64 data from the data URI
            header, data = app.icon.split(',', 1)
            if 'base64' in header:
                icon_data = base64.b64decode(data)
                media_type = header.split(';')[0].split(':')[1]
                return Response(content=icon_data, media_type=media_type)
        except Exception as e:
            print(f"Error decoding data URI icon: {e}")
    
    # Fall back to iconPath
    if not app.iconPath or not os.path.exists(app.iconPath):
        raise HTTPException(status_code=404, detail="Icon file not found")
    
    return FileResponse(app.iconPath)

@app.get("/icon/file/{icon_path:path}")
async def get_icon_file(icon_path: str):
    """Serve icon files directly by path"""
    try:
        # Security: Ensure the path is within allowed directories
        full_path = Path(icon_path)
        if not full_path.is_absolute():
            # Try to find the icon in standard paths
            found_path = find_icon_file(icon_path)
            if found_path:
                full_path = Path(found_path)
            else:
                raise HTTPException(status_code=404, detail="Icon not found")
        
        # Additional security check
        if not any(str(full_path).startswith(str(allowed_path)) for allowed_path in ICON_PATHS + DESKTOP_FILE_PATHS):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="Icon file not found")
        
        return FileResponse(full_path)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving icon: {str(e)}")

@app.post("/applications/reload")
async def reload_applications():
    """Force reload applications (useful for debugging)"""
    apps = load_applications()
    return {"status": "reloaded", "count": len(apps)}

@app.post("/session/window")
async def save_window(window: WindowState, session_id: Optional[str] = Cookie(None), response: Response = None):
    """Save or update a window state to session"""
    session_id = get_or_create_session(session_id)
    
    # Check if window already exists, update it
    existing_idx = None
    for idx, w in enumerate(sessions[session_id]["windows"]):
        if w["id"] == window.id:
            existing_idx = idx
            break
    
    if existing_idx is not None:
        sessions[session_id]["windows"][existing_idx] = window.dict()
    else:
        sessions[session_id]["windows"].append(window.dict())
    
    if response:
        response.set_cookie(key="session_id", value=session_id, httponly=True, max_age=86400*7)
    
    return {"status": "saved", "session_id": session_id}

@app.delete("/session/window/{window_id}")
async def remove_window(window_id: str, session_id: Optional[str] = Cookie(None)):
    """Remove a window from session"""
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sessions[session_id]["windows"] = [
        w for w in sessions[session_id]["windows"] if w["id"] != window_id
    ]
    return {"status": "removed"}

@app.post("/terminal/start")
async def start_terminal(req: TermRequest = None):
    """Start a new xterm.rs instance"""
    command = None
    if req is not None:
        command = req.command
    port = get_next_port()
    
    try:
        print("Command is", command)
        if command and command != "null":
            # Start xterm.rs with custom command (for TUI apps)
            process = subprocess.Popen(
                ["./xterm_rs", "--host", HOST, "--port", str(port), "--cmd", command],
            )
        else:
            # Start regular terminal
            process = subprocess.Popen(
                ["./xterm_rs", "--host", HOST, "--port", str(port)],
            )
        
        running_terminals[port] = process
        return {"port": port, "url": f"http://localhost:{port}/term"}
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=500, 
            detail="xterm.rs binary not found. Please ensure it's in your PATH."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start terminal: {str(e)}")

@app.delete("/terminal/{port}")
async def stop_terminal(port: int):
    """Stop a running terminal"""
    if port not in running_terminals:
        raise HTTPException(status_code=404, detail="Terminal not found")
    cleanup_terminal(port)
    return {"status": "stopped"}

@app.get("/terminal/{port}/status")
async def check_terminal(port: int):
    """Check if a terminal is still running"""
    if port in running_terminals:
        process = running_terminals[port]
        if process.poll() is None:
            return {"status": "running", "port": port}
        else:
            # Process died, clean up
            cleanup_terminal(port)
            return {"status": "dead", "port": port}
    return {"status": "not_found", "port": port}

@app.get("/proxy", response_class=HTMLResponse)
async def proxy_url(url: str):
    """Proxy requests to external URLs to avoid CORS/framing issues"""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(url)
            
            # Get content type
            content_type = response.headers.get("content-type", "text/html")
            
            # For HTML, inject base tag and link interceptor
            if "text/html" in content_type:
                content = response.text
                
                # Create the intercept script
                intercept_script = f'''
                <script>
                (function() {{
                    // Intercept all link clicks
                    document.addEventListener('click', function(e) {{
                        let target = e.target;
                        // Find the closest anchor tag
                        while (target && target.tagName !== 'A') {{
                            target = target.parentElement;
                        }}
                        
                        if (target && target.tagName === 'A' && target.href) {{
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Get the absolute URL
                            const absoluteUrl = target.href;
                            
                            // Notify parent to open through proxy
                            window.parent.postMessage({{
                                type: 'navigate',
                                url: absoluteUrl
                            }}, '*');
                        }}
                    }}, true);
                    
                    // Also intercept form submissions
                    document.addEventListener('submit', function(e) {{
                        const form = e.target;
                        if (form.tagName === 'FORM') {{
                            e.preventDefault();
                            const formData = new FormData(form);
                            const params = new URLSearchParams(formData);
                            const action = form.action || window.location.href;
                            const method = (form.method || 'get').toLowerCase();
                            
                            let targetUrl = action;
                            if (method === 'get') {{
                                targetUrl += '?' + params.toString();
                            }}
                            
                            window.parent.postMessage({{
                                type: 'navigate',
                                url: targetUrl
                            }}, '*');
                        }}
                    }}, true);
                }})();
                </script>
                '''
                
                # Inject base tag and script after <head>
                if "<head>" in content.lower():
                    base_tag = f'<base href="{url}">'
                    injection = base_tag + intercept_script
                    content = content.replace("<head>", f"<head>{injection}", 1)
                    content = content.replace("<HEAD>", f"<HEAD>{injection}", 1)
                else:
                    # If no head tag, inject at the beginning
                    content = intercept_script + content
                
                return FastAPIResponse(
                    content=content,
                    media_type=content_type,
                    headers={
                        "X-Frame-Options": "ALLOWALL",
                        "Content-Security-Policy": ""
                    }
                )
            else:
                # For other content types, return as-is
                return FastAPIResponse(
                    content=response.content,
                    media_type=content_type
                )
    
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=8082)