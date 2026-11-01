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

cat > $HOME/.bashrc <<'BASHRC'
# Vulpes terminal - Catppuccin Mocha
cd ~

# current git branch (green) when inside a repo
__vg() {
    local b
    b=$(git branch --show-current 2>/dev/null) || return
    [ -n "$b" ] && printf ' \001\033[38;5;150m\002 %s' "$b"
}

# line 1: user@host  ~/path (branch)   line 2: ❯
PS1='\n\[\033[1;38;5;183m\]\u\[\033[38;5;245m\]@\h \[\033[0;38;5;111m\]\w\[\033[38;5;150m\]$(__vg)\n\[\033[1;38;5;183m\]\342\235\257\[\033[0m\] '

# Catppuccin-ish ls/grep colours
export LS_COLORS='di=1;38;5;111:ln=38;5;116:so=38;5;183:pi=38;5;215:ex=1;38;5;150:bd=38;5;215:cd=38;5;215:su=38;5;211:sg=38;5;211:tw=38;5;111:ow=38;5;111:*.tar=38;5;215:*.zip=38;5;215:*.gz=38;5;215:*.jpg=38;5;183:*.png=38;5;183:*.mp4=38;5;183:*.md=38;5;189:*.sh=38;5;150'
alias ls='ls --color=auto'
alias ll='ls -lah'
alias grep='grep --color=auto'
alias ip='ip --color=auto'
BASHRC
chown vulpes:vulpes $HOME/.bashrc

cp /etc/setup/terminal $HOME/.config/xfce4/terminal

# Setting wallpaper

xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace0/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace1/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace2/last-image --set /usr/share/backgrounds/xfce/vulpes.png
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace3/last-image --set /usr/share/backgrounds/xfce/vulpes.png

touch $HOME/.setupdone

xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitorVNC-0/workspace0/last-image --set /usr/share/backgrounds/xfce/vulpes.png
