#!/bin/bash

# Installing themes

unzip /etc/themes/win10.zip -d $HOME/.themes/
tar xf /etc/themes/pop.tar.gz -C $HOME/.themes/
tar xf /etc/themes/skeuos-blue.tar.xz -C $HOME/.themes/
tar xf /etc/themes/whitesur-dark.tar.xz -C $HOME/.themes/
tar xf /etc/themes/flat-remix-blue.tar.xz -C $HOME/.themes/

# Setting up icons theme

mkdir $HOME/.icons
tar xf /etc/themes/reversal-icons.tar.xz -C $HOME/.icons/

# Setting default theme

xfconf-query -c xsettings -p /Net/ThemeName -s Skeuos-Blue-Dark
xfconf-query -c xsettings -p /Net/IconThemeName -s Reversal-blue-dark
xfconf-query -c xsettings -p /Gtk/FontName -s "Hack Nerd Font 12"
xfconf-query -c xsettings -p /Gtk/MonospaceFontName -s "Hack Nerd Font 12"

# Shell conf

mkdir $HOME/.poshthemes
wget https://github.com/JanDeDobbeleer/oh-my-posh/releases/latest/download/themes.zip -O $HOME/.poshthemes/themes.zip
unzip /home/vulpes/.poshthemes/themes.zip -d $HOME/.poshthemes
chmod u+rw $HOME/.poshthemes/*.json
chown -R vulpes:vulpes $HOME/.poshthemes
rm $HOME/.poshthemes/themes.zip

echo -e "\nNEWLINE_BEFORE_PROMPT=no\nneofetch\ncd $HOME\n" > $HOME/.bashrc

echo 'eval "$(oh-my-posh --init --shell bash --config /home/vulpes/.poshthemes/aliens.omp.json)"' >> $HOME/.bashrc

cp /etc/setup/terminal $HOME/.config/xfce4/terminal

# Setting wallpaper

xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace0/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace1/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace2/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace3/last-image --set /usr/share/backgrounds/xfce/vulpes.png

touch $HOME/.setupdone

xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace0/last-image --set /usr/share/backgrounds/xfce/vulpes.png
