#!/usr/bin/env bash

if [ "$#" -lt 1 ];then
    echo "Usage : $0 package_to_install"
    exit 0
fi

if [ -f "/shared/setup_$1.sh" ];then
    bash /shared/setup_$1.sh
else
    echo "$1 : Unknown package name"
fi
