#!/usr/bin/env bash

## VNC server start

#if [[ "$PASSWORD" == "" ]];then
#    PASSWORD=$(pwgen 14)
#    echo "Password is : $PASSWORD"
#fi

su -c "echo -e \"$PASSWORD\n$PASSWORD\nn\n\" | vncpasswd" vulpes

#unset PASSWORD

su -c "vncserver :0" vulpes&

if [[ "$PORT" == "" ]]; then
    PORT=6080
fi

exec websockify  $PORT localhost:5900
