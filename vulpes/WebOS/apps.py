from fastapi import FastAPI, HTTPException, Cookie, Header, Response, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response as FastAPIResponse, HTMLResponse, FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from typing import List, Optional
import httpx
import subprocess
import json
import os
from pathlib import Path
import configparser
import base64
import mimetypes
import secrets

HOST = "0.0.0.0"

AUTH_USERNAME = os.getenv("USERNAME") if os.getenv("USERNAME") else "vulpes"
AUTH_PASSWORD = os.getenv("PASSWORD") if os.getenv("PASSWORD") else "vulpes"

# A password set from the UI is persisted here and overrides the env/default on
# startup. Put this path on a mounted volume to survive container recreation.
AUTH_STORE = os.getenv("VULPES_AUTH_FILE", "/home/vulpes/.vulpes_auth")

def _load_stored_password():
    global AUTH_PASSWORD
    try:
        with open(AUTH_STORE) as _f:
            _d = json.load(_f)
        if isinstance(_d, dict) and _d.get("password"):
            AUTH_PASSWORD = _d["password"]
    except Exception:
        pass

_load_stored_password()

app = FastAPI(title="Vulpes WebOS Apps API")
security = HTTPBasic()

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

# Single global session - no more per-user sessions
global_session = {"windows": []}

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

class ClipBoard(BaseModel):
    value: str

class TermRequest(BaseModel):
    command: Optional[str]

class Application(BaseModel):
    id: str
    name: str
    icon: str
    iconPath: Optional[str] = None
    type: str
    executable: Optional[str] = None
    url: Optional[str] = None
    command: Optional[str] = None
    proxy: Optional[bool] = True
    category: Optional[str] = "utility"
    description: Optional[str] = None
    docked: Optional[bool] = False

class WindowState(BaseModel):
    type: str
    id: str
    app_id: str
    title: str
    icon: str
    iconPath: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    isMaximized: Optional[bool] = False
    isMinimized: Optional[bool] = False
    snap: Optional[str] = None
    displayId: Optional[int] = None
    terminalPort: Optional[int] = None
    zIndex: Optional[int] = None
    data: Optional[dict] = None

def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    """Verify HTTP Basic Auth credentials"""
    is_correct_username = secrets.compare_digest(credentials.username, AUTH_USERNAME)
    is_correct_password = secrets.compare_digest(credentials.password, AUTH_PASSWORD)

    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# Session cookie
#
# The rest of the UI authenticates every request with an Authorization header
# sent from fetch(). An <iframe src> cannot carry that header, so proxied pages
# (and any other iframe-loaded endpoint) would get a 401 with WWW-Authenticate,
# which is what pops up the browser's native Basic Auth dialog.
#
# Instead we hand out an opaque session cookie once the credentials have been
# checked (on /session, which the UI calls at login and on load). Same-origin
# iframe requests carry that cookie automatically, so the proxy authenticates
# without a header and without ever returning WWW-Authenticate.
COOKIE_NAME = "vulpes_session"
session_tokens = set()


def issue_session_cookie(response: Response):
    token = secrets.token_urlsafe(32)
    session_tokens.add(token)
    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, samesite="lax", path="/", max_age=60 * 60 * 24 * 7,
    )


def _basic_header_ok(authorization: Optional[str]) -> bool:
    if not authorization or not authorization.lower().startswith("basic "):
        return False
    try:
        decoded = base64.b64decode(authorization.split(" ", 1)[1]).decode("utf-8")
        username, _, password = decoded.partition(":")
    except Exception:
        return False
    return (secrets.compare_digest(username, AUTH_USERNAME)
            and secrets.compare_digest(password, AUTH_PASSWORD))


