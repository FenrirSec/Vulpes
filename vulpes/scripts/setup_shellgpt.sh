git clone https://github.com/TheR1D/shell_gpt.git
cd shell_gpt
virtualenv env
source env/bin/activate
sudo pip install .
sudo pip install litellm
mkdir $HOME/.config/shell_gpt
cp /shared/sgptrc $HOME/.config/shell_gpt/.sgptrc
cp /shared/sgpt.sh sgpt.sh
chmod +x sgpt.sh
