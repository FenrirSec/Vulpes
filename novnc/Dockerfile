FROM nginx:latest

WORKDIR /usr/share/nginx/

RUN apt-get update -y && apt-get install -y unzip wget
RUN wget https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.zip
RUN unzip v1.4.0.zip && rm -fr html && mv noVNC-1.4.0 html && cp html/vnc.html html/index.html


