FROM frolvlad/alpine-glibc:alpine-3.22_glibc-2.42

# Installing required packages for minimal functioning
RUN apk add --no-cache curl sudo xvfb dbus-x11 xfce4 lxterminal bash screen python3 python3-dev py3-pip pwgen websockify  bind-tools

#RUN apk add --no-cache nerd-fonts-all --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community

# Copying files to the container
COPY run.sh /run.sh
RUN chmod +x /run.sh
COPY setup /etc/setup
RUN cp /etc/setup/xinitrc /etc/xinitrc

## User creation
RUN addgroup -S vulpes
RUN adduser -S vulpes -G vulpes -s /bin/bash
RUN echo '%wheel ALL=(ALL) ALL' > /etc/sudoers.d/wheel
RUN adduser vulpes wheel
RUN echo "vulpes:vulpes" | chpasswd

# Copying apps and icons files
COPY applications /home/vulpes/.local/share/applications
COPY icons /home/vulpes/.local/share/icons

# Copying config files
COPY setup/bashrc /home/vulpes/.bashrc
RUN mkdir -p /home/vulpes/.config/i3
COPY setup/i3config /home/vulpes/.config/i3/config

## User home permissions
RUN chown -R "vulpes:vulpes" "/home/vulpes"

# Installing additional packages
RUN apk add $(cat /etc/setup/.defaultpackages)
RUN curl -s https://ohmyposh.dev/install.sh | bash -s
RUN cp /root/.local/bin/oh-my-posh /bin/
#RUN oh-my-posh font install 0xProto

# In case run.sh has been edited on windows
RUN dos2unix /run.sh && dos2unix /etc/setup/postinstall.sh && dos2unix /etc/setup/xinitscript.sh && dos2unix /etc/setup/postinstall.sh

# Setup scripts
COPY scripts /setup_scripts/
RUN mv /setup_scripts/install.sh /usr/bin/install && chmod +x /usr/bin/install

# WebOS Setup
RUN apk add --no-cache musl-dev openssl-dev openssl btop htop mousepad thunar btop vlc keepassxc

COPY WebOS /opt/webos

COPY xterm_rs /opt/webos/xterm_rs

RUN chown -R vulpes:vulpes /opt/webos

RUN ln -s /opt/webos/env/bin/vulpkg /usr/bin/vulpkg

#RUN chmod -R 777 /var/lib/vulpkg/ && chmod -R 777 /opt/vulpkg/

USER vulpes

# Setting up Python env
RUN cd /opt/webos && rm -fr env && virtualenv env && source env/bin/activate && pip install websockets Pillow python-xlib git+https://github.com/lp1dev/WebX11.git git+https://github.com/FenrirSec/vulpkg.git fastapi uvicorn httpx && true

# Vulpkg binary setup

RUN mkdir ~/.local/bin && echo -e "\nPATH=$PATH:$HOME/.local/bin/" >> ~/.bashrc

RUN ln -s /opt/webos/env/bin/vulpkg ~/.local/bin/vulpkg

CMD ["/run.sh"]