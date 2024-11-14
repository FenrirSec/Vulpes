VOLUME_FILE=volume.img
VOLUME_NAME=enc1

apk add cryptsetup e2fsprogs

#
dd if=/dev/urandom of=$VOLUME_FILE bs=1M count=2k
cryptsetup luksFormat --pbkdf argon2id $VOLUME_FILE
cryptsetup luksOpen $VOLUME_FILE $VOLUME_NAME
mkfs.ext4 -v -m0 /dev/mapper/$VOLUME_NAME

# Mounting
mkdir /encrypted
mount /dev/mapper/$VOLUME_NAME /mnt
