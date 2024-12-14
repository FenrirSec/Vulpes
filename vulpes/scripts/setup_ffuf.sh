sudo apk add go
git clone https://github.com/ffuf/ffuf /tmp/ffuf ; cd /tmp/ffuf ; go get ; go build
sudo cp ffuf /usr/bin
rm -frv /tmp/ffuf
