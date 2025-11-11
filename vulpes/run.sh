#!/usr/bin/env bash

## VNC server start

#if [[ "$PASSWORD" == "" ]];then
#    PASSWORD=$(pwgen 14)
#    echo "Password is : $PASSWORD"
#fi
sleep 3
cd /opt/webos && source ./env/bin/activate && webx11 &
cd /opt/webos && python3 -m http.server &
cd /opt/webos && source ./env/bin/activate && python3 apps.py
tail -f /dev/null
