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
cd /opt/webos && source $HOME/.env/bin/activate && python3 apps.py
tail -f /dev/null
