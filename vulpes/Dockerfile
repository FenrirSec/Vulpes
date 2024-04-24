FROM alpine

# Installing required packages for minimal functioning
RUN apk add --no-cache curl sudo x11vnc tigervnc xvfb dbus-x11 \
    xfce4 xfce4-terminal xfce4-screensaver bash screen python3 py3-pip pwgen websockify gcompat bind-tools
#RUN pip install websockify
RUN apk add --no-cache nerd-fonts --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community

# Copying files to the container
COPY run.sh /run.sh
RUN chmod +x /run.sh
COPY setup /etc/setup
COPY themes.zip /etc/themes.zip
RUN cd /etc/ && unzip themes.zip
RUN cp /etc/setup/xinitrc /etc/xinitrc

## Xfce4 logout deactivation
RUN cp /etc/setup/xfce4-session-logout.desktop /usr/share/applications/

## User creation
RUN addgroup -S vulpes
RUN adduser -S vulpes -G vulpes -s /bin/bash
RUN echo '%wheel ALL=(ALL) ALL' > /etc/sudoers.d/wheel
RUN adduser vulpes wheel
RUN echo "vulpes:vulpes" | chpasswd

## Permission and default home management
RUN cp /etc/setup/xinitrc /home/vulpes/.xinitrc && cp /etc/setup/xinitrc /root/.xinitrc
#RUN cp /etc/setup/xinitscript.sh /etc/X11/xinit/xinitrc.d/

## Autorun setup
RUN cp /etc/setup/setup.desktop /etc/xdg/autostart

## Final setup steps
RUN chown -R "vulpes:vulpes" "/home/vulpes"

# Installing additional packages
RUN apk add $(cat /etc/setup/.defaultpackages)
RUN curl -s https://ohmyposh.dev/install.sh | bash -s

# Removing broken power manager
RUN sed -i 's/<property name="plugin-9" type="string" value="power-manager-plugin"\/>//g' /etc/xdg/xfce4/panel/default.xml


# Installing fonts
RUN wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/AnonymousPro.zip && unzip AnonymousPro.zip -d /usr/share/fonts/Anonymice/ && rm AnonymousPro.zip
RUN wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/Hack.zip && unzip Hack.zip -d /usr/share/fonts/Hack && rm Hack.zip

# Updating background
RUN rm -fr /usr/share/backgrounds/xfce/*
COPY ./setup/wallpaper.png /usr/share/backgrounds/xfce/vulpes.png

# In case run.sh has been edited on windows
RUN dos2unix /run.sh && dos2unix /etc/setup/postinstall.sh && dos2unix /etc/setup/xinitscript.sh && dos2unix /etc/setup/postinstall.sh

EXPOSE 5900

CMD ["/run.sh"]