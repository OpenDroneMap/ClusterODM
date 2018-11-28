FROM node:lts
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root

RUN apt update && apt install -y telnet

COPY . /var/www
WORKDIR "/var/www"

RUN npm install

ENTRYPOINT ["/usr/local/bin/node", "/var/www/index.js"]
