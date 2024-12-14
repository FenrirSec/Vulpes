git clone https://github.com/sqlmapproject/sqlmap.git
echo '#!/usr/bin/env bash
python3 $PWD/sqlmap/sqlmap.py $*' > /tmp/sqlmap
sudo cp /tmp/sqlmap /bin/sqlmap
sudo chmod +x /bin/sqlmap
