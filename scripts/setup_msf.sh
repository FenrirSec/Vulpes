# Metasploit Framework Install Script for Alpine
# Built by Lp1 <jeremie@fenrir.pro>

apk add --no-cache ruby ruby-dev ruby-bundler build-base \
    libpcap-dev libxml2-dev libxslt-dev libpq-dev musl-dev libffi-dev zlib-dev ncurses

git clone https://github.com/rapid7/metasploit-framework.git

cd metasploit-framework

bundle install
