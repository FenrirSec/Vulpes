#!/usr/bin/env python3
"""Vulpes file browser - a small stdlib HTTP service.

Serves a file-manager UI and a JSON API for browsing, renaming, copying,
moving, deleting, creating folders, uploading and downloading files. It runs as
the vulpes user (so it can only touch what that user can) and binds loopback;
nginx exposes it at /port/8090/ behind the session cookie.
"""
import os, sys, json, shutil, html, posixpath, urllib.parse, mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8090
# Start directory. Fixed to the vulpes home so the view is the same whether the
# service is first started by root (install) or by the vulpes user (boot).
HOME = os.environ.get("FB_ROOT") or "/home/vulpes"


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    # -- helpers --------------------------------------------------------------
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg, code=400):
        self._json({"error": str(msg)}, code)

    def _q(self):
        q = urllib.parse.urlparse(self.path).query
        return {k: v[0] for k, v in urllib.parse.parse_qs(q).items()}

    def _body_json(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    # -- routing --------------------------------------------------------------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._page()
        if path == "/api/list":
            return self._list()
        if path == "/api/download":
            return self._download()
        self._err("not found", 404)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == "/api/upload":
                return self._upload()
            if path == "/api/rename":
                return self._rename()
            if path == "/api/delete":
                return self._delete()
            if path == "/api/mkdir":
                return self._mkdir()
            if path == "/api/copy":
                return self._transfer(move=False)
            if path == "/api/move":
                return self._transfer(move=True)
            self._err("not found", 404)
        except PermissionError as e:
            self._err(f"permission denied: {e}", 403)
        except FileNotFoundError as e:
            self._err(f"not found: {e}", 404)
        except Exception as e:
            self._err(str(e), 500)

    # -- API ------------------------------------------------------------------
    def _list(self):
        d = self._q().get("path") or HOME
        d = os.path.realpath(d)
        if not os.path.isdir(d):
            return self._err("not a directory", 400)
        entries = []
        try:
            names = os.listdir(d)
        except PermissionError as e:
            return self._err(f"permission denied: {e}", 403)
        for name in names:
            full = os.path.join(d, name)
            try:
                st = os.lstat(full)
                is_link = os.path.islink(full)
                is_dir = os.path.isdir(full)
                entries.append({
                    "name": name,
                    "isDir": is_dir,
                    "isLink": is_link,
                    "size": 0 if is_dir else st.st_size,
                    "mtime": int(st.st_mtime),
                    "exec": bool(st.st_mode & 0o111) and not is_dir,
                })
            except OSError:
                continue
        entries.sort(key=lambda e: (not e["isDir"], e["name"].lower()))
        parent = os.path.dirname(d) if d != "/" else None
        self._json({"path": d, "parent": parent, "entries": entries})

    def _download(self):
        p = self._q().get("path", "")
        p = os.path.realpath(p)
        if not os.path.isfile(p):
            return self._err("not a file", 404)
        try:
            size = os.path.getsize(p)
            f = open(p, "rb")
        except OSError as e:
            return self._err(str(e), 403)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        fn = os.path.basename(p).replace('"', "")
        self.send_header("Content-Disposition", f'attachment; filename="{fn}"')
        self.end_headers()
        with f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break

    def _upload(self):
        q = self._q()
        d = os.path.realpath(q.get("dir", HOME))
        name = os.path.basename(q.get("name", "")) or "upload.bin"
        if not os.path.isdir(d):
            return self._err("target is not a directory", 400)
        dest = os.path.join(d, name)
        n = int(self.headers.get("Content-Length", 0))
        remaining = n
        try:
            with open(dest, "wb") as out:
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    out.write(chunk)
                    remaining -= len(chunk)
        except OSError as e:
            return self._err(str(e), 403)
        self._json({"ok": True, "name": name, "size": n})

    def _rename(self):
        b = self._body_json()
        p = os.path.realpath(b["path"])
        newname = os.path.basename(b["newName"])
        if not newname:
            return self._err("empty name")
        dest = os.path.join(os.path.dirname(p), newname)
        if os.path.exists(dest):
            return self._err("a file with that name already exists")
        os.rename(p, dest)
        self._json({"ok": True})

    def _delete(self):
        # "Delete" moves items to ~/.trash rather than removing them, so nothing
        # is lost by accident. Empty the trash folder manually to reclaim space.
        import time as _time
        b = self._body_json()
        trash = os.path.join(HOME, ".trash")
        os.makedirs(trash, exist_ok=True)
        errors = []
        for raw in b.get("paths", []):
            p = os.path.realpath(raw)
            if p == os.path.realpath(trash):
                continue
            base = os.path.basename(p)
            target = os.path.join(trash, base)
            if os.path.exists(target):
                target = os.path.join(trash, f"{base}.{int(_time.time())}")
            try:
                shutil.move(p, target)
            except OSError as e:
                errors.append(f"{base}: {e}")
        self._json({"ok": not errors, "errors": errors})

    def _mkdir(self):
        b = self._body_json()
        d = os.path.realpath(b["path"])
        name = os.path.basename(b["name"])
        if not name:
            return self._err("empty name")
        os.mkdir(os.path.join(d, name))
        self._json({"ok": True})

    def _transfer(self, move):
        b = self._body_json()
        dest_dir = os.path.realpath(b["dest"])
        if not os.path.isdir(dest_dir):
            return self._err("destination is not a directory")
        errors = []
        for raw in b.get("srcs", []):
            src = os.path.realpath(raw)
            target = os.path.join(dest_dir, os.path.basename(src))
            try:
                if os.path.realpath(target) == src:
                    # copy onto itself -> make a "name copy"
                    base = os.path.basename(src)
                    target = os.path.join(dest_dir, base + " copy")
                if move:
                    shutil.move(src, target)
                elif os.path.isdir(src):
                    shutil.copytree(src, target)
                else:
                    shutil.copy2(src, target)
            except OSError as e:
                errors.append(f"{os.path.basename(src)}: {e}")
        self._json({"ok": not errors, "errors": errors})

    # -- UI -------------------------------------------------------------------
    def _page(self):
        body = PAGE.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Files</title><style>
:root{--bg:#11111b;--sf:#1e1e2e;--sf2:#313244;--tx:#cdd6f4;--mut:#9399b2;--acc:#cba6f7;--blue:#89b4fa;--red:#f38ba8;--ok:#a6e3a1;
--line:color-mix(in srgb,var(--tx) 8%,transparent);--hover:color-mix(in srgb,var(--tx) 7%,transparent);--sel:color-mix(in srgb,var(--acc) 22%,transparent);--btnh:color-mix(in srgb,var(--tx) 14%,var(--sf2))}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;background:var(--bg);color:var(--tx);font:14px system-ui,sans-serif;-webkit-user-select:none;user-select:none}
input,textarea{-webkit-user-select:text;user-select:text}
#bar{display:flex;gap:6px;align-items:center;padding:8px;background:var(--sf);border-bottom:1px solid var(--line);flex-wrap:wrap}
button{background:var(--sf2);color:var(--tx);border:0;border-radius:8px;padding:7px 11px;cursor:pointer;font:inherit;display:inline-flex;gap:6px;align-items:center}
button:hover{background:var(--btnh)}button:disabled{opacity:.4;cursor:default}
#crumbs{flex:1;min-width:120px;display:flex;align-items:center;gap:2px;overflow:auto;white-space:nowrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:text}
#crumbs a{color:var(--blue);text-decoration:none;cursor:pointer}#crumbs a:hover{text-decoration:underline}
#crumbs span{color:var(--mut)}
.sep{width:1px;height:22px;background:var(--sf2);margin:0 3px}
#list{flex:1;overflow:auto;user-select:none;-webkit-user-select:none}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line)}
th{position:sticky;top:0;background:var(--sf);color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.06em;z-index:1}
tr.row{cursor:default}tr.row:hover{background:var(--hover)}
tr.sel{background:var(--sel)!important}
td.nm{display:flex;align-items:center;gap:10px}
.ic{font-size:18px;width:22px;text-align:center;flex:none}
td.nm b{font-weight:500}td.nm.dir b{color:var(--blue);cursor:pointer}
td.sz,td.dt{color:var(--mut);white-space:nowrap}
.col-sz{width:120px}.col-dt{width:190px}
#drop{position:fixed;inset:0;background:color-mix(in srgb,var(--bg) 88%,transparent);display:none;align-items:center;justify-content:center;font-size:22px;color:var(--acc);border:3px dashed var(--acc);z-index:5}
#msg{padding:0 12px;color:var(--red);font-size:12px}
.spacer{flex:1}
.menuwrap{position:relative}
#settingsMenu{position:absolute;right:0;top:40px;background:var(--sf);border:1px solid var(--line);border-radius:10px;padding:10px 12px;box-shadow:0 14px 34px -12px rgba(0,0,0,.6);display:none;z-index:6;white-space:nowrap}
#settingsMenu label{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px}
</style></head><body>
<div id="bar">
  <button id="up" title="Up">&#8593;</button>
  <button id="refresh" title="Refresh">&#8635;</button>
  <div id="crumbs"></div>
  <div class="sep"></div>
  <button id="mkdir">&#128193;+ New folder</button>
  <button id="upload">&#8593; Upload</button>
  <div class="sep"></div>
  <button id="download" disabled>&#8595; Download</button>
  <button id="rename" disabled>Rename</button>
  <button id="copy" disabled>Copy</button>
  <button id="cut" disabled>Cut</button>
  <button id="paste" disabled>Paste</button>
  <button id="del" disabled title="Delete">&#128465;</button>
  <div class="menuwrap">
    <button id="settings" title="Settings">&#9881;</button>
    <div id="settingsMenu"><label><input type="checkbox" id="showHidden"> Show hidden files</label></div>
  </div>