def verify_session(
    vulpes_session: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Accept the session cookie or a Basic header. Fails with 403 (no
    WWW-Authenticate) so a failure never triggers the browser login popup."""
    if vulpes_session and vulpes_session in session_tokens:
        return True
    if _basic_header_ok(authorization):
        return True
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authenticated")

def find_icon_file(icon_name: str) -> Optional[str]:
    """Find an icon file by name in standard icon directories"""
    if not icon_name:
        return None
    
    if os.path.isabs(icon_name) and os.path.exists(icon_name):
        return icon_name
    
    extensions = ['.png', '.svg', '.xpm', '.jpg', '.jpeg', '.ico']
    
    if any(icon_name.endswith(ext) for ext in extensions):
        search_names = [icon_name]
    else:
        search_names = [f"{icon_name}{ext}" for ext in extensions]
        search_names.append(icon_name)
    
    for icon_dir in ICON_PATHS:
        if not os.path.exists(icon_dir):
            continue
        
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
        
        mime_type, _ = mimetypes.guess_type(icon_path)
        if not mime_type:
            mime_type = "image/png"
        
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

        entry_type = entry.get('Type', '')
        if entry_type not in ('Application', 'Link'):
            return None
        if entry.get('NoDisplay', 'false').lower() == 'true':
            return None
        if entry.get('Hidden', 'false').lower() == 'true':
            return None

        name = entry.get('Name', '')
        if not name:
            return None

        # Type=Link entries are web apps shown in an iframe (e.g. code-server).
        # vulpkg uses these to register browser-based tools in the launcher.
        if entry_type == 'Link':
            url = entry.get('URL', '')
            if not url:
                return None
            icon_name = entry.get('Icon', '')
            icon_path = find_icon_file(icon_name) if icon_name else None
            icon_data_uri = icon_to_data_uri(icon_path) if icon_path else None
            app_id = os.path.splitext(os.path.basename(filepath))[0]
            return {
                'id': app_id,
                'name': name,
                'icon': icon_data_uri if icon_data_uri else "",
                'iconPath': icon_path,
                'type': 'url',
                'url': url,
                # served same-origin via nginx, so bypass the HTML rewriting proxy
                'proxy': entry.get('X-Vulpes-Proxy', 'false').lower() == 'true',
                'category': 'development',
                'description': entry.get('Comment', ''),
                'docked': entry.get('Docked') is not None,
            }

        exec_cmd = entry.get('Exec', '')
        if not exec_cmd:
            return None

        exec_cmd = ' '.join([part for part in exec_cmd.split() if not part.startswith('%')])

        icon_name = entry.get('Icon', '')
        icon_path = find_icon_file(icon_name) if icon_name else None
        icon_data_uri = icon_to_data_uri(icon_path) if icon_path else None
        
        categories = entry.get('Categories', '').split(';')
        category = 'utility'
        docked = entry.get('Docked') is not None
        
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
        
        app_id = os.path.splitext(os.path.basename(filepath))[0]
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
            'description': entry.get('Comment', ''),
            'docked': docked
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
            
        for app in manual_apps:
            icon_name = app.get('icon', '')
            icon_path = find_icon_file(icon_name) if icon_name else None
            icon_data_uri = icon_to_data_uri(icon_path) if icon_path else None
            if icon_data_uri:
                    app['icon'] = icon_data_uri
        
        return manual_apps
    except Exception as e:
        print(f"Error loading manual applications: {e}")
        return []

def load_applications() -> List[Application]:
    """Load applications from both .desktop files and manual configuration"""
    desktop_apps = load_desktop_files()
    manual_apps = load_manual_applications()
    
    all_apps = {}
    
    for app in desktop_apps:
        all_apps[app['id']] = app
    
    for app in manual_apps:
        all_apps[app['id']] = app
    
    applications = [Application(**app) for app in all_apps.values()]
    
    print(f"✓ Loaded {len(applications)} applications ({len(desktop_apps)} from .desktop files, {len(manual_apps)} manual)")
    return applications

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
    return {"message": "WebOS Applications API", "version": "3.0"}

@app.get("/authz")
async def authz(_auth: bool = Depends(verify_session)):
    """Lightweight check for nginx auth_request: 204 when the session cookie
    (or Basic header) is valid, 403 otherwise. Guards the raw backends
    (terminals, X11 streams, /port apps) that nginx proxies directly."""
    return Response(status_code=204)

@app.get("/session")
async def get_session(response: Response, username: str = Depends(verify_credentials)):
    """Get global session windows (and (re)issue the session cookie)"""
    issue_session_cookie(response)
    windows = global_session["windows"]
    print(f"User {username} accessing global session with {len(windows)} windows")
    return {"windows": windows}

@app.get("/applications", response_model=List[Application])
async def get_applications(username: str = Depends(verify_credentials)):
    """Get list of all available applications"""
    return load_applications()

@app.get("/applications/{app_id}", response_model=Application)
async def get_application(app_id: str, username: str = Depends(verify_credentials)):
    """Get a specific application by ID"""
    apps = load_applications()
    app = next((app for app in apps if app.id == app_id), None)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app

@app.get("/applications/category/{category}", response_model=List[Application])
async def get_applications_by_category(category: str, username: str = Depends(verify_credentials)):
    """Get applications filtered by category"""
    apps = load_applications()
    return [app for app in apps if app.category == category]

@app.get("/icon/{app_id}")
async def get_application_icon(app_id: str, username: str = Depends(verify_credentials)):
    """Get the icon file for an application"""
    apps = load_applications()
    app = next((app for app in apps if app.id == app_id), None)
    
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    
    if app.icon.startswith('data:'):
        try:
            header, data = app.icon.split(',', 1)
            if 'base64' in header:
                icon_data = base64.b64decode(data)
                media_type = header.split(';')[0].split(':')[1]
                return Response(content=icon_data, media_type=media_type)
        except Exception as e:
            print(f"Error decoding data URI icon: {e}")
    
    if not app.iconPath or not os.path.exists(app.iconPath):
        raise HTTPException(status_code=404, detail="Icon file not found")
    
    return FileResponse(app.iconPath)

@app.get("/icon/file/{icon_path:path}")
async def get_icon_file(icon_path: str, username: str = Depends(verify_credentials)):
    """Serve icon files directly by path"""
    try:
        full_path = Path(icon_path)
        if not full_path.is_absolute():
            found_path = find_icon_file(icon_path)
            if found_path:
                full_path = Path(found_path)
            else:
                raise HTTPException(status_code=404, detail="Icon not found")
        
        if not any(str(full_path).startswith(str(allowed_path)) for allowed_path in ICON_PATHS + DESKTOP_FILE_PATHS):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="Icon file not found")
        
        return FileResponse(full_path)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving icon: {str(e)}")

@app.post("/applications/reload")
async def reload_applications(username: str = Depends(verify_credentials)):
    """Force reload applications"""
    apps = load_applications()
    return {"status": "reloaded", "count": len(apps)}

# ------------------------------------------------------------- change password
class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@app.post("/auth/password")
async def change_password(body: PasswordChange, username: str = Depends(verify_credentials)):
    """Change the server password. Requires the current password; persists the new
    one to AUTH_STORE and invalidates existing sessions so other devices re-auth."""
    global AUTH_PASSWORD
    if not secrets.compare_digest(body.current_password or "", AUTH_PASSWORD):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect")
    new = body.new_password or ""
    if len(new) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 6 characters")

    AUTH_PASSWORD = new
    persisted = True
    try:
        d = os.path.dirname(AUTH_STORE)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(AUTH_STORE, "w") as f:
            json.dump({"password": new}, f)
        try:
            os.chmod(AUTH_STORE, 0o600)
        except Exception:
            pass
    except Exception:
        persisted = False

    # Drop every issued session cookie so other devices must sign in with the new password.
    session_tokens.clear()
    return {"status": "ok", "persisted": persisted}

# ------------------------------------------------------------- WireGuard VPN
# A small helper surfaced in the top bar: shows the equivalent of `wg show` and
# lets the user download the config of the active interface to use elsewhere.
# wg needs root; the vulpes user has passwordless sudo (wheel group).
WG_DIR = "/etc/wireguard"

def _wg(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["sudo", "wg", *args], capture_output=True, text=True, timeout=10)

def _wg_interfaces() -> List[str]:
    try:
        r = _wg(["show", "interfaces"])
        return r.stdout.split() if r.returncode == 0 else []
    except Exception:
        return []

@app.get("/vpn/status")
async def vpn_status(username: str = Depends(verify_credentials)):
    """Equivalent of `wg show`: active WireGuard interfaces and their status."""
    ifaces = _wg_interfaces()
    if not ifaces:
        return {"up": False, "interfaces": [], "interface": None, "output": ""}
    try:
        r = _wg(["show"])
        output = (r.stdout if r.returncode == 0 else r.stderr) or ""
    except Exception as e:
        output = f"error: {e}"
    return {
        "up": True,
        "interfaces": ifaces,
        "interface": ifaces[0],
        "output": output.strip(),
    }

@app.get("/vpn/config")
async def vpn_config(iface: Optional[str] = None, username: str = Depends(verify_credentials)):
    """Download the active interface's .conf (on-disk wg-quick config, or the
    live kernel config as a fallback). The interface name is validated against
    the set of active interfaces, so this can't read arbitrary files."""
    ifaces = _wg_interfaces()
    if not ifaces:
        raise HTTPException(status_code=404, detail="No active WireGuard interface")
    if iface is None:
        iface = ifaces[0]
    if iface not in ifaces:
        raise HTTPException(status_code=400, detail="Unknown interface")

    content = None
    # Prefer the on-disk wg-quick config: it keeps Address / DNS, needed to
    # bring the tunnel up on another machine.
    try:
        r = subprocess.run(["sudo", "cat", os.path.join(WG_DIR, f"{iface}.conf")],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            content = r.stdout
    except Exception:
        content = None
    # Fall back to the live config dumped from the kernel (keys + peers only).
    if content is None:
        try:
            r = _wg(["showconf", iface])
            if r.returncode == 0 and r.stdout.strip():
                content = r.stdout
        except Exception:
            content = None
    if content is None:
        raise HTTPException(status_code=404, detail="Could not read configuration")

    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{iface}.conf"'},
    )

