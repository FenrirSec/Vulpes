FROM frolvlad/alpine-glibc:alpine-3.22_glibc-2.42

# Installing required packages for minimal functioning
RUN apk add --no-cache curl sudo xvfb dbus-x11 xfce4 lxterminal bash screen python3 python3-dev py3-pip pwgen websockify bind-tools xfce4-terminal openssh shadow wireshark nginx

# Copying scripts to the container
COPY run.sh /run.sh
RUN chmod +x /run.sh
COPY setup /etc/setup
#RUN cp /etc/setup/xinitrc /etc/xinitrc

## User creation
RUN addgroup -S vulpes
RUN adduser -S vulpes -G vulpes -s /bin/bash
RUN usermod -aG wireshark vulpes
RUN echo '%wheel ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/wheel
RUN adduser vulpes wheel
RUN echo "vulpes:vulpes" | chpasswd

# Copying config files
COPY setup/bashrc /home/vulpes/.bashrc
RUN mkdir -p /home/vulpes/.config/i3
COPY setup/i3config /home/vulpes/.config/i3/config

# Installing additional packages
RUN apk add $(cat /etc/setup/.defaultpackages)
RUN curl -s https://ohmyposh.dev/install.sh | bash -s
RUN cp /root/.local/bin/oh-my-posh /bin/
#RUN oh-my-posh font install 0xProto

## User home permissions
RUN chown -R "vulpes:vulpes" "/home/vulpes"

# WebOS Setup
RUN apk add --no-cache musl-dev openssl-dev openssl py3-virtualenv git

RUN ln -s /home/vulpes/.env/bin/vulpkg /usr/bin/vulpkg

#RUN chmod -R 777 /var/lib/vulpkg/ && chmod -R 777 /opt/vulpkg/

# SSHD setup
RUN ssh-keygen -A

# NGINX setup
COPY nginx.conf /etc/nginx/nginx.conf

# I would like to do this as vulpes but it is not possible with docker as of today, COPY is made as root
COPY WebOS /opt/webos

COPY xterm_rs /opt/webos/xterm_rs

RUN chown -R vulpes:vulpes /opt/webos

USER vulpes

# Setting up bash as default shell in tmux
RUN echo -e 'set -g default-terminal "screen-256color"\nset-option -g default-shell /bin/bash' >> ~/.tmux.conf

# Setting up global user Python env
RUN virtualenv $HOME/.env && source $HOME/.env/bin/activate && pip install websockets Pillow python-xlib git+https://github.com/lp1dev/WebX11.git@webos git+https://github.com/FenrirSec/vulpkg.git fastapi uvicorn httpx 

# Adding .profile file
COPY profile ~/.profile

# Vulpkg binary setup
RUN mkdir ~/.local/bin && echo -e "\nPATH=$PATH:$HOME/.local/bin/:/shared/bin/:$HOME/.env/bin/" >> ~/.bashrc
RUN ln -s /opt/webos/env/bin/vulpkg ~/.local/bin/vulpkg

WORKDIR /home/vulpes/

CMD ["/run.sh"]