</div>
<div id="msg"></div>
<div id="list"></div>
<div id="drop">Drop files to upload here</div>
<input id="file" type="file" multiple hidden>
<script>
var P=location.pathname.replace(/\/+$/,'');
var cur=null, entries=[], sel=new Set(), clip=null;
var showHidden=false; try{showHidden=localStorage.getItem('fb.hidden')==='1';}catch(e){}
var $=function(id){return document.getElementById(id);};
// Match the Vulpes theme: this app iframe is same-origin, so read the parent's
// theme CSS variables and apply them (falls back to our defaults when opened directly).
function applyParentTheme(){try{var pr=parent.document.documentElement;if(pr===document.documentElement)return;
  var ps=getComputedStyle(pr),r=document.documentElement.style;
  var map={'--bg':'--content-bg','--sf':'--surface','--sf2':'--surface-2','--tx':'--text','--mut':'--text-2','--acc':'--primary','--blue':'--accent-2','--red':'--danger','--ok':'--ok'};
  for(var k in map){var v=ps.getPropertyValue(map[k]).trim();if(v)r.setProperty(k,v);}
}catch(e){}}
applyParentTheme();
try{if(parent!==window)new MutationObserver(applyParentTheme).observe(parent.document.documentElement,{attributes:true,attributeFilter:['data-theme','style','data-bg']});}catch(e){}
function api(p){return P+'/api'+p;}
function msg(t){$('msg').textContent=t||'';}
function fmtSize(n){var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<4){n/=1024;i++;}return (i?n.toFixed(1):n)+' '+u[i];}
function fmtDate(s){var d=new Date(s*1000);return d.toLocaleString();}
function icon(e){
  if(e.isDir)return e.isLink?'\u{1F500}':'\u{1F4C1}';
  var n=e.name.toLowerCase(),x=n.split('.').pop();
  var map={png:'\u{1F5BC}',jpg:'\u{1F5BC}',jpeg:'\u{1F5BC}',gif:'\u{1F5BC}',webp:'\u{1F5BC}',svg:'\u{1F5BC}',bmp:'\u{1F5BC}',ico:'\u{1F5BC}',
    mp4:'\u{1F3AC}',mkv:'\u{1F3AC}',mov:'\u{1F3AC}',webm:'\u{1F3AC}',avi:'\u{1F3AC}',
    mp3:'\u{1F3B5}',wav:'\u{1F3B5}',flac:'\u{1F3B5}',ogg:'\u{1F3B5}',m4a:'\u{1F3B5}',
    zip:'\u{1F4E6}',tar:'\u{1F4E6}',gz:'\u{1F4E6}',xz:'\u{1F4E6}',bz2:'\u{1F4E6}','7z':'\u{1F4E6}',rar:'\u{1F4E6}',
    pdf:'\u{1F4D5}',
    py:'\u{1F4BB}',js:'\u{1F4BB}',ts:'\u{1F4BB}',rs:'\u{1F4BB}',c:'\u{1F4BB}',cpp:'\u{1F4BB}',h:'\u{1F4BB}',go:'\u{1F4BB}',java:'\u{1F4BB}',rb:'\u{1F4BB}',php:'\u{1F4BB}',sh:'\u{1F4BB}',html:'\u{1F4BB}',css:'\u{1F4BB}',json:'\u{1F4BB}',xml:'\u{1F4BB}',yaml:'\u{1F4BB}',yml:'\u{1F4BB}',toml:'\u{1F4BB}',
    txt:'\u{1F4C4}',md:'\u{1F4C4}',log:'\u{1F4C4}',conf:'\u{1F4C4}',cfg:'\u{1F4C4}',ini:'\u{1F4C4}'};
  if(map[x])return map[x];
  if(e.exec)return '⚙️';
  return '\u{1F4C4}';
}
function join(dir,name){return dir==='/'?'/'+name:dir+'/'+name;}
function load(path){
  fetch(api('/list?path='+encodeURIComponent(path||''))).then(function(r){return r.json();}).then(function(d){
    if(d.error){msg(d.error);return;}
    cur=d; entries=d.entries; sel.clear(); render();
  }).catch(function(e){msg(''+e);});
}
function crumbs(){
  var c=$('crumbs');c.innerHTML='';
  var parts=cur.path.split('/').filter(Boolean), acc='';
  var root=document.createElement('a');root.textContent='/';root.onclick=function(ev){ev.stopPropagation();load('/');};c.appendChild(root);
  parts.forEach(function(p,i){var s=document.createElement('span');s.textContent=(i===0?'':'/');c.appendChild(s);
    acc+='/'+p;var a=document.createElement('a');a.textContent=p;(function(path){a.onclick=function(ev){ev.stopPropagation();load(path);};})(acc);c.appendChild(a);});
}
function editPath(){
  var c=$('crumbs');c.innerHTML='';
  var inp=document.createElement('input');inp.value=cur.path;
  inp.style.cssText='flex:1;background:var(--bg);color:var(--tx);border:0;font:inherit;outline:none';
  c.appendChild(inp);inp.focus();inp.select();
  inp.onkeydown=function(e){if(e.key==='Enter'){load(inp.value.trim());}else if(e.key==='Escape'){crumbs();}};
  inp.onblur=function(){if(inp.parentNode)crumbs();};
}
function render(){
  msg('');crumbs();
  $('up').disabled=!cur.parent;
  var h='<table><thead><tr><th>Name</th><th class=col-sz>Size</th><th class=col-dt>Modified</th></tr></thead><tbody>';
  entries.forEach(function(e,i){
    if(!showHidden && e.name.charAt(0)==='.') return;
    h+='<tr class="row" data-i="'+i+'"><td class="nm'+(e.isDir?' dir':'')+'"><span class=ic>'+icon(e)+'</span><b>'+
       escapeHtml(e.name)+(e.isLink?' →':'')+'</b></td><td class=sz>'+(e.isDir?'':fmtSize(e.size))+'</td><td class=dt>'+fmtDate(e.mtime)+'</td></tr>';
  });
  h+='</tbody></table>';
  $('list').innerHTML=h;
  [].forEach.call(document.querySelectorAll('tr.row'),function(tr){
    var i=+tr.dataset.i;
    tr.onclick=function(ev){toggle(i,ev);};
    tr.ondblclick=function(ev){ev.preventDefault();openItem(i);};
  });
  updateButtons();
}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toggle(i,ev){
  if(!(ev.ctrlKey||ev.metaKey)){sel.clear();}
  if(sel.has(i))sel.delete(i);else sel.add(i);
  [].forEach.call(document.querySelectorAll('tr.row'),function(tr){tr.classList.toggle('sel',sel.has(+tr.dataset.i));});
  updateButtons();
}
function selPaths(){return Array.from(sel).map(function(i){return join(cur.path,entries[i].name);});}
function openItem(i){var e=entries[i];if(e.isDir){load(join(cur.path,e.name));}else{downloadItem(i);}}
function downloadItem(i){var p=join(cur.path,entries[i].name);var a=document.createElement('a');a.href=api('/download?path='+encodeURIComponent(p));a.download=entries[i].name;document.body.appendChild(a);a.click();a.remove();}
function updateButtons(){
  var n=sel.size,one=Array.from(sel)[0];
  $('download').disabled=!(n===1&&one!=null&&!entries[one].isDir);
  $('rename').disabled=n!==1;
  $('copy').disabled=$('cut').disabled=$('del').disabled=n===0;
  $('paste').disabled=!clip;
}
$('up').onclick=function(){if(cur.parent)load(cur.parent);};
$('refresh').onclick=function(){load(cur.path);};
$('mkdir').onclick=function(){var n=prompt('New folder name:');if(!n)return;
  post('/mkdir',{path:cur.path,name:n});};