@app.post("/session/window")
async def save_window(window: WindowState, username: str = Depends(verify_credentials)):
    """Save or update a window state to global session"""
    existing_idx = None
    for idx, w in enumerate(global_session["windows"]):
        if w["id"] == window.id:
            existing_idx = idx
            break
    
    if existing_idx is not None:
        global_session["windows"][existing_idx] = window.dict()
    else:
        global_session["windows"].append(window.dict())
    
    return {"status": "saved"}

@app.delete("/session/window/{window_id}")
async def remove_window(window_id: str, username: str = Depends(verify_credentials)):
    """Remove a window from global session"""
    global_session["windows"] = [
        w for w in global_session["windows"] if w["id"] != window_id
    ]
    return {"status": "removed"}

@app.get("/session/window/{window_id}/clipboard")
async def get_window_clipboard(window_id: str, username: str = Depends(verify_credentials)):
    """Get a window's clipboard"""
    display = ":" + str(int(window_id) + 1) # Ugly fix, I should do this differently
    output = subprocess.check_output(["xclip", "-o", "-d", display], env={"DISPLAY": display})
    return {"clipboard": output}

@app.post("/session/window/{window_id}/clipboard")
async def fill_window_clipboard(window_id: str, clipboard: ClipBoard, username: str = Depends(verify_credentials)):
    """Fill a window's clipboard"""
    if clipboard is not None:
        if clipboard.value:
            display = ":" + str(int(window_id) + 1) # Ugly fix, I should do this differently
            process = subprocess.Popen(["xclip", "-d", display, "-selection", "clipboard", "-i"], stdin=subprocess.PIPE)
            process.stdin.write(clipboard.value.encode('UTF-8'))
            process.stdin.close()
            # process.terminate()
            # output = subprocess.run(["xclip", "-d", display, "-i"], input=clipboard.value, capture_output=True, text=True)
            return {"status": "OK"}
    raise HTTPException(status_code=400, detail="Clipboard is empty")

