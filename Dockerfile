FROM node:8.14
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root

RUN apt update && apt install -y telnet curl

COPY . /var/www
WORKDIR "/var/www"

RUN npm install

ENTRYPOINT ["/usr/local/bin/node", "/var/www/index.js"]