$('rename').onclick=function(){var i=Array.from(sel)[0],e=entries[i];var n=prompt('Rename to:',e.name);if(!n||n===e.name)return;
  post('/rename',{path:join(cur.path,e.name),newName:n});};
$('del').onclick=function(){var ps=selPaths();if(!ps.length)return;if(!confirm('Move '+ps.length+' item(s) to the trash (~/.trash)?'))return;
  post('/delete',{paths:ps});};
$('crumbs').addEventListener('click',function(e){if(e.target.tagName!=='A')editPath();});
$('settings').onclick=function(e){e.stopPropagation();var m=$('settingsMenu');m.style.display=(m.style.display==='block'?'none':'block');};
$('showHidden').checked=showHidden;
$('showHidden').onchange=function(){showHidden=this.checked;try{localStorage.setItem('fb.hidden',showHidden?'1':'0');}catch(e){}render();};
document.addEventListener('click',function(e){if(!e.target.closest('.menuwrap'))$('settingsMenu').style.display='none';});
$('copy').onclick=function(){clip={op:'copy',srcs:selPaths()};msg(clip.srcs.length+' copied');updateButtons();};
$('cut').onclick=function(){clip={op:'cut',srcs:selPaths()};msg(clip.srcs.length+' cut');updateButtons();};
$('paste').onclick=function(){if(!clip)return;post(clip.op==='cut'?'/move':'/copy',{srcs:clip.srcs,dest:cur.path},function(){if(clip.op==='cut')clip=null;});};
$('download').onclick=function(){downloadItem(Array.from(sel)[0]);};
function post(ep,data,then){
  fetch(api(ep),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
   .then(function(r){return r.json();}).then(function(d){
     if(d.error){msg(d.error);return;}
     if(d.errors&&d.errors.length){msg(d.errors.join('; '));}
     if(then)then(d); load(cur.path);
   }).catch(function(e){msg(''+e);});
}
// upload
$('upload').onclick=function(){$('file').click();};
$('file').onchange=function(){uploadFiles(this.files);this.value='';};
function uploadFiles(files){
  var arr=[].slice.call(files),done=0;if(!arr.length)return;msg('uploading '+arr.length+'...');
  (function next(){
    if(!arr.length){msg('uploaded '+done);load(cur.path);return;}
    var f=arr.shift();
    fetch(api('/upload?dir='+encodeURIComponent(cur.path)+'&name='+encodeURIComponent(f.name)),{method:'POST',body:f})
     .then(function(r){return r.json();}).then(function(d){if(d.error)msg(d.error);else done++;next();})
     .catch(function(e){msg(''+e);next();});
  })();
}
// drag & drop
var dz=$('drop'),dc=0;
window.addEventListener('dragenter',function(e){e.preventDefault();dc++;dz.style.display='flex';});
window.addEventListener('dragover',function(e){e.preventDefault();});
window.addEventListener('dragleave',function(e){dc--;if(dc<=0){dc=0;dz.style.display='none';}});
window.addEventListener('drop',function(e){e.preventDefault();dc=0;dz.style.display='none';if(e.dataTransfer.files.length)uploadFiles(e.dataTransfer.files);});
load('');
</script></body></html>"""


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    sys.stderr.write(f"[filebrowser] listening on 127.0.0.1:{PORT}\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