@app.post("/terminal/start")
async def start_terminal(req: TermRequest = None, username: str = Depends(verify_credentials)):
    """Start a new xterm.rs instance"""
    command = None
    if req is not None:
        command = req.command
    port = get_next_port()
    
    try:
        if command and command != "null":
            process = subprocess.Popen(
                ["./xterm_rs", "--host", HOST, "--port", str(port), "--cmd", command],
            shell=False)
        else:
            process = subprocess.Popen(
                ["./xterm_rs", "--host", HOST, "--port", str(port), "--cmd", "bash -c bash"],
            shell=False)
        
        running_terminals[port] = process
        return {"port": port, "url": f"http://localhost:{port}/term/"}
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=500, 
            detail="xterm.rs binary not found. Please ensure it's in your PATH."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start terminal: {str(e)}")

@app.delete("/terminal/{port}")
async def stop_terminal(port: int, username: str = Depends(verify_credentials)):
    """Stop a running terminal"""
    if port not in running_terminals:
        raise HTTPException(status_code=404, detail="Terminal not found")
    cleanup_terminal(port)
    return {"status": "stopped"}

@app.get("/terminal/{port}/status")
async def check_terminal(port: int, username: str = Depends(verify_credentials)):
    """Check if a terminal is still running"""
    if port in running_terminals:
        process = running_terminals[port]
        if process.poll() is None:
            return {"status": "running", "port": port}
        else:
            cleanup_terminal(port)
            return {"status": "dead", "port": port}
    return {"status": "not_found", "port": port}

@app.get("/proxy/{encoded_url}", response_class=HTMLResponse)
async def proxy_url(encoded_url: str, _auth: bool = Depends(verify_session)):
    """Proxy requests to external URLs to avoid CORS/framing issues"""
    try:
        url = base64.b64decode(encoded_url).decode("utf-8")
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(url)
            
            content_type = response.headers.get("content-type", "text/html")
            
            if "text/html" in content_type:
                content = response.text
                
                intercept_script = f'''
                <script>
                (function() {{
                    document.addEventListener('click', function(e) {{
                        let target = e.target;
                        while (target && target.tagName !== 'A') {{
                            target = target.parentElement;
                        }}
                        
                        if (target && target.tagName === 'A' && target.href) {{
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const absoluteUrl = target.href;
                            
                            window.parent.postMessage({{
                                type: 'navigate',
                                url: absoluteUrl
                            }}, '*');
                        }}
                    }}, true);
                    
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
                
                if "<head>" in content.lower():
                    base_tag = f'<base href="{url}">'
                    injection = base_tag + intercept_script
                    content = content.replace("<head>", f"<head>{injection}", 1)
                    content = content.replace("<HEAD>", f"<HEAD>{injection}", 1)
                else:
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
