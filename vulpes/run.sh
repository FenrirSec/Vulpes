#!/usr/bin/env bash

bash /opt/postup.sh
sudo /usr/sbin/sshd
sudo nginx

# Start background services installed by vulpkg packages (e.g. code-server).
# Each package drops a start script here; see vulpkg/vscode.vulpkg.
for svc in /var/lib/vulpkg/startup/*.sh; do
  [ -r "$svc" ] && (bash "$svc" >/tmp/"$(basename "$svc" .sh)".log 2>&1 &)
done

cd /opt/webos && source $HOME/.env/bin/activate && webx11 &

# Built-in file browser (stdlib Python service on 127.0.0.1:8090, shown as "Files")
python3 /opt/webos/filebrowser/server.py >/tmp/filebrowser.log 2>&1 &

# Built-in web browser (static musl service on 127.0.0.1:8899, shown as "Browser").
# Baked into the base image, so no `vulpkg install vulpes-browser` is needed.
chmod +x /opt/webos/bin/vulpes-browser 2>/dev/null
/opt/webos/bin/vulpes-browser >/tmp/vulpes-browser.log 2>&1 &

cd /opt/webos && source $HOME/.env/bin/activate && python3 apps.py
tail -f /dev/null
