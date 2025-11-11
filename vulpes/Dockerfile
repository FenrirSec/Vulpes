FROM alpine:3.20.3

# Installing required packages for minimal functioning
RUN apk add --no-cache curl sudo xvfb dbus-x11 \
    xfce4 xfce4-terminal xfce4-screensaver bash screen python3 python3-dev py3-pip pwgen websockify gcompat bind-tools

RUN apk add --no-cache nerd-fonts-all --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community

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

## Final setup steps
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

# Copying apps and icons files
COPY applications /home/vulpes/.local/share/applications
COPY icons /home/vulpes/.local/share/icons

# Copying bashrc file
COPY setup/bashrc /home/vulpes/.bashrc
RUN chown -R vulpes:vulpes /home/vulpes/.bashrc

# WebOS Setup
RUN apk add --no-cache musl-dev gcompat openssl-dev openssl btop htop mousepad thunar btop vlc keepassxc

COPY WebOS /opt/webos

COPY xterm_rs /opt/webos/xterm_rs

RUN chown -R vulpes:vulpes /opt/webos

USER vulpes

RUN cd /opt/webos && rm -fr env && virtualenv env && source env/bin/activate && pip install websockets Pillow python-xlib git+https://github.com/lp1dev/WebX11.git git+https://github.com/FenrirSec/vulpkg.git && true

RUN cd /opt/webos && source env/bin/activate && pip install fastapi uvicorn httpx

CMD ["/run.sh"]