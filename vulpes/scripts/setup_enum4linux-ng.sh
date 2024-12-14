# Installing dependencies
sudo apk add samba-common samba-client samba-common-tools

# Clone
git clone https://github.com/cddmp/enum4linux-ng.git
cd enum4linux-ng
virtualenv env
source env/bin/activate
pip install -r requirements.txt
sed -i 's/\/usr\/bin\/env python3/.\/env\/bin\/python3/' enum4linux-ng.py
