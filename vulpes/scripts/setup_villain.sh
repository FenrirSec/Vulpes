git clone https://github.com/t3l3machus/Villain.git
cd Villain
virtualenv env
source env/bin/activate
sudo apk add ncurses-dev python3-dev gcc libc-dev patch make build-base libffi-dev openssl-dev curl krb5-dev linux-headers zeromq-dev
pip install -r requirements.txt
echo '#!/usr/bin/env bash
$PWD/Villain/env/bin/python3 $PWD/Villain/Villain.py $*' > /tmp/villain
sudo cp /tmp/villain /bin/villain
sudo chmod +x /bin/villain
