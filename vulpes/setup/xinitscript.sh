#/bin/bash

# Write to /etc/X11/xinit/xinitrc.d/*

if [ ! -f "/home/vulpes/.setupdone" ];then
    bash /etc/setup/postinstall.sh
fi
