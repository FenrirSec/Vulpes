
wget 'https://portswigger-cdn.net/burp/releases/download?product=community&version=2024.10.3&type=Jar' -O burp.jar

sudo apk add openjdk21-jre 

echo "java -jar $PWD/burp.jar" > burp.sh
chmod +x burp.sh
