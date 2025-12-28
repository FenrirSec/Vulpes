#!/usr/bin/env bash

bash /opt/postup.sh
sudo /usr/sbin/sshd
sudo nginx

cd /opt/webos && source ./env/bin/activate && webx11 &
cd /opt/webos && source ./env/bin/activate && python3 apps.py
tail -f /dev/null
